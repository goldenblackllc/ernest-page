/**
 * renderPostVideo (callable) — builds an MP4 of a post for its author.
 *
 * Images + post audio + burned-in subtitles, rendered with ffmpeg and saved
 * to Storage at videos/{postId}.mp4. Returns a tokenized download URL the
 * client fetches directly. Pass refresh: true to rebuild a cached video.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { promises as fs, existsSync } from 'fs';
import { spawnSync, execSync } from 'child_process';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { db, storage } from './lib/firebase/admin.js';
import { generateSubtitles, generateAssSubtitles, buildChunksFromTimestamps } from './lib/video/videoSubtitles.js';
import { renderFrame } from './lib/video/renderFrame.js';
import { getPostText } from './lib/getPostText.js';

interface RenderPostVideoRequest {
    postId: string;
    refresh?: boolean;
    /** 'short' = Q&A format (separate cache path) */
    format?: 'full' | 'short';
}

const FONTS_DIR = join(process.cwd(), 'assets', 'fonts', 'hkgrotesk');

function resolveFfmpeg(): string {
    const bundled = join(process.cwd(), 'node_modules', 'ffmpeg-static', 'ffmpeg');
    if (existsSync(bundled)) return bundled;
    try {
        return execSync('which ffmpeg', { encoding: 'utf8' }).trim();
    } catch {
        throw new Error(`ffmpeg not found at ${bundled} or in system PATH`);
    }
}

function getDuration(ffmpegPath: string, filePath: string): number {
    // ffmpeg -i always exits non-zero (no output file); duration is in stderr
    const result = spawnSync(ffmpegPath, ['-i', filePath], { encoding: 'utf8', timeout: 10000 });
    const output = (result.stderr || '') + (result.stdout || '');
    const match = output.match(/Duration:\s*(\d+):(\d+):(\d+)\.(\d+)/);
    if (!match) return 0;
    return parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseInt(match[3]) + parseInt(match[4]) / 100;
}

async function download(url: string, path: string) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to download ${url}: HTTP ${res.status}`);
    await fs.writeFile(path, Buffer.from(await res.arrayBuffer()));
}

/** Firebase-style download URL; the token is the only way to read the file. */
function downloadUrl(bucketName: string, path: string, token: string): string {
    return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
}

export const renderPostVideo = onCall<RenderPostVideoRequest>(
    {
        region: 'us-central1',
        timeoutSeconds: 540,
        memory: '2GiB',
        cpu: 2,
    },
    async (request) => {
        const uid = request.auth?.uid;
        if (!uid) throw new HttpsError('unauthenticated', 'Sign in required');

        const { postId, refresh = false, format = 'full' } = request.data || ({} as RenderPostVideoRequest);
        if (!postId) throw new HttpsError('invalid-argument', 'Missing postId');

        // ── Fetch post ──
        const postDoc = await db.collection('posts').doc(postId).get();
        if (!postDoc.exists) throw new HttpsError('not-found', 'Post not found');
        const post = postDoc.data()!;

        // Only the author can download
        if (post.authorId !== uid && post.uid !== uid) throw new HttpsError('permission-denied', 'Forbidden');

        if ((!post.audio_url && !post.letter_audio_url) || getImageUrls(post).length === 0) {
            throw new HttpsError('failed-precondition', 'Post does not have audio and image for video generation');
        }

        // ── Cached video ──
        const bucket = storage.bucket();
        const videoPath = format === 'short' ? `videos/short-${postId}.mp4` : `videos/${postId}.mp4`;
        const file = bucket.file(videoPath);
        const [exists] = await file.exists();
        if (exists && !refresh) {
            const [metadata] = await file.getMetadata();
            let token = String(metadata.metadata?.firebaseStorageDownloadTokens || '').split(',')[0];
            if (!token) {
                token = randomUUID();
                await file.setMetadata({ metadata: { firebaseStorageDownloadTokens: token } });
            }
            console.log(`[Video] Serving ${videoPath} from cache`);
            return { url: downloadUrl(bucket.name, videoPath, token) };
        }

        try {
            const video = await buildVideo(post);
            // ── Save to Storage with a fresh download token ──
            const token = randomUUID();
            await file.save(video, {
                metadata: {
                    contentType: 'video/mp4',
                    contentDisposition: `attachment; filename="earnest-page-${postId}.mp4"`,
                    metadata: {
                        postId,
                        generatedAt: new Date().toISOString(),
                        firebaseStorageDownloadTokens: token,
                    },
                },
            });

            console.log(`[Video] Rendered ${videoPath} (${(video.length / 1e6).toFixed(1)} MB)`);
            return { url: downloadUrl(bucket.name, videoPath, token) };
        } catch (error: any) {
            console.error('[Video] Generation failed:', error);
            throw new HttpsError('internal', 'Video generation failed');
        }
    }
);

/**
 * Image URLs in playback order — mirrors FeedPostCard:
 *   per-message: message_images array
 *   legacy: user_photo first (if any), then AI images
 */
function getImageUrls(post: FirebaseFirestore.DocumentData): string[] {
    const isPerMessage = post.image_style === 'per-message' && post.message_images?.length;
    const urls: string[] = (() => {
        if (isPerMessage) return post.message_images;
        const aiImages = post.imagen_urls?.length ? post.imagen_urls
            : post.public_post?.imagen_urls?.length ? post.public_post.imagen_urls
            : [post.public_post?.imagen_url || post.imagen_url || post.imageUrl].filter(Boolean);
        return post.user_photo_url ? [post.user_photo_url, ...aiImages] : aiImages;
    })();
    return urls.filter(Boolean);
}

/** Render a post's video and return the MP4 bytes. */
export async function buildVideo(post: FirebaseFirestore.DocumentData): Promise<Buffer> {
    const unifiedAudioUrl = post.audio_url;
    const letterAudioUrl = post.letter_audio_url;
    const isPerMessage = post.image_style === 'per-message' && post.message_images?.length;
    const allImageUrls = getImageUrls(post);
    const messageBoundaries = post.audio_message_boundaries as { startTime: number; endTime: number }[] | undefined;

    const workDir = join(tmpdir(), `ep-video-${randomUUID()}`);
    await fs.mkdir(workDir, { recursive: true });

    try {
        const ffmpegPath = resolveFfmpeg();
        const combinedAudioPath = join(workDir, 'combined.mp3');
        const outputPath = join(workDir, 'output.mp4');

        // ── Download images in parallel; skip any that fail ──
        const imagePaths: string[] = [];
        await Promise.all(allImageUrls.map(async (url, idx) => {
            try {
                const imgPath = join(workDir, `img_${idx}.jpg`);
                await download(url, imgPath);
                imagePaths[idx] = imgPath;
            } catch (err: any) {
                console.warn(`[Video] Failed to download image ${idx}: ${err.message}`);
            }
        }));
        const validImagePaths = imagePaths.filter(Boolean);
        if (validImagePaths.length === 0) throw new Error('Failed to download any images');

        // ── Audio ──
        if (unifiedAudioUrl) {
            await download(unifiedAudioUrl, combinedAudioPath);
        } else {
            // Legacy format: separate letter + response files, concatenated
            const letterAudioPath = join(workDir, 'letter.mp3');
            await download(letterAudioUrl, letterAudioPath);
            if (post.response_audio_url) {
                const responseAudioPath = join(workDir, 'response.mp3');
                await download(post.response_audio_url, responseAudioPath);
                const concatListPath = join(workDir, 'concat.txt');
                await fs.writeFile(concatListPath, `file '${letterAudioPath}'\nfile '${responseAudioPath}'\n`);
                spawnSync(ffmpegPath, ['-y', '-f', 'concat', '-safe', '0', '-i', concatListPath, '-c', 'copy', combinedAudioPath], { timeout: 30000 });
            } else {
                await fs.copyFile(letterAudioPath, combinedAudioPath);
            }
        }

        const totalDuration = getDuration(ffmpegPath, combinedAudioPath);
        if (totalDuration <= 0) throw new Error('Could not determine audio duration');

        // ── Subtitles ──
        // Prefer ElevenLabs word-level timestamps; fall back to word-ratio estimation for older posts
        const { letter: letterText, response: responseText } = getPostText(post);
        const letterWordRatio = post.audio_letter_ratio ?? (() => {
            const lw = letterText.split(/\s+/).filter(Boolean).length;
            const rw = responseText.split(/\s+/).filter(Boolean).length;
            return (lw + rw) > 0 ? lw / (lw + rw) : 0.5;
        })();
        const letterDuration = totalDuration * letterWordRatio;
        const responseDuration = totalDuration * (1 - letterWordRatio);

        const rawTimestamps = post.audio_word_timestamps as { word: string; start: number; end: number }[] | undefined;
        const letterWordCount = letterText.split(/\s+/).filter(Boolean).length;
        const subtitles = (rawTimestamps && rawTimestamps.length > 0)
            ? buildChunksFromTimestamps(rawTimestamps, 12, letterWordCount)
            : generateSubtitles(letterText, responseText, letterDuration, responseDuration);

        // ── Frames ──
        const framePaths: string[] = [];
        for (let i = 0; i < validImagePaths.length; i++) {
            const framePath = join(workDir, `frame_${i}.png`);
            await fs.writeFile(framePath, await renderFrame({ heroPath: validImagePaths[i] }));
            framePaths.push(framePath);
        }

        // ── Map images to timeline ──
        // Per-message posts switch images at each conversation turn (matches the feed player);
        // legacy posts distribute images evenly across subtitle chunks.
        const imageTimings: { path: string; duration: number }[] = [];
        if (framePaths.length === 1) {
            imageTimings.push({ path: framePaths[0], duration: totalDuration });
        } else if (isPerMessage && messageBoundaries && messageBoundaries.length > 0) {
            for (let i = 0; i < framePaths.length; i++) {
                const boundary = messageBoundaries[i];
                if (!boundary) {
                    // More images than boundaries — split the leftover time
                    const lastEnd = messageBoundaries[messageBoundaries.length - 1]?.endTime || totalDuration;
                    const leftoverImages = framePaths.length - i;
                    imageTimings.push({ path: framePaths[i], duration: Math.max(0.1, (totalDuration - lastEnd) / leftoverImages) });
                    continue;
                }
                const end = i < messageBoundaries.length - 1 ? messageBoundaries[i + 1].startTime : totalDuration;
                imageTimings.push({ path: framePaths[i], duration: Math.max(0.1, end - boundary.startTime) });
            }
        } else {
            const chunksPerImage = Math.max(1, Math.floor(subtitles.length / framePaths.length));
            let chunkIdx = 0;
            let prevEndTime = 0;
            for (let imgIdx = 0; imgIdx < framePaths.length; imgIdx++) {
                const isLast = imgIdx === framePaths.length - 1;
                const endChunkIdx = isLast ? subtitles.length : Math.min(chunkIdx + chunksPerImage, subtitles.length);
                if (chunkIdx >= subtitles.length) break;
                const absEndTime = isLast ? totalDuration : (subtitles[endChunkIdx - 1]?.endTime || totalDuration);
                imageTimings.push({ path: framePaths[imgIdx], duration: Math.max(0.1, absEndTime - prevEndTime) });
                prevEndTime = absEndTime;
                chunkIdx = endChunkIdx;
            }
        }

        // ── ASS subtitles + fontconfig (no system fontconfig in the container) ──
        const assPath = join(workDir, 'subtitles.ass');
        await fs.writeFile(assPath, generateAssSubtitles(subtitles, totalDuration, ''), 'utf-8');
        const fontconfigPath = join(workDir, 'fonts.conf');
        await fs.writeFile(fontconfigPath, `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <dir>${FONTS_DIR}</dir>
  <cachedir>${workDir}/fc-cache</cachedir>
</fontconfig>`, 'utf-8');
        await fs.mkdir(join(workDir, 'fc-cache'), { recursive: true });

        // ── ffmpeg ──
        // Images go in through the concat DEMUXER (one input, read one image at a
        // time). Looping each image as its own input made ffmpeg buffer frames
        // for every upcoming image and ran out of memory on long posts.
        // The last image is listed twice so its duration is honored.
        const concatListPath = join(workDir, 'images.txt');
        const lastFrame = imageTimings[imageTimings.length - 1].path;
        await fs.writeFile(concatListPath, [
            'ffconcat version 1.0',
            ...imageTimings.flatMap(t => [`file '${t.path}'`, `duration ${t.duration.toFixed(3)}`]),
            `file '${lastFrame}'`,
        ].join('\n') + '\n');
        const filterComplex = `[0:v]fps=15,format=yuv420p,ass=${assPath}:fontsdir=${FONTS_DIR}[vout]`;

        const ffmpegResult = spawnSync(ffmpegPath, [
            '-y',
            '-f', 'concat', '-safe', '0', '-i', concatListPath,
            '-i', combinedAudioPath,
            '-filter_complex', filterComplex,
            '-map', '[vout]',
            '-map', '1:a',
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-crf', '23',
            '-r', '15',
            '-c:a', 'aac',
            '-b:a', '128k',
            '-ac', '2',
            '-ar', '44100',
            '-t', totalDuration.toFixed(2),
            '-movflags', '+faststart',
            '-pix_fmt', 'yuv420p',
            outputPath,
        ], {
            timeout: 480_000,
            maxBuffer: 50 * 1024 * 1024,
            env: { ...process.env, FONTCONFIG_FILE: fontconfigPath },
        });
        if (ffmpegResult.status !== 0) {
            console.error('[Video] ffmpeg stderr tail:', (ffmpegResult.stderr || '').toString().slice(-500));
            throw new Error(`ffmpeg exited with code ${ffmpegResult.status} signal ${ffmpegResult.signal}`);
        }

        return await fs.readFile(outputPath);
    } finally {
        await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
    }
}

import { NextRequest, NextResponse } from 'next/server';
import { db, storage } from '@/lib/firebase/admin';
import { getAuth } from 'firebase-admin/auth';
import { generateSubtitles, generateAssSubtitles, buildChunksFromTimestamps } from '@/lib/video/videoSubtitles';
import { renderFrame } from '@/lib/video/renderFrame';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';

export const maxDuration = 120;
export const dynamic = 'force-dynamic';

/**
 * GET /api/posts/[id]/video
 *
 * Generates (or returns cached) an MP4 video for a short-form post.
 * Requires auth — only the post author can download.
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: postId } = await params;
        const url = new URL(request.url);
        const forceRefresh = url.searchParams.get('refresh') === '1';

        // ── Auth ──
        const authHeader = request.headers.get('Authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const token = authHeader.split('Bearer ')[1];
        const decoded = await getAuth().verifyIdToken(token);
        const uid = decoded.uid;

        // ── Fetch post ──
        const postDoc = await db.collection('posts').doc(postId).get();
        if (!postDoc.exists) {
            return NextResponse.json({ error: 'Post not found' }, { status: 404 });
        }
        const post = postDoc.data()!;

        // Only author can download
        if (post.authorId !== uid && post.uid !== uid) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        // Must have audio + image
        const unifiedAudioUrl = post.audio_url;
        const letterAudioUrl = post.letter_audio_url;
        // Collect all image URLs — prefer imagen_urls array, fall back to single url
        const allImageUrls: string[] = (
            post.public_post?.imagen_urls?.length ? post.public_post.imagen_urls
            : post.imagen_urls?.length ? post.imagen_urls
            : [post.public_post?.imagen_url || post.imagen_url || post.imageUrl]
        ).filter(Boolean) as string[];
        if ((!unifiedAudioUrl && !letterAudioUrl) || allImageUrls.length === 0) {
            return NextResponse.json({ error: 'Post does not have audio and image for video generation' }, { status: 400 });
        }

        // ── Check cache (skip if ?refresh=1) ──
        const videoPath = `videos/${postId}.mp4`;
        const file = storage.bucket().file(videoPath);
        const [exists] = await file.exists();
        if (exists && !forceRefresh) {
            console.log('[Video] Serving from cache');
            const [cachedBuffer] = await file.download();
            return new NextResponse(new Uint8Array(cachedBuffer), {
                headers: {
                    'Content-Type': 'video/mp4',
                    'Content-Disposition': `attachment; filename="earnest-page-${postId}.mp4"`,
                    'Content-Length': String(cachedBuffer.length),
                },
            });
        }
        // If refreshing, delete old cached version
        if (exists && forceRefresh) {
            await file.delete().catch(() => {});
        }

        // ── Download assets to /tmp ──
        const workDir = join(tmpdir(), `ep-video-${randomUUID()}`);
        await fs.mkdir(workDir, { recursive: true });

        const combinedAudioPath = join(workDir, 'combined.mp3');
        const outputPath = join(workDir, 'output.mp4');

        // Download all images in parallel
        console.log(`[Video] Downloading ${allImageUrls.length} image(s)...`);
        const imagePaths: string[] = [];
        await Promise.all(allImageUrls.map(async (url, idx) => {
            try {
                const res = await fetch(url);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const buf = Buffer.from(await res.arrayBuffer());
                const imgPath = join(workDir, `img_${idx}.jpg`);
                await fs.writeFile(imgPath, buf);
                imagePaths[idx] = imgPath;
            } catch (err: any) {
                console.warn(`[Video] Failed to download image ${idx}: ${err.message}`);
            }
        }));
        // Filter out failed downloads, ensure at least one image
        const validImagePaths = imagePaths.filter(Boolean);
        if (validImagePaths.length === 0) {
            throw new Error('Failed to download any images');
        }
        console.log(`[Video] Downloaded ${validImagePaths.length} image(s)`);

        if (unifiedAudioUrl) {
            // ── UNIFIED FORMAT: single audio file — download directly ──
            const audioRes = await fetch(unifiedAudioUrl);
            if (!audioRes.ok) throw new Error(`Failed to download audio: ${audioRes.status}`);
            await fs.writeFile(combinedAudioPath, Buffer.from(await audioRes.arrayBuffer()));
        } else {
            // ── LEGACY FORMAT: two separate audio files — download + concatenate ──
            const letterAudioPath = join(workDir, 'letter.mp3');
            const responseAudioPath = join(workDir, 'response.mp3');

            // Download letter audio
            const letterAudioRes = await fetch(letterAudioUrl);
            if (!letterAudioRes.ok) throw new Error(`Failed to download letter audio: ${letterAudioRes.status}`);
            await fs.writeFile(letterAudioPath, Buffer.from(await letterAudioRes.arrayBuffer()));

            // Download response audio (if exists)
            const responseAudioUrl = post.response_audio_url;
            const hasResponseAudio = !!responseAudioUrl;
            if (hasResponseAudio) {
                const responseAudioRes = await fetch(responseAudioUrl);
                if (!responseAudioRes.ok) throw new Error(`Failed to download response audio: ${responseAudioRes.status}`);
                await fs.writeFile(responseAudioPath, Buffer.from(await responseAudioRes.arrayBuffer()));
            }

            // Concatenate audio if we have response (legacy path only)
            if (hasResponseAudio) {
                const concatListPath = join(workDir, 'concat.txt');
                await fs.writeFile(concatListPath, `file '${letterAudioPath}'\nfile '${responseAudioPath}'\n`);

                // Need ffmpeg for concat — resolve path early
                const { existsSync: existsSyncEarly } = require('fs');
                const { execSync: execSyncEarly, spawnSync: spawnSyncEarly } = require('child_process');
                const pathModEarly = require('path');
                let ffmpegEarly = pathModEarly.join(process.cwd(), 'node_modules', 'ffmpeg-static', 'ffmpeg');
                if (!existsSyncEarly(ffmpegEarly)) {
                    try { ffmpegEarly = execSyncEarly('which ffmpeg', { encoding: 'utf8' }).trim(); } catch { throw new Error('ffmpeg not found'); }
                }
                spawnSyncEarly(ffmpegEarly, [
                    '-y', '-f', 'concat', '-safe', '0',
                    '-i', concatListPath, '-c', 'copy', combinedAudioPath,
                ], { timeout: 30000 });
            } else {
                await fs.copyFile(letterAudioPath, combinedAudioPath);
            }
        }



        // ── Get audio duration via ffmpeg ──
        // Turbopack rewrites require() and require.resolve() paths at bundle time.
        // Construct the real path manually from process.cwd().
        const { existsSync } = require('fs');
        const { execSync: execSyncCheck, spawnSync } = require('child_process');
        const pathMod = require('path');

        let ffmpegPath = pathMod.join(process.cwd(), 'node_modules', 'ffmpeg-static', 'ffmpeg');
        if (!existsSync(ffmpegPath)) {
            // Fallback: try system ffmpeg
            try {
                ffmpegPath = execSyncCheck('which ffmpeg', { encoding: 'utf8' }).trim();
            } catch {
                throw new Error(`ffmpeg not found at ${ffmpegPath} or in system PATH`);
            }
        }
        console.log('[Video] ffmpeg path:', ffmpegPath, 'exists:', existsSync(ffmpegPath));

        const getDuration = async (filePath: string): Promise<number> => {
            const stat = await fs.stat(filePath);
            console.log(`[Video] File ${filePath}: ${stat.size} bytes`);

            if (stat.size === 0) return 0;

            const result = spawnSync(ffmpegPath, ['-i', filePath], {
                encoding: 'utf8',
                timeout: 10000,
            });

            // ffmpeg -i always exits non-zero (no output file), duration is in stderr
            const output = (result.stderr || '') + (result.stdout || '');
            console.log('[Video] ffmpeg output snippet:', output.substring(0, 300));

            const match = output.match(/Duration:\s*(\d+):(\d+):(\d+)\.(\d+)/);
            if (match) {
                const dur = parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseInt(match[3]) + parseInt(match[4]) / 100;
                console.log(`[Video] Duration: ${dur}s`);
                return dur;
            }

            console.log('[Video] Could not parse duration from output');
            return 0;
        };

        // Get total duration from the combined audio file
        const totalDuration = await getDuration(combinedAudioPath);
        console.log(`[Video] Total audio duration: ${totalDuration}s`);

        if (totalDuration <= 0) {
            throw new Error('Could not determine audio duration');
        }

        // Estimate letter/response durations from word ratio
        const letterText = post.public_post?.letter || post.letter || '';
        const responseText = post.public_post?.response || post.response || '';
        const titleText = post.public_post?.title || post.title || '';

        const letterWordRatio = post.audio_letter_ratio ?? (() => {
            const lw = letterText.split(/\s+/).filter(Boolean).length;
            const rw = responseText.split(/\s+/).filter(Boolean).length;
            return (lw + rw) > 0 ? lw / (lw + rw) : 0.5;
        })();
        const letterDuration = totalDuration * letterWordRatio;
        const responseDuration = totalDuration * (1 - letterWordRatio);
        console.log(`[Video] Letter: ${letterDuration.toFixed(2)}s, Response: ${responseDuration.toFixed(2)}s (ratio: ${letterWordRatio.toFixed(2)})`);


        // ── Build subtitle entries ──
        // Prefer real ElevenLabs word-level timestamps for frame-accurate sync.
        // Fall back to word-ratio estimation for older posts without timestamps.
        const rawTimestamps = post.audio_word_timestamps as { word: string; start: number; end: number }[] | undefined;
        // Compute letter word count for forced subtitle break at letter/response boundary
        const letterWordCount = letterText.split(/\s+/).filter(Boolean).length;
        const subtitles = (rawTimestamps && rawTimestamps.length > 0)
            ? buildChunksFromTimestamps(rawTimestamps, 12, letterWordCount)
            : generateSubtitles(letterText, responseText, letterDuration, responseDuration);

        // ── Render frames for each image ──
        const fontsDir = join(process.cwd(), 'public/fonts/hkgrotesk');
        console.log('[Video] Rendering frames with sharp...');
        const framePaths: string[] = [];
        for (let i = 0; i < validImagePaths.length; i++) {
            const framePath = join(workDir, `frame_${i}.png`);
            const frameBuffer = await renderFrame({ heroPath: validImagePaths[i] });
            await fs.writeFile(framePath, frameBuffer);
            framePaths.push(framePath);
        }
        console.log(`[Video] Rendered ${framePaths.length} frame(s)`);

        // ── Map images to subtitle chunks ──
        // Distribute images evenly across subtitle chunks.
        // IMPORTANT: Use ABSOLUTE end times so the concat timeline matches
        // the ASS subtitle timestamps exactly. The concat demuxer starts at t=0
        // and each image's duration determines when the next image starts.
        const imageTimings: { path: string; duration: number }[] = [];
        if (framePaths.length === 1) {
            // Single image — covers entire video
            imageTimings.push({ path: framePaths[0], duration: totalDuration });
        } else {
            // Multiple images — distribute across subtitle chunks
            const chunksPerImage = Math.max(1, Math.floor(subtitles.length / framePaths.length));
            let chunkIdx = 0;
            let prevEndTime = 0; // absolute time where the previous image ended
            for (let imgIdx = 0; imgIdx < framePaths.length; imgIdx++) {
                const isLast = imgIdx === framePaths.length - 1;
                const endChunkIdx = isLast ? subtitles.length : Math.min(chunkIdx + chunksPerImage, subtitles.length);
                if (chunkIdx >= subtitles.length) break;
                // Use absolute end time of the last assigned chunk
                const absEndTime = isLast ? totalDuration : (subtitles[endChunkIdx - 1]?.endTime || totalDuration);
                const duration = absEndTime - prevEndTime;
                imageTimings.push({ path: framePaths[imgIdx], duration: Math.max(0.1, duration) });
                prevEndTime = absEndTime;
                chunkIdx = endChunkIdx;
            }
        }
        console.log(`[Video] Image timings: ${imageTimings.map(t => t.duration.toFixed(1) + 's').join(', ')}`);

        // ── Generate ASS subtitle file ──
        const assContent = generateAssSubtitles(subtitles, totalDuration, titleText);
        const assPath = join(workDir, 'subtitles.ass');
        await fs.writeFile(assPath, assContent, 'utf-8');
        console.log(`[Video] ASS subtitles written: ${subtitles.length} timed entries + static title`);

        // ── Create fontconfig config for Lambda (no system fontconfig) ──
        const fontconfigPath = join(workDir, 'fonts.conf');
        await fs.writeFile(fontconfigPath, `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <dir>${fontsDir}</dir>
  <cachedir>${workDir}/fc-cache</cachedir>
</fontconfig>`, 'utf-8');
        await fs.mkdir(join(workDir, 'fc-cache'), { recursive: true });

        // ── Build ffmpeg command ──
        console.log('[Video] Running ffmpeg...');
        let ffmpegArgs: string[];

        if (imageTimings.length === 1) {
            // Single image — simple loop (original approach)
            ffmpegArgs = [
                '-y',
                '-loop', '1',
                '-framerate', '2',
                '-i', imageTimings[0].path,
                '-i', combinedAudioPath,
                '-filter_complex', `[0:v]ass=${assPath}:fontsdir=${fontsDir}[vout]`,
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
            ];
        } else {
            // Multiple images — each image becomes a looping video input,
            // then joined via the concat FILTER (not demuxer).
            // This guarantees each image generates a proper frame stream with correct PTS.
            const inputs: string[] = ['-y'];
            for (const timing of imageTimings) {
                inputs.push(
                    '-loop', '1',
                    '-framerate', '2',
                    '-t', timing.duration.toFixed(3),
                    '-i', timing.path,
                );
            }
            // Audio is the last input
            inputs.push('-i', combinedAudioPath);

            const audioInputIdx = imageTimings.length; // index of the audio input
            // Build concat filter: [0:v][1:v][2:v]...concat=n=N:v=1:a=0[vid];[vid]ass=...[vout]
            const concatInputs = imageTimings.map((_, i) => `[${i}:v]`).join('');
            const filterComplex = `${concatInputs}concat=n=${imageTimings.length}:v=1:a=0[vid];[vid]ass=${assPath}:fontsdir=${fontsDir}[vout]`;
            console.log(`[Video] Filter: ${filterComplex}`);

            ffmpegArgs = [
                ...inputs,
                '-filter_complex', filterComplex,
                '-map', '[vout]',
                '-map', `${audioInputIdx}:a`,
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
            ];
        }
        const ffmpegResult = spawnSync(ffmpegPath, ffmpegArgs, {
            timeout: 110000,
            maxBuffer: 50 * 1024 * 1024,
            env: { ...process.env, FONTCONFIG_FILE: fontconfigPath },
        });
        if (ffmpegResult.status !== 0) {
            const fullStderr = (ffmpegResult.stderr || '').toString();
            console.error('[Video] ffmpeg stderr tail:', fullStderr.slice(-300));
            throw new Error(`ffmpeg exited with code ${ffmpegResult.status} signal ${ffmpegResult.signal}`);
        }
        console.log('[Video] FFmpeg completed');

        // ── Upload to Firebase Storage (cache) + stream directly to client ──
        const videoBuffer = await fs.readFile(outputPath);

        file.save(videoBuffer, {
            metadata: {
                contentType: 'video/mp4',
                metadata: { postId, generatedAt: new Date().toISOString() },
            },
        }).catch((e: any) => console.warn('[Video] Cache upload failed:', e.message));

        // ── Cleanup /tmp ──
        await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});

        // Stream the MP4 directly
        return new NextResponse(new Uint8Array(videoBuffer), {
            headers: {
                'Content-Type': 'video/mp4',
                'Content-Disposition': `attachment; filename="earnest-page-${postId}.mp4"`,
                'Content-Length': String(videoBuffer.length),
            },
        });

    } catch (error: any) {
        console.error('[Video] Generation failed:', error);
        return NextResponse.json(
            { error: 'Video generation failed', detail: error.message },
            { status: 500 }
        );
    }
}

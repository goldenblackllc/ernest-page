import { NextRequest, NextResponse } from 'next/server';
import { db, storage } from '@/lib/firebase/admin';
import { getAuth } from 'firebase-admin/auth';
import { generateSubtitles, generateAssSubtitles, buildChunksFromTimestamps } from '@/lib/video/videoSubtitles';
import { renderFrame, renderTextFrame, renderEndFrame } from '@/lib/video/renderFrame';
import { fetchStockVideo } from '@/lib/video/stockVideo';
import { generateShortAudio } from '@/lib/ai/postTTS';
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
        const format = url.searchParams.get('format') || 'full'; // 'short' = Q&A format

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
        const videoPath = format === 'short' ? `videos/short-${postId}.mp4` : `videos/${postId}.mp4`;
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

        // ── Route to short format pipeline if requested ──
        if (format === 'short') {
            return await generateShortVideo(postId, post, forceRefresh);
        }

        // ── Download assets to /tmp (full format) ──
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

/**
 * Generate a Q&A short-form video (~30 seconds).
 *
 * Pipeline:
 * 1. Generate Q&A script from letter+response using Opus 4.7
 * 2. Generate two audio tracks (character voice for question, Earnest voice for answer)
 * 3. Render frames: text-on-black (question), hero image (answer), end card
 * 4. Assemble with ffmpeg: concat frames + audio with ASS subtitles
 */
async function generateShortVideo(
    postId: string,
    post: FirebaseFirestore.DocumentData,
    forceRefresh: boolean,
): Promise<NextResponse> {
    const workDir = join(tmpdir(), `ep-short-${randomUUID()}`);
    await fs.mkdir(workDir, { recursive: true });

    try {
        // ── Fast path: serve stored video if available ──
        if (post.short_video_url && !forceRefresh) {
            console.log(`[ShortVideo] Serving stored video for ${postId}`);
            const storedRes = await fetch(post.short_video_url);
            if (storedRes.ok) {
                const videoBuffer = Buffer.from(await storedRes.arrayBuffer());
                return new NextResponse(new Uint8Array(videoBuffer), {
                    headers: {
                        'Content-Type': 'video/mp4',
                        'Content-Disposition': `attachment; filename="earnest-short-${postId}.mp4"`,
                        'Content-Length': String(videoBuffer.length),
                    },
                });
            }
            console.warn(`[ShortVideo] Stored video fetch failed (${storedRes.status}), falling through to generation`);
        }

        // ── Extract post data ──
        const letterText = post.public_post?.letter || post.letter || '';
        const responseText = post.public_post?.response || post.response || '';
        const uid = post.uid || post.authorId;

        if (!letterText || !responseText) {
            return NextResponse.json({ error: 'Post missing letter or response' }, { status: 400 });
        }
        // ── Use pre-stored short data ──
        const hasStoredShort = post.short_question && post.short_answer && post.short_audio_url;

        if (!hasStoredShort || !post.short_audio_question_duration || !post.short_audio_answer_duration) {
            return NextResponse.json({ error: 'Short video data not available for this post' }, { status: 400 });
        }

        console.log('[ShortVideo] Using pre-stored Q&A short data');
        const scriptQuestion: string = post.short_question;
        const scriptAnswer: string = post.short_answer;
        const questionDuration: number = post.short_audio_question_duration;
        const answerDuration: number = post.short_audio_answer_duration;

        // Download the stored combined audio
        const audioRes = await fetch(post.short_audio_url);
        if (!audioRes.ok) throw new Error(`Failed to download stored short audio: ${audioRes.status}`);
        const combinedAudioBuffer = Buffer.from(await audioRes.arrayBuffer());

        // Reconstruct timestamps from stored combined timestamps
        const allTimestamps = post.short_audio_word_timestamps as { word: string; start: number; end: number }[] || [];
        const questionTimestamps = allTimestamps.filter((w: any) => w.end <= questionDuration + 0.1);
        const answerTimestamps = allTimestamps
            .filter((w: any) => w.start >= questionDuration - 0.1)
            .map((w: any) => ({ word: w.word, start: w.start - questionDuration, end: w.end - questionDuration }));

        // ── Write audio to disk ──
        const combinedAudioPath = join(workDir, 'combined.mp3');
        await fs.writeFile(combinedAudioPath, combinedAudioBuffer);

        // Get a hero image for the answer phase (fallback if no stock video)
        const allImageUrls: string[] = (
            post.public_post?.imagen_urls?.length ? post.public_post.imagen_urls
            : post.imagen_urls?.length ? post.imagen_urls
            : [post.public_post?.imagen_url || post.imagen_url || post.imageUrl]
        ).filter(Boolean) as string[];

        // ── Render frames ──
        console.log('[ShortVideo] Step 3: Rendering frames...');

        // Download one hero image for the answer phase (fallback if no stock video)
        let heroPath: string | null = null;
        if (allImageUrls.length > 0) {
            const heroRes = await fetch(allImageUrls[0]);
            if (heroRes.ok) {
                heroPath = join(workDir, 'hero.jpg');
                await fs.writeFile(heroPath, Buffer.from(await heroRes.arrayBuffer()));
            }
        }

        // Try to fetch a real stock video clip for the answer phase
        console.log('[ShortVideo] Step 3b: Fetching stock video for answer phase...');
        let stockVideoPath: string | null = null;
        try {
            const stockResult = await fetchStockVideo(scriptQuestion, scriptAnswer);
            if (stockResult) {
                stockVideoPath = join(workDir, 'stock_clip.mp4');
                await fs.writeFile(stockVideoPath, stockResult.buffer);
                console.log(`[ShortVideo] Stock video downloaded (${stockResult.duration}s clip)`);
            } else {
                console.log('[ShortVideo] No stock video found, using hero image fallback');
            }
        } catch (err: any) {
            console.warn('[ShortVideo] Stock video fetch failed, using hero image fallback:', err.message);
        }

        const [textFrameBuffer, endFrameBuffer] = await Promise.all([
            renderTextFrame(),
            renderEndFrame(),
        ]);

        const textFramePath = join(workDir, 'frame_text.png');
        const endFramePath = join(workDir, 'frame_end.png');
        await Promise.all([
            fs.writeFile(textFramePath, textFrameBuffer),
            fs.writeFile(endFramePath, endFrameBuffer),
        ]);

        // Only render hero frame if we have an image and might need it
        let heroFramePath: string | null = null;
        if (heroPath && !stockVideoPath) {
            const heroFrameBuffer = await renderFrame({ heroPath });
            heroFramePath = join(workDir, 'frame_hero.png');
            await fs.writeFile(heroFramePath, heroFrameBuffer);
        }

        // ── Build subtitles ──
        // Offset answer timestamps by question duration so they appear after the question
        const offsetAnswerTs = answerTimestamps.map(w => ({
            word: w.word,
            start: w.start + questionDuration,
            end: w.end + questionDuration,
        }));

        const allTimestampsForSubs = [...questionTimestamps, ...offsetAnswerTs];
        const questionWordCount = questionTimestamps.length;
        const subtitles = buildChunksFromTimestamps(allTimestampsForSubs, 7, questionWordCount);

        const totalDuration = questionDuration + answerDuration;
        const endFrameDuration = 2.0;
        const fullDuration = totalDuration + endFrameDuration;

        const assContent = generateAssSubtitles(subtitles, totalDuration, '');
        const assPath = join(workDir, 'subtitles.ass');
        await fs.writeFile(assPath, assContent, 'utf-8');

        // ── Resolve ffmpeg path ──
        const { existsSync } = require('fs');
        const { execSync: execSyncCheck, spawnSync } = require('child_process');
        const pathMod = require('path');

        let ffmpegPath = pathMod.join(process.cwd(), 'node_modules', 'ffmpeg-static', 'ffmpeg');
        if (!existsSync(ffmpegPath)) {
            try {
                ffmpegPath = execSyncCheck('which ffmpeg', { encoding: 'utf8' }).trim();
            } catch {
                throw new Error(`ffmpeg not found`);
            }
        }

        // ── Assemble video with ffmpeg ──
        // Three phases:
        // 1. Text-on-black + question audio (looped for questionDuration)
        // 2. Hero image + answer audio (looped for answerDuration)
        // 3. End frame (2 seconds, no audio — silent)
        console.log('[ShortVideo] Step 4: Assembling video...');

        const fontsDir = join(process.cwd(), 'public/fonts/hkgrotesk');
        const fontconfigPath = join(workDir, 'fonts.conf');
        await fs.writeFile(fontconfigPath, `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <dir>${fontsDir}</dir>
  <cachedir>${workDir}/fc-cache</cachedir>
</fontconfig>`, 'utf-8');
        await fs.mkdir(join(workDir, 'fc-cache'), { recursive: true });

        const outputPath = join(workDir, 'output.mp4');

        // Build ffmpeg — if we have a stock video clip, use it for the answer phase.
        // Otherwise, fall back to the looped hero image.
        const useStockVideo = !!stockVideoPath;
        if (!useStockVideo && !heroFramePath) {
            throw new Error('No stock video or hero image available for the answer phase');
        }
        let ffmpegArgs: string[];

        if (useStockVideo) {
            // Stock video pipeline: 3s black intro, then stock video for the rest
            const introBlackDuration = Math.min(questionDuration, 3.0);
            const stockVideoDuration = (questionDuration - introBlackDuration) + answerDuration;
            ffmpegArgs = [
                '-y',
                '-loop', '1', '-framerate', '2', '-t', introBlackDuration.toFixed(3), '-i', textFramePath,
                '-stream_loop', '-1', '-t', stockVideoDuration.toFixed(3), '-i', stockVideoPath!,
                '-loop', '1', '-framerate', '2', '-t', endFrameDuration.toFixed(3), '-i', endFramePath,
                '-i', combinedAudioPath,
                // Scale stock video to 1920x1080, pad if needed to maintain aspect ratio
                '-filter_complex',
                `[0:v]setsar=1[v0];` +
                `[1:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,setsar=1[scaled];` +
                `[2:v]setsar=1[v2];` +
                `[v0][scaled][v2]concat=n=3:v=1:a=0[vid];` +
                `[vid]ass=${assPath}:fontsdir=${fontsDir}[vout]`,
                '-map', '[vout]',
                '-map', '3:a',
                '-c:v', 'libx264',
                '-preset', 'ultrafast',
                '-crf', '23',
                '-r', '15',
                '-c:a', 'aac',
                '-b:a', '128k',
                '-ac', '2',
                '-ar', '44100',
                '-t', fullDuration.toFixed(2),
                '-movflags', '+faststart',
                '-pix_fmt', 'yuv420p',
                outputPath,
            ];
        } else {
            // Hero image fallback pipeline (all static images)
            ffmpegArgs = [
                '-y',
                '-loop', '1', '-framerate', '2', '-t', questionDuration.toFixed(3), '-i', textFramePath,
                '-loop', '1', '-framerate', '2', '-t', answerDuration.toFixed(3), '-i', heroFramePath!,
                '-loop', '1', '-framerate', '2', '-t', endFrameDuration.toFixed(3), '-i', endFramePath,
                '-i', combinedAudioPath,
                '-filter_complex', `[0:v]setsar=1[v0];[1:v]setsar=1[v1];[2:v]setsar=1[v2];[v0][v1][v2]concat=n=3:v=1:a=0[vid];[vid]ass=${assPath}:fontsdir=${fontsDir}[vout]`,
                '-map', '[vout]',
                '-map', '3:a',
                '-c:v', 'libx264',
                '-preset', 'ultrafast',
                '-crf', '23',
                '-r', '15',
                '-c:a', 'aac',
                '-b:a', '128k',
                '-ac', '2',
                '-ar', '44100',
                '-t', fullDuration.toFixed(2),
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
            console.error('[ShortVideo] ffmpeg stderr tail:', fullStderr.slice(-500));
            throw new Error(`ffmpeg exited with code ${ffmpegResult.status}`);
        }
        console.log('[ShortVideo] FFmpeg completed');

        // ── Upload + stream ──
        const videoBuffer = await fs.readFile(outputPath);

        const videoPath = `videos/short-${postId}.mp4`;
        storage.bucket().file(videoPath).save(videoBuffer, {
            metadata: {
                contentType: 'video/mp4',
                metadata: { postId, format: 'short', generatedAt: new Date().toISOString() },
            },
        }).catch((e: any) => console.warn('[ShortVideo] Cache upload failed:', e.message));

        // Cleanup
        await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});

        return new NextResponse(new Uint8Array(videoBuffer), {
            headers: {
                'Content-Type': 'video/mp4',
                'Content-Disposition': `attachment; filename="earnest-short-${postId}.mp4"`,
                'Content-Length': String(videoBuffer.length),
            },
        });
    } catch (error: any) {
        console.error('[ShortVideo] Generation failed:', error);
        await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
        return NextResponse.json(
            { error: 'Short video generation failed', detail: error.message },
            { status: 500 }
        );
    }
}

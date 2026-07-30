/**
 * Shared short-form video assembly module.
 * Extracted from the video route so it can be called from regeneration,
 * cleanup-chats, and the video download endpoint.
 */
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { storage } from '@/lib/firebase/admin';
import { generateAssSubtitles, buildChunksFromTimestamps } from '@/lib/video/videoSubtitles';
import { renderTextFrame, renderEndFrame } from '@/lib/video/renderFrame';
import { fetchStockVideo } from '@/lib/video/stockVideo';

export interface WordTimestamp {
    word: string;
    start: number;
    end: number;
}

export interface AssembleShortVideoOptions {
    postId: string;
    scriptQuestion: string;
    scriptAnswer: string;
    questionDuration: number;
    answerDuration: number;
    questionTimestamps: WordTimestamp[];
    answerTimestamps: WordTimestamp[];
    combinedAudioBuffer: Buffer;
}

export interface AssembleShortVideoResult {
    videoBuffer: Buffer;
    videoUrl: string;
}

/**
 * Assembles a short-form Q&A video from pre-generated audio and script.
 * Handles stock video fetch, frame rendering, ffmpeg assembly, and Storage upload.
 *
 * @returns The video buffer and its public Firebase Storage URL
 */
export async function assembleShortVideo(opts: AssembleShortVideoOptions): Promise<AssembleShortVideoResult> {
    const {
        postId,
        scriptQuestion,
        scriptAnswer,
        questionDuration,
        answerDuration,
        questionTimestamps,
        answerTimestamps,
        combinedAudioBuffer,
    } = opts;

    const workDir = join(tmpdir(), `short-video-${postId}-${Date.now()}`);
    await fs.mkdir(workDir, { recursive: true });

    try {
        // ── Write audio to disk ──
        const combinedAudioPath = join(workDir, 'combined.mp3');
        await fs.writeFile(combinedAudioPath, combinedAudioBuffer);

        // ── Fetch stock video ──
        console.log('[AssembleShortVideo] Fetching stock video...');
        let stockVideoPath: string | null = null;
        try {
            const stockResult = await fetchStockVideo(scriptQuestion, scriptAnswer);
            if (stockResult) {
                stockVideoPath = join(workDir, 'stock_clip.mp4');
                await fs.writeFile(stockVideoPath, stockResult.buffer);
                console.log(`[AssembleShortVideo] Stock video downloaded (${stockResult.duration}s clip)`);
            } else {
                console.log('[AssembleShortVideo] No stock video found, using black frame fallback');
            }
        } catch (err: any) {
            console.warn('[AssembleShortVideo] Stock video fetch failed:', err.message);
        }

        // ── Render frames ──
        console.log('[AssembleShortVideo] Rendering frames...');
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

        // ── Build subtitles ──
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

        // ── Resolve ffmpeg ──
        const { existsSync } = require('fs');
        const { execSync: execSyncCheck, spawnSync } = require('child_process');
        const pathMod = require('path');

        let ffmpegPath = pathMod.join(process.cwd(), 'node_modules', 'ffmpeg-static', 'ffmpeg');
        if (!existsSync(ffmpegPath)) {
            try {
                ffmpegPath = execSyncCheck('which ffmpeg', { encoding: 'utf8' }).trim();
            } catch {
                throw new Error('ffmpeg not found');
            }
        }

        // ── Fonts config ──
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

        // ── Assemble video ──
        console.log('[AssembleShortVideo] Assembling video with ffmpeg...');
        const useStockVideo = !!stockVideoPath;
        let ffmpegArgs: string[];

        if (useStockVideo) {
            // Black intro: max 3 seconds, then stock video plays for the remainder
            const introBlackDuration = Math.min(questionDuration, 3.0);
            const stockVideoDuration = (questionDuration - introBlackDuration) + answerDuration;

            ffmpegArgs = [
                '-y',
                '-loop', '1', '-framerate', '2', '-t', introBlackDuration.toFixed(3), '-i', textFramePath,
                '-stream_loop', '-1', '-t', stockVideoDuration.toFixed(3), '-i', stockVideoPath!,
                '-loop', '1', '-framerate', '2', '-t', endFrameDuration.toFixed(3), '-i', endFramePath,
                '-i', combinedAudioPath,
                '-filter_complex',
                `[0:v]setsar=1[v0];` +
                `[1:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1[scaled];` +
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
            // Fallback: use black frame for answer phase too
            ffmpegArgs = [
                '-y',
                '-loop', '1', '-framerate', '2', '-t', questionDuration.toFixed(3), '-i', textFramePath,
                '-loop', '1', '-framerate', '2', '-t', answerDuration.toFixed(3), '-i', textFramePath,
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
            console.error('[AssembleShortVideo] ffmpeg stderr tail:', fullStderr.slice(-500));
            throw new Error(`ffmpeg exited with code ${ffmpegResult.status}`);
        }
        console.log('[AssembleShortVideo] FFmpeg completed');

        // ── Upload to Storage ──
        const videoBuffer = await fs.readFile(outputPath);
        const videoPath = `videos/short-${postId}-${Date.now()}.mp4`;
        const file = storage.bucket().file(videoPath);
        await file.save(videoBuffer, {
            metadata: {
                contentType: 'video/mp4',
                metadata: { postId, format: 'short', generatedAt: new Date().toISOString() },
            },
        });
        await file.makePublic();
        const videoUrl = `https://storage.googleapis.com/${storage.bucket().name}/${videoPath}`;
        console.log(`[AssembleShortVideo] Uploaded to ${videoUrl}`);

        return { videoBuffer, videoUrl };
    } finally {
        // Cleanup temp directory
        await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
    }
}

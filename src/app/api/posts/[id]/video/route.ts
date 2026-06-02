import { NextRequest, NextResponse } from 'next/server';
import { db, storage } from '@/lib/firebase/admin';
import { getAuth } from 'firebase-admin/auth';
import { generateSubtitles, escapeDrawText } from '@/lib/video/videoSubtitles';
import { formatDistanceToNow } from 'date-fns';
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
        const letterAudioUrl = post.letter_audio_url;
        const heroUrl = post.public_post?.imagen_url || post.imagen_url || post.imageUrl;
        if (!letterAudioUrl || !heroUrl) {
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

        const heroPath = join(workDir, 'hero.jpg');
        const letterAudioPath = join(workDir, 'letter.mp3');
        const responseAudioPath = join(workDir, 'response.mp3');
        const combinedAudioPath = join(workDir, 'combined.mp3');
        const outputPath = join(workDir, 'output.mp4');

        // Download hero image
        const heroRes = await fetch(heroUrl);
        if (!heroRes.ok) throw new Error(`Failed to download hero image: ${heroRes.status}`);
        const heroBuffer = Buffer.from(await heroRes.arrayBuffer());
        await fs.writeFile(heroPath, heroBuffer);

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

        // ── Download author avatar from user profile doc ──
        // author_avatar_url doesn't exist on the post document — it's fetched
        // from the user's profile at query time by the feed/post APIs.
        const avatarPath = join(workDir, 'avatar.jpg');
        let hasAvatar = false;
        const authorId = post.authorId || post.uid;
        if (authorId) {
            try {
                const authorDoc = await db.collection('users').doc(authorId).get();
                const avatarUrl = authorDoc.data()?.character_bible?.compiled_output?.avatar_url;
                if (avatarUrl) {
                    const avatarRes = await fetch(avatarUrl);
                    if (avatarRes.ok) {
                        await fs.writeFile(avatarPath, Buffer.from(await avatarRes.arrayBuffer()));
                        hasAvatar = true;
                        const avatarStat = await fs.stat(avatarPath);
                        console.log(`[Video] Avatar downloaded: ${avatarStat.size} bytes`);
                    }
                }
            } catch (e: any) {
                console.log('[Video] Failed to download avatar:', e.message);
            }
        }

        // ── Get audio durations via ffmpeg ──
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

        const letterDuration = await getDuration(letterAudioPath);
        const responseDuration = hasResponseAudio ? await getDuration(responseAudioPath) : 0;
        const totalDuration = letterDuration + responseDuration;
        console.log(`[Video] Letter: ${letterDuration}s, Response: ${responseDuration}s, Total: ${totalDuration}s`);

        if (totalDuration <= 0) {
            throw new Error('Could not determine audio duration');
        }

        // ── Concatenate audio if we have response ──
        if (hasResponseAudio) {
            // Create concat list file
            const concatListPath = join(workDir, 'concat.txt');
            await fs.writeFile(concatListPath, `file '${letterAudioPath}'\nfile '${responseAudioPath}'\n`);
            spawnSync(ffmpegPath, [
                '-y', '-f', 'concat', '-safe', '0',
                '-i', concatListPath, '-c', 'copy', combinedAudioPath,
            ], { timeout: 30000 });
        } else {
            await fs.copyFile(letterAudioPath, combinedAudioPath);
        }

        // ── Build subtitle drawtext filters ──
        const letterText = post.public_post?.letter || post.letter || '';
        const responseText = post.public_post?.response || post.response || '';
        const titleText = post.public_post?.title || post.title || '';

        const subtitles = generateSubtitles(letterText, responseText, letterDuration, responseDuration, 8);

        // Resolve font path — use the TTF files in public/fonts
        const fontBold = join(process.cwd(), 'public/fonts/hkgrotesk/hkgrotesk-bold-webfont.ttf');
        const fontRegular = join(process.cwd(), 'public/fonts/hkgrotesk/hkgrotesk-regular-webfont.ttf');
        const { existsSync: existsSyncFonts, statSync: statSyncFonts } = require('fs');
        const boldExists = existsSyncFonts(fontBold);
        const regExists = existsSyncFonts(fontRegular);
        console.log(`[Video] fontBold exists: ${boldExists} (size: ${boldExists ? statSyncFonts(fontBold).size : 0}) at ${fontBold}`);
        console.log(`[Video] fontRegular exists: ${regExists} (size: ${regExists ? statSyncFonts(fontRegular).size : 0}) at ${fontRegular}`);

        // Build drawtext filter chain — MINIMAL TEST
        const filters: string[] = [];
        filters.push('[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,format=yuv420p[bg]');
        filters.push('[bg]drawbox=x=0:y=h-280:w=iw:h=280:color=black@0.5:t=fill[v0]');
        filters.push(`[v0]drawtext=text=Hello:fontfile=${fontBold}:fontsize=48:fontcolor=white:x=40:y=40[v1]`);
        const currentLabel = 'v1';

        // ── Run ffmpeg ──
        const filterComplex = filters.join(';');

        // Write filter graph to file — avoids ffmpeg argument parser limits
        const filterScriptPath = join(workDir, 'filter_complex.txt');
        await fs.writeFile(filterScriptPath, filterComplex, 'utf-8');

        // Diagnostic logging
        const quoteCount = (filterComplex.match(/'/g) || []).length;
        console.log(`[Video] filter_complex: ${filterComplex.length} chars, ${quoteCount} single quotes (even: ${quoteCount % 2 === 0})`);
        console.log(`[Video] filter count: ${filters.length}`);
        // Log each filter entry so we can identify bad ones
        filters.forEach((f, i) => {
            if (f.includes('drawtext') || i < 3) {
                console.log(`[Video] filter[${i}]: ${f.substring(0, 200)}`);
            }
        });
        console.log('[Video] Running ffmpeg...');
        const ffmpegArgs: string[] = [
            '-y',
            '-loop', '1',
            '-i', heroPath,          // [0:v] hero image
            '-i', combinedAudioPath, // [1:a] audio
        ];
        if (hasAvatar) {
            ffmpegArgs.push('-loop', '1', '-i', avatarPath); // [2:v] avatar
        }
        ffmpegArgs.push(
            '-filter_complex', filterComplex,
            '-map', `[${currentLabel}]`,
            '-map', '1:a',
            '-c:v', 'libx264',
            '-preset', 'fast',
            '-crf', '23',
            '-c:a', 'aac',
            '-b:a', '128k',
            '-t', totalDuration.toFixed(2),
            '-movflags', '+faststart',
            '-pix_fmt', 'yuv420p',
            outputPath,
        );
        const ffmpegResult = spawnSync(ffmpegPath, ffmpegArgs, { timeout: 90000, maxBuffer: 50 * 1024 * 1024 });

        if (ffmpegResult.status !== 0) {
            const fullStderr = (ffmpegResult.stderr || '').toString();
            const stderrDebugPath = pathMod.join(workDir, 'ffmpeg_stderr.txt');
            await fs.writeFile(stderrDebugPath, fullStderr);
            console.error('[Video] Full stderr at:', stderrDebugPath);
            console.error('[Video] ffmpeg signal:', ffmpegResult.signal);
            console.error('[Video] ffmpeg stderr tail:', fullStderr.slice(-300));
            throw new Error(`ffmpeg exited with code ${ffmpegResult.status} signal ${ffmpegResult.signal}`);
        }
        console.log('[Video] FFmpeg completed');

        // ── Upload to Firebase Storage (cache) + stream directly to client ──
        const videoBuffer = await fs.readFile(outputPath);

        // Cache in the background — don't await so we can stream immediately
        file.save(videoBuffer, {
            metadata: {
                contentType: 'video/mp4',
                metadata: { postId, generatedAt: new Date().toISOString() },
            },
        }).catch((e: any) => console.warn('[Video] Cache upload failed:', e.message));

        // ── Cleanup /tmp ──
        await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});

        // Stream the MP4 directly — no signed URL, no Google login prompt
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

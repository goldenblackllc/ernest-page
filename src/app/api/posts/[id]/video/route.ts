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

        // Build drawtext filter chain — designed to match the site's short card UI
        const filters: string[] = [];

        // Scale image to 1080x1920 (9:16 portrait — standard for TikTok/Reels/Shorts) and set pixel format
        filters.push('[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,format=yuv420p[bg]');

        let currentLabel = 'bg';
        let labelIndex = 0;

        // ── Smooth gradient overlay (matching site's from-black/70 via-transparent to-black/80) ──
        // Single geq expression computes per-pixel alpha — no banding.
        //   Top (y 0→350):    black at 70% → 0% opacity
        //   Middle:           fully transparent
        //   Bottom (y 1600→1920): black at 0% → 80% opacity
        filters.push(
            'color=black:s=1080x1920,format=yuva420p,' +
            'geq=lum=0:cb=128:cr=128:' +
            'a=if(lt(Y\\,350)\\,178*(350-Y)/350\\,if(gt(Y\\,1600)\\,204*(Y-1600)/320\\,0))[grad]'
        );
        const gradLabel = `v${labelIndex++}`;
        filters.push(`[${currentLabel}][grad]overlay=0:0:format=auto[${gradLabel}]`);
        currentLabel = gradLabel;

        // ── Author row: avatar + "Me" + timestamp (matching the site's short card header) ──
        const avatarSize = 90;          // site's w-9 (36px) × 2.57 scale ≈ 93 → round to 90
        const authorRowY = 42;          // site's p-4 (16px) × 2.57 ≈ 41 → use 42
        let authorTextX = 40;           // default if no avatar

        if (hasAvatar) {
            // Circular avatar: scale + crop to square, convert to yuva, mask with circle via geq
            const ac = avatarSize / 2;   // center = 45
            const ar2 = (ac - 1) * (ac - 1); // radius² = 44² = 1936 (1px inset for clean edge)
            filters.push(
                `[2:v]scale=${avatarSize}:${avatarSize}:force_original_aspect_ratio=increase,` +
                `crop=${avatarSize}:${avatarSize},format=yuva420p,` +
                'geq=lum=lum(X\\,Y):cb=cb(X\\,Y):cr=cr(X\\,Y):' +
                'a=if(lt((X-' + ac + ')*(X-' + ac + ')+(Y-' + ac + ')*(Y-' + ac + ')\\,' + ar2 + ')\\,255\\,0)[avatar_circle]'
            );
            const nextLabel = `v${labelIndex++}`;
            filters.push(`[${currentLabel}][avatar_circle]overlay=40:${authorRowY}[${nextLabel}]`);
            currentLabel = nextLabel;
            authorTextX = 40 + avatarSize + 26; // right of avatar with gap (site's gap-2.5 × 2.57)
        }

        // "Me" label — matches site's text-sm font-semibold text-white/90
        const meLabel = `v${labelIndex++}`;
        filters.push(
            `[${currentLabel}]drawtext=text='Me':fontfile='${fontBold}':fontsize=34:fontcolor=white@0.9:` +
            `x=${authorTextX}:y=${authorRowY + 10}:shadowcolor=black@0.5:shadowx=1:shadowy=1[${meLabel}]`
        );
        currentLabel = meLabel;

        // Timestamp — matches site's text-[10px] text-white/50
        const postCreatedAt = post.created_at;
        let createdDate: Date;
        if (postCreatedAt?.toDate) {
            createdDate = postCreatedAt.toDate();
        } else if (postCreatedAt?._seconds) {
            createdDate = new Date(postCreatedAt._seconds * 1000);
        } else {
            createdDate = new Date();
        }
        const timeAgo = formatDistanceToNow(createdDate, { addSuffix: true });
        const timeLabel = `v${labelIndex++}`;
        filters.push(
            `[${currentLabel}]drawtext=text='${escapeDrawText(timeAgo)}':fontfile='${fontRegular}':fontsize=24:fontcolor=white@0.5:` +
            `x=${authorTextX}:y=${authorRowY + 50}:shadowcolor=black@0.3:shadowx=1:shadowy=1[${timeLabel}]`
        );
        currentLabel = timeLabel;

        // ── Title: LEFT-ALIGNED below author row, matching site card ──
        // Word-wrap at ~52 chars so wrapping matches the site's 2-line layout at 1080px
        const MAX_TITLE_CHARS = 52;
        const titleWords = titleText.split(' ');
        const titleLines: string[] = [];
        let currentTitleLine = '';
        for (const word of titleWords) {
            if (currentTitleLine.length + word.length + 1 > MAX_TITLE_CHARS && currentTitleLine.length > 0) {
                titleLines.push(currentTitleLine.trim());
                currentTitleLine = word;
            } else {
                currentTitleLine += (currentTitleLine ? ' ' : '') + word;
            }
        }
        if (currentTitleLine) titleLines.push(currentTitleLine.trim());

        const titleFontSize = 38;          // decreased to match site's visual weight (HK Grotesk Bold renders larger)
        const titleLineHeight = Math.round(titleFontSize * 1.25); // site's leading-tight (1.25)
        const titleStartY = authorRowY + avatarSize + 28; // below author row with gap matching site's mb-3
        const titleX = 40;                 // left-aligned with padding, matching site's p-4

        for (let i = 0; i < titleLines.length; i++) {
            const escapedLine = escapeDrawText(titleLines[i]);
            const nextLabel = `v${labelIndex++}`;
            filters.push(
                `[${currentLabel}]drawtext=text='${escapedLine}':fontfile='${fontBold}':fontsize=${titleFontSize}:fontcolor=white:` +
                `x=${titleX}:y=${titleStartY + i * titleLineHeight}:shadowcolor=black@0.8:shadowx=2:shadowy=2[${nextLabel}]`
            );
            currentLabel = nextLabel;
        }

        // ── Subtitles: TWO tiers matching the site exactly ──
        // Current chunk: 15px white (rendered as ~36px at 1080 res)
        // Next chunk preview: 13px white/40 (rendered as ~30px, alpha 0.4)
        for (let i = 0; i < subtitles.length; i++) {
            const sub = subtitles[i];
            const nextSub = subtitles[i + 1];
            const escapedCurrent = escapeDrawText(sub.text);
            const tStart = sub.startTime.toFixed(2);
            const tEnd = sub.endTime.toFixed(2);

            // Current subtitle line — bright white, 36px
            const nextLabel = `v${labelIndex++}`;
            filters.push(
                `[${currentLabel}]drawtext=text='${escapedCurrent}':fontfile='${fontRegular}':fontsize=36:fontcolor=white:` +
                `x=40:y=h-210:` +
                `enable='between(t,${tStart},${tEnd})':` +
                `shadowcolor=black@0.9:shadowx=2:shadowy=2[${nextLabel}]`
            );
            currentLabel = nextLabel;

            // Next subtitle preview — dimmer, 30px, white@0.4 (only if there's a next chunk)
            if (nextSub) {
                const escapedNext = escapeDrawText(nextSub.text);
                const nextLabel2 = `v${labelIndex++}`;
                filters.push(
                    `[${currentLabel}]drawtext=text='${escapedNext}':fontfile='${fontRegular}':fontsize=30:fontcolor=white@0.4:` +
                    `x=40:y=h-162:` +
                    `enable='between(t,${tStart},${tEnd})':` +
                    `shadowcolor=black@0.5:shadowx=1:shadowy=1[${nextLabel2}]`
                );
                currentLabel = nextLabel2;
            }
        }

        // ── Run ffmpeg ──
        const filterComplex = filters.join(';');

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
        const ffmpegResult = spawnSync(ffmpegPath, ffmpegArgs, { timeout: 90000 });

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

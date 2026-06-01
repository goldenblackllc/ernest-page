import { NextRequest, NextResponse } from 'next/server';
import { db, storage } from '@/lib/firebase/admin';
import { getAuth } from 'firebase-admin/auth';
import { generateSubtitles, escapeDrawText } from '@/lib/video/videoSubtitles';
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

        // ── Check cache ──
        const videoPath = `videos/${postId}.mp4`;
        const file = storage.bucket().file(videoPath);
        const [exists] = await file.exists();
        if (exists) {
            const [signedUrl] = await file.getSignedUrl({
                action: 'read',
                expires: Date.now() + 60 * 60 * 1000, // 1 hour
            });
            return NextResponse.json({ url: signedUrl, cached: true });
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

        // ── Get audio durations via ffprobe ──
        const ffmpegPath = require('ffmpeg-static') as string;
        const ffprobePath = ffmpegPath.replace(/ffmpeg$/, 'ffprobe');

        const getDuration = async (filePath: string): Promise<number> => {
            const { execSync } = require('child_process');
            const result = execSync(
                `"${ffprobePath}" -v error -show_entries format=duration -of csv=p=0 "${filePath}"`,
                { encoding: 'utf8' }
            ).trim();
            return parseFloat(result) || 0;
        };

        const letterDuration = await getDuration(letterAudioPath);
        const responseDuration = hasResponseAudio ? await getDuration(responseAudioPath) : 0;
        const totalDuration = letterDuration + responseDuration;

        if (totalDuration <= 0) {
            throw new Error('Could not determine audio duration');
        }

        // ── Concatenate audio if we have response ──
        if (hasResponseAudio) {
            const { execSync } = require('child_process');
            // Create concat list file
            const concatListPath = join(workDir, 'concat.txt');
            await fs.writeFile(concatListPath, `file '${letterAudioPath}'\nfile '${responseAudioPath}'\n`);
            execSync(
                `"${ffmpegPath}" -y -f concat -safe 0 -i "${concatListPath}" -c copy "${combinedAudioPath}"`,
                { timeout: 30000 }
            );
        } else {
            await fs.copyFile(letterAudioPath, combinedAudioPath);
        }

        // ── Build subtitle drawtext filters ──
        const letterText = post.public_post?.letter || post.letter || '';
        const responseText = post.public_post?.response || post.response || '';
        const titleText = post.public_post?.title || post.title || '';

        const subtitles = generateSubtitles(letterText, responseText, letterDuration, responseDuration);

        // Resolve font path — use the TTF files in public/fonts
        const fontBold = join(process.cwd(), 'public/fonts/hkgrotesk/hkgrotesk-bold-webfont.ttf');
        const fontRegular = join(process.cwd(), 'public/fonts/hkgrotesk/hkgrotesk-regular-webfont.ttf');

        // Build drawtext filter chain
        const filters: string[] = [];

        // Scale image to 1080x1350 (4:5) and set pixel format
        filters.push('[0:v]scale=1080:1350:force_original_aspect_ratio=increase,crop=1080:1350,format=yuv420p[bg]');

        // Build overlay chain — start with [bg], apply each filter sequentially
        let currentLabel = 'bg';
        let labelIndex = 0;

        // ── Gradient overlays FIRST (behind text) ──
        const nextLabelTopGrad = `v${labelIndex++}`;
        filters.push(
            `[${currentLabel}]drawbox=x=0:y=0:w=iw:h=220:color=black@0.6:t=fill[${nextLabelTopGrad}]`
        );
        currentLabel = nextLabelTopGrad;

        const nextLabelBottomGrad = `v${labelIndex++}`;
        filters.push(
            `[${currentLabel}]drawbox=x=0:y=h-280:w=iw:h=280:color=black@0.5:t=fill[${nextLabelBottomGrad}]`
        );
        currentLabel = nextLabelBottomGrad;

        // ── Title at top — persistent throughout video ──
        const escapedTitle = escapeDrawText(titleText);
        const nextLabel1 = `v${labelIndex++}`;
        filters.push(
            `[${currentLabel}]drawtext=text='${escapedTitle}':fontfile='${fontBold}':fontsize=42:fontcolor=white:` +
            `x=(w-tw)/2:y=80:shadowcolor=black@0.7:shadowx=2:shadowy=2[${nextLabel1}]`
        );
        currentLabel = nextLabel1;

        // ── Phase label (LETTER / RESPONSE) — small text above subtitles ──
        const nextLabelLetterPhase = `v${labelIndex++}`;
        filters.push(
            `[${currentLabel}]drawtext=text='LETTER':fontfile='${fontBold}':fontsize=22:fontcolor=white@0.5:` +
            `x=(w-tw)/2:y=h-240:enable='between(t,0,${letterDuration.toFixed(2)})':` +
            `shadowcolor=black@0.5:shadowx=1:shadowy=1[${nextLabelLetterPhase}]`
        );
        currentLabel = nextLabelLetterPhase;

        if (responseDuration > 0) {
            const nextLabelRespPhase = `v${labelIndex++}`;
            filters.push(
                `[${currentLabel}]drawtext=text='RESPONSE':fontfile='${fontBold}':fontsize=22:fontcolor=white@0.5:` +
                `x=(w-tw)/2:y=h-240:enable='between(t,${letterDuration.toFixed(2)},${totalDuration.toFixed(2)})':` +
                `shadowcolor=black@0.5:shadowx=1:shadowy=1[${nextLabelRespPhase}]`
            );
            currentLabel = nextLabelRespPhase;
        }

        // ── Subtitle chunks — each appears for its timed window at the bottom ──
        for (const sub of subtitles) {
            const escapedText = escapeDrawText(sub.text);
            const nextLabel = `v${labelIndex++}`;
            filters.push(
                `[${currentLabel}]drawtext=text='${escapedText}':fontfile='${fontRegular}':fontsize=36:fontcolor=white:` +
                `x=(w-tw)/2:y=h-180:line_spacing=8:` +
                `enable='between(t,${sub.startTime.toFixed(2)},${sub.endTime.toFixed(2)})':` +
                `shadowcolor=black@0.8:shadowx=2:shadowy=2[${nextLabel}]`
            );
            currentLabel = nextLabel;
        }

        // ── Progress bar at the very bottom ──
        const nextLabelBar = `v${labelIndex++}`;
        filters.push(
            `[${currentLabel}]drawbox=x=0:y=h-4:w=t/${totalDuration.toFixed(2)}*w:h=4:color=white@0.7:t=fill[${nextLabelBar}]`
        );
        currentLabel = nextLabelBar;

        // ── Run ffmpeg ──
        const filterComplex = filters.join(';\n');
        const { execSync } = require('child_process');

        const ffmpegCmd = [
            `"${ffmpegPath}"`,
            '-y',
            '-loop 1',
            `-i "${heroPath}"`,
            `-i "${combinedAudioPath}"`,
            `-filter_complex "${filterComplex}"`,
            `-map "[${currentLabel}]"`,
            '-map 1:a',
            '-c:v libx264',
            '-preset fast',
            '-crf 23',
            '-c:a aac',
            '-b:a 128k',
            `-t ${totalDuration.toFixed(2)}`,
            '-movflags +faststart',
            '-pix_fmt yuv420p',
            `"${outputPath}"`,
        ].join(' ');

        console.log('[Video] Running ffmpeg...');
        execSync(ffmpegCmd, { timeout: 90000 });
        console.log('[Video] FFmpeg completed');

        // ── Upload to Firebase Storage ──
        const videoBuffer = await fs.readFile(outputPath);
        await file.save(videoBuffer, {
            metadata: {
                contentType: 'video/mp4',
                metadata: {
                    postId,
                    generatedAt: new Date().toISOString(),
                },
            },
        });

        // Generate signed URL
        const [signedUrl] = await file.getSignedUrl({
            action: 'read',
            expires: Date.now() + 60 * 60 * 1000,
        });

        // ── Cleanup /tmp ──
        await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});

        return NextResponse.json({ url: signedUrl, cached: false });

    } catch (error: any) {
        console.error('[Video] Generation failed:', error);
        return NextResponse.json(
            { error: 'Video generation failed', detail: error.message },
            { status: 500 }
        );
    }
}

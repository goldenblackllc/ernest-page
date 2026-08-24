import { db, storage } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { verifyInternalAuth, verifyAuth, unauthorizedResponse } from '@/lib/auth/serverAuth';
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rateLimit';
import sharp from 'sharp';
import { validateGeneratedImage } from '@/lib/ai/validateImage';
import { generateImage } from '@/lib/ai/generateImage';
import { computeAge } from '@/lib/utils/parseBirthDate';

export const maxDuration = 60;

export async function POST(req: Request) {
    let uid: string | undefined;
    try {
        // Accept either internal auth (server-to-server) or user Bearer token (client consultation)
        const isInternal = verifyInternalAuth(req);
        let authedUid: string | null = null;
        if (!isInternal) {
            authedUid = await verifyAuth(req);
            if (!authedUid) return unauthorizedResponse();
        }

        const body = await req.json();
        uid = isInternal ? body.uid : authedUid!;

        if (!uid) {
            return Response.json({ error: 'Missing uid' }, { status: 400 });
        }

        // const rl = checkRateLimit(`avatar:${uid}`, RATE_LIMITS.avatar);
        // if (!rl.allowed) return rateLimitResponse(rl.resetMs);

        // Read identity and bible from Firestore
        const userDoc = await db.collection('users').doc(uid).get();
        if (!userDoc.exists) {
            return Response.json({ error: 'User not found' }, { status: 404 });
        }

        const data = userDoc.data()!;
        const identity = data.identity;
        const bible = data.character_bible;

        if (!identity) {
            return Response.json({ error: 'No identity found — complete onboarding first' }, { status: 400 });
        }

        const title = identity.title || 'A person of purpose';
        const gender = identity.gender || 'person';
        const birthdate = identity.birthdate || '';
        // New structured physical fields with legacy fallback
        const ethnicity = identity.ethnicity || '';
        const skinTone = identity.skin_tone || '';
        const hairColors: string[] = identity.hair_colors || [];
        const hairTexture = identity.hair_texture || '';
        const hairVolume = identity.hair_volume || '';
        const eyeColor = identity.eye_color || '';

        // Compute age from birth date
        const computedAge = computeAge(birthdate);
        const ageStr = computedAge ? `${computedAge}-year-old` : '';

        // Build hair description
        const hairColorStr = hairColors.length > 0
            ? hairColors.map(c => c.toLowerCase()).join(' and ')
            : '';
        const hairParts = [
            hairVolume ? hairVolume.toLowerCase() : '',
            hairColorStr,
            hairTexture ? hairTexture.toLowerCase() : '',
        ].filter(Boolean).join(' ');

        // Build physical description from structured fields
        const physicalParts = [
            ageStr,
            gender,
            ethnicity ? `of ${ethnicity} heritage` : '',
            skinTone ? `with ${skinTone.toLowerCase()} skin` : '',
            eyeColor ? `${eyeColor.toLowerCase()} eyes` : '',
            hairParts ? `${hairParts} hair` : '',
        ].filter(Boolean).join(' ');

        // Extract Style & Presence from compiled bible (character decides styling)
        const compiledSections = bible?.compiled_output?.ideal || [];
        const styleEntry = compiledSections.find(
            (s: { heading: string; content: string }) =>
                s.heading === 'Style & Presence' || s.heading === 'Style and Presence'
        );
        const wardrobeEntry = compiledSections.find(
            (s: { heading: string; content: string }) =>
                s.heading === 'Wardrobe'
        );
        // Fallback to legacy path for older profiles
        const compiledBible = bible?.compiled_bible || {};
        const legacyStyle = compiledBible.lifestyle?.['Style & Presence']
            || compiledBible.lifestyle?.['style_and_presence']
            || '';
        const rawStyle = styleEntry?.content || legacyStyle;
        const styleCues = typeof rawStyle === 'string'
            ? rawStyle.substring(0, 300)
            : typeof rawStyle === 'object'
                ? JSON.stringify(rawStyle).substring(0, 300)
                : '';
        const wardrobeCues = typeof wardrobeEntry?.content === 'string'
            ? wardrobeEntry.content.substring(0, 200)
            : '';
        const characterStyling = [styleCues, wardrobeCues].filter(Boolean).join(' ').substring(0, 500);

        const prompt = [
            'TIGHT HEADSHOT PORTRAIT framed from the chest up. Square 1:1 aspect ratio.',
            `A ${physicalParts} who embodies "${title}".`,
            characterStyling ? `The character's chosen style and presentation: ${characterStyling}` : '',
            'Cinematic studio lighting, shallow depth of field, warm tones.',
            'Instagram-quality sharpness and color saturation.',
            'Natural, confident expression. Face and upper chest fill the frame.',
            'Full-bleed composition. No borders, no frames, no margins, no white space around the subject.',
            !ethnicity ? 'Do not default to any racial or ethnic stereotype. Use ambiguous, diverse features unless background is specified.' : '',
            'No text, no watermarks, no logos.',
            "Do NOT show the subject's waist, hips, legs, or feet. Do NOT zoom out to show the full body. Keep the camera tight on the face and upper chest only.",
        ].filter(Boolean).join(' ');

        const finalPrompt = prompt;

        console.log(`[Avatar] Generating for ${uid}: "${title}"`);
        console.log(`[Avatar] Prompt: ${finalPrompt}`);

        // Mark avatar as generating
        await db.collection('users').doc(uid).set({
            character_bible: {
                avatar_status: 'generating',
                avatar_last_attempt: Date.now(),
            }
        }, { merge: true });

        // Generate avatar with retry loop (up to 3 attempts)
        const MAX_AVATAR_ATTEMPTS = 3;
        const AVATAR_RETRY_DELAY_MS = 2000;
        let buffer: Buffer | null = null;
        let referenceBuffer: Buffer | null = null;

        for (let attempt = 1; attempt <= MAX_AVATAR_ATTEMPTS; attempt++) {
            const imageResult = await generateImage({
                prompt: finalPrompt,
                aspectRatio: '1:1',
                logPrefix: 'Avatar',
            });

            if (!imageResult) {
                console.error(`[Avatar] Image generation returned null (attempt ${attempt}/${MAX_AVATAR_ATTEMPTS})`);
                if (attempt < MAX_AVATAR_ATTEMPTS) {
                    await new Promise(resolve => setTimeout(resolve, AVATAR_RETRY_DELAY_MS));
                    continue;
                }
                break;
            }

            // Resize and compress before validating
            const rawBuffer = imageResult.buffer;
            const resizedBuffer = await sharp(rawBuffer)
                .resize(256, 256, { fit: 'cover' })
                .jpeg({ quality: 80 })
                .toBuffer();

            // Also create a higher-res reference image (512px) for character identity
            // anchoring during post/digest image generation
            const resizedRefBuffer = await sharp(rawBuffer)
                .resize(512, 512, { fit: 'cover' })
                .jpeg({ quality: 85 })
                .toBuffer();

            console.log(`[Avatar] Resized: ${rawBuffer.length} → avatar ${resizedBuffer.length} bytes, reference ${resizedRefBuffer.length} bytes`);

            // Validate image quality before uploading
            const validation = await validateGeneratedImage(resizedBuffer, finalPrompt);
            if (!validation.pass) {
                console.warn(`[Avatar] Image validation failed for ${uid} (attempt ${attempt}/${MAX_AVATAR_ATTEMPTS}):`, validation.summary, validation.issues);
                if (attempt < MAX_AVATAR_ATTEMPTS) {
                    await new Promise(resolve => setTimeout(resolve, AVATAR_RETRY_DELAY_MS));
                    continue;
                }
                break;
            }

            // Validation passed — use these buffers
            buffer = resizedBuffer;
            referenceBuffer = resizedRefBuffer;
            console.log(`[Avatar] Image validated for ${uid} on attempt ${attempt}`);
            break;
        }

        if (!buffer || !referenceBuffer) {
            try {
                await db.collection('users').doc(uid).set({
                    character_bible: {
                        avatar_status: 'failed',
                        avatar_attempt_count: FieldValue.increment(1),
                        avatar_error: `Image failed after ${MAX_AVATAR_ATTEMPTS} attempts`,
                    }
                }, { merge: true });
            } catch (e) {
                console.error('[Avatar] Failed to write error status:', e);
            }
            return Response.json({ error: `Image failed after ${MAX_AVATAR_ATTEMPTS} attempts` }, { status: 422 });
        }

        const bucket = storage.bucket();

        // Upload standard 256px avatar
        const fileName = `avatars/${uid}.jpg`;
        const file = bucket.file(fileName);

        await file.save(buffer, {
            metadata: {
                contentType: 'image/jpeg',
                cacheControl: 'public, max-age=3600',
            },
            public: true,
        });

        // Upload 512px reference image for character consistency anchoring
        const refFileName = `avatars/${uid}_reference.jpg`;
        const refFile = bucket.file(refFileName);
        await refFile.save(referenceBuffer, {
            metadata: {
                contentType: 'image/jpeg',
                cacheControl: 'public, max-age=86400',
            },
            public: true,
        });
        console.log(`[Avatar] Reference image saved: ${refFileName}`);

        // Cache-bust: append timestamp so browsers/CDN don't serve the old image
        const avatarUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}?v=${Date.now()}`;
        console.log(`[Avatar] Saved: ${avatarUrl}`);

        // Save to Firestore under character_bible.compiled_output.avatar_url
        const currentBible = bible || {};
        await db.collection('users').doc(uid).set({
            character_bible: {
                ...currentBible,
                compiled_output: {
                    ...(currentBible.compiled_output || {}),
                    avatar_url: avatarUrl,
                },
                avatar_status: 'ready',
                avatar_attempt_count: FieldValue.increment(1),
                avatar_error: null,
            },
        }, { merge: true });

        return Response.json({ success: true, avatar_url: avatarUrl });

    } catch (error: any) {
        console.error('[Avatar] Error:', error);
        if (uid) {
            try {
                await db.collection('users').doc(uid).set({
                    character_bible: {
                        avatar_status: 'failed',
                        avatar_attempt_count: FieldValue.increment(1),
                        avatar_error: (error.message || 'Avatar generation failed').substring(0, 500),
                    }
                }, { merge: true });
            } catch (e) {
                console.error('[Avatar] Failed to write error status:', e);
            }
        }
        return Response.json({ error: error.message || 'Avatar generation failed' }, { status: 500 });
    }
}

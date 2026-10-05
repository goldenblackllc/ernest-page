/**
 * Avatar generation — headshot portrait + 512px reference image per user.
 *
 * generateAvatar   (task queue)  — does the work for one user
 * requestAvatar    (callable)    — the profile screen asks for a new avatar
 * retryAvatars     (scheduled)   — hourly retry of failed/pending avatars
 *
 * Bible compiles call generateAvatarForUser directly (see characterBuild.ts).
 */

import { onTaskDispatched } from 'firebase-functions/v2/tasks';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFunctions } from 'firebase-admin/functions';
import sharp from 'sharp';
import { db, storage, FieldValue } from './lib/firebase/admin.js';
import { generateImage } from './lib/ai/generateImage.js';
import { validateGeneratedImage } from './lib/ai/validateImage.js';
import { computeAge } from './lib/utils/parseBirthDate.js';

const REGION = 'us-central1';
const MAX_AVATAR_ATTEMPTS = 3;
const AVATAR_RETRY_DELAY_MS = 2000;

interface AvatarTask {
    uid: string;
}

function enqueueAvatar(uid: string) {
    return getFunctions()
        .taskQueue<AvatarTask>(`locations/${REGION}/functions/generateAvatar`)
        .enqueue({ uid });
}

// ─── Core generation ────────────────────────────────────────────────────────

function buildAvatarPrompt(data: FirebaseFirestore.DocumentData): string {
    const title = data.defining_words?.join(', ') || 'A person of purpose';
    const gender = data.gender || 'person';
    const ethnicity = data.ethnicity || '';
    const skinTone = data.skin_tone || '';
    const hairColors: string[] = data.hair_colors || [];
    const hairTexture = data.hair_texture || '';
    const hairVolume = data.hair_volume || '';
    const eyeColor = data.eye_color || '';

    const computedAge = computeAge(data.birthdate || '');
    const ageStr = computedAge ? `${computedAge}-year-old` : '';

    const hairColorStr = hairColors.length > 0 ? hairColors.map(c => c.toLowerCase()).join(' and ') : '';
    const hairParts = [
        hairVolume ? hairVolume.toLowerCase() : '',
        hairColorStr,
        hairTexture ? hairTexture.toLowerCase() : '',
    ].filter(Boolean).join(' ');

    const physicalParts = [
        ageStr,
        gender,
        ethnicity ? `of ${ethnicity} heritage` : '',
        skinTone ? `with ${skinTone.toLowerCase()} skin` : '',
        eyeColor ? `${eyeColor.toLowerCase()} eyes` : '',
        hairParts ? `${hairParts} hair` : '',
    ].filter(Boolean).join(' ');

    // Extract Style & Presence from compiled bible (character decides styling)
    const compiledSections = data.bible?.sections || [];
    const styleEntry = compiledSections.find(
        (s: { heading: string }) => s.heading === 'Style & Presence' || s.heading === 'Style and Presence'
    );
    const wardrobeEntry = compiledSections.find(
        (s: { heading: string }) => s.heading === 'Wardrobe' || s.heading === 'The Closet'
    );

    const rawStyle = styleEntry?.content || '';
    const styleCues = typeof rawStyle === 'string'
        ? rawStyle.substring(0, 300)
        : typeof rawStyle === 'object'
            ? JSON.stringify(rawStyle).substring(0, 300)
            : '';
    const wardrobeCues = typeof wardrobeEntry?.content === 'string' ? wardrobeEntry.content.substring(0, 200) : '';
    const characterStyling = [styleCues, wardrobeCues].filter(Boolean).join(' ').substring(0, 500);

    return [
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
}

async function markFailed(uid: string, error: string) {
    try {
        await db.collection('users').doc(uid).set({
            avatar: {
                status: 'failed',
                attempt_count: FieldValue.increment(1),
                error: error.substring(0, 500),
            },
        }, { merge: true });
    } catch (e) {
        console.error('[Avatar] Failed to write error status:', e);
    }
}

/**
 * Generate and save a user's avatar. Never throws — failures are recorded on
 * users/{uid}.avatar so the hourly retry job can pick them up.
 */
export async function generateAvatarForUser(uid: string): Promise<{ success: boolean; avatarUrl?: string; error?: string }> {
    try {
        const userRef = db.collection('users').doc(uid);
        const userDoc = await userRef.get();
        if (!userDoc.exists) return { success: false, error: 'User not found' };

        const data = userDoc.data()!;
        if (!data.defining_words) return { success: false, error: 'No identity found — complete onboarding first' };

        const prompt = buildAvatarPrompt(data);
        console.log(`[Avatar] Generating for ${uid}`);
        console.log(`[Avatar] Prompt: ${prompt}`);

        await userRef.set({ avatar: { status: 'generating', last_attempt: Date.now() } }, { merge: true });

        let buffer: Buffer | null = null;
        let referenceBuffer: Buffer | null = null;

        for (let attempt = 1; attempt <= MAX_AVATAR_ATTEMPTS; attempt++) {
            const imageResult = await generateImage({ prompt, aspectRatio: '1:1', logPrefix: 'Avatar' });

            if (!imageResult) {
                console.error(`[Avatar] Image generation returned null (attempt ${attempt}/${MAX_AVATAR_ATTEMPTS})`);
                if (attempt < MAX_AVATAR_ATTEMPTS) await new Promise(r => setTimeout(r, AVATAR_RETRY_DELAY_MS));
                continue;
            }

            const rawBuffer = imageResult.buffer;
            const resizedBuffer = await sharp(rawBuffer).resize(256, 256, { fit: 'cover' }).jpeg({ quality: 80 }).toBuffer();
            // Higher-res reference image for character identity anchoring in post/digest images
            const resizedRefBuffer = await sharp(rawBuffer).resize(512, 512, { fit: 'cover' }).jpeg({ quality: 85 }).toBuffer();

            const validation = await validateGeneratedImage(resizedBuffer, prompt);
            if (!validation.pass) {
                console.warn(`[Avatar] Image validation failed for ${uid} (attempt ${attempt}/${MAX_AVATAR_ATTEMPTS}):`, validation.summary, validation.issues);
                if (attempt < MAX_AVATAR_ATTEMPTS) await new Promise(r => setTimeout(r, AVATAR_RETRY_DELAY_MS));
                continue;
            }

            buffer = resizedBuffer;
            referenceBuffer = resizedRefBuffer;
            console.log(`[Avatar] Image validated for ${uid} on attempt ${attempt}`);
            break;
        }

        if (!buffer || !referenceBuffer) {
            const error = `Image failed after ${MAX_AVATAR_ATTEMPTS} attempts`;
            await markFailed(uid, error);
            return { success: false, error };
        }

        const bucket = storage.bucket();
        const fileName = `avatars/${uid}.jpg`;
        await bucket.file(fileName).save(buffer, {
            metadata: { contentType: 'image/jpeg', cacheControl: 'public, max-age=3600' },
            public: true,
        });
        await bucket.file(`avatars/${uid}_reference.jpg`).save(referenceBuffer, {
            metadata: { contentType: 'image/jpeg', cacheControl: 'public, max-age=86400' },
            public: true,
        });

        // Cache-bust so browsers/CDN don't serve the old image
        const avatarUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}?v=${Date.now()}`;
        await userRef.set({
            avatar: {
                url: avatarUrl,
                status: 'ready',
                attempt_count: FieldValue.increment(1),
                error: null,
            },
        }, { merge: true });

        console.log(`[Avatar] Saved: ${avatarUrl}`);
        return { success: true, avatarUrl };
    } catch (error: any) {
        console.error('[Avatar] Error:', error);
        const message = error.message || 'Avatar generation failed';
        await markFailed(uid, message);
        return { success: false, error: message };
    }
}

// ─── Task queue worker ──────────────────────────────────────────────────────

export const generateAvatar = onTaskDispatched<AvatarTask>(
    {
        region: REGION,
        timeoutSeconds: 300,
        memory: '1GiB',
        // generateAvatarForUser retries internally; failures go to the hourly job
        retryConfig: { maxAttempts: 1 },
        rateLimits: { maxConcurrentDispatches: 3 },
    },
    async (req) => {
        await generateAvatarForUser(req.data.uid);
    }
);

// ─── Profile screen: "update my avatar" ─────────────────────────────────────

export const requestAvatar = onCall({ region: REGION }, async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Sign in required');

    // Ignore repeat taps while a generation is already running
    const avatar = (await db.collection('users').doc(uid).get()).data()?.avatar;
    if (avatar?.status === 'generating' && avatar?.last_attempt > Date.now() - 2 * 60 * 1000) {
        return { queued: false };
    }

    await enqueueAvatar(uid);
    return { queued: true };
});

// ─── Hourly retry of failed/pending avatars ─────────────────────────────────

export const retryAvatars = onSchedule(
    {
        schedule: 'every 60 minutes',
        region: REGION,
        timeoutSeconds: 120,
        memory: '256MiB',
    },
    async () => {
        const oneHourAgo = Date.now() - 60 * 60 * 1000;
        const snap = await db.collection('users').where('avatar.status', 'in', ['failed', 'pending']).get();

        let enqueued = 0;
        for (const doc of snap.docs) {
            const data = doc.data();
            const avatar = data.avatar || {};
            if ((avatar.attempt_count || 0) >= 5) continue;                     // max retries reached
            if (avatar.last_attempt && avatar.last_attempt > oneHourAgo) continue; // tried recently
            if (!data.onboarding_complete && !data.defining_words) continue;      // onboarding incomplete

            try {
                await enqueueAvatar(doc.id);
                enqueued++;
            } catch (err: any) {
                console.error(`[retryAvatars] Failed to enqueue ${doc.id}:`, err.message);
            }
        }

        console.log(`[retryAvatars] Enqueued ${enqueued} of ${snap.size} failed/pending avatars`);
    }
);

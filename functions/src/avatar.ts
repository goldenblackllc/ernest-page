/**
 * Avatar generation — a headshot per situation in the character's bible, plus
 * a 512px identity reference image drawn from the main portrait situation.
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
import { REGION } from './lib/config/region.js';
import { generateImage } from './lib/ai/generateImage.js';
import { validateGeneratedImage } from './lib/ai/validateImage.js';
import { computeAge } from './lib/utils/parseBirthDate.js';
import { errorMessage } from './lib/utils/errors.js';
import type { Situation } from './lib/character/situations.js';

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

/**
 * The avatar prompt: the user's physical traits plus a look. `portrait` is a
 * situation's brief from the bible; bibles compiled before situations existed
 * fall back to the opening of Style & Presence until their next rebuild.
 */
function buildAvatarPrompt(data: FirebaseFirestore.DocumentData, portrait?: string): string {
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

    const styleSection = (data.bible?.sections || []).find(
        (s: { heading: string }) => s.heading === 'Style & Presence'
    );
    const legacyStyle = typeof styleSection?.content === 'string' ? styleSection.content.substring(0, 500) : '';

    return [
        'TIGHT HEADSHOT PORTRAIT framed from the chest up. Square 1:1 aspect ratio.',
        'The subject looks straight into the camera. Shot with a standard portrait lens: natural perspective, no wide-angle or fisheye distortion.',
        `A ${physicalParts}.`,
        portrait || (legacyStyle ? `The character's chosen style and presentation: ${legacyStyle}` : ''),
        'Instagram-quality sharpness and color saturation.',
        'Face and upper chest fill the frame.',
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

interface AvatarImage {
    /** 256px avatar shown in the app */
    small: Buffer;
    /** 512px identity reference for later images */
    reference: Buffer;
}

/** Generate and validate one avatar image, retrying up to MAX_AVATAR_ATTEMPTS. Null when every attempt fails. */
async function generateAvatarImage(prompt: string, logLabel: string, referenceImage?: Buffer): Promise<AvatarImage | null> {
    for (let attempt = 1; attempt <= MAX_AVATAR_ATTEMPTS; attempt++) {
        const imageResult = await generateImage({
            prompt,
            aspectRatio: '1:1',
            logPrefix: 'Avatar',
            ...(referenceImage ? { referenceImages: [referenceImage], referenceMode: 'identity' as const } : {}),
        });

        if (!imageResult) {
            console.error(`[Avatar] ${logLabel}: image generation returned null (attempt ${attempt}/${MAX_AVATAR_ATTEMPTS})`);
        } else {
            const small = await sharp(imageResult.buffer).resize(256, 256, { fit: 'cover' }).jpeg({ quality: 80 }).toBuffer();
            const validation = await validateGeneratedImage(small, prompt);
            if (validation.pass) {
                const reference = await sharp(imageResult.buffer).resize(512, 512, { fit: 'cover' }).jpeg({ quality: 85 }).toBuffer();
                console.log(`[Avatar] ${logLabel}: validated on attempt ${attempt}`);
                return { small, reference };
            }
            console.warn(`[Avatar] ${logLabel}: validation failed (attempt ${attempt}/${MAX_AVATAR_ATTEMPTS}):`, validation.summary, validation.issues);
        }
        if (attempt < MAX_AVATAR_ATTEMPTS) await new Promise(r => setTimeout(r, AVATAR_RETRY_DELAY_MS));
    }
    return null;
}

/** Save a public image and return its cache-busted URL. */
async function savePublicImage(path: string, buffer: Buffer, maxAge: number): Promise<string> {
    const bucket = storage.bucket();
    await bucket.file(path).save(buffer, {
        metadata: { contentType: 'image/jpeg', cacheControl: `public, max-age=${maxAge}` },
        public: true,
    });
    // Cache-bust so browsers/CDN don't serve the old image
    return `https://storage.googleapis.com/${bucket.name}/${path}?v=${Date.now()}`;
}

/**
 * Generate and save a user's avatars. The bible's first situation (the
 * character's main portrait) becomes the main avatar and the identity
 * reference; every other situation is then drawn from that reference so the
 * face stays the same. A situation whose image fails is left out, and the
 * Mirror shows the main avatar for it.
 *
 * Never throws — failures are recorded on users/{uid}.avatar so the hourly
 * retry job can pick them up.
 */
export async function generateAvatarForUser(uid: string): Promise<{ success: boolean; avatarUrl?: string; error?: string }> {
    try {
        const userRef = db.collection('users').doc(uid);
        const userDoc = await userRef.get();
        if (!userDoc.exists) return { success: false, error: 'User not found' };

        const data = userDoc.data()!;
        if (!data.defining_words) return { success: false, error: 'No identity found — complete onboarding first' };

        const situations: Situation[] = data.bible?.style?.situations || [];
        const [mainSituation, ...others] = situations;
        const prompt = buildAvatarPrompt(data, mainSituation?.portrait);
        console.log(`[Avatar] Generating for ${uid} (${situations.length} situations)`);
        console.log(`[Avatar] Prompt: ${prompt}`);

        await userRef.set({ avatar: { status: 'generating', last_attempt: Date.now() } }, { merge: true });

        const main = await generateAvatarImage(prompt, mainSituation ? `${uid}/${mainSituation.id}` : uid);
        if (!main) {
            const error = `Image failed after ${MAX_AVATAR_ATTEMPTS} attempts`;
            await markFailed(uid, error);
            return { success: false, error };
        }

        const avatarUrl = await savePublicImage(`avatars/${uid}.jpg`, main.small, 3600);
        await savePublicImage(`avatars/${uid}_reference.jpg`, main.reference, 86400);

        const situationUrls: Record<string, string> = mainSituation ? { [mainSituation.id]: avatarUrl } : {};
        await Promise.all(others.map(async (situation) => {
            const image = await generateAvatarImage(buildAvatarPrompt(data, situation.portrait), `${uid}/${situation.id}`, main.reference);
            if (image) situationUrls[situation.id] = await savePublicImage(`avatars/${uid}/${situation.id}.jpg`, image.small, 3600);
        }));
        await removeStaleSituationImages(uid, Object.keys(situationUrls));

        // update() replaces avatar.situations whole, so situations the bible
        // dropped don't linger; bibles without situations clear it
        await userRef.update({
            'avatar.url': avatarUrl,
            'avatar.status': 'ready',
            'avatar.attempt_count': FieldValue.increment(1),
            'avatar.error': null,
            'avatar.situations': mainSituation ? situationUrls : FieldValue.delete(),
        });

        console.log(`[Avatar] Saved: ${avatarUrl} + ${Object.keys(situationUrls).length - (mainSituation ? 1 : 0)} of ${others.length} situation avatars`);
        return { success: true, avatarUrl };
    } catch (error) {
        console.error('[Avatar] Error:', error);
        const message = errorMessage(error) || 'Avatar generation failed';
        await markFailed(uid, message);
        return { success: false, error: message };
    }
}

/** Delete situation images from earlier builds whose situation no longer exists. */
async function removeStaleSituationImages(uid: string, keepIds: string[]) {
    try {
        const [files] = await storage.bucket().getFiles({ prefix: `avatars/${uid}/` });
        const keep = new Set(keepIds.map(id => `avatars/${uid}/${id}.jpg`));
        await Promise.all(files.filter(f => !keep.has(f.name)).map(f => f.delete()));
    } catch (err) {
        console.error(`[Avatar] Failed to remove old situation images for ${uid}:`, errorMessage(err));
    }
}

// ─── Task queue worker ──────────────────────────────────────────────────────

export const generateAvatar = onTaskDispatched<AvatarTask>(
    {
        region: REGION,
        timeoutSeconds: 540, // a main avatar, then up to 6 situation avatars in parallel
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
            } catch (err) {
                console.error(`[RetryAvatars] Failed to enqueue ${doc.id}:`, errorMessage(err));
            }
        }

        console.log(`[RetryAvatars] Enqueued ${enqueued} of ${snap.size} failed/pending avatars`);
    }
);

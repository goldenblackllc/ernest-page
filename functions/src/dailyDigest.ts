/**
 * Daily Digest — one reflection card per active user per day.
 *
 * dailyDigest (scheduled, 4:00 AM UTC) finds users who were active on the
 * previous UTC calendar day and have a compiled bible, then enqueues one dailyDigestUser task
 * per user. Each task builds the card (image prompts, TTS, thumbnail, images)
 * and writes it to users/{uid}.daily_digest.
 *
 * Retries: a task that fails (e.g. image generation down) is retried twice,
 * two hours apart (≈6 AM and 8 AM UTC). Work is idempotent — a retry reuses
 * whatever the previous attempt already produced and only fills the gaps.
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onTaskDispatched } from 'firebase-functions/v2/tasks';
import { getFunctions } from 'firebase-admin/functions';
import { db } from './lib/firebase/admin.js';
import { REGION } from './lib/config/region.js';
import { computeAge } from './lib/utils/parseBirthDate.js';
import { processPostContent } from './lib/ai/processPostContent.js';
import { generateMessageImages } from './lib/ai/generatePostImage.js';
import { loadUserReferenceImage } from './lib/ai/loadUserReferenceImage.js';
import { getCompiledBible } from './lib/bible.js';
import { localDateKey } from './lib/utils/relativeDates.js';


interface DigestTask {
    uid: string;
    /** UTC date (YYYY-MM-DD) the card is for */
    date: string;
}

// ─── Scheduler: pick eligible users and enqueue one task each ───────────────

export const dailyDigest = onSchedule(
    {
        schedule: '0 4 * * *',
        timeZone: 'UTC',
        region: REGION,
        timeoutSeconds: 300,
        memory: '512MiB',
    },
    async () => {
        const now = new Date();
        const date = localDateKey(now, 'UTC');
        const yesterday = localDateKey(new Date(now.getTime() - 24 * 60 * 60 * 1000), 'UTC');
        const usersSnapshot = await db.collection('users').get();
        const queue = getFunctions().taskQueue<DigestTask>(`locations/${REGION}/functions/dailyDigestUser`);

        let enqueued = 0;
        for (const userDoc of usersSnapshot.docs) {
            const userData = userDoc.data();
            if (!getDigestBible(userData)) continue;

            // Only users active yesterday. A calendar-date match (not elapsed hours)
            // means each active day earns exactly one card.
            if (activeDateKey(userData?.last_active_date) !== yesterday) continue;

            try {
                // Task ID dedupes accidental double runs for the same user and day
                await queue.enqueue({ uid: userDoc.id, date }, { id: `digest-${date}-${userDoc.id}` });
                enqueued++;
            } catch (err: any) {
                if (err?.code === 'functions/task-already-exists') continue;
                console.error(`[Daily Digest] Failed to enqueue ${userDoc.id}:`, err.message);
            }
        }

        console.log(`[Daily Digest] Enqueued ${enqueued} users for ${date}`);
    }
);

/**
 * The UTC date (YYYY-MM-DD) of last_active_date. The website writes a UTC date
 * string; a full ISO timestamp is accepted too. Null when missing or invalid.
 */
function activeDateKey(lastActive: unknown): string | null {
    if (typeof lastActive !== 'string' || !lastActive) return null;
    const when = new Date(lastActive);
    return isNaN(when.getTime()) ? null : localDateKey(when, 'UTC');
}

// ─── Worker: build one user's card ──────────────────────────────────────────

export const dailyDigestUser = onTaskDispatched<DigestTask>(
    {
        region: REGION,
        timeoutSeconds: 540,
        memory: '1GiB',
        retryConfig: {
            maxAttempts: 3,          // first run + 2 retries
            minBackoffSeconds: 7200, // retries two hours apart
            maxBackoffSeconds: 7200,
            maxDoublings: 0,
        },
        rateLimits: {
            maxConcurrentDispatches: 3, // stay within image/TTS API rate limits
        },
    },
    async (req) => {
        const { uid, date } = req.data;
        await generateDigestCard(uid, date);
    }
);

// ─── Card generation ────────────────────────────────────────────────────────

/** The user's compiled bible, or null when there is nothing to build a card from. */
function getDigestBible(userData: FirebaseFirestore.DocumentData | undefined): any[] | null {
    const compiledBible = getCompiledBible(userData);
    return Array.isArray(compiledBible) && compiledBible.length > 0 ? compiledBible : null;
}

/** Split each bible category into its bolded subsections. */
function getSubsections(compiledBible: any[]): { title: string; content: string }[] {
    const subsections: { title: string; content: string }[] = [];

    for (const entry of compiledBible) {
        if (typeof entry !== 'object' || entry === null) continue;

        let rawContent = '';
        if (entry.heading && entry.content && typeof entry.content === 'string') {
            rawContent = entry.content;
        } else {
            for (const [, value] of Object.entries(entry)) {
                if (typeof value === 'string' && value.length > 10) {
                    rawContent = value;
                    break;
                }
            }
        }
        if (!rawContent) continue;

        const parts = rawContent.split(/\*\*([^*]+):\*\*/);
        if (parts.length >= 3) {
            for (let i = 1; i < parts.length; i += 2) {
                const subTitle = parts[i].trim();
                const subContent = (parts[i + 1] || '').trim();
                if (subContent.length > 20) subsections.push({ title: subTitle, content: subContent });
            }
        } else if (rawContent.length > 20) {
            subsections.push({ title: entry.heading || 'Reflection', content: rawContent });
        }
    }

    return subsections;
}

function buildDemographicHint(userData: any): string {
    const identity = userData?.identity;
    const gender = userData?.gender || identity?.gender || '';
    const ethnicity = userData?.ethnicity || identity?.ethnicity || '';
    const age = computeAge(userData?.birthdate || identity?.birthdate);
    const parts = [age ? `approximately ${age} years old` : '', ethnicity, gender].filter(Boolean);
    return parts.length > 0
        ? ` If any human figure, silhouette, or body is shown, they must plausibly be ${parts.join(', ')} (skin tone, build, age-appropriate). Do NOT default to any other demographic.`
        : '';
}

async function generateDigestCard(uid: string, date: string): Promise<void> {
    const ref = db.collection('users').doc(uid);
    const userDoc = await ref.get();
    const userData = userDoc.data();

    const compiledBible = getDigestBible(userData);
    if (!compiledBible) return;
    const subsections = getSubsections(compiledBible);
    if (subsections.length === 0) return;

    const voiceId: string | null = userData?.voice?.id || userData?.character_bible?.voice_id || null;
    const existingDigest = userData?.daily_digest;
    const isRetry = existingDigest?.date === date;

    // ─── IDEMPOTENCY CHECK ───
    if (isRetry) {
        const hasImages = Boolean(
            existingDigest.message_images?.some((u: string) => !!u) ||
            existingDigest.imagen_urls?.length ||
            existingDigest.image_url
        );
        const hasAudio = Boolean(existingDigest.audio_url) || !voiceId; // audio not needed if no voice
        if (hasImages && hasAudio) {
            console.log(`[Daily Digest] Skipping ${uid} — today's card is complete`);
            return;
        }
        console.log(`[Daily Digest] Re-running ${uid} — missing: ${!hasImages ? 'images' : ''} ${!hasAudio ? 'audio' : ''}`);
    }

    // Sequential rotation: advance to the next subsection, wrapping at the end.
    // A retry of an already-written card keeps today's index instead of advancing again.
    const lastIndex = typeof userData?.digest_rotation_index === 'number' ? userData.digest_rotation_index : -1;
    const nextRotationIndex = isRetry ? Math.max(lastIndex, 0) : (lastIndex + 1) % subsections.length;
    const pick = subsections[nextRotationIndex];

    const title = isRetry ? existingDigest.title : pick.title;
    const content = isRetry ? existingDigest.content : pick.content;

    // ─── Structure content as a single message (same pipeline as post feed) ───
    const messages: Array<{ role: 'user' | 'ideal_self'; text: string }> = [
        { role: 'ideal_self', text: `About me and my life. ${title}. ${content}` },
    ];

    // Reuse existing prompts/images from partial runs
    let image_prompts: string[] = isRetry ? (existingDigest.image_prompts || []) : [];
    let message_images: string[] = isRetry ? (existingDigest.message_images || []) : [];
    let thumbnailUrl: string | null = isRetry ? (existingDigest.thumbnail_url || null) : null;

    const needsPrompts = image_prompts.length === 0;
    const needsAudio = !existingDigest?.audio_url && voiceId;
    const needsThumbnail = !thumbnailUrl;

    // ─── Shared pipeline: image prompts + TTS + thumbnail (same as post feed) ───
    let audioFields: Record<string, any> = {};
    if (needsPrompts || needsAudio || needsThumbnail) {
        const pipelineResult = await processPostContent({
            transcript: '', // unused — preCondensed provides messages
            uid,
            postId: `digest_${uid}_${Date.now()}`,
            compiledBible,
            demographicHint: buildDemographicHint(userData),
            characterVoiceId: voiceId || undefined,
            singleVoice: true, // digest is a monologue — same voice for both roles
            gender: '',        // unused when singleVoice is true
            logPrefix: 'Daily Digest',
            preCondensed: { messages, title },
        });

        if (pipelineResult) {
            if (needsPrompts) image_prompts = pipelineResult.imagePrompts;
            if (needsAudio) audioFields = pipelineResult.audioFields;
            if (needsThumbnail) thumbnailUrl = pipelineResult.thumbnailUrl;
        }
    } else {
        audioFields = {
            audio_url: existingDigest?.audio_url || null,
            audio_word_timestamps: existingDigest?.audio_word_timestamps || null,
            audio_message_boundaries: existingDigest?.audio_message_boundaries || null,
        };
    }

    // ─── Image generation ───
    if (image_prompts.length > 0 && (!message_images.length || message_images.some(u => !u))) {
        const referenceImage = await loadUserReferenceImage(uid);
        message_images = await generateMessageImages({
            prompts: image_prompts,
            uid,
            filePrefix: `digest_${uid}`,
            referenceImages: referenceImage ? [referenceImage] : undefined,
            existingUrls: message_images.length > 0 ? message_images : undefined,
        });
    }

    if (!message_images.some(Boolean)) {
        // Don't write a broken card — keep yesterday's digest visible. Throwing
        // hands the task back to Cloud Tasks for a retry.
        throw new Error(`[Daily Digest] Images failed for ${uid}`);
    }

    const digestCard = {
        title,
        content,
        full_content: content,
        // Legacy compat fields
        image_url: message_images[0] || null,
        imagen_urls: message_images.filter(Boolean),
        // Per-message fields (same shape as post feed)
        image_style: 'per-message' as const,
        image_prompts,
        message_images,
        condensed_transcript: messages,
        thumbnail_url: thumbnailUrl,
        audio_url: audioFields.audio_url || null,
        audio_word_timestamps: audioFields.audio_word_timestamps || null,
        audio_message_boundaries: audioFields.audio_message_boundaries || null,
        date,
        updated_at: new Date().toISOString(),
    };

    await ref.set({ daily_digest: digestCard, digest_rotation_index: nextRotationIndex }, { merge: true });
    console.log(`[Daily Digest] Card written for ${uid}`);

    // The card is visible without audio; a retry fills the audio in later.
    if (voiceId && !digestCard.audio_url) {
        throw new Error(`[Daily Digest] Audio failed for ${uid}`);
    }
}

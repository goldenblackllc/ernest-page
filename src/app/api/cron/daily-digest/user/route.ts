import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase/admin';
import { processPostContent } from '@/lib/ai/processPostContent';
import { generateMessageImages } from '@/lib/ai/generatePostImage';
import { loadUserReferenceImage } from '@/lib/ai/loadUserReferenceImage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * POST /api/cron/daily-digest/user
 *
 * Generates a single user's daily digest card.
 * Called by the main daily-digest cron via fan-out — each user gets
 * its own function invocation with its own 300s budget.
 */
export async function POST(req: Request) {
    // Auth: internal key from the parent cron
    const key = req.headers.get('x-internal-key');
    if (!process.env.CRON_SECRET || key !== process.env.CRON_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const user = await req.json() as {
            uid: string;
            title: string;
            content: string;
            demographicHint: string;
            archetype: string;
            identityTitle: string;
            voiceId: string | null;
            nextRotationIndex: number;
            compiledBible: any[];
        };

        const ref = db.collection('users').doc(user.uid);
        const success = await generateDigestCard({ ...user, ref });

        return NextResponse.json({ success, uid: user.uid });
    } catch (error: any) {
        console.error('[Daily Digest User] Error:', error.message);
        return NextResponse.json({ error: error.message, isQuotaError: error.isQuotaError }, { status: 500 });
    }
}


async function generateDigestCard(user: {
    uid: string;
    title: string;
    content: string;
    ref: FirebaseFirestore.DocumentReference;
    demographicHint: string;
    archetype: string;
    identityTitle: string;
    voiceId: string | null;
    nextRotationIndex: number;
    compiledBible: any[];
}): Promise<boolean> {
    // ─── IDEMPOTENCY CHECK ───
    // If this user already has a complete digest card for today, skip.
    // This allows the cron to run multiple times (4 AM / 6 AM / 8 AM)
    // and only retry users whose card is missing image or audio.
    const today = new Date().toISOString().split('T')[0];
    const userDoc = await user.ref.get();
    const existingDigest = userDoc.data()?.daily_digest;

    if (existingDigest?.date === today) {
        const hasImages = Boolean(
            existingDigest.message_images?.some((u: string) => !!u) ||
            existingDigest.imagen_urls?.length ||
            existingDigest.image_url
        );
        const hasAudio = Boolean(existingDigest.audio_url) || !user.voiceId; // audio not needed if no voice

        if (hasImages && hasAudio) {
            console.log(`[Daily Digest] Skipping ${user.uid} — today's card is complete`);
            return false; // Already complete, skip
        }
        console.log(`[Daily Digest] Re-running ${user.uid} — missing: ${!hasImages ? 'images' : ''} ${!hasAudio ? 'audio' : ''}`);
    }

    // Use existing content if re-running, otherwise use newly picked content
    const title = existingDigest?.date === today ? existingDigest.title : user.title;
    const content = existingDigest?.date === today ? existingDigest.content : user.content;

    // ─── Structure content as a single message (same pipeline as post feed) ───
    const messages: Array<{ role: 'user' | 'ideal_self'; text: string }> = [
        { role: 'ideal_self', text: `About me and my life. ${title}. ${content}` }
    ];

    // ─── Shared pipeline: image prompts + TTS + thumbnail (same as post feed) ───
    // Reuse existing prompts/images from partial runs (idempotency)
    let image_prompts: string[] = existingDigest?.date === today
        ? (existingDigest.image_prompts || []) : [];
    let message_images: string[] = existingDigest?.date === today
        ? (existingDigest.message_images || []) : [];
    let thumbnailUrl: string | null = existingDigest?.date === today
        ? (existingDigest.thumbnail_url || null) : null;

    const needsPrompts = image_prompts.length === 0;
    const needsAudio = !existingDigest?.audio_url && user.voiceId;
    const needsThumbnail = !thumbnailUrl;

    // Run the shared pipeline if any AI work is needed
    let audioFields: Record<string, any> = {};
    if (needsPrompts || needsAudio || needsThumbnail) {
        const postId = `digest_${user.uid}_${Date.now()}`;
        const pipelineResult = await processPostContent({
            transcript: '',  // unused — preCondensed provides messages
            uid: user.uid,
            postId,
            compiledBible: user.compiledBible,
            demographicHint: user.demographicHint,
            characterVoiceId: user.voiceId || undefined,
            singleVoice: true,  // digest is a monologue — same voice for both roles
            gender: '',  // unused when singleVoice is true
            logPrefix: 'Daily Digest',
            preCondensed: {
                messages,
                title,
            },
        });

        if (pipelineResult) {
            if (needsPrompts) image_prompts = pipelineResult.imagePrompts;
            if (needsAudio) audioFields = pipelineResult.audioFields;
            if (needsThumbnail) thumbnailUrl = pipelineResult.thumbnailUrl;
        }
    } else {
        // Re-running but pipeline already complete — reuse existing audio
        audioFields = {
            audio_url: existingDigest?.audio_url || null,
            audio_word_timestamps: existingDigest?.audio_word_timestamps || null,
            audio_message_boundaries: existingDigest?.audio_message_boundaries || null,
        };
    }

    // ─── IMAGE GENERATION (caller responsibility — same pattern as processChat) ───
    if (image_prompts.length > 0 && (!message_images.length || message_images.some(u => !u))) {
        const referenceImage = await loadUserReferenceImage(user.uid);
        const referenceImages = referenceImage ? [referenceImage] : undefined;

        message_images = await generateMessageImages({
            prompts: image_prompts,
            uid: user.uid,
            filePrefix: `digest_${user.uid}`,
            referenceImages,
            existingUrls: message_images.length > 0 ? message_images : undefined,
        });
    }

    if (!message_images.some(Boolean)) {
        console.warn(`[Daily Digest] Images failed for ${user.uid} — will retry on next cron run`);
        return false; // Don't write a broken card — keep yesterday's digest visible
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
        // Thumbnail (same as post feed — enables poster frame + hides title overlay)
        thumbnail_url: thumbnailUrl,
        // Audio
        audio_url: audioFields.audio_url || null,
        audio_word_timestamps: audioFields.audio_word_timestamps || null,
        audio_message_boundaries: audioFields.audio_message_boundaries || null,
        date: today,
        updated_at: new Date().toISOString(),
    };

    await user.ref.set({ daily_digest: digestCard, digest_rotation_index: user.nextRotationIndex }, { merge: true });
    return true;
}

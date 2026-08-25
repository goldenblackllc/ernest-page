import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase/admin';
import { processPostContent } from '@/lib/ai/processPostContent';
import { generateMessageImages } from '@/lib/ai/generatePostImage';
import { loadUserReferenceImage } from '@/lib/ai/loadUserReferenceImage';
import { computeAge } from '@/lib/utils/parseBirthDate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Human-friendly category names
const CATEGORY_LABELS: Record<string, string> = {
    Style_and_Presence: 'Style & Presence',
    Daily_Life_and_Habits: 'Daily Life & Habits',
    People_and_Connections: 'People & Connections',
    The_Inner_Mind: 'The Inner Mind',
    Quirks_and_Details: 'Quirks & Details',
    Order_and_Sanctuary: 'Order & Sanctuary',
    The_World_I_Love: 'The World I Love',
};

export async function GET(req: Request) {
    // Verify cron secret (Vercel sends Authorization: Bearer <CRON_SECRET>)
    const authHeader = req.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const usersSnapshot = await db.collection('users').get();
        let cardsGenerated = 0;

        // Build list of eligible users with their digest data
        const eligibleUsers: { uid: string; title: string; content: string; ref: FirebaseFirestore.DocumentReference; demographicHint: string; archetype: string; identityTitle: string; voiceId: string | null; nextRotationIndex: number; compiledBible: any[] }[] = [];

        for (const userDoc of usersSnapshot.docs) {
            const uid = userDoc.id;
            const userData = userDoc.data();

            // Need a compiled bible
            const compiledBible = userData?.character_bible?.compiled_output?.ideal;
            if (!compiledBible || !Array.isArray(compiledBible) || compiledBible.length === 0) continue;

            // Skip users who haven't opened the app in 7+ days
            const lastActive = userData?.last_active_date;
            if (lastActive) {
                const daysSinceActive = Math.floor((Date.now() - new Date(lastActive).getTime()) / (24 * 60 * 60 * 1000));
                if (daysSinceActive > 7) continue;
            }

            // Split each category into subcategories
            const allSubsections: { title: string; content: string }[] = [];

            for (const entry of compiledBible) {
                if (typeof entry !== 'object' || entry === null) continue;

                let rawContent = '';
                if (entry.heading && entry.content && typeof entry.content === 'string') {
                    rawContent = entry.content;
                } else {
                    for (const [, value] of Object.entries(entry)) {
                        if (typeof value === 'string' && value.length > 10) {
                            rawContent = value as string;
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
                        if (subContent.length > 20) {
                            allSubsections.push({ title: subTitle, content: subContent });
                        }
                    }
                } else if (rawContent.length > 20) {
                    const heading = entry.heading || 'Reflection';
                    allSubsections.push({ title: heading, content: rawContent });
                }
            }

            if (allSubsections.length === 0) continue;

            // Sequential rotation: advance to the next subsection, wrapping at the end
            const lastIndex = typeof userData?.digest_rotation_index === 'number' ? userData.digest_rotation_index : -1;
            const nextIndex = (lastIndex + 1) % allSubsections.length;
            const pick = allSubsections[nextIndex];

            // Build demographic hint for image generation
            const identity = userData?.identity;
            const uGender = identity?.gender || '';
            const uEthnicity = identity?.ethnicity || '';
            const uAge = computeAge(identity?.birthdate);
            const demoParts = [
                uAge ? `approximately ${uAge} years old` : '',
                uEthnicity,
                uGender,
            ].filter(Boolean);
            const demographicHint = demoParts.length > 0
                ? ` If any human figure, silhouette, or body is shown, they must plausibly be ${demoParts.join(', ')} (skin tone, build, age-appropriate). Do NOT default to any other demographic.`
                : '';

            const archetype = userData?.character_bible?.source_code?.archetype || '';
            const identityTitle = identity?.title || '';

            const voiceId = userData?.character_bible?.voice_id || null;

            eligibleUsers.push({ uid, title: pick.title, content: pick.content, ref: userDoc.ref, demographicHint, archetype, identityTitle, voiceId, nextRotationIndex: nextIndex, compiledBible });
        }

        // ─── SEQUENTIAL PROCESSING: generate one at a time to avoid 429 rate limits ──
        const USER_STAGGER_MS = 1500;
        let quotaExhausted = false;

        for (let i = 0; i < eligibleUsers.length; i++) {
            if (quotaExhausted) break;
            if (i > 0) await new Promise(r => setTimeout(r, USER_STAGGER_MS));

            try {
                const success = await generateDigestCard(eligibleUsers[i]);
                if (success) cardsGenerated++;
            } catch (err: any) {
                if (err?.isQuotaError) {
                    quotaExhausted = true;
                    const remaining = eligibleUsers.length - (i + 1);
                    console.warn(`[Daily Digest] Image quota exhausted — stopping. ${remaining} users deferred to next cron run.`);
                } else {
                    console.error('[Daily Digest] Card generation error:', err);
                }
            }
        }

        return NextResponse.json({
            success: true,
            cardsGenerated,
            eligible: eligibleUsers.length,
        });
    } catch (error: any) {
        console.error('[Daily Digest] Cron error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
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

    // ─── IMAGE GENERATION (caller responsibility — same pattern as cleanup-chats) ───
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


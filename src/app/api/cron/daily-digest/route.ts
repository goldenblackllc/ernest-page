import { NextResponse } from 'next/server';
import { db, storage } from '@/lib/firebase/admin';
import { generatePostAudio } from '@/lib/ai/postTTS';
import { validateGeneratedImage } from '@/lib/ai/validateImage';
import { generateImage } from '@/lib/ai/generateImage';
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
        const eligibleUsers: { uid: string; title: string; content: string; ref: FirebaseFirestore.DocumentReference; demographicHint: string; archetype: string; identityTitle: string; voiceId: string | null; nextRotationIndex: number }[] = [];

        for (const userDoc of usersSnapshot.docs) {
            const uid = userDoc.id;
            const userData = userDoc.data();

            // Eligible: active subscribers OR users who had a session in the last 30 days
            const sub = userData?.subscription;
            const isSubscriber = sub?.status === 'active' && sub?.subscribedUntil && new Date(sub.subscribedUntil) > new Date();

            let hadRecentSession = false;
            if (!isSubscriber) {
                const purchases = userData?.session_purchases || [];
                const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
                hadRecentSession = purchases.some((p: any) =>
                    p.purchasedAt && new Date(p.purchasedAt).getTime() > thirtyDaysAgo
                );
            }

            if (!isSubscriber && !hadRecentSession) continue;

            // Need a compiled bible
            const compiledBible = userData?.character_bible?.compiled_output?.ideal;
            if (!compiledBible || !Array.isArray(compiledBible) || compiledBible.length === 0) continue;

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
            const uAge = computeAge(identity?.age);
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

            eligibleUsers.push({ uid, title: pick.title, content: pick.content, ref: userDoc.ref, demographicHint, archetype, identityTitle, voiceId, nextRotationIndex: nextIndex });
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

// ─── Generate a single digest card (image + write) ───────────────────────────
const MAX_IMAGE_ATTEMPTS = 3;
const IMAGE_RETRY_DELAY_MS = 2000;

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
}): Promise<boolean> {
    // ─── IDEMPOTENCY CHECK ───
    // If this user already has a complete digest card for today, skip.
    // This allows the cron to run multiple times (4 AM / 6 AM / 8 AM)
    // and only retry users whose card is missing image or audio.
    const today = new Date().toISOString().split('T')[0];
    const userDoc = await user.ref.get();
    const existingDigest = userDoc.data()?.daily_digest;

    if (existingDigest?.date === today) {
        const hasImage = Boolean(existingDigest.image_url);
        const hasAudio = Boolean(existingDigest.audio_url) || !user.voiceId; // audio not needed if no voice

        if (hasImage && hasAudio) {
            console.log(`[Daily Digest] Skipping ${user.uid} — today's card is complete`);
            return false; // Already complete, skip
        }
        console.log(`[Daily Digest] Re-running ${user.uid} — missing: ${!hasImage ? 'image' : ''} ${!hasAudio ? 'audio' : ''}`);
    }

    // Use existing content if re-running, otherwise use newly picked content
    const title = existingDigest?.date === today ? existingDigest.title : user.title;
    const content = existingDigest?.date === today ? existingDigest.content : user.content;

    // ─── IMAGE GENERATION (with retry) ───
    let imageUrl: string | null = existingDigest?.date === today ? (existingDigest.image_url || null) : null;

    if (!imageUrl) {
        const contentSnippet = content.substring(0, 200).replace(/[*#_]/g, '');
        const identityContext = (user.archetype || user.identityTitle)
            ? ` The user's identity: archetype "${user.archetype}", roles "${user.identityTitle}". Let this inform the visual world — setting, objects, and atmosphere should reflect who this person is.`
            : '';
        const imagenPrompt = `Create an art-directed editorial photograph inspired by this passage: "${contentSnippet}". Shot in the style of a luxury lifestyle magazine — warm natural light with intentional shadows, rich textures, shallow depth of field. Aspirational and emotionally resonant. Include environmental texture that creates mood — steam, morning light through a window, soft bokeh, tactile surfaces. NEVER include visible faces or readable text.${identityContext}${user.demographicHint} ECOSYSTEM BRAND RULES (apply ONLY when the subject naturally calls for it — do NOT force these into unrelated images): If the image involves coffee, espresso, or a coffee machine, depict a sleek Jura automatic bean-to-cup machine (modern Swiss design, minimalist, silver/black) — NEVER a traditional espresso machine with a portafilter or group head. If the image involves a cup of coffee, always show rich golden-brown crema on top — NEVER flat black coffee or drip coffee.`;

        // Load user's reference image for character consistency anchoring
        const referenceImage = await loadUserReferenceImage(user.uid);
        const referenceImages = referenceImage ? [referenceImage] : undefined;

        for (let attempt = 1; attempt <= MAX_IMAGE_ATTEMPTS; attempt++) {
            try {
                const imageGenResult = await generateImage({
                    prompt: imagenPrompt,
                    aspectRatio: '16:9',
                    logPrefix: 'Daily Digest',
                    referenceImages,
                });

                if (imageGenResult) {
                    const buffer = imageGenResult.buffer;

                    // Validate image quality before uploading
                    const validation = await validateGeneratedImage(buffer, imagenPrompt);
                    if (!validation.pass) {
                        console.warn(`[Daily Digest] Image validation failed for ${user.uid} (attempt ${attempt}/${MAX_IMAGE_ATTEMPTS}):`, validation.summary);
                        continue;
                    }

                    const bucket = storage.bucket();
                    const fileName = `digest-images/${user.uid}_${Date.now()}.jpg`;
                    const file = bucket.file(fileName);

                    await file.save(buffer, {
                        metadata: { contentType: 'image/jpeg' },
                        public: true
                    });

                    imageUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
                    console.log(`[Daily Digest] Image generated for ${user.uid} on attempt ${attempt}`);
                    break; // Success — exit retry loop
                } else {
                    console.error(`[Daily Digest] Image generation failed (attempt ${attempt}/${MAX_IMAGE_ATTEMPTS})`);
                }
            } catch (imgErr: any) {
                if (imgErr.isQuotaError) {
                    console.warn(`[Daily Digest] Image quota exhausted for ${user.uid} — deferring to next cron run`);
                    throw imgErr; // Bubble up to batch loop to stop all processing
                }
                console.error(`[Daily Digest] Image generation failed (attempt ${attempt}/${MAX_IMAGE_ATTEMPTS}):`, imgErr);
            }

            // Wait before retrying (skip delay on last attempt)
            if (attempt < MAX_IMAGE_ATTEMPTS) {
                await new Promise(resolve => setTimeout(resolve, IMAGE_RETRY_DELAY_MS));
            }
        }

        if (!imageUrl) {
            console.warn(`[Daily Digest] Image failed after ${MAX_IMAGE_ATTEMPTS} attempts for ${user.uid} — will retry on next cron run`);
            return false; // Don't write a broken card — keep yesterday's digest visible
        }
    }

    // ─── TTS Audio Generation ───
    let audioUrl: string | null = existingDigest?.date === today ? (existingDigest.audio_url || null) : null;

    if (!audioUrl && user.voiceId) {
        try {
            // Narrate as: "About me and my life. [Title]. [Content]"
            const narrationText = `About me and my life. ${title}. ${content}`;
            const audioResult = await generatePostAudio(
                narrationText,
                '',  // No response — single narration track
                user.voiceId,
                `digest_${user.uid}_${Date.now()}`,
            );
            if (audioResult?.audioUrl) {
                audioUrl = audioResult.audioUrl;
                console.log(`[Daily Digest] Audio generated for ${user.uid}`);
            }
        } catch (audioErr) {
            console.error('[Daily Digest] Audio generation failed:', audioErr);
        }
    }

    const digestCard = {
        title,
        content,
        full_content: content,
        image_url: imageUrl,
        audio_url: audioUrl,
        date: today,
        updated_at: new Date().toISOString(),
    };

    await user.ref.set({ daily_digest: digestCard, digest_rotation_index: user.nextRotationIndex }, { merge: true });
    return true;
}


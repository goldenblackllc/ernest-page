import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase/admin';
import { generatePostAudio } from '@/lib/ai/postTTS';
import { generateStoryboardImages } from '@/lib/ai/generatePostImage';
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
        const hasImages = Boolean(existingDigest.imagen_urls?.length || existingDigest.image_url);
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

    // ─── IMAGE GENERATION (shared pipeline — same as post cards) ───
    let imagen_urls: string[] = existingDigest?.date === today
        ? (existingDigest.imagen_urls || []) : [];

    if (imagen_urls.length === 0) {
        imagen_urls = await generateStoryboardImages({
            content: `${title}: ${content}`,
            demographicHint: user.demographicHint,
            uid: user.uid,
            filePrefix: `digest_${user.uid}`,
            numImages: 3,
        });

        if (imagen_urls.length === 0) {
            console.warn(`[Daily Digest] Images failed for ${user.uid} — will retry on next cron run`);
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
        image_url: imagen_urls[0] || null,
        imagen_urls,
        audio_url: audioUrl,
        date: today,
        updated_at: new Date().toISOString(),
    };

    await user.ref.set({ daily_digest: digestCard, digest_rotation_index: user.nextRotationIndex }, { merge: true });
    return true;
}


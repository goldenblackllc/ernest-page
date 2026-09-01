import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase/admin';
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

// Fan-out config: process users in parallel batches to stay within API rate limits
const BATCH_SIZE = 3;           // Concurrent users per batch
const BATCH_STAGGER_MS = 3000;  // Delay between batches

export async function GET(req: Request) {
    // Verify cron secret (Vercel sends Authorization: Bearer <CRON_SECRET>)
    const authHeader = req.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const origin = new URL(req.url).origin;
        const usersSnapshot = await db.collection('users').get();

        // Build list of eligible users with their digest data
        const eligibleUsers: { uid: string; title: string; content: string; demographicHint: string; archetype: string; identityTitle: string; voiceId: string | null; nextRotationIndex: number; compiledBible: any[] }[] = [];

        for (const userDoc of usersSnapshot.docs) {
            const uid = userDoc.id;
            const userData = userDoc.data();

            // Need a compiled bible
            const compiledBible = userData?.character_bible?.compiled_output?.ideal;
            if (!compiledBible || !Array.isArray(compiledBible) || compiledBible.length === 0) continue;

            // Skip users who haven't opened the app recently
            const lastActive = userData?.last_active_date;
            if (!lastActive) continue; // No activity tracking yet — user hasn't opened app since deploy
            const daysSinceActive = Math.floor((Date.now() - new Date(lastActive).getTime()) / (24 * 60 * 60 * 1000));
            if (daysSinceActive > 7) continue;

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

            eligibleUsers.push({ uid, title: pick.title, content: pick.content, demographicHint, archetype, identityTitle, voiceId, nextRotationIndex: nextIndex, compiledBible });
        }

        console.log(`[Daily Digest] ${eligibleUsers.length} eligible users, dispatching in batches of ${BATCH_SIZE}`);

        // ─── FAN-OUT: dispatch per-user generation in parallel batches ───
        let cardsGenerated = 0;
        let cardsFailed = 0;

        for (let batchStart = 0; batchStart < eligibleUsers.length; batchStart += BATCH_SIZE) {
            if (batchStart > 0) await new Promise(r => setTimeout(r, BATCH_STAGGER_MS));

            const batch = eligibleUsers.slice(batchStart, batchStart + BATCH_SIZE);
            const results = await Promise.allSettled(
                batch.map(user =>
                    fetch(`${origin}/api/cron/daily-digest/user`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'x-internal-key': process.env.CRON_SECRET || '',
                        },
                        body: JSON.stringify(user),
                    }).then(async res => {
                        const data = await res.json();
                        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
                        return data;
                    })
                )
            );

            for (const result of results) {
                if (result.status === 'fulfilled' && result.value.success) {
                    cardsGenerated++;
                } else if (result.status === 'rejected') {
                    cardsFailed++;
                    console.error('[Daily Digest] Batch error:', result.reason?.message);
                }
            }
        }

        console.log(`[Daily Digest] Complete: ${cardsGenerated} generated, ${cardsFailed} failed, ${eligibleUsers.length} eligible`);

        return NextResponse.json({
            success: true,
            cardsGenerated,
            cardsFailed,
            eligible: eligibleUsers.length,
        });
    } catch (error: any) {
        console.error('[Daily Digest] Cron error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

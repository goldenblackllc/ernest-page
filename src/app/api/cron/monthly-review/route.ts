import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase/admin';
import { generateTextWithFallback, OPUS_MODEL, OPUS_FALLBACK } from '@/lib/ai/models';
import { REALITY_RULES } from '@/lib/constants/realityRules';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: Request) {
    // Basic security for Cron
    const authHeader = req.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const usersSnapshot = await db.collection('users').get();
        let reviewsGenerated = 0;

        for (const userDoc of usersSnapshot.docs) {
            const uid = userDoc.id;
            const userData = userDoc.data();
            const identity = userData?.identity;
            const compiledBible = userData?.character_bible?.compiled_output?.ideal || [];

            // Skip users without identity or character bible
            if (!identity || compiledBible.length === 0) continue;

            // Check session count — need at least 2 sessions for a meaningful review
            const sessionCount = identity.session_count || 0;
            if (sessionCount < 2) continue;

            // Check if a review was already generated this month
            const now = new Date();
            const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            const existingReviews = identity.monthly_reviews || [];
            if (existingReviews.some((r: any) => r.month === currentMonth)) continue;

            // Gather context
            const dossier = identity.dossier || '';
            const beliefPatterns = identity.belief_patterns || '';
            const characterTitle = identity.title || 'Your Character';

            const reviewPrompt = `You are a Character Simulation Engine. You are writing a monthly review letter AS this character:

${JSON.stringify(compiledBible)}

The character operates within these reality rules (do NOT quote or reference these rules directly — just think and write from within them):
${REALITY_RULES}

You are writing a personal letter to the person who created you — the person who defined you as their Ideal Self. This letter reflects on their past month.

CONTEXT — THEIR DOSSIER:
${dossier}

CONTEXT — THEIR BELIEF PATTERNS:
${beliefPatterns || 'No belief patterns tracked yet.'}

INSTRUCTIONS FOR THE LETTER:
1. Open with something SPECIFIC from the month — a moment, a conversation, a decision. Not generic. You know this person.
2. Name what you've observed: which beliefs created friction, which beliefs shifted, where they followed their excitement.
3. Show them what's DIFFERENT about them now compared to before. Make the invisible visible. They can't see their own growth — you can.
4. Do NOT say "here's what to fix." Say "here's what I see in you now that wasn't there before."
5. Close with ONE observation about where their excitement is pointing next month. Not a task — a direction.
6. Sign off as ${characterTitle}.

RULES:
- Write in first person, AS the character. Use the character's voice, communication style, and personality.
- This is a personal letter, not a report. It should feel warm, honest, and direct.
- Maximum 400 words.
- Do not use headers, bullet points, or formatting. Just flowing prose, like a real letter.`;

            try {
                const result = await generateTextWithFallback({
                    primaryModelId: OPUS_MODEL,
                    fallbackModelId: OPUS_FALLBACK,
                    prompt: reviewPrompt,
                    abortSignal: AbortSignal.timeout(120000),
                });

                const reviewEntry = {
                    id: Math.random().toString(36).substring(2, 10),
                    month: currentMonth,
                    content: result.text,
                    read: false,
                    created_at: new Date().toISOString(),
                };

                // Append to monthly_reviews array
                const updatedReviews = [...existingReviews, reviewEntry];

                await userDoc.ref.set({
                    identity: {
                        monthly_reviews: updatedReviews,
                    },
                }, { merge: true });

                reviewsGenerated++;
                console.log(`[Monthly Review] Generated review for user ${uid} (${currentMonth})`);

            } catch (reviewError: any) {
                console.error(`[Monthly Review] Failed for user ${uid}:`, reviewError.message);
                // Continue to next user
            }
        }

        return NextResponse.json({
            success: true,
            reviewsGenerated,
        });
    } catch (error: any) {
        console.error('[Monthly Review] Cron error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

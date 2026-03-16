import { db, FieldValue } from '@/lib/firebase/admin';
import { verifyAuth, unauthorizedResponse } from '@/lib/auth/serverAuth';

const MAX_SESSIONS_PER_DAY = 5;

/**
 * POST /api/consume-session
 * Called when a user starts a new Mirror Chat session.
 * Enforces: daily cap (5/day for everyone), then credit check.
 * Users with active subscriptions bypass the credit check but NOT the daily cap.
 */
export async function POST(req: Request) {
    try {
        const uid = await verifyAuth(req);
        if (!uid) return unauthorizedResponse();

        const userDoc = await db.collection('users').doc(uid).get();
        const data = userDoc.data();

        // ─── DAILY CAP (applies to everyone, including Archangel) ───
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        const sessionsToday = data?.sessions_today_date === today ? (data?.sessions_today || 0) : 0;

        if (sessionsToday >= MAX_SESSIONS_PER_DAY) {
            return Response.json(
                {
                    error: `You've reached your daily limit of ${MAX_SESSIONS_PER_DAY} sessions. Come back tomorrow — or better yet, go do the work.`,
                    granted: false,
                    dailyLimit: true,
                    remaining: 0,
                },
                { status: 429 }
            );
        }

        // ─── SUBSCRIPTION CHECK (Archangel, Proving Ground, Long Game) ───
        const sub = data?.subscription;
        const hasActiveSub = sub?.status === 'active' && sub?.subscribedUntil && new Date(sub.subscribedUntil) > new Date();

        if (hasActiveSub) {
            // Increment daily counter but don't consume credits
            await db.collection('users').doc(uid).update({
                sessions_today: sessionsToday + 1,
                sessions_today_date: today,
            });

            return Response.json({
                granted: true,
                source: 'subscription',
                remaining: 'unlimited',
                sessionsToday: sessionsToday + 1,
                dailyRemaining: MAX_SESSIONS_PER_DAY - sessionsToday - 1,
            });
        }

        // ─── CREDIT CHECK (pay-per-session users) ───
        const credits = data?.session_credits || 0;
        if (credits <= 0) {
            return Response.json(
                { error: 'No session credits available. Purchase a session to continue.', granted: false },
                { status: 402 }
            );
        }

        // Decrement credit + increment daily counter
        await db.collection('users').doc(uid).update({
            session_credits: FieldValue.increment(-1),
            sessions_today: sessionsToday + 1,
            sessions_today_date: today,
        });

        return Response.json({
            granted: true,
            source: 'session_credit',
            remaining: credits - 1,
            sessionsToday: sessionsToday + 1,
            dailyRemaining: MAX_SESSIONS_PER_DAY - sessionsToday - 1,
        });
    } catch (error: any) {
        console.error('Consume Session Error:', error);
        return Response.json(
            { error: error.message || 'Failed to consume session.' },
            { status: 500 }
        );
    }
}

import { db } from '@/lib/firebase/admin';
import { verifyAuth, unauthorizedResponse } from '@/lib/auth/serverAuth';

const MAX_SESSIONS_PER_DAY = 5;

/**
 * POST /api/check-session-access
 * Lightweight access check — verifies daily cap, subscription, and credit balance
 * WITHOUT consuming a credit. Used to gate the chat window opening.
 */
export async function POST(req: Request) {
    try {
        const uid = await verifyAuth(req);
        if (!uid) return unauthorizedResponse();

        const userDoc = await db.collection('users').doc(uid).get();
        const data = userDoc.data();

        // ─── DAILY CAP (applies to everyone) ───
        const today = new Date().toISOString().split('T')[0];
        const sessionsToday = data?.sessions_today_date === today ? (data?.sessions_today || 0) : 0;

        if (sessionsToday >= MAX_SESSIONS_PER_DAY) {
            return Response.json({
                canStart: false,
                reason: 'daily_limit',
                message: `You've reached your daily limit of ${MAX_SESSIONS_PER_DAY} sessions. Come back tomorrow — or better yet, go do the work.`,
                remaining: 0,
            });
        }

        // ─── SUBSCRIPTION CHECK ───
        const sub = data?.subscription;
        const subEndDate = sub?.currentPeriodEnd || sub?.subscribedUntil;
        const isActiveStatus = sub?.status === 'active' || sub?.status === 'past_due';
        const hasActiveSub = isActiveStatus && subEndDate && new Date(subEndDate) > new Date();

        // Allow 3-day grace period for past_due subscriptions beyond their period end
        const isPastDueGrace = sub?.status === 'past_due' && subEndDate &&
            (Date.now() - new Date(subEndDate).getTime()) < 3 * 24 * 60 * 60 * 1000;

        if (hasActiveSub || isPastDueGrace) {
            return Response.json({
                canStart: true,
                source: 'subscription',
                dailyRemaining: MAX_SESSIONS_PER_DAY - sessionsToday,
                paymentFailed: sub?.status === 'past_due',
            });
        }

        // ─── CREDIT CHECK (read-only) ───
        const credits = data?.session_credits || 0;
        if (credits <= 0) {
            return Response.json({
                canStart: false,
                reason: 'no_credits',
                message: 'No session credits available. Purchase a session to continue.',
            });
        }

        return Response.json({
            canStart: true,
            source: 'session_credit',
            credits,
            dailyRemaining: MAX_SESSIONS_PER_DAY - sessionsToday,
        });
    } catch (error: any) {
        console.error('Check Session Access Error:', error);
        return Response.json(
            { error: error.message || 'Failed to check session access.' },
            { status: 500 }
        );
    }
}

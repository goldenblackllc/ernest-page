import { db } from '@/lib/firebase/admin';
import { verifyAuth, unauthorizedResponse } from '@/lib/auth/serverAuth';

const MAX_SESSIONS_PER_DAY = 5;

/**
 * POST /api/check-session-access
 * Lightweight access check — verifies daily cap only.
 * Earnest Page is free for all authenticated users.
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

        return Response.json({
            canStart: true,
            source: 'free',
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

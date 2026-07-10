import { db, FieldValue } from '@/lib/firebase/admin';
import { verifyAuth, unauthorizedResponse } from '@/lib/auth/serverAuth';

const MAX_SESSIONS_PER_DAY = 5;

/**
 * POST /api/consume-session
 * Called when a user starts a new Mirror Chat session.
 * Enforces daily cap (5/day for everyone). Earnest Page is free.
 */
export async function POST(req: Request) {
    try {
        const uid = await verifyAuth(req);
        if (!uid) return unauthorizedResponse();

        const userDoc = await db.collection('users').doc(uid).get();
        const data = userDoc.data();

        // ─── FREE ONBOARDING SESSION ───
        const isLegacyComplete = !!data?.identity?.title;
        const isOnboardingComplete = data?.identity?.onboarding_complete || isLegacyComplete;
        
        if (!isOnboardingComplete) {
            return Response.json({
                granted: true,
                source: 'free_onboarding',
                remaining: 'free',
                sessionsToday: 0,
                dailyRemaining: MAX_SESSIONS_PER_DAY,
            });
        }

        // ─── DAILY CAP (applies to everyone) ───
        const today = new Date().toISOString().split('T')[0];
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

        // Increment daily counter
        await db.collection('users').doc(uid).update({
            sessions_today: sessionsToday + 1,
            sessions_today_date: today,
        });

        return Response.json({
            granted: true,
            source: 'free',
            remaining: 'unlimited',
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

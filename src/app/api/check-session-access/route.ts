import { verifyAuth, unauthorizedResponse } from '@/lib/auth/serverAuth';
import { readAccess } from '@/lib/access/accessStore';
import { accessSummary } from '@functions/lib/access/sessionAccess';

/**
 * POST /api/check-session-access
 * Whether the user can start a session now and what it would use (membership,
 * a free session or a credit). Changes nothing; /api/consume-session starts it.
 * Returns AccessSummary: { canStart, reason?, source?, freeRemaining, credits, ... }.
 */
export async function POST(req: Request) {
    try {
        const uid = await verifyAuth(req);
        if (!uid) return unauthorizedResponse();

        const { access, signupMs } = await readAccess(uid);
        return Response.json(accessSummary(access, signupMs, Date.now()));
    } catch (error) {
        console.error('Check Session Access Error:', error);
        return Response.json({ error: 'Failed to check session access.' }, { status: 500 });
    }
}

import { verifyAuth, unauthorizedResponse } from '@/lib/auth/serverAuth';
import { checkRateLimit, rateLimitResponse } from '@/lib/rateLimit';
import { startSession } from '@/lib/access/accessStore';

/**
 * POST /api/consume-session  { sessionId }
 * Starts a Mirror session (called with the first message). Uses the membership,
 * a free session or a paid credit, and records the grant on the active chat;
 * mirrorReply refuses sessions without one. Starting the same session twice is
 * a no-op. Refusals: 429 { reason: 'daily_limit' }, 402 { reason: 'payment_required' }.
 */
export async function POST(req: Request) {
    try {
        const uid = await verifyAuth(req);
        if (!uid) return unauthorizedResponse();

        const rl = checkRateLimit(`consume-session:${uid}`, { maxRequests: 10, windowMs: 60_000 });
        if (!rl.allowed) return rateLimitResponse(rl.resetMs);

        const { sessionId } = await req.json().catch(() => ({}));
        if (typeof sessionId !== 'string' || !/^[\w-]{8,64}$/.test(sessionId)) {
            return Response.json({ error: 'Missing or invalid session' }, { status: 400 });
        }

        const result = await startSession(uid, sessionId);
        if (!result.granted) {
            return Response.json(
                { error: 'Session not available', granted: false, reason: result.reason },
                { status: result.reason === 'daily_limit' ? 429 : 402 },
            );
        }
        return Response.json({ granted: true, source: result.source, resumed: result.resumed });
    } catch (error) {
        console.error('Consume Session Error:', error);
        return Response.json({ error: 'Failed to consume session.' }, { status: 500 });
    }
}

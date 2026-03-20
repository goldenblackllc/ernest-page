import { db, FieldValue } from '@/lib/firebase/admin';
import { verifyAuth, unauthorizedResponse } from '@/lib/auth/serverAuth';

/**
 * POST /api/refund-credit
 * Grace-period auto-refund: returns a session credit if the session had 0 user messages.
 * This is NOT a Stripe refund — it restores the internal session_credits counter.
 * Idempotent — will not refund the same session twice.
 *
 * Body: { sessionId: string }
 */
export async function POST(req: Request) {
    try {
        const uid = await verifyAuth(req);
        if (!uid) return unauthorizedResponse();

        const { sessionId } = await req.json();

        if (!sessionId || typeof sessionId !== 'string') {
            return Response.json({ error: 'Missing sessionId.' }, { status: 400 });
        }

        // ─── Verify session exists ───
        const sessionRef = db.collection('users').doc(uid).collection('active_chats').doc(sessionId);
        const sessionDoc = await sessionRef.get();

        if (!sessionDoc.exists) {
            return Response.json({ refunded: false, reason: 'Session not found.' }, { status: 404 });
        }

        const sessionData = sessionDoc.data();

        // Idempotency: don't refund twice
        if (sessionData?.creditRefunded) {
            return Response.json({ refunded: false, alreadyRefunded: true });
        }

        // Only refund if there are 0 user messages
        const messages = sessionData?.messages || [];
        const userMessages = messages.filter((m: any) => m.role === 'user');

        if (userMessages.length > 0) {
            return Response.json({
                refunded: false,
                reason: 'Session has user messages — no refund.',
            });
        }

        // Only refund if a credit was actually consumed for this session
        if (!sessionData?.creditConsumed) {
            return Response.json({
                refunded: false,
                reason: 'No credit was consumed for this session.',
            });
        }

        // ─── Refund the credit ───
        const today = new Date().toISOString().split('T')[0];
        const userDoc = await db.collection('users').doc(uid).get();
        const userData = userDoc.data();
        const sessionsToday = userData?.sessions_today_date === today ? (userData?.sessions_today || 0) : 0;

        const updateData: Record<string, any> = {
            session_credits: FieldValue.increment(1),
        };

        // Only decrement sessions_today if it's still today and > 0
        if (sessionsToday > 0) {
            updateData.sessions_today = FieldValue.increment(-1);
        }

        await db.collection('users').doc(uid).update(updateData);

        // Mark session as refunded (idempotency)
        await sessionRef.update({ creditRefunded: true });

        console.log(`RefundCredit: Refunded 1 credit for user ${uid}, session ${sessionId}`);

        return Response.json({ refunded: true });
    } catch (error: any) {
        console.error('Refund Credit Error:', error);
        return Response.json(
            { error: error.message || 'Failed to refund credit.' },
            { status: 500 }
        );
    }
}

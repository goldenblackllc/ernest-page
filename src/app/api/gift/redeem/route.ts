import { db, FieldValue } from '@/lib/firebase/admin';
import { verifyAuth, unauthorizedResponse } from '@/lib/auth/serverAuth';

/**
 * POST /api/gift/redeem
 * Redeems a gift code, granting the recipient 1 session credit.
 * Body: { giftCode: string }
 */
export async function POST(req: Request) {
    try {
        const uid = await verifyAuth(req);
        if (!uid) return unauthorizedResponse();

        const { giftCode } = await req.json();
        if (!giftCode) {
            return Response.json({ error: 'Gift code is required.' }, { status: 400 });
        }

        const giftRef = db.collection('gifts').doc(giftCode);
        const giftDoc = await giftRef.get();

        if (!giftDoc.exists) {
            return Response.json({ error: 'Invalid gift code.' }, { status: 404 });
        }

        const gift = giftDoc.data()!;

        // Already redeemed?
        if (gift.status === 'redeemed') {
            return Response.json({ error: 'This gift has already been redeemed.' }, { status: 400 });
        }

        // Prevent self-redemption
        if (gift.buyerUid === uid) {
            return Response.json(
                { error: 'You can\'t redeem your own gift. Share the link with someone else!' },
                { status: 400 }
            );
        }

        // Grant 1 session credit to the recipient
        await db.collection('users').doc(uid).update({
            session_credits: FieldValue.increment(1),
            total_sessions_purchased: FieldValue.increment(1),
        });

        // Mark gift as redeemed
        await giftRef.update({
            recipientUid: uid,
            redeemedAt: new Date().toISOString(),
            status: 'redeemed',
        });

        return Response.json({
            success: true,
            message: 'Gift redeemed! You now have a session credit.',
        });
    } catch (error: any) {
        console.error('Gift Redeem Error:', error);
        return Response.json(
            { error: error.message || 'Failed to redeem gift.' },
            { status: 500 }
        );
    }
}

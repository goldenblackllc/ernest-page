import { db } from '@/lib/firebase/admin';
import { verifyAuth, unauthorizedResponse } from '@/lib/auth/serverAuth';
import { nanoid } from 'nanoid';

/**
 * POST /api/gift/create
 * Called after a successful session_gift payment.
 * Generates a unique gift code and stores it in Firestore.
 * Body: { paymentIntentId: string }
 */
export async function POST(req: Request) {
    try {
        const uid = await verifyAuth(req);
        if (!uid) return unauthorizedResponse();

        const { paymentIntentId } = await req.json();
        if (!paymentIntentId) {
            return Response.json({ error: 'Payment intent ID is required.' }, { status: 400 });
        }

        // Check if a gift code already exists for this payment (idempotent)
        const existing = await db.collection('gifts')
            .where('paymentIntentId', '==', paymentIntentId)
            .limit(1)
            .get();

        if (!existing.empty) {
            const doc = existing.docs[0];
            const data = doc.data();
            return Response.json({
                giftCode: doc.id,
                giftUrl: `${process.env.NEXT_PUBLIC_BASE_URL || 'https://earnestpage.com'}/gift/${doc.id}`,
                status: data.status,
            });
        }

        // Generate a unique, URL-safe gift code
        const giftCode = nanoid(12);

        await db.collection('gifts').doc(giftCode).set({
            buyerUid: uid,
            paymentIntentId,
            recipientUid: null,
            redeemedAt: null,
            createdAt: new Date().toISOString(),
            status: 'pending',
        });

        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://earnestpage.com';
        const giftUrl = `${baseUrl}/gift/${giftCode}`;

        return Response.json({ giftCode, giftUrl });
    } catch (error: any) {
        console.error('Gift Create Error:', error);
        return Response.json(
            { error: error.message || 'Failed to create gift.' },
            { status: 500 }
        );
    }
}

import { db } from '@/lib/firebase/admin';
import { verifyAuth, unauthorizedResponse } from '@/lib/auth/serverAuth';
import { nanoid } from 'nanoid';

const ADMIN_UID = process.env.ADMIN_UID;

/**
 * POST /api/gift/create
 * Called after a successful session_gift payment.
 * Generates a unique gift code and stores it in Firestore.
 * Body: { paymentIntentId?: string, count?: number }
 *
 * Admin bypass: if the authenticated user matches ADMIN_UID,
 * paymentIntentId is optional and gifts are created for free.
 * `count` (admin only) generates multiple gift codes at once (max 20).
 */
export async function POST(req: Request) {
    try {
        const uid = await verifyAuth(req);
        if (!uid) return unauthorizedResponse();

        const body = await req.json();
        const { paymentIntentId, count } = body;
        const isAdmin = ADMIN_UID && uid === ADMIN_UID;

        // ─── Admin batch creation ──────────────────────────────
        if (isAdmin && !paymentIntentId) {
            const batchSize = Math.min(Math.max(count || 1, 1), 20);
            const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://earnestpage.com';
            const gifts: { giftCode: string; giftUrl: string }[] = [];

            for (let i = 0; i < batchSize; i++) {
                const giftCode = nanoid(12);
                await db.collection('gifts').doc(giftCode).set({
                    buyerUid: uid,
                    paymentIntentId: 'admin_grant',
                    recipientUid: null,
                    redeemedAt: null,
                    createdAt: new Date().toISOString(),
                    status: 'pending',
                });
                gifts.push({ giftCode, giftUrl: `${baseUrl}/gift/${giftCode}` });
            }

            console.log(`Admin gift grant: ${batchSize} code(s) created by ${uid}`);
            return Response.json(batchSize === 1 ? gifts[0] : { gifts });
        }

        // ─── Standard paid flow ────────────────────────────────
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

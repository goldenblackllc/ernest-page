import { db } from '@/lib/firebase/admin';
import { verifyAuth, unauthorizedResponse } from '@/lib/auth/serverAuth';
import { nanoid } from 'nanoid';

/**
 * POST /api/beta/apply
 * Self-serve beta application: auto-creates an invite code, redeems it,
 * and stores the applicant's payment info for the $20 UGC compensation.
 *
 * Body: { paymentMethod: 'venmo' | 'cashapp', paymentHandle: string, source?: string }
 */
export async function POST(req: Request) {
    try {
        const uid = await verifyAuth(req);
        if (!uid) return unauthorizedResponse();

        const body = await req.json();
        const { paymentMethod, paymentHandle, source = 'tiktok' } = body;

        if (!paymentMethod || !paymentHandle) {
            return Response.json({ error: 'Payment method and handle are required.' }, { status: 400 });
        }

        // Check if user already has an active beta subscription
        const userDoc = await db.collection('users').doc(uid).get();
        const userData = userDoc.data();
        if (userData?.subscription?.status === 'active' && userData?.subscription?.grantedBy === 'beta_invite') {
            return Response.json({ error: 'You already have beta access.' }, { status: 400 });
        }

        // Create and immediately redeem a beta invite code
        const code = nanoid(12);
        const cohort = 'tiktok-ugc-june-2026';
        const now = new Date();
        const expiry = new Date(now);
        expiry.setDate(expiry.getDate() + 30);
        const subscribedAt = now.toISOString();
        const subscribedUntil = expiry.toISOString();

        // Create the invite (already redeemed)
        await db.collection('beta_invites').doc(code).set({
            code,
            createdAt: subscribedAt,
            createdBy: 'self-serve',
            cohort,
            source,
            status: 'redeemed',
            recipientUid: uid,
            redeemedAt: subscribedAt,
        });

        // Grant subscription + tag as beta tester
        await db.collection('users').doc(uid).set(
            {
                subscription: {
                    status: 'active',
                    plan: 'archangel',
                    subscribedAt,
                    subscribedUntil,
                    grantedBy: 'beta_invite',
                },
                beta_tester: {
                    cohort,
                    enrolled_at: subscribedAt,
                    invite_code: code,
                    source,
                },
                // Beta testers default to community so their posts fill the feed
                default_post_routing: 'community',
            },
            { merge: true }
        );

        // Store application data (payment info for compensation)
        await db.collection('beta_applications').doc(uid).set({
            uid,
            paymentMethod,
            paymentHandle,
            source,
            invite_code: code,
            cohort,
            appliedAt: subscribedAt,
            compensationStatus: 'pending', // pending → paid after session completion
            compensationAmount: 20,
        });

        console.log(`Beta apply: User ${uid} self-enrolled [cohort: ${cohort}, payment: ${paymentMethod}/${paymentHandle}]`);

        return Response.json({
            success: true,
            message: 'You\'re in. 30 days of unlimited access.',
            subscription: {
                plan: 'archangel',
                subscribedAt,
                subscribedUntil,
            },
        });
    } catch (error: any) {
        console.error('Beta Apply Error:', error);
        return Response.json(
            { error: error.message || 'Failed to apply.' },
            { status: 500 }
        );
    }
}

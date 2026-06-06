import { db } from '@/lib/firebase/admin';
import { verifyAuth, unauthorizedResponse } from '@/lib/auth/serverAuth';

/**
 * POST /api/beta/redeem
 * Redeems a beta invite code, granting the user:
 *   1. A 30-day Archangel subscription (no Stripe — admin grant)
 *   2. Beta tester tagging on the user document
 *
 * Body: { code: string }
 */
export async function POST(req: Request) {
    try {
        const uid = await verifyAuth(req);
        if (!uid) return unauthorizedResponse();

        const { code } = await req.json();
        if (!code) {
            return Response.json({ error: 'Invite code is required.' }, { status: 400 });
        }

        const inviteRef = db.collection('beta_invites').doc(code);
        const inviteDoc = await inviteRef.get();

        if (!inviteDoc.exists) {
            return Response.json({ error: 'Invalid invite code.' }, { status: 404 });
        }

        const invite = inviteDoc.data()!;

        // Already redeemed?
        if (invite.status === 'redeemed') {
            return Response.json({ error: 'This invite has already been used.' }, { status: 400 });
        }

        // Compute 30-day subscription window
        const now = new Date();
        const expiry = new Date(now);
        expiry.setDate(expiry.getDate() + 30);

        const subscribedAt = now.toISOString();
        const subscribedUntil = expiry.toISOString();

        // Atomically update the user document
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
                    cohort: invite.cohort || 'unknown',
                    enrolled_at: subscribedAt,
                    invite_code: code,
                    source: invite.source || 'tiktok',
                    ...(invite.tiktok_handle ? { tiktok_handle: invite.tiktok_handle } : {}),
                    ...(invite.name ? { name: invite.name } : {}),
                },
                // Beta testers default to community so their posts fill the feed
                default_post_routing: 'community',
            },
            { merge: true }
        );

        // Mark invite as redeemed
        await inviteRef.update({
            recipientUid: uid,
            redeemedAt: subscribedAt,
            status: 'redeemed',
        });

        console.log(`Beta redeem: User ${uid} redeemed code ${code} [cohort: ${invite.cohort}]`);

        return Response.json({
            success: true,
            message: 'Welcome. You have 30 days of unlimited access.',
            subscription: {
                plan: 'archangel',
                subscribedAt,
                subscribedUntil,
            },
        });
    } catch (error: any) {
        console.error('Beta Redeem Error:', error);
        return Response.json(
            { error: error.message || 'Failed to redeem invite.' },
            { status: 500 }
        );
    }
}

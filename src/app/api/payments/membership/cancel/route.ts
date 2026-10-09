import { verifyAuth, unauthorizedResponse } from '@/lib/auth/serverAuth';
import { checkRateLimit, rateLimitResponse } from '@/lib/rateLimit';
import { readAccess, saveMembership } from '@/lib/access/accessStore';
import { getStripe } from '@/lib/payments/stripe';
import { membershipFromSubscription } from '@/lib/payments/billing';
import { membershipActive } from '@functions/lib/access/sessionAccess';

/**
 * POST /api/payments/membership/cancel  { resume?: boolean }
 * Cancels the membership at the end of the paid month, or (resume: true)
 * undoes a pending cancellation.
 */
export async function POST(req: Request) {
    try {
        const uid = await verifyAuth(req);
        if (!uid) return unauthorizedResponse();

        const rl = checkRateLimit(`payments:${uid}`, { maxRequests: 10, windowMs: 60_000 });
        if (!rl.allowed) return rateLimitResponse(rl.resetMs);

        const { resume } = await req.json().catch(() => ({}));
        const { access } = await readAccess(uid);
        const membership = access.membership;
        if (!membership || !membershipActive(membership, Date.now())) {
            return Response.json({ error: 'No active membership' }, { status: 404 });
        }
        if (membership.comp) return Response.json({ error: 'Complimentary memberships have nothing to cancel' }, { status: 409 });

        const updated = await getStripe().subscriptions.update(membership.subscription_id, {
            cancel_at_period_end: resume !== true,
        });
        const saved = await saveMembership(uid, membershipFromSubscription(updated));

        return Response.json({ cancelAtPeriodEnd: saved.cancel_at_period_end, renewsAt: saved.current_period_end });
    } catch (error) {
        console.error('[Payments] Cancel error:', error);
        return Response.json({ error: 'Membership could not be changed.' }, { status: 500 });
    }
}

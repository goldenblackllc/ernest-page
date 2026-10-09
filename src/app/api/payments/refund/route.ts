import type Stripe from 'stripe';
import { verifyAuth, unauthorizedResponse } from '@/lib/auth/serverAuth';
import { checkRateLimit, rateLimitResponse } from '@/lib/rateLimit';
import {
    reserveCreditRefund,
    reserveSessionRefund,
    reserveMembershipRefund,
    saveMembership,
} from '@/lib/access/accessStore';
import { getStripe } from '@/lib/payments/stripe';
import { membershipFromSubscription } from '@/lib/payments/billing';

/**
 * POST /api/payments/refund
 *   { kind: 'credits', lotId }      unused credits from one purchase
 *   { kind: 'session', sessionId }  a used paid session (7 days; 1 per 5 paid sessions; 3 a year)
 *   { kind: 'membership' }          a first membership (7 days, 3 sessions or fewer; once)
 * Self-serve, no questions asked, within the rules in sessionAccess.ts.
 * Refusals: 409 { reason }.
 */
export async function POST(req: Request) {
    try {
        const uid = await verifyAuth(req);
        if (!uid) return unauthorizedResponse();

        const rl = checkRateLimit(`payments:${uid}`, { maxRequests: 10, windowMs: 60_000 });
        if (!rl.allowed) return rateLimitResponse(rl.resetMs);

        const body = await req.json().catch(() => ({}));
        const stripe = getStripe();

        if (body.kind === 'credits' || body.kind === 'session') {
            const id = body.kind === 'credits' ? body.lotId : body.sessionId;
            if (typeof id !== 'string' || !id) return Response.json({ error: 'Missing purchase' }, { status: 400 });

            const reservation = body.kind === 'credits'
                ? await reserveCreditRefund(uid, id)
                : await reserveSessionRefund(uid, id);
            if (!reservation.ok) return Response.json({ error: 'Not refundable', reason: reservation.reason }, { status: 409 });

            try {
                await stripe.refunds.create({
                    payment_intent: reservation.paymentIntentId,
                    amount: reservation.amountCents,
                    reason: 'requested_by_customer',
                    metadata: { uid, kind: body.kind, id },
                }, { idempotencyKey: `refund-${uid}-${body.kind}-${id}` });
            } catch (error) {
                await reservation.undo();
                throw error;
            }
            return Response.json({ refunded: true, amountCents: reservation.amountCents });
        }

        if (body.kind === 'membership') {
            const reservation = await reserveMembershipRefund(uid);
            if (!reservation.ok) return Response.json({ error: 'Not refundable', reason: reservation.reason }, { status: 409 });

            let amountCents = 0;
            try {
                const paymentIntentId = await firstMembershipPayment(stripe, reservation.subscriptionId, reservation.firstInvoiceId);
                if (paymentIntentId) {
                    const refund = await stripe.refunds.create({
                        payment_intent: paymentIntentId,
                        reason: 'requested_by_customer',
                        metadata: { uid, kind: 'membership' },
                    }, { idempotencyKey: `refund-${uid}-membership-${reservation.subscriptionId}` });
                    amountCents = refund.amount;
                }
            } catch (error) {
                await reservation.undo();
                throw error;
            }
            // Refunded memberships end now, not at the end of the month.
            const canceled = await stripe.subscriptions.cancel(reservation.subscriptionId);
            await saveMembership(uid, membershipFromSubscription(canceled));
            return Response.json({ refunded: true, amountCents });
        }

        return Response.json({ error: 'Unknown refund' }, { status: 400 });
    } catch (error) {
        console.error('[Payments] Refund error:', error);
        return Response.json({ error: 'Refund could not be completed.' }, { status: 500 });
    }
}

async function firstMembershipPayment(stripe: Stripe, subscriptionId: string, firstInvoiceId: string | null): Promise<string | null> {
    let invoiceId = firstInvoiceId;
    if (!invoiceId) {
        const invoices = await stripe.invoices.list({ subscription: subscriptionId, status: 'paid', limit: 1 });
        invoiceId = invoices.data[0]?.id ?? null;
    }
    if (!invoiceId) return null;
    const payments = await stripe.invoicePayments.list({ invoice: invoiceId, limit: 1 });
    const pi = payments.data[0]?.payment?.payment_intent;
    return typeof pi === 'string' ? pi : pi?.id || null;
}

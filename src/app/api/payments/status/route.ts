import { db } from '@/lib/firebase/admin';
import { verifyAuth, unauthorizedResponse } from '@/lib/auth/serverAuth';
import { readAccess, type CreditLot } from '@/lib/access/accessStore';
import { getStripe } from '@/lib/payments/stripe';
import { listCards } from '@/lib/payments/billing';
import {
    accessSummary,
    canRefundMembership,
    canRefundUsedSession,
    usedSessionRefundsLeft,
    REFUND_RULES,
    type PaidSession,
} from '@functions/lib/access/sessionAccess';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * GET /api/payments/status
 * Everything Billing shows except history: free sessions, credits,
 * membership, saved cards, billing email, purchases with unused credits, and
 * recent paid sessions with whether each can be refunded.
 */
export async function GET(req: Request) {
    try {
        const uid = await verifyAuth(req);
        if (!uid) return unauthorizedResponse();

        const now = Date.now();
        const { access, signupMs } = await readAccess(uid);
        const userRef = db.collection('users').doc(uid);

        const [lotsSnap, sessionsSnap] = await Promise.all([
            userRef.collection('credit_lots').get(),
            userRef.collection('paid_sessions')
                .where('started_at', '>=', now - REFUND_RULES.usedSessionDays * DAY_MS)
                .get(),
        ]);

        const purchases = lotsSnap.docs
            .map(d => ({ id: d.id, ...(d.data() as CreditLot) }))
            .sort((a, b) => b.purchased_at - a.purchased_at)
            .map(lot => ({
                id: lot.id,
                product: lot.product,
                creditsTotal: lot.credits_total,
                creditsRemaining: lot.credits_remaining,
                amountCents: lot.amount_cents,
                refundableCents: lot.credits_remaining * lot.unit_price_cents,
                purchasedAt: lot.purchased_at,
            }));

        const sessions = sessionsSnap.docs
            .map(d => ({ id: d.id, data: d.data() as PaidSession }))
            .sort((a, b) => b.data.started_at - a.data.started_at)
            .map(({ id, data }) => {
                const check = canRefundUsedSession(access, data, now);
                return {
                    id,
                    startedAt: data.started_at,
                    amountCents: data.unit_price_cents,
                    refunded: !!data.refunded_at,
                    refundable: check.ok,
                    ...(check.ok ? {} : { reason: check.reason }),
                };
            });

        const membershipRefund = canRefundMembership(access, now);
        const summary = accessSummary(access, signupMs, now);

        return Response.json({
            summary,
            purchases,
            sessions,
            sessionRefundsLeft: usedSessionRefundsLeft(access, now),
            membershipRefundable: membershipRefund.ok,
            billingEmail: access.billing_email || null,
            cards: access.stripe_customer_id ? await savedCards(access.stripe_customer_id) : [],
        });
    } catch (error) {
        console.error('[Payments] Status error:', error);
        return Response.json({ error: 'Failed to load sessions.' }, { status: 500 });
    }
}

/** Saved cards, or none if Stripe can't be reached (the rest of the page still loads). */
async function savedCards(customerId: string) {
    try {
        return await listCards(getStripe(), customerId);
    } catch (error) {
        console.warn('[Payments] Could not load cards:', error);
        return [];
    }
}

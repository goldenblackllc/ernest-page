import { verifyAuth, unauthorizedResponse } from '@/lib/auth/serverAuth';
import { readAccess } from '@/lib/access/accessStore';
import { getStripe } from '@/lib/payments/stripe';
import { toBillingItem } from '@/lib/payments/billing';
import { SELLER } from '@/lib/payments/catalog';

/**
 * GET /api/payments/receipt?id=pi_...
 * One receipt: the charge, its refunds, the seller and the billing email.
 * Only for the signed-in user's own payments.
 */
export async function GET(req: Request) {
    try {
        const uid = await verifyAuth(req);
        if (!uid) return unauthorizedResponse();

        const id = new URL(req.url).searchParams.get('id');
        if (!id || !/^pi_\w+$/.test(id)) return Response.json({ error: 'Receipt not found' }, { status: 404 });

        const { access } = await readAccess(uid);
        const stripe = getStripe();
        const pi = await stripe.paymentIntents.retrieve(id, { expand: ['latest_charge'] }).catch(() => null);
        const customer = typeof pi?.customer === 'string' ? pi.customer : pi?.customer?.id;
        if (!pi || pi.status !== 'succeeded' || !access.stripe_customer_id || customer !== access.stripe_customer_id) {
            return Response.json({ error: 'Receipt not found' }, { status: 404 });
        }

        const refunds = await stripe.refunds.list({ payment_intent: pi.id, limit: 20 });
        const charge = typeof pi.latest_charge === 'object' ? pi.latest_charge : null;

        return Response.json({
            ...toBillingItem(pi),
            receiptNumber: charge?.receipt_number || pi.id,
            billingEmail: access.billing_email || null,
            refunds: refunds.data
                .filter(r => r.status === 'succeeded' || r.status === 'pending')
                .map(r => ({ createdAt: r.created * 1000, amountCents: r.amount })),
            seller: SELLER,
        });
    } catch (error) {
        console.error('[Payments] Receipt error:', error);
        return Response.json({ error: 'Receipt could not be loaded.' }, { status: 500 });
    }
}

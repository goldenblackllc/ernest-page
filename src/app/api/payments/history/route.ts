import { verifyAuth, unauthorizedResponse } from '@/lib/auth/serverAuth';
import { readAccess } from '@/lib/access/accessStore';
import { getStripe } from '@/lib/payments/stripe';
import { toBillingItem } from '@/lib/payments/billing';

/**
 * GET /api/payments/history
 * Every successful charge (session purchases and membership months), newest
 * first, with amounts refunded. Each item's id opens its receipt.
 */
export async function GET(req: Request) {
    try {
        const uid = await verifyAuth(req);
        if (!uid) return unauthorizedResponse();

        const { access } = await readAccess(uid);
        if (!access.stripe_customer_id) return Response.json({ items: [] });

        const intents = await getStripe().paymentIntents.list({
            customer: access.stripe_customer_id,
            limit: 100,
            expand: ['data.latest_charge'],
        });
        const items = intents.data.filter(pi => pi.status === 'succeeded').map(toBillingItem);
        return Response.json({ items });
    } catch (error) {
        console.error('[Payments] History error:', error);
        return Response.json({ error: 'Billing history could not be loaded.' }, { status: 500 });
    }
}

import Stripe from 'stripe';
import { verifyAuth, unauthorizedResponse } from '@/lib/auth/serverAuth';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2026-02-25.clover',
});

/**
 * GET /api/billing/history
 * Fetches the user's payment history directly from Stripe.
 * Returns all payment intents associated with this user's UID,
 * including refund status by checking the underlying charge.
 */
export async function GET(req: Request) {
    try {
        const uid = await verifyAuth(req);
        if (!uid) return unauthorizedResponse();

        // Search for payment intents with this user's UID in metadata
        const paymentIntents = await stripe.paymentIntents.search({
            query: `metadata["uid"]:"${uid}" AND status:"succeeded"`,
            limit: 50,
        });

        // Check refund status for each payment intent
        const history = await Promise.all(
            paymentIntents.data.map(async (pi) => {
                let refunded = false;

                // Check refund status via the charge
                if (pi.latest_charge) {
                    try {
                        const chargeId = typeof pi.latest_charge === 'string'
                            ? pi.latest_charge
                            : pi.latest_charge.id;
                        const charge = await stripe.charges.retrieve(chargeId);
                        refunded = charge.refunded;
                    } catch {
                        // If charge lookup fails, assume not refunded
                    }
                }

                return {
                    id: pi.id,
                    amount: pi.amount,
                    currency: pi.currency,
                    description: pi.description || 'Earnest Page',
                    plan: pi.metadata?.plan || 'unknown',
                    date: new Date(pi.created * 1000).toISOString(),
                    status: refunded ? 'refunded' : 'succeeded',
                };
            })
        );

        return Response.json({ history });
    } catch (error: any) {
        console.error('Billing History Error:', error);
        return Response.json(
            { error: error.message || 'Failed to fetch billing history.' },
            { status: 500 }
        );
    }
}

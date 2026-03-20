import Stripe from 'stripe';
import { db } from '@/lib/firebase/admin';
import { verifyAuth, unauthorizedResponse } from '@/lib/auth/serverAuth';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2026-02-25.clover',
});

/**
 * POST /api/update-payment-method
 *
 * Creates a SetupIntent so the user can update their card on file.
 * The frontend uses this clientSecret with Stripe Elements to collect
 * the new payment method, which is then attached to the customer.
 */
export async function POST(req: Request) {
    try {
        const uid = await verifyAuth(req);
        if (!uid) return unauthorizedResponse();

        const userDoc = await db.collection('users').doc(uid).get();
        const customerId = userDoc.data()?.subscription?.stripeCustomerId;

        if (!customerId) {
            return Response.json(
                { error: 'No subscription found.' },
                { status: 400 }
            );
        }

        const setupIntent = await stripe.setupIntents.create({
            customer: customerId,
            payment_method_types: ['card'],
            metadata: { uid },
        });

        return Response.json({ clientSecret: setupIntent.client_secret });
    } catch (error: any) {
        console.error('Update Payment Method Error:', error);
        return Response.json(
            { error: error.message || 'Failed to create setup intent.' },
            { status: 500 }
        );
    }
}

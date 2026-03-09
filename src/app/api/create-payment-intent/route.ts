import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2025-02-24.acacia',
});

const PLAN_AMOUNTS: Record<string, number> = {
    executive_retainer: 120000, // $1,200.00 in cents
    founders_key: 250000,       // $2,500.00 in cents
};

const PLAN_DESCRIPTIONS: Record<string, string> = {
    executive_retainer: 'Earnest Page — The Executive Retainer (Annual)',
    founders_key: 'Earnest Page — The Founders Key (Lifetime)',
};

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { tier, uid } = body;

        if (!tier || !uid) {
            return Response.json(
                { error: 'Tier and UID are required.' },
                { status: 400 }
            );
        }

        const amount = PLAN_AMOUNTS[tier];
        if (!amount) {
            return Response.json(
                { error: 'Invalid tier.' },
                { status: 400 }
            );
        }

        const paymentIntent = await stripe.paymentIntents.create({
            amount,
            currency: 'usd',
            description: PLAN_DESCRIPTIONS[tier],
            metadata: {
                uid,
                plan: tier,
            },
            automatic_payment_methods: {
                enabled: true,
            },
        });

        return Response.json({ clientSecret: paymentIntent.client_secret });
    } catch (error: any) {
        console.error('Create Payment Intent Error:', error);
        return Response.json(
            { error: error.message || 'Failed to create payment intent.' },
            { status: 500 }
        );
    }
}

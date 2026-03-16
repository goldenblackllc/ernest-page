import Stripe from 'stripe';
import { verifyAuth, unauthorizedResponse } from '@/lib/auth/serverAuth';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2026-02-25.clover',
});

const PLAN_AMOUNTS: Record<string, number> = {
    proving_ground: 12000,  // $120.00 in cents
    long_game: 120000,      // $1,200.00 in cents
    archangel: 49900,       // $499.00 — Archangel Program (unlimited/month)
    session_single: 2000,   // $20.00 — Single clarity session
    session_3pack: 5000,    // $50.00 — 3-pack of sessions
    session_gift: 2000,     // $20.00 — Gift a session
};

const PLAN_DESCRIPTIONS: Record<string, string> = {
    proving_ground: 'Earnest Page — The Proving Ground (30 Days)',
    long_game: 'Earnest Page — The Long Game (1 Year)',
    archangel: 'Earnest Page — The Archangel Program (30 Days)',
    session_single: 'Earnest Page — Clarity Session',
    session_3pack: 'Earnest Page — Clarity Sessions (3-Pack)',
    session_gift: 'Earnest Page — Clarity Session (Gift)',
};

export async function POST(req: Request) {
    try {
        const uid = await verifyAuth(req);
        if (!uid) return unauthorizedResponse();

        const body = await req.json();
        const { tier } = body;

        if (!tier) {
            return Response.json(
                { error: 'Tier is required.' },
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
            payment_method_types: ['card'],
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

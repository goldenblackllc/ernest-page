'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth/AuthContext';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase/config';
import { motion } from 'framer-motion';
import { Lock } from 'lucide-react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import { CheckoutForm } from './CheckoutForm';
import type { Appearance } from '@stripe/stripe-js';

interface TollboothProps {
    onComplete: () => void;
}

// ─── Stripe Setup ──────────────────────────────────────────────────
const stripePromise = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
    ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
    : null;

// Dark mode appearance — matches the Earnest Page aesthetic
const stripeAppearance: Appearance = {
    theme: 'night',
    variables: {
        colorPrimary: '#ffffff',
        colorBackground: '#0a0a0a',
        colorText: '#ffffff',
        colorDanger: '#ef4444',
        fontFamily: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        borderRadius: '12px',
        spacingUnit: '4px',
        fontSizeBase: '14px',
        colorTextPlaceholder: '#52525b',
    },
    rules: {
        '.Input': {
            border: '1px solid #27272a',
            backgroundColor: 'rgba(24, 24, 27, 0.8)',
            boxShadow: 'none',
            transition: 'border-color 150ms ease',
        },
        '.Input:focus': {
            border: '1px solid #52525b',
            boxShadow: 'none',
        },
        '.Input:hover': {
            border: '1px solid #3f3f46',
        },
        '.Label': {
            fontSize: '10px',
            fontWeight: '600',
            textTransform: 'uppercase' as const,
            letterSpacing: '0.2em',
            color: '#52525b',
        },
        '.Tab': {
            border: '1px solid #27272a',
            backgroundColor: '#0a0a0a',
            color: '#a1a1aa',
        },
        '.Tab:hover': {
            border: '1px solid #3f3f46',
            color: '#ffffff',
        },
        '.Tab--selected': {
            border: '1px solid #52525b',
            backgroundColor: 'rgba(24, 24, 27, 0.8)',
            color: '#ffffff',
        },
        '.Error': {
            fontSize: '12px',
            color: '#ef4444',
        },
    },
};

// ─── Animation Variants ────────────────────────────────────────────
const fadeUp = {
    hidden: { opacity: 0, y: 24 },
    visible: (i: number) => ({
        opacity: 1,
        y: 0,
        transition: { delay: i * 0.12, duration: 0.5, ease: [0.22, 1, 0.36, 1] as const },
    }),
};

const cardReveal = {
    hidden: { opacity: 0, y: 32 },
    visible: (i: number) => ({
        opacity: 1,
        y: 0,
        transition: { delay: 0.3 + i * 0.12, duration: 0.45, ease: [0.22, 1, 0.36, 1] as const },
    }),
};

type Plan = 'proving_ground' | 'long_game';

export function Tollbooth({ onComplete }: TollboothProps) {
    const { user } = useAuth();
    const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
    const [clientSecret, setClientSecret] = useState<string | null>(null);
    const [loadingIntent, setLoadingIntent] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // When a plan is selected, create a PaymentIntent
    useEffect(() => {
        if (!selectedPlan || !user) return;

        let cancelled = false;
        setLoadingIntent(true);
        setError(null);
        setClientSecret(null);

        (async () => {
            try {
                const idToken = await user.getIdToken();
                const res = await fetch('/api/create-payment-intent', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${idToken}`,
                    },
                    body: JSON.stringify({ tier: selectedPlan }),
                });

                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Failed to initialize payment.');

                if (!cancelled) {
                    setClientSecret(data.clientSecret);
                }
            } catch (err: any) {
                if (!cancelled) {
                    setError(err.message || 'Something went wrong.');
                }
            } finally {
                if (!cancelled) setLoadingIntent(false);
            }
        })();

        return () => { cancelled = true; };
    }, [selectedPlan, user]);

    const selectPlan = (plan: Plan) => {
        if (selectedPlan === plan) return; // Already selected
        setSelectedPlan(plan);
    };

    return (
        <main className="min-h-screen bg-black text-white flex flex-col items-center justify-start px-5 py-16 sm:py-24">
            <div className="w-full max-w-2xl mx-auto">

                {/* ── HEADER ── */}
                <motion.div
                    className="mb-16 sm:mb-20"
                    custom={0}
                    variants={fadeUp}
                    initial="hidden"
                    animate="visible"
                >
                    <div className="flex items-center gap-2 mb-6">
                        <Lock className="w-4 h-4 text-zinc-600" />
                        <span className="text-[10px] uppercase tracking-[0.3em] text-zinc-600 font-semibold">
                            Secure Enrollment
                        </span>
                    </div>
                    <h1 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight leading-[1.08] mb-6">
                        Demand a Better Life.
                    </h1>
                    <p className="text-base sm:text-lg text-zinc-400 leading-relaxed max-w-xl">
                        Earnest Page is not another app you forget about. It is an intentional
                        investment for someone who refuses to compromise. At $4 a day, securing
                        your standard costs less than the coffee you drink while making excuses.
                    </p>
                </motion.div>

                {/* ── PRICING CARDS ── */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-12 sm:mb-16">

                    {/* Card A — The Proving Ground */}
                    <motion.button
                        onClick={() => selectPlan('proving_ground')}
                        className={`group rounded-2xl border bg-zinc-950 p-7 sm:p-8 text-left transition-all duration-200 ${selectedPlan === 'proving_ground'
                            ? 'border-white/30 ring-1 ring-white/10'
                            : 'border-white/[0.08] hover:border-white/20'
                            }`}
                        custom={0}
                        variants={cardReveal}
                        initial="hidden"
                        animate="visible"
                    >
                        <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-600 mb-4">
                            30 Days
                        </p>
                        <h3 className="text-lg sm:text-xl font-bold tracking-tight text-white mb-2">
                            The Proving Ground
                        </h3>
                        <div className="flex items-baseline gap-2 mb-5">
                            <span className="text-3xl sm:text-4xl font-black tracking-tight text-white">
                                $120
                            </span>
                            <span className="text-sm text-zinc-600">/ 30 days</span>
                        </div>
                        <p className="text-sm text-zinc-500 leading-relaxed">
                            30 days to prove you mean it. No extensions.
                        </p>
                    </motion.button>

                    {/* Card B — The Long Game */}
                    <motion.button
                        onClick={() => selectPlan('long_game')}
                        className={`group rounded-2xl border bg-zinc-950 p-7 sm:p-8 text-left transition-all duration-200 ${selectedPlan === 'long_game'
                            ? 'border-white/30 ring-1 ring-white/10'
                            : 'border-white/[0.08] hover:border-white/20'
                            }`}
                        custom={1}
                        variants={cardReveal}
                        initial="hidden"
                        animate="visible"
                    >
                        <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-600 mb-4">
                            1 Year
                        </p>
                        <h3 className="text-lg sm:text-xl font-bold tracking-tight text-white mb-2">
                            The Long Game
                        </h3>
                        <div className="flex items-baseline gap-2 mb-5">
                            <span className="text-3xl sm:text-4xl font-black tracking-tight text-white">
                                $1,200
                            </span>
                            <span className="text-sm text-zinc-600">/ 1 year</span>
                        </div>
                        <p className="text-sm text-zinc-500 leading-relaxed">
                            You already proved it. Now build the compound effect.
                        </p>
                    </motion.button>
                </div>

                {/* ── STRIPE PAYMENT FORM ── */}
                {selectedPlan && (
                    <motion.div
                        className="mb-10"
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                    >
                        <div className="rounded-2xl border border-white/[0.08] bg-zinc-950 p-6 sm:p-8">
                            {loadingIntent && (
                                <div className="flex items-center justify-center py-12">
                                    <div className="w-6 h-6 border-2 border-zinc-700 border-t-white rounded-full animate-spin" />
                                </div>
                            )}

                            {clientSecret && (
                                <Elements
                                    stripe={stripePromise}
                                    options={{
                                        clientSecret,
                                        appearance: stripeAppearance,
                                    }}
                                >
                                    <CheckoutForm
                                        plan={selectedPlan}
                                        uid={user?.uid || ''}
                                        onSuccess={onComplete}
                                        onError={(msg) => setError(msg)}
                                    />
                                </Elements>
                            )}
                        </div>
                    </motion.div>
                )}

                {/* Prompt to select plan */}
                {!selectedPlan && (
                    <motion.p
                        className="text-[10px] text-zinc-600 text-center tracking-wide mb-10"
                        custom={3}
                        variants={fadeUp}
                        initial="hidden"
                        animate="visible"
                    >
                        Select your commitment above to proceed.
                    </motion.p>
                )}

                {/* ── ERROR ── */}
                {error && (
                    <div className="text-red-400 text-sm p-3 bg-red-500/10 border border-red-500/20 rounded-xl mb-6">
                        {error}
                    </div>
                )}

                {/* ── SIGN OUT ── */}
                <div className="text-center">
                    <button
                        onClick={() => signOut(auth)}
                        className="text-zinc-600 text-sm hover:text-zinc-400 transition-colors py-3"
                    >
                        Sign out
                    </button>
                </div>
            </div>
        </main>
    );
}

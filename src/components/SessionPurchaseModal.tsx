'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Zap, Gift, Loader2, Crown } from 'lucide-react';
import { loadStripe, Appearance } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';

// ─── Stripe ────────────────────────────────────────────────────────
const stripePromise = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
    ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
    : null;

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

// ─── Types ─────────────────────────────────────────────────────────
type SessionTier = 'session_single' | 'session_3pack' | 'session_gift' | 'archangel';

interface SessionPurchaseModalProps {
    isOpen: boolean;
    onClose: () => void;
    onPurchased: (paymentIntentId?: string) => void;
    defaultTier?: SessionTier;
}

// ─── Inner Checkout Form (needs Stripe context) ────────────────────
function SessionCheckoutForm({
    tier,
    onSuccess,
    onError,
}: {
    tier: SessionTier;
    onSuccess: (paymentIntentId?: string) => void;
    onError: (msg: string) => void;
}) {
    const stripe = useStripe();
    const elements = useElements();
    const { user: authUser } = useAuth();
    const [processing, setProcessing] = useState(false);
    const [ready, setReady] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!stripe || !elements) return;

        setProcessing(true);

        const { error, paymentIntent } = await stripe.confirmPayment({
            elements,
            confirmParams: {
                return_url: window.location.origin,
                payment_method_data: {
                    billing_details: {
                        email: '',
                        phone: '',
                    },
                },
            },
            redirect: 'if_required',
        });

        if (error) {
            onError(error.message || 'Payment failed.');
            setProcessing(false);
            return;
        }

        if (paymentIntent?.status === 'succeeded') {
            // Verify payment and credit account directly — don't rely on webhook timing
            try {
                const idToken = await authUser?.getIdToken();
                const confirmRes = await fetch('/api/confirm-purchase', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(idToken ? { 'Authorization': `Bearer ${idToken}` } : {}),
                    },
                    body: JSON.stringify({ paymentIntentId: paymentIntent.id }),
                });

                if (!confirmRes.ok) {
                    const confirmData = await confirmRes.json();
                    onError(confirmData.error || 'Failed to confirm purchase.');
                    setProcessing(false);
                    return;
                }

                onSuccess(paymentIntent.id);
            } catch {
                // Network error — proceed anyway, webhook will catch up
                onSuccess(paymentIntent.id);
            }
        } else {
            onError('Payment was not completed.');
            setProcessing(false);
        }
    };

    const labels: Record<SessionTier, string> = {
        session_single: 'Pay $20 USD — Start Session',
        session_3pack: 'Pay $50 USD — Get 3 Sessions',
        session_gift: 'Pay $20 USD — Send Gift',
        archangel: 'Subscribe — $499/month',
    };
    const label = labels[tier];

    return (
        <form onSubmit={handleSubmit}>
            <div className="mb-5">
                <PaymentElement
                    onReady={() => setReady(true)}
                    options={{
                        layout: 'tabs',
                        fields: {
                            billingDetails: {
                                email: 'never',
                                phone: 'never',
                            },
                        },
                        wallets: {
                            applePay: 'never',
                            googlePay: 'never',
                        },
                    }}
                />
            </div>

            <button
                type="submit"
                disabled={!stripe || !elements || processing || !ready}
                className="w-full rounded-full bg-white text-black py-3.5 text-sm font-bold tracking-wide hover:bg-zinc-200 active:scale-[0.98] transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
            >
                {processing ? (
                    <span className="flex items-center justify-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Processing...
                    </span>
                ) : (
                    label
                )}
            </button>

            <p className="text-[10px] text-zinc-600 text-center tracking-wide mt-3">
                {tier === 'archangel'
                    ? 'Secure payment via Stripe. $499/month. Cancel anytime.'
                    : 'Secure payment via Stripe. No subscription. Cancel anytime.'
                }
            </p>
        </form>
    );
}

// ─── Main Modal ────────────────────────────────────────────────────
export function SessionPurchaseModal({ isOpen, onClose, onPurchased, defaultTier }: SessionPurchaseModalProps) {
    const { user } = useAuth();
    const [selectedTier, setSelectedTier] = useState<SessionTier | null>(defaultTier || null);
    const [clientSecret, setClientSecret] = useState<string | null>(null);
    const [loadingIntent, setLoadingIntent] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Create PaymentIntent when tier selected
    useEffect(() => {
        if (!selectedTier || !user) return;

        let cancelled = false;
        setLoadingIntent(true);
        setError(null);
        setClientSecret(null);

        (async () => {
            try {
                const idToken = await user.getIdToken();
                const apiUrl = selectedTier === 'archangel'
                    ? '/api/create-archangel-subscription'
                    : '/api/create-payment-intent';
                const res = await fetch(apiUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${idToken}`,
                    },
                    body: JSON.stringify({ tier: selectedTier }),
                });

                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Failed to initialize payment.');

                if (!cancelled) setClientSecret(data.clientSecret);
            } catch (err: any) {
                if (!cancelled) setError(err.message);
            } finally {
                if (!cancelled) setLoadingIntent(false);
            }
        })();

        return () => { cancelled = true; };
    }, [selectedTier, user]);

    // Reset on close
    useEffect(() => {
        if (!isOpen) {
            setSelectedTier(null);
            setClientSecret(null);
            setError(null);
        }
    }, [isOpen]);

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm px-4"
                    onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
                >
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                        className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl shadow-black/60"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800/50">
                            <div>
                                <h2 className="text-lg font-bold text-white">Start a Clarity Session</h2>
                                <p className="text-xs text-zinc-500 mt-0.5">One conversation. No commitment.</p>
                            </div>
                            <button
                                onClick={onClose}
                                className="p-2 text-zinc-500 hover:text-white transition-colors rounded-full hover:bg-zinc-800/50"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="px-6 py-5 space-y-4">
                            {/* Tier Selection */}
                            {!selectedTier && (
                                <div className="space-y-3">
                                    {/* Single Session */}
                                    <button
                                        onClick={() => setSelectedTier('session_single')}
                                        className="w-full text-left rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 hover:border-zinc-600 transition-all group"
                                    >
                                        <div className="flex items-start justify-between">
                                            <div>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <Zap className="w-4 h-4 text-zinc-400" />
                                                    <span className="text-sm font-bold text-white">Single Session</span>
                                                </div>
                                                <p className="text-xs text-zinc-500">
                                                    One full conversation. Up to 2 hours. 30 exchanges.
                                                </p>
                                            </div>
                                            <span className="text-xl font-black text-white">$20 <span className="text-xs font-medium text-zinc-500">USD</span></span>
                                        </div>
                                    </button>

                                    {/* 3-Pack */}
                                    <button
                                        onClick={() => setSelectedTier('session_3pack')}
                                        className="w-full text-left rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 hover:border-zinc-600 transition-all group"
                                    >
                                        <div className="flex items-start justify-between">
                                            <div>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <Zap className="w-4 h-4 text-zinc-400" />
                                                    <span className="text-sm font-bold text-white">3-Pack</span>
                                                    <span className="text-[10px] uppercase tracking-wider bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded-full font-bold">
                                                        Save $10
                                                    </span>
                                                </div>
                                                <p className="text-xs text-zinc-500">
                                                    Three sessions. Use anytime. They remember where you left off.
                                                </p>
                                            </div>
                                            <span className="text-xl font-black text-white">$50 <span className="text-xs font-medium text-zinc-500">USD</span></span>
                                        </div>
                                    </button>

                                    {/* Divider */}
                                    <div className="relative flex items-center my-1">
                                        <div className="flex-1 border-t border-zinc-800" />
                                        <span className="px-3 text-[10px] uppercase tracking-widest text-zinc-600 font-bold">or go unlimited</span>
                                        <div className="flex-1 border-t border-zinc-800" />
                                    </div>

                                    {/* Archangel Program */}
                                    <button
                                        onClick={() => setSelectedTier('archangel')}
                                        className="w-full text-left rounded-xl border border-amber-800/40 bg-gradient-to-br from-zinc-900 to-amber-950/20 p-5 hover:border-amber-600/60 transition-all group"
                                    >
                                        <div className="flex items-start justify-between">
                                            <div>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <Crown className="w-4 h-4 text-amber-500" />
                                                    <span className="text-sm font-bold text-white">The Archangel Program</span>
                                                </div>
                                                <p className="text-xs text-zinc-500">
                                                    All sessions included. Up to 5 per day. Cancel anytime.
                                                </p>
                                            </div>
                                            <div className="text-right">
                                                <span className="text-xl font-black text-white">$499 <span className="text-xs font-medium text-zinc-500">USD</span></span>
                                                <p className="text-[10px] text-zinc-600">/month</p>
                                            </div>
                                        </div>
                                    </button>
                                </div>
                            )}

                            {/* Payment form */}
                            {selectedTier && (
                                <div>
                                    {/* Selected tier summary */}
                                    <div className="flex items-center justify-between mb-4 px-1">
                                        <button
                                            onClick={() => { setSelectedTier(null); setClientSecret(null); }}
                                            className="text-xs text-zinc-500 hover:text-white transition-colors"
                                        >
                                            ← Change selection
                                        </button>
                                        <span className="text-sm font-bold text-white">
                                            {selectedTier === 'session_single' ? '$20 USD — 1 Session'
                                                : selectedTier === 'session_3pack' ? '$50 USD — 3 Sessions'
                                                : '$499/month — Unlimited Sessions'}
                                        </span>
                                    </div>

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
                                            <SessionCheckoutForm
                                                tier={selectedTier}
                                                onSuccess={() => {
                                                    onClose();
                                                    onPurchased();
                                                }}
                                                onError={(msg) => setError(msg)}
                                            />
                                        </Elements>
                                    )}
                                </div>
                            )}

                            {error && (
                                <div className="text-red-400 text-sm p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                                    {error}
                                </div>
                            )}
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

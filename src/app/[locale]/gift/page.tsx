'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth/AuthContext';
import { useRouter } from 'next/navigation';
import { Gift, Copy, Check, MessageCircle, ArrowLeft, Loader2, CreditCard } from 'lucide-react';
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
        },
        '.Input:focus': {
            border: '1px solid #52525b',
            boxShadow: 'none',
        },
        '.Label': {
            fontSize: '10px',
            fontWeight: '600',
            textTransform: 'uppercase' as const,
            letterSpacing: '0.2em',
            color: '#52525b',
        },
    },
};

// ─── Inline Checkout Form ──────────────────────────────────────────
function GiftCheckoutForm({ onSuccess, onError }: {
    onSuccess: (paymentIntentId: string) => void;
    onError: (msg: string) => void;
}) {
    const stripe = useStripe();
    const elements = useElements();
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
                    billing_details: { email: '', phone: '' },
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
            onSuccess(paymentIntent.id);
        } else {
            onError('Payment was not completed.');
            setProcessing(false);
        }
    };

    return (
        <form onSubmit={handleSubmit}>
            <div className="mb-5">
                <PaymentElement
                    onReady={() => setReady(true)}
                    options={{
                        layout: 'tabs',
                        fields: {
                            billingDetails: { email: 'never', phone: 'never' },
                        },
                        wallets: { applePay: 'never', googlePay: 'never' },
                    }}
                />
            </div>
            <button
                type="submit"
                disabled={!stripe || !elements || processing || !ready}
                className="w-full rounded-full bg-white text-black py-3.5 text-sm font-bold tracking-wide hover:bg-zinc-200 active:scale-[0.98] transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
                {processing ? (
                    <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Processing...
                    </>
                ) : (
                    <>
                        <Gift className="w-4 h-4" />
                        Pay $20 — Send Gift
                    </>
                )}
            </button>
            <p className="text-[10px] text-zinc-400 text-center tracking-wide mt-3">
                Secure payment via Stripe. This session is for someone else — you&apos;ll get a link to share.
            </p>
        </form>
    );
}

// ─── Main Gift Page ────────────────────────────────────────────────
export default function GiftPage() {
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();

    const [step, setStep] = useState<'info' | 'checkout' | 'done'>('info');
    const [clientSecret, setClientSecret] = useState<string | null>(null);
    const [loadingIntent, setLoadingIntent] = useState(false);
    const [giftUrl, setGiftUrl] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleStartCheckout = async () => {
        if (!user) return;
        setLoadingIntent(true);
        setError(null);
        try {
            const token = await user.getIdToken();

            // Try admin bypass first — server decides if caller qualifies
            const adminRes = await fetch('/api/gift/create', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({}),
            });

            if (adminRes.ok) {
                const adminData = await adminRes.json();
                if (adminData.giftUrl) {
                    setGiftUrl(adminData.giftUrl);
                    setStep('done');
                    return;
                }
            }

            // Standard Stripe flow for non-admin users
            const res = await fetch('/api/create-payment-intent', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ tier: 'session_gift' }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to start checkout.');
            setClientSecret(data.clientSecret);
            setStep('checkout');
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoadingIntent(false);
        }
    };

    const handlePaymentSuccess = async (paymentIntentId: string) => {
        // Create the gift code
        try {
            const token = await user!.getIdToken();
            const res = await fetch('/api/gift/create', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ paymentIntentId }),
            });
            const data = await res.json();
            if (res.ok && data.giftUrl) {
                setGiftUrl(data.giftUrl);
                setStep('done');
            } else {
                setError('Payment succeeded but gift link creation failed. Contact support.');
            }
        } catch {
            setError('Payment succeeded but gift link creation failed. Contact support.');
        }
    };

    const handleCopy = async () => {
        if (!giftUrl) return;
        await navigator.clipboard.writeText(giftUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleShareSMS = () => {
        if (!giftUrl) return;
        const message = `I got you a session on Earnest Page. It's a real conversation — not a chatbot, not therapy. Just someone in your corner for an hour.\n\n${giftUrl}`;
        window.open(`sms:?body=${encodeURIComponent(message)}`);
    };

    if (authLoading) {
        return <div className="min-h-screen bg-black flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-zinc-700 border-t-white rounded-full animate-spin" />
        </div>;
    }

    if (!user) {
        router.push('/');
        return null;
    }

    return (
        <div className="min-h-screen bg-black text-white pt-safe">
            <div className="max-w-lg mx-auto px-4 pt-20 pb-12">

                {/* Back */}
                <button
                    onClick={() => router.push('/')}
                    className="flex items-center gap-2 text-zinc-500 hover:text-white text-sm mb-8 transition-colors"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Back
                </button>

                {/* ── STEP 1: Info ── */}
                {step === 'info' && (
                    <>
                        <div className="text-center mb-10">
                            <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto mb-5">
                                <Gift className="w-8 h-8 text-white" />
                            </div>
                            <h1 className="text-2xl font-bold tracking-tight mb-2">
                                Gift a Session
                            </h1>
                            <p className="text-sm text-zinc-400 leading-relaxed max-w-sm mx-auto">
                                For the person who needs this but would never seek it out themselves.
                            </p>
                        </div>

                        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8">
                            {/* How it works */}
                            <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-400 font-bold mb-5">
                                How it works
                            </p>
                            <div className="space-y-4 mb-8">
                                <div className="flex items-start gap-3">
                                    <div className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center shrink-0 mt-0.5">
                                        <span className="text-[10px] font-bold text-zinc-400">1</span>
                                    </div>
                                    <p className="text-sm text-zinc-400">You pay <span className="text-white font-semibold">$20</span> for a clarity session</p>
                                </div>
                                <div className="flex items-start gap-3">
                                    <div className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center shrink-0 mt-0.5">
                                        <span className="text-[10px] font-bold text-zinc-400">2</span>
                                    </div>
                                    <p className="text-sm text-zinc-400">You get a <span className="text-white font-semibold">unique link</span> to share</p>
                                </div>
                                <div className="flex items-start gap-3">
                                    <div className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center shrink-0 mt-0.5">
                                        <span className="text-[10px] font-bold text-zinc-400">3</span>
                                    </div>
                                    <p className="text-sm text-zinc-400">They open the link, log in, and the <span className="text-white font-semibold">session is theirs</span></p>
                                </div>
                            </div>

                            {/* CTA */}
                            <button
                                onClick={handleStartCheckout}
                                disabled={loadingIntent}
                                className="w-full rounded-full bg-white text-black py-3.5 text-sm font-bold tracking-wide hover:bg-zinc-200 active:scale-[0.98] transition-all duration-150 flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                {loadingIntent ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Setting up...
                                    </>
                                ) : (
                                    <>
                                        <CreditCard className="w-4 h-4" />
                                        Continue to Payment — $20
                                    </>
                                )}
                            </button>

                            <p className="text-[10px] text-zinc-400 text-center mt-3">
                                This session is for someone else. It won&apos;t be added to your account.
                            </p>
                        </div>
                    </>
                )}

                {/* ── STEP 2: Checkout ── */}
                {step === 'checkout' && clientSecret && stripePromise && (
                    <>
                        <div className="text-center mb-6">
                            <div className="inline-flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-full px-4 py-2 text-xs font-semibold text-zinc-400 mb-4">
                                <Gift className="w-3.5 h-3.5" />
                                Purchasing a gift — this is for someone else
                            </div>
                            <h2 className="text-xl font-bold tracking-tight">Payment</h2>
                        </div>

                        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
                            <Elements
                                stripe={stripePromise}
                                options={{
                                    clientSecret,
                                    appearance: stripeAppearance,
                                }}
                            >
                                <GiftCheckoutForm
                                    onSuccess={handlePaymentSuccess}
                                    onError={(msg) => setError(msg)}
                                />
                            </Elements>
                        </div>
                    </>
                )}

                {/* ── STEP 3: Done — Show gift link ── */}
                {step === 'done' && giftUrl && (
                    <>
                        <div className="text-center mb-8">
                            <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-5">
                                <Check className="w-8 h-8 text-emerald-400" />
                            </div>
                            <h1 className="text-2xl font-bold tracking-tight mb-2">
                                Gift Ready
                            </h1>
                            <p className="text-sm text-zinc-400">
                                Share this link with the person you&apos;re gifting.
                                When they open it, they&apos;ll get a session credit.
                            </p>
                        </div>

                        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-5">
                            {/* Gift URL */}
                            <div className="bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 flex items-center gap-3">
                                <p className="text-sm text-zinc-300 font-mono truncate flex-1">
                                    {giftUrl}
                                </p>
                                <button
                                    onClick={handleCopy}
                                    className="shrink-0 p-2 rounded-lg hover:bg-zinc-800 transition-colors"
                                >
                                    {copied ? (
                                        <Check className="w-4 h-4 text-emerald-400" />
                                    ) : (
                                        <Copy className="w-4 h-4 text-zinc-400" />
                                    )}
                                </button>
                            </div>

                            {/* Share buttons */}
                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    onClick={handleCopy}
                                    className="rounded-xl border border-zinc-800 py-3 text-sm font-semibold text-zinc-300 hover:bg-zinc-800/50 transition-all flex items-center justify-center gap-2"
                                >
                                    <Copy className="w-4 h-4" />
                                    {copied ? 'Copied!' : 'Copy Link'}
                                </button>
                                <button
                                    onClick={handleShareSMS}
                                    className="rounded-xl border border-zinc-800 py-3 text-sm font-semibold text-zinc-300 hover:bg-zinc-800/50 transition-all flex items-center justify-center gap-2"
                                >
                                    <MessageCircle className="w-4 h-4" />
                                    Send via SMS
                                </button>
                            </div>
                        </div>

                        {/* Exit */}
                        <button
                            onClick={() => router.push('/')}
                            className="w-full mt-5 rounded-full border border-zinc-800 py-3 text-sm font-semibold text-zinc-300 hover:bg-zinc-800/50 transition-all"
                        >
                            Done — Back to Home
                        </button>
                    </>
                )}

                {/* Error */}
                {error && (
                    <div className="mt-4 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400">
                        {error}
                    </div>
                )}
            </div>
        </div>
    );
}

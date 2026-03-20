"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth/AuthContext";
import { subscribeToCharacterProfile } from "@/lib/firebase/character";
import { CharacterProfile } from "@/types/character";
import { Loader2, CheckCircle, Zap, Clock, CreditCard, RotateCcw, Shield, AlertTriangle } from "lucide-react";
import { SessionPurchaseModal } from "./SessionPurchaseModal";
import { loadStripe, Appearance } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';

const MAX_SESSIONS_PER_DAY = 5;

// ─── Stripe (for update payment method) ────────────────────────────
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
        '.Input:focus': { border: '1px solid #52525b', boxShadow: 'none' },
        '.Label': {
            fontSize: '10px', fontWeight: '600',
            textTransform: 'uppercase' as const, letterSpacing: '0.2em', color: '#52525b',
        },
    },
};

// ─── Update Card Form ──────────────────────────────────────────────
function UpdateCardForm({ onSuccess, onCancel }: { onSuccess: () => void; onCancel: () => void }) {
    const stripe = useStripe();
    const elements = useElements();
    const [processing, setProcessing] = useState(false);
    const [ready, setReady] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!stripe || !elements) return;
        setProcessing(true);
        setError(null);

        const { error: confirmError } = await stripe.confirmSetup({
            elements,
            confirmParams: { return_url: window.location.origin },
            redirect: 'if_required',
        });

        if (confirmError) {
            setError(confirmError.message || 'Failed to update payment method.');
            setProcessing(false);
        } else {
            onSuccess();
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <PaymentElement
                onReady={() => setReady(true)}
                options={{
                    layout: 'tabs',
                    fields: { billingDetails: { email: 'never', phone: 'never' } },
                    wallets: { applePay: 'never', googlePay: 'never' },
                }}
            />
            {error && (
                <div className="text-red-400 text-xs p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                    {error}
                </div>
            )}
            <div className="flex gap-3">
                <button
                    type="button"
                    onClick={onCancel}
                    className="flex-1 py-2.5 px-4 rounded-xl border border-zinc-700 text-sm font-semibold text-zinc-400 hover:text-white transition-all"
                >
                    Cancel
                </button>
                <button
                    type="submit"
                    disabled={!stripe || !elements || processing || !ready}
                    className="flex-1 rounded-xl bg-white text-black py-2.5 text-sm font-bold hover:bg-zinc-200 active:scale-[0.97] transition-all disabled:opacity-40"
                >
                    {processing ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Update Card'}
                </button>
            </div>
        </form>
    );
}

// ─── Types ─────────────────────────────────────────────────────────
interface BillingRecord {
    id: string;
    amount: number;
    currency: string;
    description: string;
    plan: string;
    date: string;
    status: string;
}

// ─── Main Component ────────────────────────────────────────────────
export function SubscriptionView() {
    const { user } = useAuth();
    const [profile, setProfile] = useState<CharacterProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [isCanceling, setIsCanceling] = useState(false);
    const [cancelStatus, setCancelStatus] = useState<string | null>(null);
    const [showConfirm, setShowConfirm] = useState(false);
    const [isPurchaseOpen, setIsPurchaseOpen] = useState(false);
    const [refundingId, setRefundingId] = useState<string | null>(null);
    const [refundResult, setRefundResult] = useState<{ id: string; message: string; success: boolean } | null>(null);
    const [billingHistory, setBillingHistory] = useState<BillingRecord[]>([]);
    const [billingLoading, setBillingLoading] = useState(true);
    const [isResubscribing, setIsResubscribing] = useState(false);
    const [showUpdateCard, setShowUpdateCard] = useState(false);
    const [setupClientSecret, setSetupClientSecret] = useState<string | null>(null);

    useEffect(() => {
        if (!user) return;
        const unsub = subscribeToCharacterProfile(user.uid, (data) => {
            setProfile(data);
            setLoading(false);
        });
        return () => unsub();
    }, [user]);

    // Fetch billing history from Stripe
    useEffect(() => {
        if (!user) return;
        const fetchHistory = async () => {
            try {
                const token = await user.getIdToken();
                const res = await fetch('/api/billing/history', {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (res.ok) {
                    const data = await res.json();
                    setBillingHistory(data.history || []);
                }
            } catch (err) {
                console.error('Failed to fetch billing history:', err);
            } finally {
                setBillingLoading(false);
            }
        };
        fetchHistory();
    }, [user]);

    const sub = profile?.subscription;
    const subEndDate = sub?.currentPeriodEnd || sub?.subscribedUntil;
    const isActive = (sub?.status === 'active' || sub?.status === 'past_due') && subEndDate && new Date(subEndDate) > new Date();
    const isPastDue = sub?.status === 'past_due';
    const isCancelingAtEnd = sub?.cancelAtPeriodEnd && sub?.status === 'active';
    const isArchangel = !!sub?.stripeSubscriptionId;
    const credits = profile?.session_credits || 0;
    const expiresAt = subEndDate ? new Date(subEndDate) : null;
    const refundCount = profile?.refund_count || 0;
    const purchases = profile?.session_purchases || [];
    const totalPurchased = profile?.total_sessions_purchased || purchases.length;

    // Daily sessions
    const today = new Date().toISOString().split('T')[0];
    const sessionsToday = profile?.sessions_today_date === today ? (profile?.sessions_today || 0) : 0;
    const dailyRemaining = MAX_SESSIONS_PER_DAY - sessionsToday;

    // Trust tier calculation (mirrors server logic)
    const getRefundsAllowed = () => {
        const ratio = totalPurchased > 0 ? refundCount / totalPurchased : 0;
        if (ratio > 0.4 && totalPurchased >= 3) return 0;
        if (totalPurchased <= 3) return 1;
        if (totalPurchased <= 15) return Math.floor(totalPurchased / 5);
        return Math.floor(totalPurchased / 3);
    };
    const refundsAvailable = Math.max(0, getRefundsAllowed() - refundCount);

    const handleRefund = async (paymentIntentId: string) => {
        if (!user) return;
        setRefundingId(paymentIntentId);
        setRefundResult(null);
        try {
            const token = await user.getIdToken();
            const res = await fetch('/api/refund-session', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ paymentIntentId }),
            });
            const data = await res.json();
            if (!res.ok) {
                setRefundResult({ id: paymentIntentId, message: data.error, success: false });
            } else {
                setRefundResult({ id: paymentIntentId, message: data.message, success: true });
                setBillingHistory(prev => prev.map(r => r.id === paymentIntentId ? { ...r, status: 'refunded' } : r));
            }
        } catch (err: any) {
            setRefundResult({ id: paymentIntentId, message: 'Something went wrong.', success: false });
        } finally {
            setRefundingId(null);
        }
    };

    const canRefundRecord = (record: BillingRecord) => {
        const daysSince = Math.floor((Date.now() - new Date(record.date).getTime()) / (1000 * 60 * 60 * 24));
        return daysSince <= 7;
    };

    const handleTerminate = async () => {
        if (!user) return;
        setIsCanceling(true);
        setCancelStatus(null);
        try {
            const token = await user.getIdToken();
            const res = await fetch('/api/subscription/cancel', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Cancellation failed.');
            setShowConfirm(false);
            if (data.refunded) {
                setCancelStatus('Access terminated. Your payment has been returned.');
            } else if (isArchangel) {
                const until = data.accessUntil ? new Date(data.accessUntil).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '';
                setCancelStatus(`Your subscription will not renew. You have access until ${until}.`);
            } else {
                setCancelStatus('Access terminated. Your enrollment continues until the end of your billing cycle.');
            }
        } catch (err: any) {
            setCancelStatus(err.message || 'Something went wrong.');
        } finally {
            setIsCanceling(false);
        }
    };

    const handleResubscribe = async () => {
        if (!user) return;
        setIsResubscribing(true);
        try {
            const token = await user.getIdToken();
            const res = await fetch('/api/archangel/resubscribe', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Resubscribe failed.');
            setCancelStatus(null);
        } catch (err: any) {
            setCancelStatus(err.message || 'Something went wrong.');
        } finally {
            setIsResubscribing(false);
        }
    };

    const handleUpdateCard = async () => {
        if (!user) return;
        try {
            const token = await user.getIdToken();
            const res = await fetch('/api/update-payment-method', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to initialize.');
            setSetupClientSecret(data.clientSecret);
            setShowUpdateCard(true);
        } catch (err: any) {
            console.error('Update card error:', err);
        }
    };

    if (loading) {
        return <div className="h-64 w-full animate-pulse bg-zinc-900/50 rounded-xl" />;
    }

    return (
        <div className="space-y-10 py-6">

            {/* ── PAGE HEADER ── */}
            <div>
                <h1 className="text-2xl font-bold text-white tracking-tight">
                    Billing & Sessions
                </h1>
                <p className="text-sm text-zinc-400 mt-1">
                    Manage your session credits, view payment history, and request refunds.
                </p>
            </div>

            {/* ── PAYMENT FAILED BANNER ── */}
            {isPastDue && (
                <div className="bg-red-950/30 border border-red-900/50 rounded-xl p-5 flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                    <div className="flex-1">
                        <p className="text-sm font-semibold text-red-400 mb-1">Payment Failed</p>
                        <p className="text-xs text-red-400/70 leading-relaxed">
                            Your last payment didn&apos;t go through. Update your card to keep your Archangel access.
                        </p>
                        <button
                            onClick={handleUpdateCard}
                            className="mt-3 rounded-full bg-red-500 text-white px-5 py-2 text-xs font-bold hover:bg-red-400 active:scale-[0.97] transition-all"
                        >
                            Update Payment Method
                        </button>
                    </div>
                </div>
            )}

            {/* ── SESSION CREDITS + DAILY USAGE ── */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center">
                            <Zap className="w-5 h-5 text-zinc-300" />
                        </div>
                        <div>
                            <p className="text-xs text-zinc-500 uppercase tracking-widest font-bold">
                                Session Credits
                            </p>
                            <p className="text-2xl font-black text-white">
                                {isActive ? (
                                    <>∞{credits > 0 && <span className="text-sm font-semibold text-zinc-500 ml-1.5">(+{credits} stored)</span>}</>
                                ) : credits}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={() => setIsPurchaseOpen(true)}
                        className="rounded-full bg-white text-black px-5 py-2.5 text-sm font-bold hover:bg-zinc-200 active:scale-[0.97] transition-all duration-150"
                    >
                        Buy More
                    </button>
                </div>
                <div className="flex items-center gap-4 text-xs text-zinc-400">
                    <span>
                        Each credit = one conversation (up to 2 hours / 30 exchanges).
                    </span>
                    <span className="text-zinc-600">|</span>
                    <span className={dailyRemaining <= 1 ? 'text-amber-500' : ''}>
                        {dailyRemaining} of {MAX_SESSIONS_PER_DAY} sessions remaining today
                    </span>
                </div>
            </div>

            {/* ── ACTIVE PLAN (Archangel / Legacy) ── */}
            {isActive && (
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-3">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center">
                            <Clock className="w-5 h-5 text-zinc-300" />
                        </div>
                        <div>
                            <p className="text-xs text-zinc-500 uppercase tracking-widest font-bold">
                                Active Plan
                            </p>
                            <p className="text-lg text-white font-semibold">
                                {sub?.plan === 'archangel'
                                    ? 'The Archangel Program'
                                    : sub?.plan === 'long_game'
                                        ? 'The Long Game'
                                        : 'The Proving Ground'}
                            </p>
                        </div>
                    </div>

                    {/* Billing info */}
                    {expiresAt && (
                        <p className="text-sm text-zinc-500">
                            {isArchangel ? (
                                isCancelingAtEnd ? (
                                    <>
                                        Access until{' '}
                                        <span className="text-zinc-300">
                                            {expiresAt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                                        </span>
                                        <span className="text-amber-500 ml-1">· Will not renew</span>
                                    </>
                                ) : (
                                    <>
                                        Unlimited sessions (up to {MAX_SESSIONS_PER_DAY}/day) · Next billing{' '}
                                        <span className="text-zinc-300">
                                            {expiresAt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                                        </span>
                                    </>
                                )
                            ) : (
                                <>
                                    Unlimited sessions (up to {MAX_SESSIONS_PER_DAY}/day) until{' '}
                                    <span className="text-zinc-300">
                                        {expiresAt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                                    </span>
                                </>
                            )}
                        </p>
                    )}

                    {/* Resubscribe button (for canceled-at-period-end) */}
                    {isCancelingAtEnd && (
                        <button
                            onClick={handleResubscribe}
                            disabled={isResubscribing}
                            className="flex items-center gap-2 py-2.5 px-5 rounded-xl bg-white text-black text-sm font-bold hover:bg-zinc-200 active:scale-[0.97] transition-all disabled:opacity-40"
                        >
                            {isResubscribing ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Keep My Subscription'}
                        </button>
                    )}

                    {/* Update card button (for Archangel subscribers) */}
                    {isArchangel && !isCancelingAtEnd && !showUpdateCard && (
                        <button
                            onClick={handleUpdateCard}
                            className="text-xs text-zinc-500 hover:text-white transition-colors underline underline-offset-2"
                        >
                            Update payment method
                        </button>
                    )}

                    {/* Inline update card form */}
                    {showUpdateCard && setupClientSecret && (
                        <div className="mt-4 bg-zinc-950 border border-zinc-800 rounded-xl p-5">
                            <p className="text-xs text-zinc-500 uppercase tracking-widest font-bold mb-4">Update Payment Method</p>
                            <Elements
                                stripe={stripePromise}
                                options={{ clientSecret: setupClientSecret, appearance: stripeAppearance }}
                            >
                                <UpdateCardForm
                                    onSuccess={() => { setShowUpdateCard(false); setSetupClientSecret(null); }}
                                    onCancel={() => { setShowUpdateCard(false); setSetupClientSecret(null); }}
                                />
                            </Elements>
                        </div>
                    )}

                    {cancelStatus && (
                        <div className="flex items-start gap-2.5 bg-emerald-500/10 border border-emerald-500/20 px-4 py-3 rounded-xl mt-2">
                            <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                            <p className="text-sm text-emerald-400">{cancelStatus}</p>
                        </div>
                    )}

                    {!cancelStatus && !isCancelingAtEnd && (
                        <div className="pt-4 border-t border-zinc-800">
                            {!showConfirm ? (
                                <button
                                    onClick={() => setShowConfirm(true)}
                                    className="py-2 px-4 rounded-xl border border-red-900/50 text-xs font-semibold text-red-500/80 hover:bg-red-950/30 transition-all"
                                >
                                    Cancel Plan
                                </button>
                            ) : (
                                <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 space-y-3">
                                    <p className="text-sm text-zinc-300 font-medium">
                                        {isArchangel
                                            ? 'Cancel your subscription? You\'ll keep access until the end of your current billing period.'
                                            : 'Cancel your plan?'}
                                    </p>
                                    <div className="flex gap-3">
                                        <button
                                            onClick={() => setShowConfirm(false)}
                                            className="flex-1 py-2.5 px-4 rounded-xl border border-zinc-700 text-sm font-semibold text-zinc-400 hover:text-white transition-all"
                                        >
                                            Keep Plan
                                        </button>
                                        <button
                                            onClick={handleTerminate}
                                            disabled={isCanceling}
                                            className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-red-900/50 bg-red-950/30 text-sm font-semibold text-red-500/80 hover:bg-red-950/50 transition-all disabled:opacity-40"
                                        >
                                            {isCanceling ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Yes, Cancel'}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* ── REFUND POLICY ── */}
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5 flex items-start gap-3">
                <Shield className="w-5 h-5 text-zinc-500 shrink-0 mt-0.5" />
            <div>
                    <p className="text-sm font-semibold text-zinc-300 mb-1">Satisfaction Guarantee</p>
                    <p className="text-xs text-zinc-500 leading-relaxed">
                        Not satisfied with a session? Refund it instantly — no forms, no emails, one click.
                        Refunds are available within 7 days of purchase.
                    </p>
                </div>
            </div>

            {/* ── PAYMENT HISTORY (from Stripe) ── */}
            <div>
                <h2 className="text-xs text-zinc-500 uppercase tracking-widest font-bold mb-4 flex items-center gap-2">
                    <CreditCard className="w-3.5 h-3.5" />
                    Payment History
                </h2>
                {billingLoading ? (
                    <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 flex items-center justify-center">
                        <Loader2 className="w-5 h-5 animate-spin text-zinc-600" />
                    </div>
                ) : billingHistory.length === 0 ? (
                    <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 text-center">
                        <p className="text-sm text-zinc-500">No payments yet.</p>
                    </div>
                ) : (
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                        {billingHistory.map((record, i) => {
                            const isRefunded = record.status === 'refunded';
                            const isRefundable = !isRefunded && canRefundRecord(record);
                            const isRefundingThis = refundingId === record.id;
                            const resultForThis = refundResult?.id === record.id ? refundResult : null;

                            return (
                                <div
                                    key={record.id}
                                    className={`px-5 py-3.5 ${i < billingHistory.length - 1 ? 'border-b border-zinc-800/50' : ''}`}
                                >
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className={`text-sm font-medium ${isRefunded ? 'text-zinc-600 line-through' : 'text-zinc-200'}`}>
                                                {record.description}
                                                {isRefunded && <span className="ml-2 text-[10px] uppercase tracking-wider text-red-500/70 font-bold no-underline">Refunded</span>}
                                            </p>
                                            <p className="text-xs text-zinc-400">
                                                {new Date(record.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <span className={`text-sm font-bold ${isRefunded ? 'text-zinc-600' : 'text-white'}`}>
                                                ${(record.amount / 100).toFixed(2)}
                                            </span>
                                            {isRefundable && !resultForThis && (
                                                <button
                                                    onClick={() => handleRefund(record.id)}
                                                    disabled={isRefundingThis}
                                                    className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-zinc-500 hover:text-white border border-zinc-800 hover:border-zinc-600 px-2.5 py-1.5 rounded-lg transition-all disabled:opacity-40"
                                                >
                                                    {isRefundingThis ? (
                                                        <Loader2 className="w-3 h-3 animate-spin" />
                                                    ) : (
                                                        <>
                                                            <RotateCcw className="w-3 h-3" />
                                                            Refund
                                                        </>
                                                    )}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    {resultForThis && (
                                        <div className={`mt-2 text-xs px-3 py-2 rounded-lg ${
                                            resultForThis.success
                                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                                : 'bg-red-500/10 text-red-400 border border-red-500/20'
                                        }`}>
                                            {resultForThis.message}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Session Purchase Modal */}
            <SessionPurchaseModal
                isOpen={isPurchaseOpen}
                onClose={() => setIsPurchaseOpen(false)}
                onPurchased={() => setIsPurchaseOpen(false)}
            />
        </div>
    );
}

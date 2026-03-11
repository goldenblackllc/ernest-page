"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth/AuthContext";
import { subscribeToCharacterProfile } from "@/lib/firebase/character";
import { CharacterProfile } from "@/types/character";
import { Loader2, CheckCircle } from "lucide-react";

export function SubscriptionView() {
    const { user } = useAuth();
    const [profile, setProfile] = useState<CharacterProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [isCanceling, setIsCanceling] = useState(false);
    const [cancelStatus, setCancelStatus] = useState<string | null>(null);
    const [showConfirm, setShowConfirm] = useState(false);

    useEffect(() => {
        if (!user) return;
        const unsub = subscribeToCharacterProfile(user.uid, (data) => {
            setProfile(data);
            setLoading(false);
        });
        return () => unsub();
    }, [user]);

    const sub = profile?.subscription;
    const isActive = sub?.status === 'active';
    const isCanceled = sub?.status === 'canceled';
    const currentPlan = sub?.plan;
    const expiresAt = sub?.subscribedUntil ? new Date(sub.subscribedUntil) : null;
    const subscribedAt = sub?.subscribedAt ? new Date(sub.subscribedAt) : null;
    const daysSince = subscribedAt
        ? Math.floor((Date.now() - subscribedAt.getTime()) / (1000 * 60 * 60 * 24))
        : 999;
    const withinGrace = daysSince <= 7;

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
            setCancelStatus(data.refunded
                ? 'Access terminated. Your payment has been returned.'
                : 'Access terminated. Your enrollment continues until the end of your billing cycle.'
            );
        } catch (err: any) {
            setCancelStatus(err.message || 'Something went wrong.');
        } finally {
            setIsCanceling(false);
        }
    };

    if (loading) {
        return <div className="h-64 w-full animate-pulse bg-zinc-900/50 rounded-xl" />;
    }

    const planLabel = currentPlan === 'long_game' ? 'The Long Game' : 'The Proving Ground';
    const planPrice = currentPlan === 'long_game' ? '$1,200/yr' : '$120/mo';

    return (
        <div className="space-y-10 py-6">

            {/* ── PAGE HEADER ── */}
            <div>
                <h1 className="text-2xl font-bold text-white tracking-tight">
                    Access & Enrollment
                </h1>
                <p className="text-sm text-zinc-500 mt-1">
                    View your current access and enrollment status.
                </p>
            </div>

            {/* ── CURRENT STATUS ── */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-3">
                {!sub || sub.status === 'expired' ? (
                    <div>
                        <p className="text-xs text-zinc-500 uppercase tracking-widest font-bold mb-1">
                            Status
                        </p>
                        <p className="text-sm text-zinc-400">
                            Not currently enrolled. Choose your commitment below.
                        </p>
                    </div>
                ) : isCanceled ? (
                    <div className="space-y-1">
                        <p className="text-xs text-zinc-500 uppercase tracking-widest font-bold">
                            Status
                        </p>
                        <p className="text-sm text-zinc-400">
                            Canceled — {planLabel}
                        </p>
                        {expiresAt && (
                            <p className="text-sm text-zinc-500">
                                Read-only access until{' '}
                                <span className="text-zinc-300">
                                    {expiresAt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                                </span>
                            </p>
                        )}
                    </div>
                ) : (
                    <div className="space-y-1">
                        <p className="text-xs text-zinc-500 uppercase tracking-widest font-bold">
                            Active Plan
                        </p>
                        <p className="text-lg text-white font-semibold">
                            {planLabel}{' '}
                            <span className="text-zinc-400 font-normal text-sm">({planPrice})</span>
                        </p>
                        {expiresAt && (
                            <p className="text-sm text-zinc-500">
                                Renews on{' '}
                                <span className="text-zinc-300">
                                    {expiresAt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                                </span>
                            </p>
                        )}
                    </div>
                )}

                {cancelStatus && (
                    <div className="flex items-start gap-2.5 bg-emerald-500/10 border border-emerald-500/20 px-4 py-3 rounded-xl mt-2">
                        <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        <p className="text-sm text-emerald-400">{cancelStatus}</p>
                    </div>
                )}
            </div>

            {/* ── TIER SELECTORS ── */}
            <div>
                <h2 className="text-xs text-zinc-500 uppercase tracking-widest font-bold mb-4">
                    Available Plans
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

                    {/* The Proving Ground */}
                    <div className={`
                        relative bg-zinc-900/50 border rounded-xl p-6 space-y-4 transition-all
                        ${currentPlan === 'proving_ground' && isActive
                            ? 'border-zinc-600 ring-1 ring-zinc-600'
                            : 'border-zinc-800 hover:border-zinc-700'
                        }
                    `}>
                        {currentPlan === 'proving_ground' && isActive && (
                            <span className="absolute top-4 right-4 text-[10px] font-bold uppercase tracking-widest text-zinc-400 bg-zinc-800 px-2.5 py-1 rounded-full">
                                Current
                            </span>
                        )}
                        <div>
                            <h3 className="text-lg font-bold text-white">The Proving Ground</h3>
                            <p className="text-2xl font-bold text-white mt-1">
                                $120
                            </p>
                        </div>
                        <p className="text-sm text-zinc-500 leading-relaxed">
                            30 days to prove you mean it. No extensions.
                        </p>
                        {currentPlan !== 'proving_ground' && isActive && (
                            <button
                                className="w-full py-3 px-4 rounded-xl border border-zinc-700 text-sm font-semibold text-zinc-300 hover:bg-zinc-800 hover:text-white transition-all"
                            >
                                Switch to Monthly
                            </button>
                        )}
                        {(!sub || sub.status === 'expired' || isCanceled) && (
                            <button
                                className="w-full py-3 px-4 rounded-xl bg-white text-black text-sm font-semibold hover:bg-zinc-200 transition-all"
                            >
                                Enroll
                            </button>
                        )}
                    </div>

                    {/* The Long Game */}
                    <div className={`
                        relative bg-zinc-900/50 border rounded-xl p-6 space-y-4 transition-all
                        ${currentPlan === 'long_game' && isActive
                            ? 'border-zinc-600 ring-1 ring-zinc-600'
                            : 'border-zinc-700 hover:border-zinc-600'
                        }
                    `}>
                        {currentPlan === 'long_game' && isActive && (
                            <span className="absolute top-4 right-4 text-[10px] font-bold uppercase tracking-widest text-zinc-400 bg-zinc-800 px-2.5 py-1 rounded-full">
                                Current
                            </span>
                        )}
                        <div>
                            <h3 className="text-lg font-bold text-white">The Long Game</h3>
                            <p className="text-2xl font-bold text-white mt-1">
                                $1,200
                            </p>
                        </div>
                        <p className="text-sm text-zinc-500 leading-relaxed">
                            You already proved it. Now build the compound effect.
                        </p>
                        {currentPlan === 'proving_ground' && isActive && (
                            <button
                                className="w-full py-3 px-4 rounded-xl bg-white text-black text-sm font-semibold hover:bg-zinc-200 transition-all"
                            >
                                Upgrade to Annual
                            </button>
                        )}
                        {currentPlan === 'long_game' && isActive && null}
                        {(!sub || sub.status === 'expired' || isCanceled) && (
                            <button
                                className="w-full py-3 px-4 rounded-xl bg-white text-black text-sm font-semibold hover:bg-zinc-200 transition-all"
                            >
                                Enroll
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* ── CANCELLATION ZONE ── */}
            {isActive && !cancelStatus && (
                <div className="pt-6 mt-4 border-t border-zinc-800">
                    <h2 className="text-sm font-semibold text-zinc-300 mb-2">
                        Revoke Access
                    </h2>
                    <p className="text-sm text-zinc-500 leading-relaxed mb-6 max-w-lg">
                        Execution requires commitment. Revoking access will lock your AI Counsel and your feed at the end of your current billing cycle. Your historical ledger will remain securely encrypted but inaccessible until you return. We do not offer pauses.
                    </p>

                    {!showConfirm ? (
                        <button
                            onClick={() => setShowConfirm(true)}
                            className="py-3 px-6 rounded-xl border border-red-900/50 text-sm font-semibold text-red-500/80 hover:bg-red-950/30 transition-all"
                        >
                            Terminate Access
                        </button>
                    ) : (
                        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4 max-w-md">
                            <p className="text-sm text-zinc-300 font-medium">
                                Revoke access at the end of your billing cycle?
                            </p>
                            {expiresAt && (
                                <p className="text-xs text-zinc-500">
                                    {withinGrace
                                        ? 'Your payment will be returned and access will end immediately.'
                                        : `Access continues until ${expiresAt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.`
                                    }
                                </p>
                            )}
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setShowConfirm(false)}
                                    className="flex-1 py-3 px-4 rounded-xl border border-zinc-700 text-sm font-semibold text-zinc-400 hover:text-white hover:border-zinc-500 transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleTerminate}
                                    disabled={isCanceling}
                                    className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl border border-red-900/50 bg-red-950/30 text-sm font-semibold text-red-500/80 hover:bg-red-950/50 transition-all disabled:opacity-40"
                                >
                                    {isCanceling ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Yes'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

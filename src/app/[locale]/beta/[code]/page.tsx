'use client';

import { useState, use } from 'react';
import { useAuth } from '@/lib/auth/AuthContext';
import { Shield, Check, ArrowRight, Loader2 } from 'lucide-react';
import OTPLogin from '@/components/auth/OTPLogin';

export default function BetaRedeemPage({ params }: { params: Promise<{ code: string }> }) {
    const { code } = use(params);
    const { user, loading: authLoading } = useAuth();
    const [redeeming, setRedeeming] = useState(false);
    const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

    const handleRedeem = async () => {
        if (!user) return;
        setRedeeming(true);
        try {
            const token = await user.getIdToken();
            const res = await fetch('/api/beta/redeem', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ code }),
            });
            const data = await res.json();
            if (res.ok) {
                setResult({ success: true, message: data.message });
            } else {
                setResult({ success: false, message: data.error });
            }
        } catch {
            setResult({ success: false, message: 'Something went wrong.' });
        } finally {
            setRedeeming(false);
        }
    };

    if (authLoading) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-zinc-700 border-t-white rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-black text-white flex items-center justify-center px-4 pt-safe">
            <div className="max-w-sm w-full">

                {/* Header */}
                <div className="text-center mb-8">
                    <div className="w-20 h-20 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto mb-6">
                        <Shield className="w-10 h-10 text-white" />
                    </div>
                    <h1 className="text-2xl font-bold tracking-tight mb-2">
                        You&apos;ve been invited.
                    </h1>
                    <p className="text-sm text-zinc-500 leading-relaxed">
                        30 days of unlimited access. No credit card.
                        No catch. Just use it.
                    </p>
                </div>

                {/* Not logged in — show login */}
                {!user && (
                    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
                        <p className="text-xs text-zinc-500 uppercase tracking-widest font-bold text-center mb-4">
                            Log in to claim your access
                        </p>
                        <OTPLogin />
                    </div>
                )}

                {/* Logged in — show redeem button */}
                {user && !result && (
                    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center">
                        <div className="space-y-4 mb-6 text-left">
                            <div className="flex items-start gap-3">
                                <div className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center shrink-0 mt-0.5">
                                    <span className="text-[10px] font-bold text-zinc-400">1</span>
                                </div>
                                <p className="text-sm text-zinc-400">
                                    <span className="text-white font-semibold">30 days</span> of unlimited sessions
                                </p>
                            </div>
                            <div className="flex items-start gap-3">
                                <div className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center shrink-0 mt-0.5">
                                    <span className="text-[10px] font-bold text-zinc-400">2</span>
                                </div>
                                <p className="text-sm text-zinc-400">
                                    Talk to your <span className="text-white font-semibold">Ideal Self</span> — the AI builds your character from the conversation
                                </p>
                            </div>
                            <div className="flex items-start gap-3">
                                <div className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center shrink-0 mt-0.5">
                                    <span className="text-[10px] font-bold text-zinc-400">3</span>
                                </div>
                                <p className="text-sm text-zinc-400">
                                    Your conversations become <span className="text-white font-semibold">anonymous letters</span> on the public feed — names changed, details scrubbed. You can set any session to private.
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={handleRedeem}
                            disabled={redeeming}
                            className="w-full rounded-full bg-white text-black py-3.5 text-sm font-bold tracking-wide hover:bg-zinc-200 active:scale-[0.98] transition-all duration-150 flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            {redeeming ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <>
                                    <Shield className="w-4 h-4" />
                                    Claim Your Access
                                </>
                            )}
                        </button>
                        <p className="text-[10px] text-zinc-600 mt-3 leading-relaxed">
                            Everything you share is rewritten anonymously. No real names, no locations, no identifying details ever appear publicly.
                        </p>
                    </div>
                )}

                {/* Result */}
                {result && (
                    <div className={`rounded-2xl border p-8 text-center ${
                        result.success
                            ? 'bg-zinc-900 border-emerald-500/20'
                            : 'bg-zinc-900 border-red-500/20'
                    }`}>
                        {result.success ? (
                            <>
                                <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-4">
                                    <Check className="w-6 h-6 text-emerald-400" />
                                </div>
                                <h2 className="text-lg font-bold mb-2">You&apos;re in.</h2>
                                <p className="text-sm text-zinc-500 mb-6">{result.message}</p>
                                <a
                                    href="/"
                                    className="inline-flex items-center gap-2 rounded-full bg-white text-black py-3 px-6 text-sm font-bold hover:bg-zinc-200 transition-all"
                                >
                                    Start Your First Session
                                    <ArrowRight className="w-4 h-4" />
                                </a>
                            </>
                        ) : (
                            <>
                                <h2 className="text-lg font-bold text-red-400 mb-2">Couldn&apos;t Redeem</h2>
                                <p className="text-sm text-zinc-500">{result.message}</p>
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

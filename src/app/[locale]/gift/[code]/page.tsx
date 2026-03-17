'use client';

import { useState, useEffect, use } from 'react';
import { useAuth } from '@/lib/auth/AuthContext';
import { Gift, Check, ArrowRight, Loader2 } from 'lucide-react';
import OTPLogin from '@/components/auth/OTPLogin';

export default function GiftRedeemPage({ params }: { params: Promise<{ code: string }> }) {
    const { code } = use(params);
    const { user, loading: authLoading } = useAuth();
    const [redeeming, setRedeeming] = useState(false);
    const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

    const handleRedeem = async () => {
        if (!user) return;
        setRedeeming(true);
        try {
            const token = await user.getIdToken();
            const res = await fetch('/api/gift/redeem', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ giftCode: code }),
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

                {/* Gift icon */}
                <div className="text-center mb-8">
                    <div className="w-20 h-20 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto mb-6">
                        <Gift className="w-10 h-10 text-white" />
                    </div>
                    <h1 className="text-2xl font-bold tracking-tight mb-2">
                        Someone gifted you a session.
                    </h1>
                    <p className="text-sm text-zinc-500 leading-relaxed">
                        A real conversation. Not a chatbot, not therapy.
                        Just someone in your corner for an hour.
                    </p>
                </div>

                {/* Not logged in — show login */}
                {!user && (
                    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
                        <p className="text-xs text-zinc-500 uppercase tracking-widest font-bold text-center mb-4">
                            Log in to redeem
                        </p>
                        <OTPLogin />
                    </div>
                )}

                {/* Logged in — show redeem button */}
                {user && !result && (
                    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center">
                        <p className="text-sm text-zinc-400 mb-6">
                            Tap below to add this session to your account.
                        </p>
                        <button
                            onClick={handleRedeem}
                            disabled={redeeming}
                            className="w-full rounded-full bg-white text-black py-3.5 text-sm font-bold tracking-wide hover:bg-zinc-200 active:scale-[0.98] transition-all duration-150 flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            {redeeming ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <>
                                    <Gift className="w-4 h-4" />
                                    Redeem Session
                                </>
                            )}
                        </button>
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
                                <h2 className="text-lg font-bold mb-2">Session Added</h2>
                                <p className="text-sm text-zinc-500 mb-6">{result.message}</p>
                                <a
                                    href="/"
                                    className="inline-flex items-center gap-2 rounded-full bg-white text-black py-3 px-6 text-sm font-bold hover:bg-zinc-200 transition-all"
                                >
                                    Start Your Session
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

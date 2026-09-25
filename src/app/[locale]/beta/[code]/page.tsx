'use client';

import { useState, use } from 'react';
import { useAuth } from '@/lib/auth/AuthContext';
import { Shield, Check, ArrowRight, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import OTPLogin from '@/components/auth/OTPLogin';

export default function BetaRedeemPage({ params }: { params: Promise<{ code: string }> }) {
    const { code } = use(params);
    const { user, loading: authLoading } = useAuth();
    const [redeeming, setRedeeming] = useState(false);
    const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
    const t = useTranslations("beta");

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
            setResult({ success: false, message: t('errorDefault') });
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
                        {t('title')}
                    </h1>
                    <p className="text-sm text-zinc-500 leading-relaxed">
                        {t('subtitle')}
                    </p>
                </div>

                {/* Not logged in — show login */}
                {!user && (
                    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
                        <p className="text-xs text-zinc-500 uppercase tracking-widest font-bold text-center mb-4">
                            {t('loginPrompt')}
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
                                    <span className="text-white font-semibold">{t('point1Amount')}</span>{t('point1Text')}
                                </p>
                            </div>
                            <div className="flex items-start gap-3">
                                <div className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center shrink-0 mt-0.5">
                                    <span className="text-[10px] font-bold text-zinc-400">2</span>
                                </div>
                                <p className="text-sm text-zinc-400">
                                    {t('point2Text1')}<span className="text-white font-semibold">{t('point2Highlight')}</span>{t('point2Text2')}
                                </p>
                            </div>
                            <div className="flex items-start gap-3">
                                <div className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center shrink-0 mt-0.5">
                                    <span className="text-[10px] font-bold text-zinc-400">3</span>
                                </div>
                                <p className="text-sm text-zinc-400">
                                    {t('point3Text1')}<span className="text-white font-semibold">{t('point3Highlight')}</span>{t('point3Text2')}
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
                                    {t('btnClaim')}
                                </>
                            )}
                        </button>
                        <p className="text-[10px] text-zinc-600 mt-3 leading-relaxed">
                            {t('privacyNote')}
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
                                <h2 className="text-lg font-bold mb-2">{t('successTitle')}</h2>
                                <p className="text-sm text-zinc-500 mb-6">{result.message}</p>
                                <a
                                    href="/"
                                    className="inline-flex items-center gap-2 rounded-full bg-white text-black py-3 px-6 text-sm font-bold hover:bg-zinc-200 transition-all"
                                >
                                    {t('btnStart')}
                                    <ArrowRight className="w-4 h-4" />
                                </a>
                            </>
                        ) : (
                            <>
                                <h2 className="text-lg font-bold text-red-400 mb-2">{t('errorTitle')}</h2>
                                <p className="text-sm text-zinc-500">{result.message}</p>
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

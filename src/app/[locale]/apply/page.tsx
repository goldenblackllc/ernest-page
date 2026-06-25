'use client';

import { useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth/AuthContext';
import { Check, ArrowRight, Loader2, DollarSign } from 'lucide-react';
import OTPLogin from '@/components/auth/OTPLogin';
import { useRouter } from 'next/navigation';

type PaymentMethod = 'venmo' | 'cashapp';
type PageStep = 'form' | 'login' | 'activating' | 'done';

export default function ApplyPage() {
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();

    const [step, setStep] = useState<PageStep>('form');
    const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('venmo');
    const [paymentHandle, setPaymentHandle] = useState('');
    const [error, setError] = useState<string | null>(null);

    // After OTP login succeeds, auto-activate beta access
    const handlePostLogin = useCallback(async () => {
        setStep('activating');
        setError(null);
        try {
            // Small delay to ensure Firebase auth state propagates
            await new Promise(r => setTimeout(r, 500));

            // Get fresh token from the auth state
            const { auth } = await import('@/lib/firebase/config');
            const currentUser = auth.currentUser;
            if (!currentUser) throw new Error('Not signed in');

            const token = await currentUser.getIdToken();
            const res = await fetch('/api/beta/apply', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    paymentMethod,
                    paymentHandle,
                    source: 'tiktok',
                }),
            });

            const data = await res.json();
            if (!res.ok) {
                // If they already have access, still let them through
                if (data.error?.includes('already have beta access')) {
                    setStep('done');
                    return;
                }
                throw new Error(data.error || 'Failed to activate');
            }

            setStep('done');
        } catch (err: any) {
            console.error('Beta activation failed:', err);
            setError(err.message || 'Something went wrong. Try refreshing.');
            setStep('form');
        }
    }, [paymentMethod, paymentHandle]);

    // If already logged in when they arrive, check if they already have access
    const handleAlreadyLoggedIn = useCallback(async () => {
        if (!user) return;
        setStep('activating');
        setError(null);
        try {
            const token = await user.getIdToken();
            const res = await fetch('/api/beta/apply', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    paymentMethod,
                    paymentHandle,
                    source: 'tiktok',
                }),
            });

            const data = await res.json();
            if (!res.ok) {
                if (data.error?.includes('already have beta access')) {
                    setStep('done');
                    return;
                }
                throw new Error(data.error || 'Failed to activate');
            }
            setStep('done');
        } catch (err: any) {
            console.error('Beta activation failed:', err);
            setError(err.message || 'Something went wrong.');
            setStep('form');
        }
    }, [user, paymentMethod, paymentHandle]);

    const handleFormSubmit = () => {
        if (!paymentHandle.trim()) {
            setError('Enter your Venmo or Cash App handle so we can pay you.');
            return;
        }
        setError(null);

        if (user) {
            // Already logged in — skip OTP, go straight to activation
            handleAlreadyLoggedIn();
        } else {
            setStep('login');
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
        <div className="min-h-screen bg-black text-white flex items-center justify-center px-4 py-12 pt-safe">
            <div className="max-w-sm w-full">

                {/* ── STEP: Form ── */}
                {step === 'form' && (
                    <>
                        {/* Header */}
                        <div className="text-center mb-8">
                            <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto mb-5">
                                <DollarSign className="w-8 h-8 text-emerald-400" />
                            </div>
                            <h1 className="text-2xl font-bold tracking-tight mb-2">
                                Paid Test — $20
                            </h1>
                            <p className="text-sm text-zinc-500 leading-relaxed">
                                10 spots. Takes about 30 minutes.
                            </p>
                        </div>

                        {/* Steps explanation */}
                        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 mb-6">
                            <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold mb-4">
                                Here&apos;s how it works
                            </p>
                            <div className="space-y-4">
                                <div className="flex items-start gap-3">
                                    <div className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center shrink-0 mt-0.5">
                                        <span className="text-[10px] font-bold text-zinc-400">1</span>
                                    </div>
                                    <p className="text-sm text-zinc-400">
                                        Tell us where to send the <span className="text-white font-semibold">$20</span> — Venmo or Cash App
                                    </p>
                                </div>
                                <div className="flex items-start gap-3">
                                    <div className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center shrink-0 mt-0.5">
                                        <span className="text-[10px] font-bold text-zinc-400">2</span>
                                    </div>
                                    <p className="text-sm text-zinc-400">
                                        <span className="text-white font-semibold">Sign in</span> with your phone number and complete the setup process (~5 min)
                                    </p>
                                </div>
                                <div className="flex items-start gap-3">
                                    <div className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center shrink-0 mt-0.5">
                                        <span className="text-[10px] font-bold text-zinc-400">3</span>
                                    </div>
                                    <p className="text-sm text-zinc-400">
                                        <span className="text-white font-semibold">Start and finish a session</span> — the whole thing, even when it gets uncomfortable. Be honest. If you disagree with something, say so out loud. Don&apos;t quit.
                                    </p>
                                </div>
                                <div className="flex items-start gap-3">
                                    <div className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center shrink-0 mt-0.5">
                                        <span className="text-[10px] font-bold text-zinc-400">4</span>
                                    </div>
                                    <p className="text-sm text-zinc-400">
                                        When your session becomes a <span className="text-white font-semibold">public post</span>, we send you $20. Everything is anonymous — no real names ever appear.
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Payment form */}
                        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
                            <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold mb-4">
                                Where should we send the $20?
                            </p>

                            {/* Payment method toggle */}
                            <div className="flex gap-2 mb-4">
                                <button
                                    onClick={() => setPaymentMethod('venmo')}
                                    className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                                        paymentMethod === 'venmo'
                                            ? 'bg-white text-black'
                                            : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300'
                                    }`}
                                >
                                    Venmo
                                </button>
                                <button
                                    onClick={() => setPaymentMethod('cashapp')}
                                    className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                                        paymentMethod === 'cashapp'
                                            ? 'bg-white text-black'
                                            : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300'
                                    }`}
                                >
                                    Cash App
                                </button>
                            </div>

                            {/* Handle input */}
                            <input
                                type="text"
                                placeholder={paymentMethod === 'venmo' ? '@username' : '$cashtag'}
                                value={paymentHandle}
                                onChange={(e) => setPaymentHandle(e.target.value)}
                                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white placeholder:text-zinc-600 outline-none focus:border-zinc-500 transition-colors text-sm"
                            />

                            {error && (
                                <p className="text-red-400 text-xs mt-3">{error}</p>
                            )}

                            <button
                                onClick={handleFormSubmit}
                                className="w-full mt-4 rounded-full bg-white text-black py-3.5 text-sm font-bold tracking-wide hover:bg-zinc-200 active:scale-[0.98] transition-all duration-150 flex items-center justify-center gap-2"
                            >
                                Continue
                                <ArrowRight className="w-4 h-4" />
                            </button>
                        </div>

                        <p className="text-[10px] text-zinc-600 text-center mt-4 leading-relaxed px-4">
                            By continuing you agree to our terms of service.
                            Your session content is anonymized before it appears publicly.
                        </p>
                    </>
                )}

                {/* ── STEP: Login (OTP) ── */}
                {step === 'login' && (
                    <div className="space-y-6">
                        <div className="text-center mb-4">
                            <h1 className="text-xl font-bold tracking-tight mb-2">
                                Sign in to get started
                            </h1>
                            <p className="text-sm text-zinc-500">
                                We&apos;ll text you a code. Takes 10 seconds.
                            </p>
                        </div>

                        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 [&_h1]:text-white [&_input]:bg-zinc-800 [&_input]:border-zinc-700 [&_input]:text-white [&_input]:placeholder:text-zinc-600 [&_button]:bg-white [&_button]:text-black [&_button]:rounded-lg [&_button]:hover:bg-zinc-200 [&_p]:text-zinc-600 [&_div.text-red-500]:bg-red-500/10 [&_div.text-red-500]:border-red-500/20 [&_div.text-red-500]:text-red-400 [&_input]:rounded-lg">
                            <OTPLogin onSuccess={handlePostLogin} />
                        </div>

                        <button
                            onClick={() => setStep('form')}
                            className="text-zinc-600 text-xs underline w-full text-center"
                        >
                            ← Back
                        </button>
                    </div>
                )}

                {/* ── STEP: Activating ── */}
                {step === 'activating' && (
                    <div className="text-center py-12">
                        <Loader2 className="w-10 h-10 text-white animate-spin mx-auto mb-4" />
                        <h2 className="text-lg font-bold mb-2">Setting up your account...</h2>
                        <p className="text-sm text-zinc-500">This takes a few seconds.</p>
                    </div>
                )}

                {/* ── STEP: Done ── */}
                {step === 'done' && (
                    <div className="text-center">
                        <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-5">
                            <Check className="w-8 h-8 text-emerald-400" />
                        </div>
                        <h2 className="text-2xl font-bold mb-2">You&apos;re in.</h2>
                        <p className="text-sm text-zinc-500 mb-2">30 days of unlimited access.</p>
                        <p className="text-sm text-zinc-400 mb-8 leading-relaxed">
                            Complete the setup, then start a session.<br />
                            Be honest. Say when you don&apos;t like what you hear.<br />
                            That&apos;s where the good stuff happens.
                        </p>
                        <a
                            href="/"
                            className="inline-flex items-center gap-2 rounded-full bg-white text-black py-3.5 px-8 text-sm font-bold hover:bg-zinc-200 transition-all active:scale-[0.98]"
                        >
                            Start Setup
                            <ArrowRight className="w-4 h-4" />
                        </a>
                    </div>
                )}
            </div>
        </div>
    );
}

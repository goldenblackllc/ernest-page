'use client';

import { useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth/AuthContext';
import { Check, ArrowRight, Loader2 } from 'lucide-react';
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
            await new Promise(r => setTimeout(r, 500));

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
            setError('Enter your handle so we know where to send $20.');
            return;
        }
        setError(null);

        if (user) {
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

                {/* ── Main form: pitch + payment on one screen ── */}
                {step === 'form' && (
                    <>
                        <div className="text-center mb-8">
                            <h1 className="text-3xl font-black tracking-tight mb-4 leading-tight">
                                Is something bothering you?
                                <br />
                                <span className="text-zinc-500">You&apos;re lucky.</span>
                            </h1>
                            <p className="text-[15px] text-zinc-400 leading-relaxed">
                                There&apos;s nothing wrong with you. Feelings are your superpower. 
                                The worse you feel, the luckier you are. You&apos;re special. 
                                Discover what your feelings are telling you.
                            </p>
                        </div>

                        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 mb-6">
                            <p className="text-sm text-zinc-300 leading-relaxed mb-4">
                                We&apos;re new and we need your perspective. 
                                Not a survey. Not a raffle. You finish, you get $20.
                            </p>

                            {/* Payment method toggle */}
                            <div className="flex gap-2 mb-3">
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
                        </div>

                        <button
                            onClick={handleFormSubmit}
                            className="w-full rounded-full bg-white text-black py-3.5 text-sm font-bold tracking-wide hover:bg-zinc-200 active:scale-[0.98] transition-all duration-150 flex items-center justify-center gap-2"
                        >
                            I&apos;m in
                            <ArrowRight className="w-4 h-4" />
                        </button>

                        <p className="text-[10px] text-zinc-600 text-center mt-4 leading-relaxed">
                            Everything is anonymous. No real names ever appear.
                        </p>
                    </>
                )}

                {/* ── Login (OTP) ── */}
                {step === 'login' && (
                    <div className="space-y-6">
                        <div className="text-center mb-4">
                            <h1 className="text-xl font-bold tracking-tight mb-2">
                                Enter your phone number
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

                {/* ── Activating ── */}
                {step === 'activating' && (
                    <div className="text-center py-12">
                        <Loader2 className="w-10 h-10 text-white animate-spin mx-auto mb-4" />
                        <h2 className="text-lg font-bold mb-2">Setting up your account...</h2>
                        <p className="text-sm text-zinc-500">This takes a few seconds.</p>
                    </div>
                )}

                {/* ── Done ── */}
                {step === 'done' && (
                    <div className="text-center">
                        <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-5">
                            <Check className="w-8 h-8 text-emerald-400" />
                        </div>
                        <h2 className="text-2xl font-bold mb-2">You&apos;re in.</h2>
                        <p className="text-sm text-zinc-400 mb-8 leading-relaxed">
                            Be honest. Say when you disagree.<br />
                            That&apos;s where it gets interesting.
                        </p>
                        <a
                            href="/"
                            className="inline-flex items-center gap-2 rounded-full bg-white text-black py-3.5 px-8 text-sm font-bold hover:bg-zinc-200 transition-all active:scale-[0.98]"
                        >
                            Let&apos;s go
                            <ArrowRight className="w-4 h-4" />
                        </a>
                    </div>
                )}
            </div>
        </div>
    );
}

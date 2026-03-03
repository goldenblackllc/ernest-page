'use client';

import { useState, useRef, useCallback } from 'react';
import { RecaptchaVerifier, signInWithPhoneNumber, ConfirmationResult } from 'firebase/auth';
import { auth } from '@/lib/firebase/config';
import { useRouter } from 'next/navigation';

export function LandingPage() {
    const [phoneNumber, setPhoneNumber] = useState('');
    const [verificationCode, setVerificationCode] = useState('');
    const [step, setStep] = useState<'WELCOME' | 'INPUT_CODE'>('WELCOME');
    const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const router = useRouter();
    const recaptchaRef = useRef<RecaptchaVerifier | null>(null);

    const getVerifier = useCallback(() => {
        if (recaptchaRef.current) {
            try { recaptchaRef.current.clear(); } catch { /* ignore */ }
            recaptchaRef.current = null;
        }

        recaptchaRef.current = new RecaptchaVerifier(auth, 'landing-recaptcha', {
            size: 'invisible',
        });
        return recaptchaRef.current;
    }, []);

    const handleSendCode = async () => {
        setError(null);
        if (!phoneNumber) {
            setError("Please enter a phone number.");
            return;
        }

        setLoading(true);
        try {
            const verifier = getVerifier();
            const result = await signInWithPhoneNumber(auth, phoneNumber, verifier);
            setConfirmationResult(result);
            setStep('INPUT_CODE');
        } catch (err: any) {
            console.error("Error sending code:", err);
            if (err.code === 'auth/invalid-app-credential') {
                setError("Verification failed. Please try again.");
            } else if (err.code === 'auth/too-many-requests') {
                setError("Too many attempts. Please try again later.");
            } else {
                setError(err.message || "Failed to send code.");
            }

            if (recaptchaRef.current) {
                try { recaptchaRef.current.clear(); } catch { /* ignore */ }
                recaptchaRef.current = null;
            }
        } finally {
            setLoading(false);
        }
    };

    const handleVerifyCode = async () => {
        setError(null);
        if (!verificationCode || !confirmationResult) return;

        setLoading(true);
        try {
            await confirmationResult.confirm(verificationCode);
            router.push('/');
        } catch {
            setError("Invalid code. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <main className="min-h-screen bg-black text-white flex flex-col items-center justify-center px-6">
            {/* Invisible reCAPTCHA container — never visible to user */}
            <div id="landing-recaptcha" />

            <div className="w-full max-w-sm flex flex-col items-center">
                {/* Brand */}
                <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-center mb-3">
                    Earnest Page
                </h1>
                <p className="text-sm text-zinc-500 text-center mb-10 max-w-xs leading-relaxed">
                    Write yourself into who you want to be.
                </p>

                {error && (
                    <div className="w-full text-red-400 text-xs font-medium p-3 bg-red-500/10 border border-red-500/20 rounded-xl mb-4">
                        {error}
                    </div>
                )}

                {step === 'WELCOME' && (
                    <div className="w-full flex flex-col gap-3">
                        <input
                            type="tel"
                            placeholder="+1 555 555 5555"
                            value={phoneNumber}
                            onChange={(e) => setPhoneNumber(e.target.value)}
                            className="w-full bg-zinc-900 border border-zinc-800 px-4 py-3.5 text-base text-white placeholder-zinc-600 focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all"
                        />
                        <button
                            onClick={handleSendCode}
                            disabled={loading}
                            className="w-full bg-white text-black py-3.5 text-sm font-bold tracking-wide hover:bg-zinc-200 transition-colors disabled:opacity-50"
                        >
                            {loading ? 'Sending...' : 'Get Started'}
                        </button>

                        <div className="flex items-center gap-3 my-2">
                            <div className="flex-1 h-px bg-zinc-800" />
                            <span className="text-[10px] text-zinc-600 uppercase tracking-widest">or</span>
                            <div className="flex-1 h-px bg-zinc-800" />
                        </div>

                        <button
                            onClick={() => {
                                const phone = prompt("Enter your phone number (e.g., +15551234567):");
                                if (phone) {
                                    setPhoneNumber(phone);
                                }
                            }}
                            className="w-full border border-zinc-800 py-3.5 text-sm font-bold text-zinc-400 hover:bg-zinc-900 hover:text-white transition-colors"
                        >
                            Sign In
                        </button>

                        <p className="text-[10px] text-zinc-600 text-center mt-4 leading-relaxed">
                            By signing up, you agree to be radically honest with yourself.
                        </p>
                    </div>
                )}

                {step === 'INPUT_CODE' && (
                    <div className="w-full flex flex-col gap-3">
                        <p className="text-xs text-zinc-400 text-center mb-2">
                            Enter the 6-digit code sent to <span className="text-white font-semibold">{phoneNumber}</span>
                        </p>
                        <input
                            type="text"
                            placeholder="000000"
                            value={verificationCode}
                            onChange={(e) => setVerificationCode(e.target.value)}
                            className="w-full bg-zinc-900 border border-zinc-800 px-4 py-3.5 text-lg text-white text-center tracking-[0.5em] placeholder-zinc-700 focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all"
                            maxLength={6}
                            autoFocus
                        />
                        <button
                            onClick={handleVerifyCode}
                            disabled={loading || verificationCode.length < 6}
                            className="w-full bg-white text-black py-3.5 text-sm font-bold tracking-wide hover:bg-zinc-200 transition-colors disabled:opacity-50"
                        >
                            {loading ? 'Verifying...' : 'Verify'}
                        </button>
                        <button
                            onClick={() => {
                                setStep('WELCOME');
                                setVerificationCode('');
                                setError(null);
                            }}
                            className="text-zinc-500 text-xs mt-2 text-center hover:text-white transition-colors"
                        >
                            ← Change number
                        </button>
                    </div>
                )}
            </div>
        </main>
    );
}

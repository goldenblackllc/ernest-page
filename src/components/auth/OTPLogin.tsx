'use client';

import { useState, useRef, useCallback } from 'react';
import { RecaptchaVerifier, signInWithPhoneNumber, ConfirmationResult } from 'firebase/auth';
import { auth } from '@/lib/firebase/config';
import { useRouter } from 'next/navigation';

export default function OTPLogin() {
    const [phoneNumber, setPhoneNumber] = useState('');
    const [verificationCode, setVerificationCode] = useState('');
    const [step, setStep] = useState<'INPUT_PHONE' | 'INPUT_CODE'>('INPUT_PHONE');
    const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const router = useRouter();
    const recaptchaRef = useRef<RecaptchaVerifier | null>(null);

    const getVerifier = useCallback(() => {
        // Clean up any existing verifier first
        if (recaptchaRef.current) {
            try { recaptchaRef.current.clear(); } catch { /* ignore */ }
            recaptchaRef.current = null;
        }

        // Create a fresh invisible verifier each time
        recaptchaRef.current = new RecaptchaVerifier(auth, 'recaptcha-container', {
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
                setError(err.message || "Failed to send code. Please try again.");
            }

            // Clean up the broken verifier
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
        <div className="flex flex-col gap-6 w-full max-w-sm relative">
            {/* Invisible reCAPTCHA container — never visible to user */}
            <div id="recaptcha-container" />

            {error && <div className="text-red-500 text-sm font-medium p-3 bg-red-50 border border-red-200 rounded-md">{error}</div>}

            {step === 'INPUT_PHONE' && (
                <>
                    <h1 className="text-2xl font-bold uppercase tracking-widest text-center">Login</h1>
                    <input
                        type="tel"
                        placeholder="+1 555 555 5555"
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                        className="border-2 border-black p-4 text-lg outline-none placeholder:text-gray-400"
                    />
                    <button
                        onClick={handleSendCode}
                        disabled={loading}
                        className="bg-black text-white p-4 text-lg font-bold uppercase hover:bg-gray-800 transition-colors disabled:opacity-50"
                    >
                        {loading ? 'Sending...' : 'Send Code'}
                    </button>
                    <p className="text-xs text-gray-400 text-center mt-2">
                        Format: Country code + number (e.g., +15551234567)
                    </p>
                </>
            )}

            {step === 'INPUT_CODE' && (
                <>
                    <h1 className="text-2xl font-bold uppercase tracking-widest text-center">Verify</h1>
                    <input
                        type="text"
                        placeholder="123456"
                        value={verificationCode}
                        onChange={(e) => setVerificationCode(e.target.value)}
                        className="border-2 border-black p-4 text-lg outline-none placeholder:text-gray-400 text-center tracking-widest"
                        maxLength={6}
                    />
                    <button
                        onClick={handleVerifyCode}
                        disabled={loading}
                        className="bg-black text-white p-4 text-lg font-bold uppercase hover:bg-gray-800 transition-colors disabled:opacity-50"
                    >
                        {loading ? 'Verifying...' : 'Verify & Login'}
                    </button>
                    <button
                        onClick={() => {
                            setStep('INPUT_PHONE');
                            setVerificationCode('');
                            setError(null);
                        }}
                        className="text-gray-500 text-sm underline mt-2 text-center"
                    >
                        Change Phone Number
                    </button>
                </>
            )}
        </div>
    );
}

'use client';

import { useState, useEffect } from 'react';
import { RecaptchaVerifier, signInWithPhoneNumber, ConfirmationResult } from 'firebase/auth';
import { auth } from '@/lib/firebase/config';
import { useRouter } from 'next/navigation';

declare global {
    interface Window {
        recaptchaVerifier: any;
    }
}

export default function OTPLogin() {
    const [phoneNumber, setPhoneNumber] = useState('');
    const [verificationCode, setVerificationCode] = useState('');
    const [step, setStep] = useState<'INPUT_PHONE' | 'INPUT_CODE'>('INPUT_PHONE');
    const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const router = useRouter();

    useEffect(() => {
        // Initialize RecaptchaVerifier
        if (!window.recaptchaVerifier) {
            window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
                'size': 'invisible',
                'callback': (response: any) => {
                    // reCAPTCHA solved, allow signInWithPhoneNumber.
                },
                'expired-callback': () => {
                    // Response expired. Ask user to solve reCAPTCHA again.
                    // Reset recaptcha?
                }
            });
        }

        return () => {
            if (window.recaptchaVerifier) {
                window.recaptchaVerifier.clear();
                window.recaptchaVerifier = undefined;
            }
        }
    }, []);


    const handleSendCode = async () => {
        setError(null);
        if (!phoneNumber) {
            setError("Please enter a phone number.");
            return;
        }

        try {
            const appVerifier = window.recaptchaVerifier;
            const result = await signInWithPhoneNumber(auth, phoneNumber, appVerifier as any);
            setConfirmationResult(result);
            setStep('INPUT_CODE');
        } catch (err: any) {
            console.error("Error sending code:", err);
            setError(err.message || "Failed to send code. Please try again.");
            if (window.recaptchaVerifier) {
                window.recaptchaVerifier.render().then((widgetId: any) => {
                    (window as any).recaptchaVerifier.reset(widgetId);
                });
            }
        }
    };

    const handleVerifyCode = async () => {
        setError(null);
        if (!verificationCode || !confirmationResult) return;

        try {
            await confirmationResult.confirm(verificationCode);
            router.push('/');
        } catch (err: any) {
            console.error("Error verifying code:", err);
            setError("Invalid code. Please try again.");
        }
    };

    return (
        <div className="flex flex-col gap-6 w-full max-w-sm">
            <div id="recaptcha-container"></div>

            {error && <div className="text-red-500 text-sm">{error}</div>}

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
                        className="bg-black text-white p-4 text-lg font-bold uppercase hover:bg-gray-800 transition-colors"
                    >
                        Send Code
                    </button>
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
                        className="bg-black text-white p-4 text-lg font-bold uppercase hover:bg-gray-800 transition-colors"
                    >
                        Verify & Login
                    </button>
                    <button
                        onClick={() => setStep('INPUT_PHONE')}
                        className="text-gray-500 text-sm underline mt-2 text-center"
                    >
                        Change Phone Number
                    </button>
                </>
            )}
        </div>
    );
}

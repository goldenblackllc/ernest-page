'use client';

import { useState, useEffect, useRef } from 'react';
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

    const clearRecaptcha = () => {
        if (window.recaptchaVerifier) {
            try {
                window.recaptchaVerifier.clear();
            } catch (e) {
                // Ignore errors during clear
            }
            window.recaptchaVerifier = undefined;
        }

        // Also defensively wipe any DOM elements Google might have injected globally
        // This stops the mysterious "Cannot read properties of null (reading 'style')" error
        const badges = document.querySelectorAll('.grecaptcha-badge');
        badges.forEach(badge => badge.remove());
    };

    useEffect(() => {
        // We do not initialize it in useEffect anymore to prevent Strict Mode issues with double mounting.
        // It will be initialized on demand when the user clicks 'Send Code'.
        return () => {
            clearRecaptcha();
        };
    }, []);

    const setupRecaptcha = () => {
        if (!window.recaptchaVerifier) {
            window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-wrapper-container', {
                'size': 'invisible',
                'callback': () => {
                    // reCAPTCHA solved
                },
                'expired-callback': () => {
                    // Response expired
                    clearRecaptcha();
                }
            });
        }
        return window.recaptchaVerifier;
    };

    const handleSendCode = async () => {
        setError(null);
        if (!phoneNumber) {
            setError("Please enter a phone number.");
            return;
        }

        try {
            const appVerifier = setupRecaptcha();
            const result = await signInWithPhoneNumber(auth, phoneNumber, appVerifier);
            setConfirmationResult(result);
            setStep('INPUT_CODE');
        } catch (err: any) {
            console.error("Error sending code:", err);

            if (err.code === 'auth/invalid-app-credential') {
                setError("App verification failed. Firebase blocked this domain. Try testing with a registered 'Test Number' in your Firebase console instead to bypass this security check locally.");
            } else if (err.code === 'auth/quota-exceeded') {
                setError("SMS quota exceeded. Please upgrade to a Blaze plan in Firebase.");
            } else if (err.code === 'auth/too-many-requests') {
                setError("Too many attempts. We've temporarily blocked requests from this number/device due to unusual activity. Please try again later.");
            } else {
                setError(err.message || "Failed to send code. Please try again.");
            }

            // Immediately clear the broken verifier
            clearRecaptcha();
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
        <div className="flex flex-col gap-6 w-full max-w-sm relative">

            {/* 
              CRITICAL FIX: 
              This container must NEVER be unmounted conditionally by React state changes (like step === 'INPUT_PHONE'). 
              If React unmounts it while the invisible reCAPTCHA is trying to solve or throw an error, 
              recaptcha_en.js will crash with "Cannot read properties of null (reading 'style')". 
            */}
            <div id="recaptcha-wrapper-container" className="absolute" style={{ display: 'none' }}></div>

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
                        className="bg-black text-white p-4 text-lg font-bold uppercase hover:bg-gray-800 transition-colors"
                    >
                        Send Code
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
                        className="bg-black text-white p-4 text-lg font-bold uppercase hover:bg-gray-800 transition-colors"
                    >
                        Verify & Login
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

'use client';

import { useState } from 'react';
import { signInWithCustomToken } from 'firebase/auth';
import { auth } from '@/lib/firebase/config';
import { useRouter } from 'next/navigation';
import { CountryCodeSelect } from '@/components/auth/CountryCodeSelect';
import { detectCountryFromTimezone, getDialCodeForCountry } from '@/lib/constants/countryCodes';
import { useTrackEvent } from '@/lib/analytics/useTrackEvent';

function normalizePhoneNumber(input: string, dialCode: string): string {
    const stripped = input.replace(/[\s\-\(\)\.]/g, '');
    if (stripped.startsWith('+')) return stripped;
    return `${dialCode}${stripped}`;
}

export default function OTPLogin() {
    const [phoneNumber, setPhoneNumber] = useState('');
    const [verificationCode, setVerificationCode] = useState('');
    const [step, setStep] = useState<'INPUT_PHONE' | 'INPUT_CODE'>('INPUT_PHONE');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [selectedCountry, setSelectedCountry] = useState(() => detectCountryFromTimezone());
    const dialCode = getDialCodeForCountry(selectedCountry);
    const router = useRouter();
    const { trackEvent } = useTrackEvent();

    const handleSendCode = async () => {
        setError(null);
        if (!phoneNumber) {
            setError("Please enter a phone number.");
            return;
        }
        const normalized = normalizePhoneNumber(phoneNumber, dialCode);
        setLoading(true);
        try {
            const res = await fetch('/api/auth/send-code', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone: normalized }),
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data.error || 'Failed to send code.');
                return;
            }
            setStep('INPUT_CODE');
        } catch (err: any) {
            console.error("Error sending code:", err);
            setError("Failed to send code. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    const handleVerifyCode = async () => {
        setError(null);
        if (!verificationCode) return;
        const normalized = normalizePhoneNumber(phoneNumber, dialCode);
        setLoading(true);
        try {
            const res = await fetch('/api/auth/verify-code', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone: normalized, code: verificationCode }),
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data.error || 'Invalid code. Please try again.');
                return;
            }
            await signInWithCustomToken(auth, data.token);
            trackEvent('login');
            router.push('/');
        } catch {
            setError("Invalid code. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col gap-6 w-full max-w-sm relative">
            {error && <div className="text-red-500 text-sm font-medium p-3 bg-red-50 border border-red-200 rounded-md">{error}</div>}

            {step === 'INPUT_PHONE' && (
                <>
                    <h1 className="text-2xl font-bold uppercase tracking-widest text-center">Login</h1>
                    <div className="flex gap-2">
                        <CountryCodeSelect
                            value={selectedCountry}
                            onChange={setSelectedCountry}
                        />
                        <input
                            type="tel"
                            placeholder="Phone number"
                            value={phoneNumber}
                            onChange={(e) => setPhoneNumber(e.target.value)}
                            className="flex-1 border-2 border-black p-4 text-lg outline-none placeholder:text-gray-400"
                        />
                    </div>
                    <button
                        onClick={handleSendCode}
                        disabled={loading}
                        className="bg-black text-white p-4 text-lg font-bold uppercase hover:bg-gray-800 transition-colors disabled:opacity-50"
                    >
                        {loading ? 'Sending...' : 'Send Code'}
                    </button>
                    <p className="text-xs text-gray-400 text-center mt-2">
                        Select your country above and enter your phone number.
                    </p>
                </>
            )}

            {step === 'INPUT_CODE' && (
                <form onSubmit={(e) => { e.preventDefault(); handleVerifyCode(); }}>
                    <h1 className="text-2xl font-bold uppercase tracking-widest text-center">Verify</h1>
                    <input
                        id="otp-code"
                        name="otp-code"
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        autoComplete="one-time-code"
                        placeholder="123456"
                        value={verificationCode}
                        onChange={(e) => setVerificationCode(e.target.value)}
                        className="border-2 border-black p-4 text-lg outline-none placeholder:text-gray-400 placeholder:tracking-normal text-center tracking-widest w-full mt-6"
                        maxLength={6}
                        autoFocus
                    />
                    <button
                        type="submit"
                        disabled={loading}
                        className="bg-black text-white p-4 text-lg font-bold uppercase hover:bg-gray-800 transition-colors disabled:opacity-50 w-full mt-3"
                    >
                        {loading ? 'Verifying...' : 'Verify & Login'}
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            setStep('INPUT_PHONE');
                            setVerificationCode('');
                            setError(null);
                        }}
                        className="text-gray-500 text-sm underline mt-2 text-center w-full"
                    >
                        Change Phone Number
                    </button>
                </form>
            )}
        </div>
    );
}

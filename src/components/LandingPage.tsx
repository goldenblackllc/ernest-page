'use client';

import { useState, useRef, useCallback } from 'react';
import { RecaptchaVerifier, signInWithPhoneNumber, ConfirmationResult } from 'firebase/auth';
import { auth } from '@/lib/firebase/config';
import { useRouter } from 'next/navigation';

// Detect the user's default country dial code from browser timezone
function getDefaultDialCode(): string {
    try {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
        const region = tz.split('/')[0];
        const city = tz.split('/')[1] || '';

        // Map common timezones to dial codes
        const tzToDialCode: Record<string, string> = {
            // Americas
            'America': '+1',    // US/Canada default
            'US': '+1',
            // Specific non-US Americas
            'America/Mexico_City': '+52', 'America/Cancun': '+52', 'America/Tijuana': '+52',
            'America/Sao_Paulo': '+55', 'America/Fortaleza': '+55', 'America/Manaus': '+55',
            'America/Argentina': '+54', 'America/Buenos_Aires': '+54',
            'America/Bogota': '+57', 'America/Lima': '+51', 'America/Santiago': '+56',
            // Europe
            'Europe/London': '+44', 'Europe/Dublin': '+353',
            'Europe/Berlin': '+49', 'Europe/Munich': '+49',
            'Europe/Paris': '+33', 'Europe/Madrid': '+34', 'Europe/Rome': '+39',
            'Europe/Amsterdam': '+31', 'Europe/Brussels': '+32',
            'Europe/Stockholm': '+46', 'Europe/Oslo': '+47', 'Europe/Helsinki': '+358',
            'Europe/Warsaw': '+48', 'Europe/Prague': '+420', 'Europe/Vienna': '+43',
            'Europe/Zurich': '+41', 'Europe/Lisbon': '+351',
            'Europe/Moscow': '+7', 'Europe/Kiev': '+380',
            // Asia
            'Asia/Tokyo': '+81', 'Asia/Seoul': '+82',
            'Asia/Shanghai': '+86', 'Asia/Hong_Kong': '+852', 'Asia/Taipei': '+886',
            'Asia/Kolkata': '+91', 'Asia/Calcutta': '+91', 'Asia/Mumbai': '+91',
            'Asia/Singapore': '+65', 'Asia/Bangkok': '+66',
            'Asia/Dubai': '+971', 'Asia/Riyadh': '+966',
            'Asia/Jakarta': '+62', 'Asia/Manila': '+63',
            'Asia/Karachi': '+92', 'Asia/Dhaka': '+880',
            // Oceania
            'Australia/Sydney': '+61', 'Australia/Melbourne': '+61', 'Australia/Perth': '+61',
            'Pacific/Auckland': '+64',
            // Africa
            'Africa/Lagos': '+234', 'Africa/Johannesburg': '+27', 'Africa/Cairo': '+20',
            'Africa/Nairobi': '+254', 'Africa/Casablanca': '+212',
        };

        // Try exact match first (e.g., "America/Mexico_City")
        if (tzToDialCode[tz]) return tzToDialCode[tz];
        // Try region/city combo
        if (tzToDialCode[`${region}/${city}`]) return tzToDialCode[`${region}/${city}`];
        // Fall back to region
        if (tzToDialCode[region]) return tzToDialCode[region];

        return '+1'; // Default to US if unknown
    } catch {
        return '+1';
    }
}

function normalizePhoneNumber(input: string): string {
    // Strip all formatting characters
    const stripped = input.replace(/[\s\-\(\)\.]/g, '');

    // Already has country code
    if (stripped.startsWith('+')) return stripped;

    // Prepend detected country dial code
    return `${getDefaultDialCode()}${stripped}`;
}

export function LandingPage() {
    const [phoneNumber, setPhoneNumber] = useState('');
    const [verificationCode, setVerificationCode] = useState('');
    const [step, setStep] = useState<'WELCOME' | 'INPUT_CODE'>('WELCOME');
    const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [detectedDialCode] = useState(() => getDefaultDialCode());
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

        const normalized = normalizePhoneNumber(phoneNumber);
        setLoading(true);
        try {
            const verifier = getVerifier();
            const result = await signInWithPhoneNumber(auth, normalized, verifier);
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

    const displayNumber = phoneNumber
        ? normalizePhoneNumber(phoneNumber)
        : '';

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
                        <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 text-sm font-medium pointer-events-none">
                                {detectedDialCode}
                            </span>
                            <input
                                type="tel"
                                placeholder="555 555 5555"
                                value={phoneNumber}
                                onChange={(e) => setPhoneNumber(e.target.value)}
                                className="w-full bg-zinc-900 border border-zinc-800 pl-12 pr-4 py-3.5 text-base text-white placeholder-zinc-600 focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all"
                            />
                        </div>
                        <button
                            onClick={handleSendCode}
                            disabled={loading}
                            className="w-full bg-white text-black py-3.5 text-sm font-bold tracking-wide hover:bg-zinc-200 transition-colors disabled:opacity-50"
                        >
                            {loading ? 'Sending...' : 'Continue'}
                        </button>

                        <p className="text-[10px] text-zinc-600 text-center mt-4 leading-relaxed">
                            By continuing, you agree to be radically honest with yourself.
                        </p>
                    </div>
                )}

                {step === 'INPUT_CODE' && (
                    <div className="w-full flex flex-col gap-3">
                        <p className="text-xs text-zinc-400 text-center mb-2">
                            Enter the 6-digit code sent to <span className="text-white font-semibold">{displayNumber}</span>
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

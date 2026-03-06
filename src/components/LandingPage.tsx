'use client';

import { useState, useRef, useCallback } from 'react';
import { RecaptchaVerifier, signInWithPhoneNumber, ConfirmationResult } from 'firebase/auth';
import { auth } from '@/lib/firebase/config';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { User, MessageSquare, ShieldCheck, ChevronDown } from 'lucide-react';

// ─── Timezone → Dial Code Detection ────────────────────────────────
function getDefaultDialCode(): string {
    try {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
        const region = tz.split('/')[0];
        const city = tz.split('/')[1] || '';

        const tzToDialCode: Record<string, string> = {
            'America': '+1', 'US': '+1',
            'America/Mexico_City': '+52', 'America/Cancun': '+52', 'America/Tijuana': '+52',
            'America/Sao_Paulo': '+55', 'America/Fortaleza': '+55', 'America/Manaus': '+55',
            'America/Argentina': '+54', 'America/Buenos_Aires': '+54',
            'America/Bogota': '+57', 'America/Lima': '+51', 'America/Santiago': '+56',
            'Europe/London': '+44', 'Europe/Dublin': '+353',
            'Europe/Berlin': '+49', 'Europe/Munich': '+49',
            'Europe/Paris': '+33', 'Europe/Madrid': '+34', 'Europe/Rome': '+39',
            'Europe/Amsterdam': '+31', 'Europe/Brussels': '+32',
            'Europe/Stockholm': '+46', 'Europe/Oslo': '+47', 'Europe/Helsinki': '+358',
            'Europe/Warsaw': '+48', 'Europe/Prague': '+420', 'Europe/Vienna': '+43',
            'Europe/Zurich': '+41', 'Europe/Lisbon': '+351',
            'Europe/Moscow': '+7', 'Europe/Kiev': '+380',
            'Asia/Tokyo': '+81', 'Asia/Seoul': '+82',
            'Asia/Shanghai': '+86', 'Asia/Hong_Kong': '+852', 'Asia/Taipei': '+886',
            'Asia/Kolkata': '+91', 'Asia/Calcutta': '+91', 'Asia/Mumbai': '+91',
            'Asia/Singapore': '+65', 'Asia/Bangkok': '+66',
            'Asia/Dubai': '+971', 'Asia/Riyadh': '+966',
            'Asia/Jakarta': '+62', 'Asia/Manila': '+63',
            'Asia/Karachi': '+92', 'Asia/Dhaka': '+880',
            'Australia/Sydney': '+61', 'Australia/Melbourne': '+61', 'Australia/Perth': '+61',
            'Pacific/Auckland': '+64',
            'Africa/Lagos': '+234', 'Africa/Johannesburg': '+27', 'Africa/Cairo': '+20',
            'Africa/Nairobi': '+254', 'Africa/Casablanca': '+212',
        };

        if (tzToDialCode[tz]) return tzToDialCode[tz];
        if (tzToDialCode[`${region}/${city}`]) return tzToDialCode[`${region}/${city}`];
        if (tzToDialCode[region]) return tzToDialCode[region];

        return '+1';
    } catch {
        return '+1';
    }
}

function normalizePhoneNumber(input: string): string {
    const stripped = input.replace(/[\s\-\(\)\.]/g, '');
    if (stripped.startsWith('+')) return stripped;
    return `${getDefaultDialCode()}${stripped}`;
}

// ─── Animation Variants ────────────────────────────────────────────
const fadeUp = {
    hidden: { opacity: 0, y: 24 },
    visible: (i: number) => ({
        opacity: 1,
        y: 0,
        transition: { delay: i * 0.12, duration: 0.5, ease: [0.22, 1, 0.36, 1] as const },
    }),
};

const cardReveal = {
    hidden: { opacity: 0, y: 32 },
    visible: (i: number) => ({
        opacity: 1,
        y: 0,
        transition: { delay: 0.1 + i * 0.1, duration: 0.45, ease: [0.22, 1, 0.36, 1] as const },
    }),
};

// ─── Mechanics Data ────────────────────────────────────────────────
const MECHANICS = [
    {
        icon: User,
        title: 'The Description',
        text: 'Outline exactly who your ideal self is and what they stand for.',
    },
    {
        icon: MessageSquare,
        title: 'The Style',
        text: 'Define how this version of you speaks, thinks, and approaches the world.',
    },
    {
        icon: ShieldCheck,
        title: 'The Rules',
        text: 'Set the concrete, non-negotiable guidelines for how you respond to friction.',
    },
];

// ─── Component ─────────────────────────────────────────────────────
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
            setError('Please enter a phone number.');
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
            console.error('Error sending code:', err);
            if (err.code === 'auth/invalid-app-credential') {
                setError('Verification failed. Please try again.');
            } else if (err.code === 'auth/too-many-requests') {
                setError('Too many attempts. Please try again later.');
            } else {
                setError(err.message || 'Failed to send code.');
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
            setError('Invalid code. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const displayNumber = phoneNumber ? normalizePhoneNumber(phoneNumber) : '';

    return (
        <main className="min-h-screen bg-black text-white scroll-smooth">
            {/* Invisible reCAPTCHA container */}
            <div id="landing-recaptcha" />

            {/* ── HERO SECTION ── */}
            <section className="relative min-h-screen flex flex-col items-center justify-center px-6 text-center">
                {/* Subtle radial gradient behind hero text */}
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(59,130,246,0.08)_0%,_transparent_70%)]" />

                <div className="relative z-10 max-w-3xl mx-auto">
                    <motion.h1
                        className="text-4xl sm:text-5xl md:text-7xl font-black tracking-tight leading-[1.1] mb-6"
                        custom={0}
                        variants={fadeUp}
                        initial="hidden"
                        animate="visible"
                    >
                        Stop reacting.
                        <br />
                        <span className="text-blue-500">Start commanding.</span>
                    </motion.h1>

                    <motion.p
                        className="text-base sm:text-lg md:text-xl text-zinc-400 leading-relaxed max-w-2xl mx-auto"
                        custom={1}
                        variants={fadeUp}
                        initial="hidden"
                        animate="visible"
                    >
                        Most of your day is spent on autopilot. Earnest Page lets you architect
                        your ideal self so you can stop letting circumstances dictate your behavior.
                        <span className="block mt-3 text-white font-semibold">
                            Don&apos;t wait for life to happen. Dictate the terms.
                        </span>
                    </motion.p>
                </div>

                {/* Scroll indicator */}
                <motion.div
                    className="absolute bottom-10 left-1/2 -translate-x-1/2"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 1.2, duration: 0.6 }}
                >
                    <motion.div
                        animate={{ y: [0, 8, 0] }}
                        transition={{ repeat: Infinity, duration: 1.8, ease: 'easeInOut' }}
                    >
                        <ChevronDown className="w-6 h-6 text-zinc-600" />
                    </motion.div>
                </motion.div>
            </section>

            {/* ── MECHANICS GRID ── */}
            <section className="relative px-6 py-24 md:py-32">
                <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
                    {MECHANICS.map((item, i) => (
                        <motion.div
                            key={item.title}
                            className="group relative rounded-2xl border border-white/10 bg-white/[0.03] p-8 transition-colors duration-200 hover:border-blue-500/40 hover:bg-blue-500/[0.04]"
                            custom={i}
                            variants={cardReveal}
                            initial="hidden"
                            whileInView="visible"
                            viewport={{ once: true, margin: '-60px' }}
                        >
                            <item.icon className="w-7 h-7 text-blue-500 mb-5 transition-transform duration-200 group-hover:scale-110" />
                            <h3 className="text-lg font-bold tracking-tight text-white mb-2">
                                {item.title}
                            </h3>
                            <p className="text-sm text-zinc-400 leading-relaxed">
                                {item.text}
                            </p>
                        </motion.div>
                    ))}
                </div>
            </section>

            {/* ── AUTH CARD ── */}
            <section className="relative px-6 pb-24 md:pb-32">
                <motion.div
                    className="max-w-md mx-auto rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-8 sm:p-10"
                    variants={cardReveal}
                    custom={0}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: '-40px' }}
                >
                    {/* Card header */}
                    <div className="text-center mb-8">
                        <h2 className="text-2xl sm:text-3xl font-black tracking-tight mb-2">
                            Earnest Page
                        </h2>
                        <p className="text-sm text-zinc-500">
                            Engineer your ideal response.
                        </p>
                    </div>

                    {/* Error display */}
                    {error && (
                        <div className="text-red-400 text-xs font-medium p-3 bg-red-500/10 border border-red-500/20 rounded-xl mb-5">
                            {error}
                        </div>
                    )}

                    {/* STEP 1 — Phone input */}
                    {step === 'WELCOME' && (
                        <div className="flex flex-col gap-3">
                            <div className="relative">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 text-sm font-medium pointer-events-none select-none">
                                    {detectedDialCode}
                                </span>
                                <input
                                    type="tel"
                                    placeholder="555 555 5555"
                                    value={phoneNumber}
                                    onChange={(e) => setPhoneNumber(e.target.value)}
                                    className="w-full bg-zinc-900/80 border border-white/10 pl-12 pr-4 py-3.5 text-base text-white placeholder-zinc-600 rounded-xl focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all duration-150"
                                />
                            </div>
                            <button
                                onClick={handleSendCode}
                                disabled={loading}
                                className="w-full bg-blue-500 text-white py-3.5 text-sm font-bold tracking-wide rounded-xl hover:bg-blue-400 active:scale-[0.98] transition-all duration-150 disabled:opacity-50 disabled:hover:bg-blue-500"
                            >
                                {loading ? 'Sending...' : 'Continue'}
                            </button>

                            <p className="text-[10px] text-zinc-600 text-center mt-3 leading-relaxed">
                                By continuing, you agree to be radically honest with yourself.
                            </p>
                        </div>
                    )}

                    {/* STEP 2 — OTP verification */}
                    {step === 'INPUT_CODE' && (
                        <div className="flex flex-col gap-3">
                            <p className="text-xs text-zinc-400 text-center mb-2">
                                Enter the 6-digit code sent to{' '}
                                <span className="text-white font-semibold">{displayNumber}</span>
                            </p>
                            <input
                                type="text"
                                placeholder="000000"
                                value={verificationCode}
                                onChange={(e) => setVerificationCode(e.target.value)}
                                className="w-full bg-zinc-900/80 border border-white/10 px-4 py-3.5 text-lg text-white text-center tracking-[0.5em] placeholder-zinc-700 rounded-xl focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all duration-150"
                                maxLength={6}
                                autoFocus
                            />
                            <button
                                onClick={handleVerifyCode}
                                disabled={loading || verificationCode.length < 6}
                                className="w-full bg-blue-500 text-white py-3.5 text-sm font-bold tracking-wide rounded-xl hover:bg-blue-400 active:scale-[0.98] transition-all duration-150 disabled:opacity-50 disabled:hover:bg-blue-500"
                            >
                                {loading ? 'Verifying...' : 'Verify'}
                            </button>
                            <button
                                onClick={() => {
                                    setStep('WELCOME');
                                    setVerificationCode('');
                                    setError(null);
                                }}
                                className="text-zinc-500 text-xs mt-2 text-center hover:text-white transition-colors duration-150"
                            >
                                ← Change number
                            </button>
                        </div>
                    )}
                </motion.div>
            </section>
        </main>
    );
}

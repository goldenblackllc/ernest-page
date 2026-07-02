'use client';

import { useState, useRef, useCallback } from 'react';
import { useTrackEvent } from '@/lib/analytics/useTrackEvent';
import { signInWithCustomToken } from 'firebase/auth';
import { auth } from '@/lib/firebase/config';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { LocaleSwitcher } from '@/components/LocaleSwitcher';
import { CountryCodeSelect } from '@/components/auth/CountryCodeSelect';
import { useEffect } from 'react';
import { detectCountryFromTimezone, getDialCodeForCountry } from '@/lib/constants/countryCodes';
import { GuestMirrorChat } from '@/components/GuestMirrorChat';
import { PublicFeed } from '@/components/PublicFeed';

// ─── Phone Number Normalization ────────────────────────────────────
function normalizePhoneNumber(input: string, dialCode: string): string {
    const stripped = input.replace(/[\s\-\(\)\.]/g, '');
    if (stripped.startsWith('+')) return stripped;
    return `${dialCode}${stripped}`;
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

const sectionFade = {
    hidden: { opacity: 0, y: 40 },
    visible: {
        opacity: 1,
        y: 0,
        transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const },
    },
};


// ─── Component ─────────────────────────────────────────────────────
export function LandingPage() {
    const t = useTranslations();
    const [phoneNumber, setPhoneNumber] = useState('');
    const [showAuthModal, setShowAuthModal] = useState(false);
    const [verificationCode, setVerificationCode] = useState('');

    const [step, setStep] = useState<'WELCOME' | 'INPUT_CODE'>('WELCOME');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [selectedCountry, setSelectedCountry] = useState('US'); // Fallback for SSR
    const detectedDialCode = getDialCodeForCountry(selectedCountry);

    useEffect(() => {
        // Detect timezone-based country after hydration to avoid SSR mismatch
        setSelectedCountry(detectCountryFromTimezone());
    }, []);

    // ── Funnel: track landing page view ──
    const { trackEvent } = useTrackEvent();
    useEffect(() => {
        trackEvent('landing');
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const router = useRouter();

    // Delay focus so the browser registers the input for SMS autofill
    // before it receives focus — autoFocus fires too early.
    const otpInputRef = useCallback((node: HTMLInputElement | null) => {
        if (node) {
            requestAnimationFrame(() => {
                setTimeout(() => node.focus(), 100);
            });
        }
    }, []);

    const handleSendCode = async () => {
        setError(null);
        if (!phoneNumber) {
            setError(t('landing.auth.errorNoPhone'));
            return;
        }
        const normalized = normalizePhoneNumber(phoneNumber, detectedDialCode);
        setLoading(true);
        try {
            const res = await fetch('/api/auth/send-code', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone: normalized }),
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data.error || t('landing.auth.errorSendFailed'));
                return;
            }
            setStep('INPUT_CODE');
        } catch (err: any) {
            console.error('Error sending code:', err);
            setError(t('landing.auth.errorSendFailed'));
        } finally {
            setLoading(false);
        }
    };

    const handleVerifyCode = async () => {
        setError(null);
        if (!verificationCode) return;
        const normalized = normalizePhoneNumber(phoneNumber, detectedDialCode);
        setLoading(true);
        try {
            const res = await fetch('/api/auth/verify-code', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone: normalized, code: verificationCode }),
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data.error || t('landing.auth.errorVerifyFailed'));
                return;
            }
            await signInWithCustomToken(auth, data.token);
            trackEvent('login');
            router.push('/');
        } catch {
            setError(t('landing.auth.errorVerifyFailed'));
        } finally {
            setLoading(false);
        }
    };

    const displayNumber = phoneNumber ? normalizePhoneNumber(phoneNumber, detectedDialCode) : '';

    const openAuthModal = () => setShowAuthModal(true);
    const closeAuthModal = () => setShowAuthModal(false);

    useEffect(() => {
        const handleOpenModal = () => openAuthModal();
        window.addEventListener('open-auth-modal', handleOpenModal);
        return () => window.removeEventListener('open-auth-modal', handleOpenModal);
    }, []);

    return (
        <main className="min-h-screen bg-black text-white scroll-smooth overflow-x-hidden">

            {/* ── STICKY TOP NAV ── */}
            <nav className="fixed top-0 w-full z-50 backdrop-blur-md bg-black/80 border-b border-white/[0.06]">
                <div className="max-w-5xl mx-auto flex items-center justify-between px-6 py-3">
                    <span className="font-bold text-lg text-zinc-100 tracking-tight">{t('common.brand')}</span>
                    <div className="flex items-center gap-3 sm:gap-4">
                        <LocaleSwitcher className="w-20 sm:w-24 border-none bg-transparent hover:bg-white/5" />
                        <button
                            onClick={openAuthModal}
                            className="rounded-full bg-white text-black px-5 py-2 text-sm font-semibold hover:bg-zinc-200 active:scale-[0.97] transition-all duration-150"
                        >
                            {t('landing.nav.login')}
                        </button>
                    </div>
                </div>
            </nav>

            {/* ═══════════════════════════════════════════════════════════
                HERO — Compact headline
               ═══════════════════════════════════════════════════════════ */}
            <section className="relative px-6 pt-28 sm:pt-32 pb-6 sm:pb-8">
                <div className="relative z-10 max-w-2xl mx-auto w-full text-center">
                    <motion.h1
                        className="text-3xl sm:text-5xl md:text-6xl font-black tracking-tight leading-[1.08] mb-3"
                        custom={1}
                        variants={fadeUp}
                        initial="hidden"
                        animate="visible"
                    >
                        Something bothering you?
                    </motion.h1>

                    <motion.p
                        className="text-2xl sm:text-4xl md:text-5xl font-black tracking-tight text-zinc-500 leading-[1.08]"
                        custom={2}
                        variants={fadeUp}
                        initial="hidden"
                        animate="visible"
                    >
                        Ask Earnest.
                    </motion.p>
                </div>
            </section>

            {/* ═══════════════════════════════════════════════════════════
                DEMO CHAT — Inline guest chat session
               ═══════════════════════════════════════════════════════════ */}
            <section className="px-4 sm:px-6 pb-8">
                <motion.div
                    className="max-w-2xl mx-auto"
                    variants={sectionFade}
                    initial="hidden"
                    animate="visible"
                >
                    <GuestMirrorChat />
                </motion.div>
            </section>

            {/* ═══════════════════════════════════════════════════════════
                AUTH MODAL — Triggered by nav "Log in" button
               ═══════════════════════════════════════════════════════════ */}
            <AnimatePresence>
                {showAuthModal && (
                    <motion.div
                        className="fixed inset-0 z-[60] flex items-center justify-center px-6"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                    >
                        {/* Backdrop */}
                        <div
                            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                            onClick={closeAuthModal}
                        />

                        {/* Modal */}
                        <motion.div
                            className="relative max-w-md w-full rounded-2xl border border-white/[0.08] bg-zinc-950 p-8 sm:p-10"
                            initial={{ opacity: 0, scale: 0.95, y: 16 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 16 }}
                            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                        >
                            {/* Close button */}
                            <button
                                onClick={closeAuthModal}
                                className="absolute top-4 right-4 text-zinc-500 hover:text-white transition-colors w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/5"
                                aria-label="Close"
                            >
                                ✕
                            </button>

                            <div className="text-center mb-6">
                                <h2 className="text-lg sm:text-xl font-bold tracking-tight text-zinc-100 mb-1">
                                    {t('landing.nav.login')}
                                </h2>
                            </div>

                            {error && (
                                <div className="text-red-400 text-xs font-medium p-3 bg-red-500/10 border border-red-500/20 rounded-xl mb-5">
                                    {error}
                                </div>
                            )}

                            {step === 'WELCOME' && (
                                <div className="flex flex-col gap-3">
                                    <div className="flex gap-2">
                                        <CountryCodeSelect
                                            value={selectedCountry}
                                            onChange={setSelectedCountry}
                                        />
                                        <input
                                            type="tel"
                                            autoComplete="tel"
                                            placeholder={t('landing.auth.phonePlaceholder')}
                                            value={phoneNumber}
                                            onChange={(e) => setPhoneNumber(e.target.value)}
                                            className="flex-1 min-w-0 bg-zinc-900/80 border border-white/10 px-4 py-3.5 text-base text-white placeholder-zinc-600 rounded-xl focus:border-zinc-500 transition-all duration-150"
                                        />
                                    </div>
                                    <button
                                        onClick={handleSendCode}
                                        disabled={loading}
                                        className="w-full bg-white text-black py-3.5 text-sm font-bold tracking-wide rounded-full hover:bg-zinc-200 active:scale-[0.98] transition-all duration-150 disabled:opacity-50 disabled:hover:bg-white"
                                    >
                                        {loading ? t('landing.auth.sending') : t('landing.auth.sendCode')}
                                    </button>

                                    <p className="text-[10px] text-zinc-600 text-center mt-2 leading-relaxed">
                                        {t('landing.auth.byContinuing')}{' '}
                                        <Link href="/terms" className="underline hover:text-zinc-400 transition-colors">
                                            {t('landing.footer.terms')}
                                        </Link>{' '}
                                        {t('landing.auth.and')}{' '}
                                        <Link href="/privacy" className="underline hover:text-zinc-400 transition-colors">
                                            {t('landing.footer.privacy')}
                                        </Link>.
                                    </p>
                                </div>
                            )}

                            {step === 'INPUT_CODE' && (
                                <form onSubmit={(e) => { e.preventDefault(); handleVerifyCode(); }} className="flex flex-col gap-3">
                                    <p className="text-xs text-zinc-400 text-center mb-2">
                                        {t('landing.auth.codeSent')} <span className="text-white font-semibold">{displayNumber}</span>
                                    </p>
                                    <input
                                        id="otp-code"
                                        name="otp-code"
                                        type="text"
                                        inputMode="numeric"
                                        pattern="[0-9]*"
                                        autoComplete="one-time-code"
                                        placeholder={t('landing.auth.codePlaceholder')}
                                        value={verificationCode}
                                        onChange={(e) => setVerificationCode(e.target.value)}
                                        className="w-full bg-zinc-900/80 border border-white/10 px-4 py-3.5 text-lg text-white text-center tracking-[0.5em] placeholder:tracking-normal placeholder-zinc-700 rounded-xl focus:border-zinc-500 transition-all duration-150"
                                        maxLength={6}
                                        ref={otpInputRef}
                                    />
                                    <button
                                        type="submit"
                                        disabled={loading || verificationCode.length < 6}
                                        className="w-full bg-white text-black py-3.5 text-sm font-bold tracking-wide rounded-full hover:bg-zinc-200 active:scale-[0.98] transition-all duration-150 disabled:opacity-50 disabled:hover:bg-white"
                                    >
                                        {loading ? t('landing.auth.verifying') : t('landing.auth.verify')}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setStep('WELCOME');
                                            setVerificationCode('');
                                            setError(null);
                                        }}
                                        className="text-zinc-500 text-xs mt-2 text-center hover:text-white transition-colors duration-150"
                                    >
                                        ← {t('landing.auth.wrongNumber')}
                                    </button>
                                </form>
                            )}
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ═══════════════════════════════════════════════════════════
                PUBLIC FEED — Read-only infinite scroll
               ═══════════════════════════════════════════════════════════ */}
            <section className="pb-8">
                <div className="max-w-3xl mx-auto px-0 sm:px-4">
                    <PublicFeed />
                </div>
            </section>

            {/* ── FOOTER ── */}
            <footer className="border-t border-white/[0.06] px-6 py-10">
                <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-zinc-600">
                    <span>{t('landing.footer.copyright', { year: new Date().getFullYear() })}</span>
                    <div className="flex items-center gap-4">
                        <Link href="/terms" className="hover:text-zinc-400 transition-colors">{t('landing.footer.terms')}</Link>
                        <Link href="/privacy" className="hover:text-zinc-400 transition-colors">{t('landing.footer.privacy')}</Link>
                        <Link href="/acceptable-use" className="hover:text-zinc-400 transition-colors">{t('landing.footer.acceptableUse')}</Link>
                    </div>
                </div>
                <p className="max-w-5xl mx-auto text-[10px] text-zinc-700 text-center sm:text-left mt-4">
                    {t('landing.footer.disclaimer')}
                </p>
            </footer>
        </main>
    );
}

'use client';

import { useState, useRef } from 'react';
import { useTrackEvent } from '@/lib/analytics/useTrackEvent';
import { signInWithCustomToken } from 'firebase/auth';
import { auth } from '@/lib/firebase/config';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Shield } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { LocaleSwitcher } from '@/components/LocaleSwitcher';
import { CountryCodeSelect } from '@/components/auth/CountryCodeSelect';
import { useEffect } from 'react';
import { detectCountryFromTimezone, getDialCodeForCountry } from '@/lib/constants/countryCodes';
import { ShowcasePostCard } from '@/components/ShowcasePostCard';

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

const cardReveal = {
    hidden: { opacity: 0, y: 32 },
    visible: (i: number) => ({
        opacity: 1,
        y: 0,
        transition: { delay: 0.1 + i * 0.1, duration: 0.45, ease: [0.22, 1, 0.36, 1] as const },
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

    // ── Showcase: public posts carousel ──
    const [showcasePosts, setShowcasePosts] = useState<any[]>([]);
    const [activeShowcaseIndex, setActiveShowcaseIndex] = useState(0);
    const [showcasePaused, setShowcasePaused] = useState(false);
    const [showcaseAudioPlaying, setShowcaseAudioPlaying] = useState(false);
    const touchStartX = useRef<number | null>(null);

    useEffect(() => {
        fetch('/api/posts/public')
            .then(res => res.json())
            .then(data => {
                if (data.posts?.length) setShowcasePosts(data.posts);
            })
            .catch(() => {});
    }, []);

    // Auto-advance the showcase every 6 seconds (paused when reading or audio is playing)
    useEffect(() => {
        if (showcasePosts.length < 2 || showcasePaused || showcaseAudioPlaying) return;

        const interval = setInterval(() => {
            setActiveShowcaseIndex(prev =>
                prev >= showcasePosts.length - 1 ? 0 : prev + 1
            );
        }, 6000);

        return () => clearInterval(interval);
    }, [showcasePosts, showcasePaused, showcaseAudioPlaying]);

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

    const scrollToAuth = () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    return (
        <main className="min-h-screen bg-black text-white scroll-smooth overflow-x-hidden">

            {/* ── STICKY TOP NAV ── */}
            <nav className="fixed top-0 w-full z-50 backdrop-blur-md bg-black/80 border-b border-white/[0.06]">
                <div className="max-w-5xl mx-auto flex items-center justify-between px-6 py-3">
                    <span className="font-bold text-lg text-zinc-100 tracking-tight">{t('common.brand')}</span>
                    <div className="flex items-center gap-3 sm:gap-4">
                        <LocaleSwitcher className="w-20 sm:w-24 border-none bg-transparent hover:bg-white/5" />
                        <button
                            onClick={scrollToAuth}
                            className="rounded-full bg-white text-black px-5 py-2 text-sm font-semibold hover:bg-zinc-200 active:scale-[0.97] transition-all duration-150"
                        >
                            {t('landing.nav.login')}
                        </button>
                    </div>
                </div>
            </nav>

            {/* ═══════════════════════════════════════════════════════════
                HERO — Headline + subtext only
               ═══════════════════════════════════════════════════════════ */}
            <section className="relative px-6 pt-28 sm:pt-32 pb-10 overflow-hidden">
                {/* Background hero image with aggressive fade */}
                <div className="absolute inset-0 z-0">
                    <Image
                        src="/img/shots-hero.png"
                        alt=""
                        fill
                        className="object-cover object-center"
                        style={{
                            opacity: 0.25,
                            maskImage: 'radial-gradient(ellipse at center, black 20%, transparent 70%)',
                            WebkitMaskImage: 'radial-gradient(ellipse at center, black 20%, transparent 70%)',
                        }}
                        priority
                    />
                </div>

                <div className="relative z-10 max-w-3xl mx-auto w-full text-center">
                    <motion.h1
                        className="text-2xl sm:text-5xl md:text-6xl lg:text-7xl font-black tracking-tight leading-[1.08] mb-6 break-words"
                        custom={1}
                        variants={fadeUp}
                        initial="hidden"
                        animate="visible"
                    >
                        {t('landing.hero.headline1')}{' '}
                        <br className="hidden sm:block" />
                        <span className="text-zinc-500">{t('landing.hero.headline2')}</span>
                    </motion.h1>

                    <motion.p
                        className="text-lg sm:text-xl text-zinc-400 leading-relaxed max-w-2xl mx-auto"
                        custom={2}
                        variants={fadeUp}
                        initial="hidden"
                        animate="visible"
                    >
                        {t('landing.hero.subtext')}
                    </motion.p>
                </div>
            </section>

            {/* ═══════════════════════════════════════════════════════════
                SHOWCASE — Real public posts from inside the app
               ═══════════════════════════════════════════════════════════ */}
            {showcasePosts.length > 0 && (
                <section className="relative py-6 md:py-10 overflow-hidden">
                    <div className="max-w-2xl mx-auto px-4 sm:px-6">
                        {/* Swipeable card area */}
                        <div
                            className="relative overflow-hidden"
                            onTouchStart={(e) => {
                                touchStartX.current = e.touches[0].clientX;
                            }}
                            onTouchEnd={(e) => {
                                if (touchStartX.current === null) return;
                                const diff = touchStartX.current - e.changedTouches[0].clientX;
                                if (Math.abs(diff) > 50) {
                                    if (diff > 0) {
                                        // Swipe left → next
                                        setActiveShowcaseIndex(prev =>
                                            prev >= showcasePosts.length - 1 ? 0 : prev + 1
                                        );
                                    } else {
                                        // Swipe right → prev
                                        setActiveShowcaseIndex(prev =>
                                            prev <= 0 ? showcasePosts.length - 1 : prev - 1
                                        );
                                    }
                                }
                                touchStartX.current = null;
                            }}
                        >
                            <ShowcasePostCard
                                key={showcasePosts[activeShowcaseIndex].id}
                                post={showcasePosts[activeShowcaseIndex]}
                                onInteract={scrollToAuth}
                                onExpandChange={setShowcasePaused}
                                onAudioPlayingChange={setShowcaseAudioPlaying}
                            />
                        </div>

                        {/* Dot indicators */}
                        {showcasePosts.length > 1 && (
                            <div className="flex items-center justify-center gap-2 mt-5">
                                {showcasePosts.map((_, i) => (
                                    <button
                                        key={i}
                                        onClick={() => setActiveShowcaseIndex(i)}
                                        className={`transition-all duration-300 rounded-full ${
                                            i === activeShowcaseIndex
                                                ? 'w-6 h-2 bg-white'
                                                : 'w-2 h-2 bg-zinc-700 hover:bg-zinc-500'
                                        }`}
                                        aria-label={`View post ${i + 1}`}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                </section>
            )}

            {/* ═══════════════════════════════════════════════════════════
                AUTH — Sign up / Log in
               ═══════════════════════════════════════════════════════════ */}
            <section className="px-6 py-12 md:py-16">
                <motion.div
                    className="max-w-md mx-auto rounded-2xl border border-white/[0.08] bg-zinc-950/80 backdrop-blur-sm p-8 sm:p-10"
                    variants={sectionFade}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: '-40px' }}
                >
                    <div className="text-center mb-6">
                        <h2 className="text-sm sm:text-base font-semibold tracking-tight text-zinc-300 mb-1">
                            {t('landing.auth.heading1')}
                        </h2>
                        <p className="text-xs text-zinc-400">
                            {t('landing.auth.heading2')}
                        </p>
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
                                    placeholder={t('landing.auth.phonePlaceholder')}
                                    value={phoneNumber}
                                    onChange={(e) => setPhoneNumber(e.target.value)}
                                    className="flex-1 bg-zinc-900/80 border border-white/10 px-4 py-3.5 text-base text-white placeholder-zinc-600 rounded-xl focus:border-zinc-500 transition-all duration-150"
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
                                autoFocus
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
            </section>

            <div className="max-w-5xl mx-auto border-t border-white/[0.06]" />

            {/* ═══════════════════════════════════════════════════════════
                THE SIGNAL — How it works
               ═══════════════════════════════════════════════════════════ */}
            <section className="relative px-6 py-24 md:py-32">
                <motion.div
                    className="max-w-3xl mx-auto"
                    variants={sectionFade}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: '-80px' }}
                >
                    <p className="text-[11px] uppercase tracking-[0.3em] text-zinc-500 mb-6">
                        {t('landing.signal.label')}
                    </p>

                    <div className="space-y-12">
                        {[1, 2, 3].map((n) => (
                            <motion.div
                                key={n}
                                custom={n}
                                variants={cardReveal}
                                initial="hidden"
                                whileInView="visible"
                                viewport={{ once: true, margin: '-40px' }}
                            >
                                <h3 className="text-xl sm:text-2xl font-bold text-white mb-3">
                                    {t(`landing.signal.step${n}Title` as any)}
                                </h3>
                                <p className="text-base text-zinc-400 leading-relaxed">
                                    {t(`landing.signal.step${n}Body` as any)}
                                </p>
                            </motion.div>
                        ))}
                    </div>
                </motion.div>
            </section>

            <div className="max-w-5xl mx-auto border-t border-white/[0.06]" />

            {/* ═══════════════════════════════════════════════════════════
                THE WORLDVIEW — What we believe
               ═══════════════════════════════════════════════════════════ */}
            <section className="relative px-6 py-24 md:py-32">
                <motion.div
                    className="max-w-2xl mx-auto text-center"
                    variants={sectionFade}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: '-80px' }}
                >
                    <p className="text-[11px] uppercase tracking-[0.3em] text-zinc-500 mb-10">
                        {t('landing.worldview.label')}
                    </p>
                    <h2 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight leading-[1.1] mb-8">
                        {t('landing.worldview.heading')}
                    </h2>
                    <div className="space-y-2 text-xl sm:text-2xl text-zinc-400 font-semibold leading-relaxed">
                        <p>{t('landing.worldview.line1')}</p>
                        <p>{t('landing.worldview.line2')}</p>
                        <p>{t('landing.worldview.line3')}</p>
                        <p className="text-white">{t('landing.worldview.line4')}</p>
                    </div>
                </motion.div>
            </section>

            <div className="max-w-5xl mx-auto border-t border-white/[0.06]" />

            {/* ═══════════════════════════════════════════════════════════
                PRIVACY — The trust section
               ═══════════════════════════════════════════════════════════ */}
            <section className="relative px-6 py-24 md:py-36">
                <motion.div
                    className="max-w-3xl mx-auto text-center"
                    variants={sectionFade}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: '-80px' }}
                >
                    <div className="w-16 h-16 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mx-auto mb-8">
                        <Shield className="w-7 h-7 text-zinc-400" />
                    </div>
                    <h2 className="text-3xl sm:text-4xl font-black tracking-tight leading-[1.1] mb-6">
                        {t('landing.privacy.heading')}
                    </h2>
                    <p className="text-base sm:text-lg text-zinc-400 leading-relaxed max-w-2xl mx-auto">
                        {t('landing.privacy.body')}
                    </p>
                </motion.div>
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

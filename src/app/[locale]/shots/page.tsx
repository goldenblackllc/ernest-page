'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, MessageCircle, Clock, Shield, Zap, ArrowRight } from 'lucide-react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';

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

// ─── Entry Points (The Problem Stack) ──────────────────────────────
const ENTRY_POINTS = [
    { key: 'stuck', color: 'from-blue-500/20 to-transparent' },
    { key: 'secret', color: 'from-purple-500/20 to-transparent' },
    { key: 'pattern', color: 'from-amber-500/20 to-transparent' },
    { key: 'gap', color: 'from-emerald-500/20 to-transparent' },
    { key: 'mask', color: 'from-rose-500/20 to-transparent' },
];

// ─── How It Works Steps ────────────────────────────────────────────
const STEPS = [
    { icon: Zap, key: 'step1' },
    { icon: MessageCircle, key: 'step2' },
    { icon: Clock, key: 'step3' },
];

// ─── Component ─────────────────────────────────────────────────────
export default function TherapyShotsPage() {
    const t = useTranslations("shots");
    const [hoveredEntry, setHoveredEntry] = useState<number | null>(null);
    const [isComparisonOpen, setIsComparisonOpen] = useState(false);

    const scrollToCTA = () => {
        document.getElementById('start-section')?.scrollIntoView({ behavior: 'smooth' });
    };

    return (
        <main className="min-h-screen bg-black text-white scroll-smooth">

            {/* ── STICKY TOP NAV ── */}
            <nav className="fixed top-0 w-full z-50 backdrop-blur-md bg-black/80 border-b border-white/[0.06]">
                <div className="max-w-5xl mx-auto flex items-center justify-between px-6 py-3">
                    <div className="flex items-center gap-3">
                        <span className="font-bold text-lg text-zinc-100 tracking-tight">{t('navBrand')}</span>
                        <span className="text-zinc-600 text-sm font-medium">{t('navSession')}</span>
                    </div>
                    <button
                        onClick={scrollToCTA}
                        className="rounded-full bg-white text-black px-5 py-2 text-sm font-semibold hover:bg-zinc-200 active:scale-[0.97] transition-all duration-150"
                    >
                        $20 — Start Now
                    </button>
                </div>
            </nav>

            {/* ═══════════════════════════════════════════════════════════
                HERO — The hook
               ═══════════════════════════════════════════════════════════ */}
            <section className="relative min-h-screen flex flex-col items-center justify-center px-6 text-center overflow-hidden">
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

                <div className="relative z-10 max-w-3xl mx-auto">
                    <motion.p
                        className="text-[11px] sm:text-xs uppercase tracking-[0.3em] text-zinc-500 mb-8"
                        custom={0}
                        variants={fadeUp}
                        initial="hidden"
                        animate="visible"
                    >{t('heroSubtext')}</motion.p>

                    <motion.h1
                        className="text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-black tracking-tight leading-[1.08] mb-8"
                        custom={1}
                        variants={fadeUp}
                        initial="hidden"
                        animate="visible"
                    >
                        {t('heroTitle1')}<br /><span className="text-zinc-500">{t('heroTitle2')}</span><br />{t('heroTitle3')}
                    </motion.h1>

                    <motion.p
                        className="text-base sm:text-lg text-zinc-400 leading-relaxed max-w-2xl mx-auto mb-4"
                        custom={2}
                        variants={fadeUp}
                        initial="hidden"
                        animate="visible"
                    >
                        {t('heroDesc')}
                    </motion.p>

                    <motion.p
                        className="text-lg sm:text-xl text-white font-semibold tracking-wide mb-10"
                        custom={3}
                        variants={fadeUp}
                        initial="hidden"
                        animate="visible"
                    >
                        {t('heroFree')}
                    </motion.p>

                    <motion.div
                        custom={4}
                        variants={fadeUp}
                        initial="hidden"
                        animate="visible"
                        className="flex flex-col sm:flex-row items-center justify-center gap-4"
                    >
                        <button
                            onClick={scrollToCTA}
                            className="rounded-full bg-white text-black px-10 py-4 font-bold text-base hover:bg-zinc-200 active:scale-[0.97] transition-all duration-150"
                        >{t('startSession')}</button>
                        <button
                            onClick={scrollToCTA}
                            className="rounded-full border border-white/20 bg-transparent text-white px-8 py-4 font-semibold text-base hover:bg-white/10 active:scale-[0.97] transition-all duration-150 flex items-center gap-2"
                        >
                            <ArrowRight className="w-4 h-4" />
                            {t('learnMore')}</button>
                    </motion.div>
                </div>

                {/* Scroll indicator */}
                <motion.div
                    className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 1.4, duration: 0.6 }}
                >
                    <motion.div
                        animate={{ y: [0, 8, 0] }}
                        transition={{ repeat: Infinity, duration: 1.8, ease: 'easeInOut' }}
                    >
                        <ChevronDown className="w-5 h-5 text-zinc-600" />
                    </motion.div>
                </motion.div>
            </section>

            {/* ═══════════════════════════════════════════════════════════
                THE PROBLEM STACK — Entry Points
               ═══════════════════════════════════════════════════════════ */}
            <section className="relative px-6 py-24 md:py-36">
                <motion.div
                    className="max-w-3xl mx-auto"
                    variants={sectionFade}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: '-80px' }}
                >
                    <p className="text-[11px] uppercase tracking-[0.3em] text-zinc-600 mb-6">{t('problemLabel')}</p>
                    <h2 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight leading-[1.1] mb-16">
                        {t('problemTitle1')}<br /><span className="text-zinc-500">{t('problemTitle2')}</span>
                    </h2>

                    <div className="space-y-3">
                        {ENTRY_POINTS.map((entry, i) => (
                            <motion.button
                                key={i}
                                className="relative w-full text-left rounded-2xl border border-white/[0.08] bg-zinc-950 p-6 sm:p-8 transition-all duration-200 hover:border-white/20 hover:bg-zinc-900/60 group overflow-hidden"
                                custom={i}
                                variants={cardReveal}
                                initial="hidden"
                                whileInView="visible"
                                viewport={{ once: true, margin: '-40px' }}
                                onMouseEnter={() => setHoveredEntry(i)}
                                onMouseLeave={() => setHoveredEntry(null)}
                                onClick={scrollToCTA}
                            >
                                {/* Subtle color glow on hover */}
                                <div
                                    className={`absolute inset-0 bg-gradient-to-r ${entry.color} opacity-0 group-hover:opacity-100 transition-opacity duration-300`}
                                />
                                <div className="relative z-10 flex items-center justify-between">
                                    <div>
                                        <p className="text-lg sm:text-xl font-bold text-white mb-1">
                                            &ldquo;{t(entry.key)}&rdquo;
                                        </p>
                                        <p className="text-sm text-zinc-500">
                                            {t(`${entry.key}Sub` as any)}
                                        </p>
                                    </div>
                                    <ArrowRight
                                        className={`w-5 h-5 text-zinc-600 transition-all duration-200 ${hoveredEntry === i ? 'text-white translate-x-1' : ''}`}
                                    />
                                </div>
                            </motion.button>
                        ))}
                    </div>
                </motion.div>
            </section>

            {/* Thin divider */}
            <div className="max-w-5xl mx-auto border-t border-white/[0.06]" />

            {/* ═══════════════════════════════════════════════════════════
                THE DIFFERENCE — What this isn't
               ═══════════════════════════════════════════════════════════ */}
            <section className="relative px-6 py-24 md:py-36">
                <motion.div
                    className="max-w-3xl mx-auto"
                    variants={sectionFade}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: '-80px' }}
                >
                    <p className="text-[11px] uppercase tracking-[0.3em] text-zinc-600 mb-6">{t('diffLabel')}</p>
                    <h2 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight leading-[1.1] mb-10">
                        {t('diffTitle1')}<br /><span className="text-zinc-500">{t('diffTitle2')}</span>
                    </h2>
                    <div className="space-y-6 text-base sm:text-lg text-zinc-400 leading-relaxed">
                        <p>
                            {t('diffBody1')}
                        </p>
                        <p className="text-zinc-300 font-semibold">
                            {t('diffBody2')}
                        </p>
                        <p>
                            {t('diffBody3')}
                        </p>
                    </div>

                    {/* Expandable comparison */}
                    <button
                        onClick={() => setIsComparisonOpen(!isComparisonOpen)}
                        className="mt-10 flex items-center gap-2 text-sm text-zinc-500 hover:text-white transition-colors duration-200"
                    >
                        <span>{isComparisonOpen ? t('toggleHide') : t('toggleShow')}</span>
                        <motion.span
                            animate={{ rotate: isComparisonOpen ? 180 : 0 }}
                            transition={{ duration: 0.3 }}
                        >
                            <ChevronDown className="w-4 h-4" />
                        </motion.span>
                    </button>

                    <AnimatePresence initial={false}>
                        {isComparisonOpen && (
                            <motion.div
                                key="comparison"
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                                className="overflow-hidden"
                            >
                                <div className="mt-8 rounded-2xl border border-white/[0.08] bg-zinc-950 overflow-hidden">
                                    <div className="grid grid-cols-4 text-[11px] uppercase tracking-[0.15em] text-zinc-600 border-b border-white/[0.06] px-6 py-4">
                                        <span></span>
                                        <span className="text-center">Traditional Therapy</span>
                                        <span className="text-center">AI Chatbots</span>
                                        <span className="text-center text-white font-semibold">Clarity Session</span>
                                    </div>
                                    {[
                                        ['Cost', '$150–300', 'Free–$20/mo', '$20'],
                                        ['Available', 'Days/weeks', 'Anytime', 'Right now'],
                                        ['Commitment', 'Weekly', 'None', 'None'],
                                        ['Remembers you', 'Session notes', 'Mostly no', 'Yes'],
                                        ['Challenges you', 'Sometimes', 'Never', 'Always'],
                                    ].map(([label, trad, ai, us], i) => (
                                        <div key={i} className="grid grid-cols-4 text-sm border-b border-white/[0.04] px-6 py-3.5">
                                            <span className="text-zinc-400 font-medium">{label}</span>
                                            <span className="text-center text-zinc-600">{trad}</span>
                                            <span className="text-center text-zinc-600">{ai}</span>
                                            <span className="text-center text-white font-semibold">{us}</span>
                                        </div>
                                    ))}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </motion.div>
            </section>

            {/* Thin divider */}
            <div className="max-w-5xl mx-auto border-t border-white/[0.06]" />

            {/* ═══════════════════════════════════════════════════════════
                HOW IT WORKS — 3 Steps
               ═══════════════════════════════════════════════════════════ */}
            <section className="relative px-6 py-24 md:py-36">
                <motion.div
                    className="max-w-5xl mx-auto"
                    variants={sectionFade}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: '-80px' }}
                >
                    <p className="text-[11px] uppercase tracking-[0.3em] text-zinc-600 mb-6">{t('stepsLabel')}</p>
                    <h2 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight leading-[1.1] mb-16">
                        {t('stepsTitle1')}<br /><span className="text-zinc-500">{t('stepsTitle2')}</span>
                    </h2>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                        {STEPS.map((step, i) => (
                            <motion.div
                                key={step.key}
                                className="group relative rounded-2xl border border-white/[0.08] bg-zinc-950 p-8 transition-colors duration-200 hover:border-white/20 hover:bg-zinc-900/60"
                                custom={i}
                                variants={cardReveal}
                                initial="hidden"
                                whileInView="visible"
                                viewport={{ once: true, margin: '-60px' }}
                            >
                                <div className="flex items-center gap-3 mb-6">
                                    <div className="w-10 h-10 rounded-xl bg-white/[0.06] flex items-center justify-center">
                                        <step.icon className="w-5 h-5 text-zinc-300" />
                                    </div>
                                    <span className="text-[11px] uppercase tracking-[0.25em] text-zinc-600 font-semibold">
                                        Step {i + 1}
                                    </span>
                                </div>
                                <h3 className="text-lg font-bold tracking-tight text-white mb-3">
                                    {t(`${step.key}Title` as any)}
                                </h3>
                                <p className="text-sm text-zinc-500 leading-relaxed">
                                    {t(`${step.key}Text` as any)}
                                </p>
                            </motion.div>
                        ))}
                    </div>
                </motion.div>
            </section>

            {/* Thin divider */}
            <div className="max-w-5xl mx-auto border-t border-white/[0.06]" />

            {/* ═══════════════════════════════════════════════════════════
                TRUST — The privacy promise
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
                    <h2 className="text-3xl sm:text-4xl font-black tracking-tight leading-[1.1] mb-6">{t('trustTitle')}</h2>
                    <p className="text-base sm:text-lg text-zinc-400 leading-relaxed max-w-2xl mx-auto mb-4">
                        {t('trustDesc')}
                    </p>
                    <p className="text-sm text-zinc-600">
                        {t('trustSub')}
                    </p>
                </motion.div>
            </section>

            {/* Thin divider */}
            <div className="max-w-5xl mx-auto border-t border-white/[0.06]" />

            {/* ═══════════════════════════════════════════════════════════
                START FREE — The CTA
               ═══════════════════════════════════════════════════════════ */}
            <section id="start-section" className="relative px-6 py-24 md:py-36">
                <motion.div
                    className="max-w-3xl mx-auto text-center"
                    variants={sectionFade}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: '-80px' }}
                >
                    <p className="text-[11px] uppercase tracking-[0.3em] text-zinc-600 mb-6">{t('ctaLabel')}</p>
                    <h2 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight leading-[1.1] mb-6">
                        {t('ctaTitle1')}<br /><span className="text-zinc-500">{t('ctaTitle2')}</span>
                    </h2>
                    <p className="text-base sm:text-lg text-zinc-400 leading-relaxed max-w-xl mx-auto mb-10">
                        {t('ctaDesc')}
                    </p>
                    <button
                        className="rounded-full bg-white text-black px-10 py-4 font-bold text-base hover:bg-zinc-200 active:scale-[0.97] transition-all duration-150"
                    >{t('ctaBtn')}</button>
                    <p className="text-sm text-zinc-600 mt-8">{t('ctaNote')}</p>
                </motion.div>
            </section>

            {/* Thin divider */}
            <div className="max-w-5xl mx-auto border-t border-white/[0.06]" />

            {/* ═══════════════════════════════════════════════════════════
                FINAL CTA — The close
               ═══════════════════════════════════════════════════════════ */}
            <section className="relative px-6 py-24 md:py-36">
                <motion.div
                    className="max-w-3xl mx-auto text-center"
                    variants={sectionFade}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: '-80px' }}
                >
                    <h2 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tight leading-[1.1] mb-6">
                        {t('closeTitle1')}<br /><span className="text-zinc-500">{t('closeTitle2')}</span>
                    </h2>
                    <p className="text-base sm:text-lg text-zinc-400 leading-relaxed max-w-xl mx-auto mb-10">
                        {t('closeDesc')}
                    </p>
                    <button
                        onClick={() => document.getElementById('start-section')?.scrollIntoView({ behavior: 'smooth' })}
                        className="rounded-full bg-white text-black px-10 py-4 font-bold text-base hover:bg-zinc-200 active:scale-[0.97] transition-all duration-150"
                    >{t('startSession')}</button>
                </motion.div>
            </section>

            {/* Footer */}
            <footer className="border-t border-white/[0.06] px-6 py-8">
                <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
                    <p className="text-xs text-zinc-700">
                        {t('footerCopyright', { year: new Date().getFullYear() })}
                    </p>
                    <p className="text-[10px] text-zinc-700 text-center sm:text-right max-w-sm">
                        {t('footerDisclaimer')}
                    </p>
                </div>
            </footer>
        </main>
    );
}

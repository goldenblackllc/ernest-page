'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, MessageCircle, Clock, Shield, Zap, Gift, ArrowRight, Crown } from 'lucide-react';
import Image from 'next/image';

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
    {
        label: "I'm stuck and I don't know why",
        subtext: 'Career paralysis, life transitions, feeling frozen',
        color: 'from-blue-500/20 to-transparent',
    },
    {
        label: "I can't say this out loud to anyone",
        subtext: 'The thing you carry alone',
        color: 'from-purple-500/20 to-transparent',
    },
    {
        label: 'I keep making the same mistake',
        subtext: 'Patterns you can see but can\'t stop',
        color: 'from-amber-500/20 to-transparent',
    },
    {
        label: 'I know what I should do but I can\'t do it',
        subtext: 'The gap between intention and action',
        color: 'from-emerald-500/20 to-transparent',
    },
    {
        label: 'Everyone thinks I\'m fine',
        subtext: 'The high-functioning mask',
        color: 'from-rose-500/20 to-transparent',
    },
];

// ─── How It Works Steps ────────────────────────────────────────────
const STEPS = [
    {
        icon: Zap,
        title: 'Choose your entry point',
        text: 'Pick the thing that\'s on your mind. No intake forms. No waiting rooms. No small talk.',
    },
    {
        icon: MessageCircle,
        title: 'Have the conversation',
        text: 'You\'ll speak with someone who doesn\'t give you the easy answer. They sit in the mess with you until you can see it clearly.',
    },
    {
        icon: Clock,
        title: 'Walk away with clarity',
        text: 'Not a prescription. Not a to-do list. A shift in how you see the problem — which changes everything.',
    },
];

// ─── Component ─────────────────────────────────────────────────────
export default function TherapyShotsPage() {
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
                        <span className="font-bold text-lg text-zinc-100 tracking-tight">Earnest Page</span>
                        <span className="text-zinc-600 text-sm font-medium">/ Clarity Sessions</span>
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
                    >
                        No account. No commitment. Just a conversation.
                    </motion.p>

                    <motion.h1
                        className="text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-black tracking-tight leading-[1.08] mb-8"
                        custom={1}
                        variants={fadeUp}
                        initial="hidden"
                        animate="visible"
                    >
                        You know that thing
                        <br />
                        <span className="text-zinc-500">you keep thinking about</span>
                        <br />
                        at 2am?
                    </motion.h1>

                    <motion.p
                        className="text-base sm:text-lg text-zinc-400 leading-relaxed max-w-2xl mx-auto mb-4"
                        custom={2}
                        variants={fadeUp}
                        initial="hidden"
                        animate="visible"
                    >
                        Talk to someone who won&rsquo;t judge, won&rsquo;t forget what you said
                        ten minutes ago, and won&rsquo;t charge you $200.
                    </motion.p>

                    <motion.p
                        className="text-lg sm:text-xl text-white font-semibold tracking-wide mb-10"
                        custom={3}
                        variants={fadeUp}
                        initial="hidden"
                        animate="visible"
                    >
                        $20. Start right now.
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
                        >
                            Start a Session
                        </button>
                        <button
                            onClick={scrollToCTA}
                            className="rounded-full border border-white/20 bg-transparent text-white px-8 py-4 font-semibold text-base hover:bg-white/10 active:scale-[0.97] transition-all duration-150 flex items-center gap-2"
                        >
                            <Gift className="w-4 h-4" />
                            Gift One to Someone
                        </button>
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
                    <p className="text-[11px] uppercase tracking-[0.3em] text-zinc-600 mb-6">
                        Sound Familiar?
                    </p>
                    <h2 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight leading-[1.1] mb-16">
                        Pick the one that
                        <br />
                        <span className="text-zinc-500">won&rsquo;t leave you alone.</span>
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
                                            &ldquo;{entry.label}&rdquo;
                                        </p>
                                        <p className="text-sm text-zinc-500">
                                            {entry.subtext}
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
                    <p className="text-[11px] uppercase tracking-[0.3em] text-zinc-600 mb-6">
                        The Difference
                    </p>
                    <h2 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight leading-[1.1] mb-10">
                        This is not a chatbot.
                        <br />
                        <span className="text-zinc-500">This is not therapy.</span>
                    </h2>
                    <div className="space-y-6 text-base sm:text-lg text-zinc-400 leading-relaxed">
                        <p>
                            Chatbots validate you. Therapists analyze you. Neither of them will sit in front
                            of you, look at the mess of your life, and tell you the thing you already know
                            but haven&rsquo;t been able to say out loud.
                        </p>
                        <p className="text-zinc-300 font-semibold">
                            This is a conversation with someone who sees the pattern you can&rsquo;t see
                            from the inside.
                        </p>
                        <p>
                            You choose someone you admire &mdash; an archetype built from real psychology,
                            real philosophy, and real lived experience. They don&rsquo;t tell you what to do.
                            They help you see clearly enough to know for yourself.
                        </p>
                    </div>

                    {/* Expandable comparison */}
                    <button
                        onClick={() => setIsComparisonOpen(!isComparisonOpen)}
                        className="mt-10 flex items-center gap-2 text-sm text-zinc-500 hover:text-white transition-colors duration-200"
                    >
                        <span>{isComparisonOpen ? 'Hide comparison' : 'See how this compares'}</span>
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
                    <p className="text-[11px] uppercase tracking-[0.3em] text-zinc-600 mb-6">
                        How It Works
                    </p>
                    <h2 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight leading-[1.1] mb-16">
                        Three steps. Twenty dollars.
                        <br />
                        <span className="text-zinc-500">Zero small talk.</span>
                    </h2>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                        {STEPS.map((step, i) => (
                            <motion.div
                                key={step.title}
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
                                    {step.title}
                                </h3>
                                <p className="text-sm text-zinc-500 leading-relaxed">
                                    {step.text}
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
                    <h2 className="text-3xl sm:text-4xl font-black tracking-tight leading-[1.1] mb-6">
                        What you say stays here.
                    </h2>
                    <p className="text-base sm:text-lg text-zinc-400 leading-relaxed max-w-2xl mx-auto mb-4">
                        No account required. No email. No data sold. Your conversation exists for you,
                        during your session, and nowhere else. When it ends, it ends.
                    </p>
                    <p className="text-sm text-zinc-600">
                        Built by the maker of Earnest Page &mdash; a platform where privacy is the foundation, not the feature.
                    </p>
                </motion.div>
            </section>

            {/* Thin divider */}
            <div className="max-w-5xl mx-auto border-t border-white/[0.06]" />

            {/* ═══════════════════════════════════════════════════════════
                PRICING — The CTA
               ═══════════════════════════════════════════════════════════ */}
            <section id="start-section" className="relative px-6 py-24 md:py-36">
                <motion.div
                    className="max-w-4xl mx-auto"
                    variants={sectionFade}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: '-80px' }}
                >
                    <div className="text-center mb-16">
                        <p className="text-[11px] uppercase tracking-[0.3em] text-zinc-600 mb-6">
                            Start Now
                        </p>
                        <h2 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight leading-[1.1] mb-6">
                            One conversation.
                            <br />
                            <span className="text-zinc-500">No strings attached.</span>
                        </h2>
                    </div>

                    {/* Pricing cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-4xl mx-auto">
                        {/* Single Session */}
                        <motion.div
                            className="group rounded-2xl border-2 border-white/20 bg-zinc-950 p-8 sm:p-10 transition-colors duration-200 hover:border-white/40 relative"
                            custom={0}
                            variants={cardReveal}
                            initial="hidden"
                            whileInView="visible"
                            viewport={{ once: true, margin: '-60px' }}
                        >
                            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                                <span className="text-[10px] uppercase tracking-[0.2em] bg-white text-black px-3 py-1 rounded-full font-bold">
                                    Most Popular
                                </span>
                            </div>
                            <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-600 mb-4">
                                Single Session
                            </p>
                            <div className="flex items-baseline gap-2 mb-2">
                                <span className="text-5xl sm:text-6xl font-black tracking-tight text-white">
                                    $20
                                </span>
                            </div>
                            <p className="text-sm text-zinc-500 leading-relaxed mb-8">
                                One full conversation. Up to 2 hours. No commitment.
                            </p>
                            <button
                                className="w-full rounded-full bg-white text-black py-3.5 text-sm font-bold tracking-wide hover:bg-zinc-200 active:scale-[0.98] transition-all duration-150"
                            >
                                Start Now
                            </button>
                        </motion.div>

                        {/* 3-Pack */}
                        <motion.div
                            className="group rounded-2xl border border-white/[0.08] bg-zinc-950 p-8 sm:p-10 transition-colors duration-200 hover:border-white/20"
                            custom={1}
                            variants={cardReveal}
                            initial="hidden"
                            whileInView="visible"
                            viewport={{ once: true, margin: '-60px' }}
                        >
                            <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-600 mb-4">
                                3-Pack
                            </p>
                            <div className="flex items-baseline gap-2 mb-2">
                                <span className="text-5xl sm:text-6xl font-black tracking-tight text-white">
                                    $50
                                </span>
                            </div>
                            <p className="text-sm text-zinc-500 leading-relaxed mb-8">
                                Three sessions. Use anytime. They remember where you left off.
                            </p>
                            <button
                                className="w-full rounded-full border border-white/20 bg-transparent text-white py-3.5 text-sm font-bold tracking-wide hover:bg-white hover:text-black active:scale-[0.98] transition-all duration-150"
                            >
                                Get 3 Sessions
                            </button>
                        </motion.div>

                        {/* Gift */}
                        <motion.div
                            className="group rounded-2xl border border-white/[0.08] bg-zinc-950 p-8 sm:p-10 transition-colors duration-200 hover:border-white/20"
                            custom={2}
                            variants={cardReveal}
                            initial="hidden"
                            whileInView="visible"
                            viewport={{ once: true, margin: '-60px' }}
                        >
                            <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-600 mb-4">
                                Gift a Session
                            </p>
                            <div className="flex items-baseline gap-2 mb-2">
                                <span className="text-5xl sm:text-6xl font-black tracking-tight text-white">
                                    $20
                                </span>
                            </div>
                            <p className="text-sm text-zinc-500 leading-relaxed mb-8">
                                For the person who needs this but would never seek it out themselves.
                            </p>
                            <button
                                className="w-full rounded-full border border-white/20 bg-transparent text-white py-3.5 text-sm font-bold tracking-wide hover:bg-white hover:text-black active:scale-[0.98] transition-all duration-150 flex items-center justify-center gap-2"
                            >
                                <Gift className="w-4 h-4" />
                                Send a Gift
                            </button>
                        </motion.div>
                    </div>

                    {/* Archangel — Price anchor / premium tier */}
                    <motion.div
                        className="mt-5 max-w-4xl mx-auto rounded-2xl border border-amber-800/30 bg-gradient-to-br from-zinc-950 via-zinc-950 to-amber-950/10 p-8 sm:p-10 transition-colors duration-200 hover:border-amber-700/50"
                        custom={3}
                        variants={cardReveal}
                        initial="hidden"
                        whileInView="visible"
                        viewport={{ once: true, margin: '-60px' }}
                    >
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
                            <div className="flex-1">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-800/30 flex items-center justify-center">
                                        <Crown className="w-5 h-5 text-amber-500" />
                                    </div>
                                    <div>
                                        <p className="text-[10px] uppercase tracking-[0.25em] text-amber-600/80 font-bold">
                                            For the Architect of Their Day
                                        </p>
                                        <h3 className="text-lg font-bold tracking-tight text-white">
                                            The Archangel Program
                                        </h3>
                                    </div>
                                </div>
                                <p className="text-sm text-zinc-500 leading-relaxed max-w-lg">
                                    All sessions included for 30 days. Up to 5 per day.
                                    No per-session fees, no counting credits. For the person who doesn&rsquo;t want to think about whether it&rsquo;s
                                    &ldquo;worth another $20.&rdquo; It always is.
                                </p>
                            </div>
                            <div className="flex flex-col items-end gap-3 shrink-0">
                                <div>
                                    <span className="text-4xl sm:text-5xl font-black tracking-tight text-white">
                                        $499
                                    </span>
                                    <span className="text-sm text-zinc-600 ml-1">/month</span>
                                </div>
                                <button
                                    className="rounded-full border border-amber-800/40 text-white px-6 py-3 text-sm font-bold tracking-wide hover:bg-amber-900/20 hover:border-amber-700/50 active:scale-[0.98] transition-all duration-150"
                                >
                                    Go All-In
                                </button>
                            </div>
                        </div>
                    </motion.div>

                    {/* Bottom reassurance */}
                    <motion.p
                        className="text-center text-sm text-zinc-600 mt-10"
                        custom={4}
                        variants={cardReveal}
                        initial="hidden"
                        whileInView="visible"
                        viewport={{ once: true }}
                    >
                        Secure payment via Stripe. No account required. No subscription. No data stored after your session.
                    </motion.p>
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
                        The thing you keep carrying
                        <br />
                        <span className="text-zinc-500">doesn&rsquo;t have to stay invisible.</span>
                    </h2>
                    <p className="text-base sm:text-lg text-zinc-400 leading-relaxed max-w-xl mx-auto mb-10">
                        Twenty dollars. One conversation. No one has to know.
                    </p>
                    <button
                        onClick={() => document.getElementById('start-section')?.scrollIntoView({ behavior: 'smooth' })}
                        className="rounded-full bg-white text-black px-10 py-4 font-bold text-base hover:bg-zinc-200 active:scale-[0.97] transition-all duration-150"
                    >
                        Start a Session
                    </button>
                </motion.div>
            </section>

            {/* Footer */}
            <footer className="border-t border-white/[0.06] px-6 py-8">
                <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
                    <p className="text-xs text-zinc-700">
                        &copy; {new Date().getFullYear()} Earnest Page. All rights reserved.
                    </p>
                    <p className="text-[10px] text-zinc-700 text-center sm:text-right max-w-sm">
                        Clarity Sessions are not a substitute for licensed therapy or psychiatric care.
                        If you are in crisis, please contact the 988 Suicide &amp; Crisis Lifeline.
                    </p>
                </div>
            </footer>
        </main>
    );
}

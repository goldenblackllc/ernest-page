'use client';

import { useState, useCallback } from 'react';
import { signInWithCustomToken } from 'firebase/auth';
import { auth } from '@/lib/firebase/config';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Lock, BarChart3, Target, Shield, Award } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

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

const sectionFade = {
    hidden: { opacity: 0, y: 40 },
    visible: {
        opacity: 1,
        y: 0,
        transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const },
    },
};

// ─── Mechanics Data ────────────────────────────────────────────────
const MECHANICS = [
    {
        icon: Lock,
        title: 'The Blueprint',
        text: 'You do not rent your principles. You define your highest standard—your Character Bible—and lock it in. This is the immutable baseline you will answer to every single day.',
    },
    {
        icon: Target,
        title: 'The Friction Audit',
        text: 'When you fail to execute, the system does not rely on brute-force guilt. It initiates a Friction Audit. The engine diagnoses whether you are facing resistance or a flawed strategy, instantly scaling your goal down to a frictionless micro-action to force immediate physical momentum.',
    },
    {
        icon: BarChart3,
        title: 'The Ledger',
        text: 'A silent, stark, data-driven vault of your execution. When doubt sets in, the system pulls from your own history, proving with hard data that you have navigated this exact friction before and won.',
    },
];

// ─── Component ─────────────────────────────────────────────────────
export function LandingPage() {
    const [phoneNumber, setPhoneNumber] = useState('');
    const [verificationCode, setVerificationCode] = useState('');
    const [isArchitectExpanded, setIsArchitectExpanded] = useState(false);
    const [step, setStep] = useState<'WELCOME' | 'INPUT_CODE'>('WELCOME');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [detectedDialCode] = useState(() => getDefaultDialCode());
    const router = useRouter();

    const handleSendCode = async () => {
        setError(null);
        if (!phoneNumber) {
            setError('Please enter a phone number.');
            return;
        }
        const normalized = normalizePhoneNumber(phoneNumber);
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
            console.error('Error sending code:', err);
            setError('Failed to send code. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleVerifyCode = async () => {
        setError(null);
        if (!verificationCode) return;
        const normalized = normalizePhoneNumber(phoneNumber);
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
            router.push('/');
        } catch {
            setError('Invalid code. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const displayNumber = phoneNumber ? normalizePhoneNumber(phoneNumber) : '';

    const scrollToAuth = () => {
        document.getElementById('auth-section')?.scrollIntoView({ behavior: 'smooth' });
    };

    return (
        <main className="min-h-screen bg-black text-white scroll-smooth">

            {/* ── STICKY TOP NAV ── */}
            <nav className="fixed top-0 w-full z-50 backdrop-blur-md bg-black/80 border-b border-white/[0.06]">
                <div className="max-w-5xl mx-auto flex items-center justify-between px-6 py-3">
                    <span className="font-bold text-lg text-zinc-100 tracking-tight">Earnest Page</span>
                    <button
                        onClick={scrollToAuth}
                        className="rounded-full bg-white text-black px-5 py-2 text-sm font-semibold hover:bg-zinc-200 active:scale-[0.97] transition-all duration-150"
                    >
                        Log In
                    </button>
                </div>
            </nav>

            {/* ═══════════════════════════════════════════════════════════
                HERO — "The standard you walk past..."
               ═══════════════════════════════════════════════════════════ */}
            <section className="relative min-h-screen flex flex-col items-center justify-center px-6 text-center overflow-hidden">
                <div className="relative z-10 max-w-3xl mx-auto">
                    <motion.p
                        className="text-[11px] sm:text-xs uppercase tracking-[0.3em] text-zinc-500 mb-8"
                        custom={0}
                        variants={fadeUp}
                        initial="hidden"
                        animate="visible"
                    >
                        Your daily execution engine
                    </motion.p>

                    <motion.h1
                        className="text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-black tracking-tight leading-[1.08] mb-8"
                        custom={1}
                        variants={fadeUp}
                        initial="hidden"
                        animate="visible"
                    >
                        The standard you walk past
                        <br />
                        is the standard you accept.
                    </motion.h1>

                    <motion.p
                        className="text-base sm:text-lg text-zinc-400 leading-relaxed max-w-2xl mx-auto mb-4"
                        custom={2}
                        variants={fadeUp}
                        initial="hidden"
                        animate="visible"
                    >
                        Earnest Page is your daily execution engine. Define your highest standard,
                        consult your Ideal Self, and force immediate action. Stop reacting to circumstances.
                    </motion.p>

                    <motion.p
                        className="text-sm sm:text-base text-white font-semibold tracking-wide mb-10"
                        custom={3}
                        variants={fadeUp}
                        initial="hidden"
                        animate="visible"
                    >
                        Accountability is not optional.
                    </motion.p>

                    <motion.div
                        custom={4}
                        variants={fadeUp}
                        initial="hidden"
                        animate="visible"
                    >
                        <button
                            onClick={scrollToAuth}
                            className="rounded-full bg-white text-black px-10 py-4 font-bold text-base hover:bg-zinc-200 active:scale-[0.97] transition-all duration-150"
                        >
                            Start Commanding
                        </button>
                    </motion.div>
                </div>

                {/* Interface mockup peeking from bottom */}
                <motion.div
                    className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[280px] sm:w-[320px] md:w-[360px]"
                    initial={{ opacity: 0, y: 80 }}
                    animate={{ opacity: 1, y: 20 }}
                    transition={{ delay: 0.8, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                >
                    <div className="relative rounded-t-3xl overflow-hidden border border-white/10 border-b-0 shadow-2xl shadow-white/[0.03]">
                        <Image
                            src="/img/hero-mockup.png"
                            alt="Earnest Page interface"
                            width={360}
                            height={640}
                            className="w-full h-auto"
                            priority
                        />
                        {/* Fade-to-black gradient at the bottom */}
                        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black to-transparent" />
                    </div>
                </motion.div>

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
                SECTION 1 — THE ARCHITECTURE
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
                        The Architecture
                    </p>
                    <h2 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight leading-[1.1] mb-10">
                        An Intentional Investment
                        <br />
                        <span className="text-zinc-500">for Your Mind.</span>
                    </h2>
                    <div className="space-y-6 text-base sm:text-lg text-zinc-400 leading-relaxed">
                        <p>
                            Most of your day is spent on a high-end autopilot. The market is flooded with
                            cheap, $15‑a‑month productivity apps that give you permission to quit the
                            moment things get difficult. We reject the short-term trap.
                        </p>
                        <p className="text-zinc-300">
                            Earnest Page is not a digital diary. It is a masterfully crafted, uncompromising
                            Executive Command Center. It is an everyday necessity for those who refuse to
                            compromise, engineered to strip away your excuses and hand you absolute control
                            over your daily ritual.
                        </p>
                    </div>
                </motion.div>
            </section>

            {/* Thin divider */}
            <div className="max-w-5xl mx-auto border-t border-white/[0.06]" />

            {/* ═══════════════════════════════════════════════════════════
                SECTION — THE ARCHITECT (Founder's Letter)
               ═══════════════════════════════════════════════════════════ */}
            <section className="relative px-6 py-24 md:py-36">
                {/* Woodcut portrait — atmospheric, blended into dark bg */}
                <motion.div
                    className="relative w-full max-w-sm mx-auto mb-16"
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
                    viewport={{ once: true, margin: '-40px' }}
                >
                    <Image
                        src="/woodcutman.jpeg"
                        alt="Earnest Page"
                        width={800}
                        height={500}
                        className="w-full h-auto"
                        style={{
                            mixBlendMode: 'luminosity',
                            opacity: 0.6,
                            maskImage: 'radial-gradient(ellipse at center, black 30%, transparent 70%)',
                            WebkitMaskImage: 'radial-gradient(ellipse at center, black 30%, transparent 70%)',
                            filter: 'invert(1)',
                        }}
                    />
                </motion.div>

                <motion.div
                    className="max-w-3xl mx-auto"
                    variants={sectionFade}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: '-80px' }}
                >
                    <p className="text-[11px] uppercase tracking-[0.3em] text-zinc-600 mb-6">
                        The Architect
                    </p>
                    <h2 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight leading-[1.1] mb-10">
                        I Built This Because
                        <br />
                        <span className="text-zinc-500">Nothing Else Was Honest Enough.</span>
                    </h2>

                    {/* Hook paragraph */}
                    <p className="text-base sm:text-lg text-zinc-400 leading-relaxed mb-10">
                        I almost became a doctor. Instead, I became an engineer with a doctor&rsquo;s
                        instinct&mdash;someone who builds technology but thinks about people first.
                    </p>

                    {/* Credential badges */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-10">
                        {[
                            { label: 'Harvard', detail: 'Patent Holder' },
                            { label: 'RSA', detail: 'Security Architect' },
                            { label: 'JSA Financial', detail: '$10M / yr Founder' },
                        ].map((cred, i) => (
                            <motion.div
                                key={cred.label}
                                className="rounded-xl border border-white/[0.08] bg-zinc-950 px-5 py-4 text-center"
                                custom={i}
                                variants={cardReveal}
                                initial="hidden"
                                whileInView="visible"
                                viewport={{ once: true, margin: '-40px' }}
                            >
                                <div className="flex items-center justify-center gap-2 mb-1">
                                    <Award className="w-3.5 h-3.5 text-zinc-500" />
                                    <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-semibold">
                                        {cred.label}
                                    </span>
                                </div>
                                <span className="text-sm text-zinc-300 font-semibold">
                                    {cred.detail}
                                </span>
                            </motion.div>
                        ))}
                    </div>

                    {/* Expandable full story */}
                    <AnimatePresence initial={false}>
                        {isArchitectExpanded && (
                            <motion.div
                                key="architect-story"
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                                className="overflow-hidden"
                            >
                                <div className="border-l-2 border-zinc-800 pl-6 space-y-6 text-base sm:text-lg text-zinc-400 leading-relaxed mb-8">
                                    <p>
                                        I built Harvard&rsquo;s first internet banking system and received a patent
                                        for it. I architected security for world governments at RSA. I
                                        founded JSA Financial Systems twenty-six years ago&mdash;today it
                                        generates $10M annually. Every product I&rsquo;ve shipped has succeeded
                                        for the same reason: I build for people who hate technology.
                                    </p>
                                    <p>
                                        But professionally, I was performing. Privately, I was falling apart.
                                    </p>
                                    <p>
                                        I spent decades pressure-testing every major framework for the
                                        human mind. Cognitive Behavioral Therapy. Dialectical Behavior
                                        Therapy. Byron Katie. Buddhist practice. I checked into the
                                        Pavilion at McLean Hospital&mdash;Harvard&rsquo;s most intensive
                                        psychiatric program&mdash;and worked with some of the finest
                                        clinicians in the world. They told me I was one of the strongest
                                        practitioners of CBT they had ever trained. Some asked me for
                                        guidance after I left.
                                    </p>
                                    <p>
                                        Those systems were real. They gave me structure. But none of them
                                        were complete.
                                    </p>
                                    <p>
                                        I kept searching until I found a system that was. One that
                                        synthesized everything I had learned into a single, executable
                                        framework&mdash;structured enough for an engineer, intuitive
                                        enough for anyone willing to do the work.
                                    </p>
                                    <p>
                                        There was one problem: sharing it. The cognitive load was enormous.
                                        People could agree with the principles but struggled to apply them
                                        daily. That gap&mdash;between understanding and
                                        execution&mdash;is the gap this product closes.
                                    </p>
                                    <p className="text-zinc-300 font-semibold">
                                        Earnest Page is not my first product. It may be my most important.
                                    </p>
                                </div>

                                {/* Attribution */}
                                <p className="text-[11px] text-zinc-600 font-mono tracking-wide">
                                    David Johnson&ensp;·&ensp;Founder&ensp;·&ensp;Patent Holder&ensp;·&ensp;26 Years Building Systems That Work
                                </p>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Toggle */}
                    <button
                        onClick={() => setIsArchitectExpanded((prev) => !prev)}
                        className="mt-8 flex items-center gap-2 text-sm text-zinc-500 hover:text-white transition-colors duration-200 group"
                    >
                        <span>{isArchitectExpanded ? 'Collapse' : 'Read the Full Story'}</span>
                        <motion.span
                            animate={{ rotate: isArchitectExpanded ? 180 : 0 }}
                            transition={{ duration: 0.3 }}
                        >
                            <ChevronDown className="w-4 h-4" />
                        </motion.span>
                    </button>
                </motion.div>
            </section>

            {/* Thin divider */}
            <div className="max-w-5xl mx-auto border-t border-white/[0.06]" />

            {/* ═══════════════════════════════════════════════════════════
                SECTION 2 — THE MECHANICS (3 Cards)
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
                        The Mechanics
                    </p>
                    <h2 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight leading-[1.1] mb-16">
                        How the Engine Runs
                    </h2>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                        {MECHANICS.map((item, i) => (
                            <motion.div
                                key={item.title}
                                className="group relative rounded-2xl border border-white/[0.08] bg-zinc-950 p-8 transition-colors duration-200 hover:border-white/20 hover:bg-zinc-900/60"
                                custom={i}
                                variants={cardReveal}
                                initial="hidden"
                                whileInView="visible"
                                viewport={{ once: true, margin: '-60px' }}
                            >
                                <div className="w-10 h-10 rounded-xl bg-white/[0.06] flex items-center justify-center mb-6">
                                    <item.icon className="w-5 h-5 text-zinc-300" />
                                </div>
                                <h3 className="text-lg font-bold tracking-tight text-white mb-3">
                                    {item.title}
                                </h3>
                                <p className="text-sm text-zinc-500 leading-relaxed">
                                    {item.text}
                                </p>
                            </motion.div>
                        ))}
                    </div>
                </motion.div>
            </section>

            {/* Thin divider */}
            <div className="max-w-5xl mx-auto border-t border-white/[0.06]" />

            {/* ═══════════════════════════════════════════════════════════
                SECTION 3 — THE FIREWALL
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
                        The Firewall
                    </p>
                    <h2 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight leading-[1.1] mb-10">
                        The Bouncer at the Door.
                    </h2>

                    {/* Blurred "Dear Earnest" preview */}
                    <div className="relative rounded-2xl border border-white/[0.08] bg-zinc-950 p-6 sm:p-8 mb-10 overflow-hidden">
                        <div className="blur-[6px] select-none pointer-events-none space-y-4">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-zinc-800" />
                                <div className="space-y-1">
                                    <div className="h-3 w-24 bg-zinc-700 rounded" />
                                    <div className="h-2 w-16 bg-zinc-800 rounded" />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <div className="h-3 w-full bg-zinc-800 rounded" />
                                <div className="h-3 w-5/6 bg-zinc-800 rounded" />
                                <div className="h-3 w-3/4 bg-zinc-800 rounded" />
                            </div>
                            <div className="border-t border-white/5 pt-4 flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-zinc-800" />
                                <div className="space-y-1">
                                    <div className="h-3 w-20 bg-zinc-700 rounded" />
                                    <div className="h-2 w-14 bg-zinc-800 rounded" />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <div className="h-3 w-full bg-zinc-800 rounded" />
                                <div className="h-3 w-4/5 bg-zinc-800 rounded" />
                            </div>
                        </div>
                        {/* Shield overlay */}
                        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                            <div className="flex flex-col items-center gap-2">
                                <Shield className="w-8 h-8 text-zinc-500" />
                                <span className="text-[10px] uppercase tracking-[0.25em] text-zinc-500 font-semibold">
                                    Dear Earnest Feed
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-6 text-base sm:text-lg text-zinc-400 leading-relaxed">
                        <p>
                            You are not paying for a human coach; you are paying to access a radically
                            curated, heavily fenced network of peers who refuse to settle.
                        </p>
                        <p>
                            Through a strict Contact Firewall and geographical inversion, real tensions are
                            stripped of identifying fingerprints and published to the &ldquo;Dear Earnest&rdquo;
                            feed. It provides a raw, sanitized view of reality that proves you are not fighting
                            alone. The steep barrier to entry ensures this network remains pristine.
                        </p>
                        <p className="text-zinc-300 font-semibold">
                            Only those with true skin in the game make it inside.
                        </p>
                    </div>
                </motion.div>
            </section>

            {/* Thin divider */}
            <div className="max-w-5xl mx-auto border-t border-white/[0.06]" />

            {/* ═══════════════════════════════════════════════════════════
                SECTION 4 — THE TOLLBOOTH (Pricing)
               ═══════════════════════════════════════════════════════════ */}
            <section className="relative px-6 py-24 md:py-36">
                <motion.div
                    className="max-w-4xl mx-auto"
                    variants={sectionFade}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: '-80px' }}
                >
                    <p className="text-[11px] uppercase tracking-[0.3em] text-zinc-600 mb-6">
                        The Tollbooth
                    </p>
                    <h2 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight leading-[1.1] mb-6">
                        Demand a Better Life.
                    </h2>
                    <p className="text-base sm:text-lg text-zinc-400 leading-relaxed max-w-2xl mb-6">
                        Earnest Page is not another app you forget about. It is an intentional
                        investment for someone who refuses to compromise. We ground this in
                        undeniable math: securing your standard costs less than the fallout
                        from a blown opportunity, a derailed week, or a life lived reacting to
                        circumstances.
                    </p>
                    <p className="text-base sm:text-lg text-zinc-300 font-semibold mb-16">
                        At $4 a day, this is a highly rational decision to permanently
                        secure your standard.
                    </p>

                    {/* Pricing cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        {/* The Proving Ground */}
                        <motion.div
                            className="group rounded-2xl border border-white/[0.08] bg-zinc-950 p-8 sm:p-10 transition-colors duration-200 hover:border-white/20"
                            custom={0}
                            variants={cardReveal}
                            initial="hidden"
                            whileInView="visible"
                            viewport={{ once: true, margin: '-60px' }}
                        >
                            <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-600 mb-4">
                                30 Days
                            </p>
                            <h3 className="text-xl sm:text-2xl font-bold tracking-tight text-white mb-2">
                                The Proving Ground
                            </h3>
                            <div className="flex items-baseline gap-2 mb-6">
                                <span className="text-4xl sm:text-5xl font-black tracking-tight text-white">
                                    $120
                                </span>
                                <span className="text-sm text-zinc-600">/ 30 days</span>
                            </div>
                            <p className="text-sm text-zinc-500 leading-relaxed mb-8">
                                30 days to prove you mean it. No extensions.
                            </p>
                            <button
                                onClick={scrollToAuth}
                                className="w-full rounded-full bg-white text-black py-3.5 text-sm font-bold tracking-wide hover:bg-zinc-200 active:scale-[0.98] transition-all duration-150"
                            >
                                Enter the Proving Ground
                            </button>
                        </motion.div>

                        {/* The Long Game */}
                        <motion.div
                            className="group rounded-2xl border border-white/[0.08] bg-zinc-950 p-8 sm:p-10 transition-colors duration-200 hover:border-white/20"
                            custom={1}
                            variants={cardReveal}
                            initial="hidden"
                            whileInView="visible"
                            viewport={{ once: true, margin: '-60px' }}
                        >
                            <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-600 mb-4">
                                1 Year
                            </p>
                            <h3 className="text-xl sm:text-2xl font-bold tracking-tight text-white mb-2">
                                The Long Game
                            </h3>
                            <div className="flex items-baseline gap-2 mb-6">
                                <span className="text-4xl sm:text-5xl font-black tracking-tight text-white">
                                    $1,200
                                </span>
                                <span className="text-sm text-zinc-600">/ 1 year</span>
                            </div>
                            <p className="text-sm text-zinc-500 leading-relaxed mb-8">
                                You already proved it. Now build the compound effect.
                            </p>
                            <button
                                onClick={scrollToAuth}
                                className="w-full rounded-full border border-white/20 bg-transparent text-white py-3.5 text-sm font-bold tracking-wide hover:bg-white hover:text-black active:scale-[0.98] transition-all duration-150"
                            >
                                Lock In the Long Game
                            </button>
                        </motion.div>
                    </div>
                </motion.div>
            </section>

            {/* Thin divider */}
            <div className="max-w-5xl mx-auto border-t border-white/[0.06]" />

            {/* ═══════════════════════════════════════════════════════════
                AUTH CARD
               ═══════════════════════════════════════════════════════════ */}
            <section id="auth-section" className="relative px-6 py-24 md:py-32">
                <motion.div
                    className="max-w-md mx-auto rounded-2xl border border-white/[0.08] bg-zinc-950 p-8 sm:p-10"
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
                            Accountability is not optional.
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
                                    className="w-full bg-zinc-900/80 border border-white/10 pl-12 pr-4 py-3.5 text-base text-white placeholder-zinc-600 rounded-xl focus:border-zinc-500 transition-all duration-150"
                                />
                            </div>
                            <button
                                onClick={handleSendCode}
                                disabled={loading}
                                className="w-full bg-white text-black py-3.5 text-sm font-bold tracking-wide rounded-full hover:bg-zinc-200 active:scale-[0.98] transition-all duration-150 disabled:opacity-50 disabled:hover:bg-white"
                            >
                                {loading ? 'Sending...' : 'Continue'}
                            </button>

                            <p className="text-[10px] text-zinc-600 text-center mt-3 leading-relaxed">
                                By continuing, you agree to our{' '}
                                <Link href="/terms" className="underline hover:text-zinc-400 transition-colors">
                                    Terms of Service
                                </Link>{' '}
                                and{' '}
                                <Link href="/privacy" className="underline hover:text-zinc-400 transition-colors">
                                    Privacy Policy
                                </Link>.
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
                                inputMode="numeric"
                                autoComplete="one-time-code"
                                placeholder="000000"
                                value={verificationCode}
                                onChange={(e) => setVerificationCode(e.target.value)}
                                className="w-full bg-zinc-900/80 border border-white/10 px-4 py-3.5 text-lg text-white text-center tracking-[0.5em] placeholder-zinc-700 rounded-xl focus:border-zinc-500 transition-all duration-150"
                                maxLength={6}
                                autoFocus
                            />
                            <button
                                onClick={handleVerifyCode}
                                disabled={loading || verificationCode.length < 6}
                                className="w-full bg-white text-black py-3.5 text-sm font-bold tracking-wide rounded-full hover:bg-zinc-200 active:scale-[0.98] transition-all duration-150 disabled:opacity-50 disabled:hover:bg-white"
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

            {/* ── FOOTER ── */}
            <footer className="border-t border-white/[0.06] px-6 py-10">
                <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-zinc-600">
                    <span>© {new Date().getFullYear()} Earnest Page. All rights reserved.</span>
                    <div className="flex items-center gap-4">
                        <Link href="/terms" className="hover:text-zinc-400 transition-colors">Terms</Link>
                        <Link href="/privacy" className="hover:text-zinc-400 transition-colors">Privacy</Link>
                        <Link href="/acceptable-use" className="hover:text-zinc-400 transition-colors">Acceptable Use</Link>
                    </div>
                </div>
            </footer>
        </main>
    );
}

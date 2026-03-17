'use client';

import { useState, useEffect, useCallback, useRef, DragEvent } from 'react';
import { useAuth } from '@/lib/auth/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, ShieldCheck, Lock, Plus, Upload, X, FileText } from 'lucide-react';
import { updateCharacterProfile } from '@/lib/firebase/character';
import { cn } from '@/lib/utils';
import {
    normalizePhoneNumber,
    hashPhoneNumber,
    syncFirewallHashes,
    parseContactFile,
} from '@/lib/security/contactFirewall';
import { useTranslations } from 'next-intl';

// ─── Types ─────────────────────────────────────────────────────────
interface ContactFirewallProps {
    onComplete: () => void;
}

type FirewallState = 'idle' | 'processing' | 'success' | 'error';
type ActiveTab = 'precision' | 'bulk';

interface TargetRow {
    phone: string;
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

// ─── Component ─────────────────────────────────────────────────────
export function ContactFirewall({ onComplete }: ContactFirewallProps) {
    const { user } = useAuth();
    const [state, setState] = useState<FirewallState>('idle');
    const [activeTab, setActiveTab] = useState<ActiveTab>('precision');
    const [hashCount, setHashCount] = useState(0);
    const [finalCount, setFinalCount] = useState(0);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const counterRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const t = useTranslations('contactFirewall');

    // Precision Targeting State
    const [targets, setTargets] = useState<TargetRow[]>([
        { phone: '' },
        { phone: '' },
        { phone: '' },
    ]);

    // Bulk Isolation State
    const [isDragging, setIsDragging] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Clean up counter on unmount
    useEffect(() => {
        return () => {
            if (counterRef.current) clearInterval(counterRef.current);
        };
    }, []);

    // ── Counter animation ──
    const startCounterAnimation = useCallback((target: number) => {
        let current = 0;
        const step = Math.max(1, Math.floor(target / 40));
        counterRef.current = setInterval(() => {
            current += step + Math.floor(Math.random() * step);
            if (current >= target) {
                current = target;
                if (counterRef.current) clearInterval(counterRef.current);
            }
            setHashCount(current);
        }, 60);
    }, []);

    // ── Core hashing engine ──
    const processNumbers = useCallback(async (rawNumbers: string[]) => {
        if (!user) return;

        setState('processing');
        setHashCount(0);
        setErrorMsg(null);

        startCounterAnimation(rawNumbers.length);

        try {
            const hashes: string[] = [];
            for (const raw of rawNumbers) {
                try {
                    const normalized = normalizePhoneNumber(raw);
                    const hash = await hashPhoneNumber(normalized);
                    hashes.push(hash);
                } catch { /* skip invalid */ }
            }

            const unique = [...new Set(hashes)];
            await syncFirewallHashes(user.uid, unique);
            await updateCharacterProfile(user.uid, { firewall_synced: true });

            if (counterRef.current) clearInterval(counterRef.current);
            setHashCount(unique.length);
            setFinalCount(unique.length);
            setState('success');
        } catch (err) {
            if (counterRef.current) clearInterval(counterRef.current);
            setState('error');
            setErrorMsg(err instanceof Error ? err.message : 'An unexpected error occurred.');
        }
    }, [user, startCounterAnimation]);

    // ── Precision Targeting ──
    const handleUpdateTarget = (index: number, value: string) => {
        setTargets(prev => {
            const next = [...prev];
            next[index] = { phone: value };
            return next;
        });
    };

    const handleAddTarget = () => {
        setTargets(prev => [...prev, { phone: '' }]);
    };

    const handleRemoveTarget = (index: number) => {
        if (targets.length <= 1) return;
        setTargets(prev => prev.filter((_, i) => i !== index));
    };

    const handleLockPerimeter = () => {
        const phones = targets
            .map(t => t.phone.trim())
            .filter(p => p.length > 0);

        if (phones.length === 0) {
            setErrorMsg('Enter at least one phone number.');
            setState('error');
            return;
        }

        processNumbers(phones);
    };

    // ── Bulk Isolation ──
    const handleFileSelect = async (file: File) => {
        setSelectedFile(file);
        try {
            const numbers = await parseContactFile(file);
            if (numbers.length === 0) {
                setErrorMsg('No phone numbers found in this file. Check the format.');
                setState('error');
                return;
            }
            processNumbers(numbers);
        } catch (err) {
            setErrorMsg(err instanceof Error ? err.message : 'Failed to parse file.');
            setState('error');
        }
    };

    const handleDrop = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) handleFileSelect(file);
    };

    const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = () => setIsDragging(false);

    const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) handleFileSelect(file);
    };

    // ── Skip / Enter ──
    const handleSkip = useCallback(async () => {
        if (!user) return;
        await updateCharacterProfile(user.uid, { firewall_synced: true });
        onComplete();
    }, [user, onComplete]);

    const handleEnter = useCallback(() => {
        onComplete();
    }, [onComplete]);

    return (
        <main className="min-h-screen bg-black text-white flex flex-col items-center justify-start px-5 py-16 sm:py-24">
            <div className="w-full max-w-2xl mx-auto">

                {/* ── HEADER ── */}
                <motion.div
                    className="mb-14 sm:mb-18"
                    custom={0}
                    variants={fadeUp}
                    initial="hidden"
                    animate="visible"
                >
                    <div className="flex items-center gap-2 mb-6">
                        <Shield className="w-4 h-4 text-zinc-600" />
                        <span className="text-[10px] uppercase tracking-[0.3em] text-zinc-600 font-semibold">
                            {t('protocolTitle')}
                        </span>
                    </div>
                    <h1 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight leading-[1.08] mb-6">
                        {t('title')}
                    </h1>
                    <p className="text-base sm:text-lg text-zinc-400 leading-relaxed max-w-xl">
                        {t('desc')}
                    </p>
                </motion.div>

                {/* ── TRUST CARD ── */}
                <motion.div
                    className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6 sm:p-8 mb-10 sm:mb-14"
                    custom={1}
                    variants={fadeUp}
                    initial="hidden"
                    animate="visible"
                >
                    <div className="flex items-start gap-4">
                        <Lock className="w-5 h-5 text-zinc-600 mt-0.5 shrink-0" />
                        <p className="text-sm sm:text-[15px] text-zinc-400 leading-relaxed">
                            {t('trustDesc')}
                        </p>
                    </div>
                </motion.div>

                {/* ── ACTION ZONE ── */}
                <motion.div
                    custom={2}
                    variants={fadeUp}
                    initial="hidden"
                    animate="visible"
                >
                    <AnimatePresence mode="wait">

                        {/* ── IDLE STATE ── */}
                        {state === 'idle' && (
                            <motion.div
                                key="idle"
                                initial={{ opacity: 0, y: 12 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -12 }}
                                transition={{ duration: 0.3 }}
                                className="w-full"
                            >
                                {/* TAB SWITCHER */}
                                <div className="flex items-center rounded-full bg-zinc-900 border border-zinc-800 p-1 mb-8">
                                    <button
                                        onClick={() => setActiveTab('precision')}
                                        className={cn(
                                            "flex-1 py-2.5 px-4 rounded-full text-xs font-bold uppercase tracking-[0.15em] transition-all duration-200",
                                            activeTab === 'precision'
                                                ? "bg-white text-black shadow-lg"
                                                : "text-zinc-500 hover:text-zinc-300"
                                        )}
                                    >
                                        {t('precisionTargeting')}
                                    </button>
                                    <button
                                        onClick={() => setActiveTab('bulk')}
                                        className={cn(
                                            "flex-1 py-2.5 px-4 rounded-full text-xs font-bold uppercase tracking-[0.15em] transition-all duration-200",
                                            activeTab === 'bulk'
                                                ? "bg-white text-black shadow-lg"
                                                : "text-zinc-500 hover:text-zinc-300"
                                        )}
                                    >
                                        {t('bulkIsolation')}
                                    </button>
                                </div>

                                <AnimatePresence mode="wait">

                                    {/* ══ TAB A: PRECISION TARGETING ══ */}
                                    {activeTab === 'precision' && (
                                        <motion.div
                                            key="precision"
                                            initial={{ opacity: 0, x: -12 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            exit={{ opacity: 0, x: 12 }}
                                            transition={{ duration: 0.2 }}
                                        >
                                            <h2 className="text-lg sm:text-xl font-bold text-white mb-2">
                                                {t('precisionTitle')}
                                            </h2>
                                            <p className="text-sm text-zinc-500 mb-8 leading-relaxed">
                                                {t('precisionDesc')}
                                            </p>

                                            {/* Input Rows */}
                                            <div className="space-y-3 mb-6">
                                                {targets.map((target, i) => (
                                                    <div key={i} className="flex items-center gap-2">
                                                        <input
                                                            type="tel"
                                                            placeholder={t('phoneNumber')}
                                                            value={target.phone}
                                                            onChange={e => handleUpdateTarget(i, e.target.value)}
                                                            className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors font-mono"
                                                        />
                                                        {targets.length > 1 && (
                                                            <button
                                                                onClick={() => handleRemoveTarget(i)}
                                                                className="p-2 text-zinc-700 hover:text-zinc-400 transition-colors shrink-0"
                                                            >
                                                                <X className="w-4 h-4" />
                                                            </button>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>

                                            {/* Add another */}
                                            <button
                                                onClick={handleAddTarget}
                                                className="flex items-center gap-2 text-xs text-zinc-600 hover:text-zinc-300 transition-colors mb-10 font-medium"
                                            >
                                                <Plus className="w-3.5 h-3.5" />
                                                {t('addAnotherTarget')}
                                            </button>

                                            {/* Primary Action */}
                                            <button
                                                onClick={handleLockPerimeter}
                                                className="w-full py-4 px-8 rounded-full bg-white text-black font-bold text-base tracking-tight
                                                           hover:bg-zinc-200 active:scale-[0.98] transition-all duration-150"
                                            >
                                                {t('lockPerimeter')}
                                            </button>
                                        </motion.div>
                                    )}

                                    {/* ══ TAB B: BULK ISOLATION ══ */}
                                    {activeTab === 'bulk' && (
                                        <motion.div
                                            key="bulk"
                                            initial={{ opacity: 0, x: 12 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            exit={{ opacity: 0, x: -12 }}
                                            transition={{ duration: 0.2 }}
                                        >
                                            <h2 className="text-lg sm:text-xl font-bold text-white mb-2">
                                                {t('bulkTitle')}
                                            </h2>
                                            <p className="text-sm text-zinc-500 mb-8 leading-relaxed">
                                                {t('bulkDesc')}
                                            </p>

                                            {/* Export Instructions */}
                                            <div className="space-y-2 mb-8">
                                                <details className="group rounded-xl border border-zinc-800 overflow-hidden">
                                                    <summary className="flex items-center justify-between p-4 cursor-pointer text-sm font-medium text-zinc-400 hover:text-zinc-200 transition-colors">
                                                        <span>{t('exportApple')}</span>
                                                        <span className="text-zinc-600 group-open:rotate-45 transition-transform duration-200 text-lg leading-none">+</span>
                                                    </summary>
                                                    <div className="px-4 pb-4 text-sm text-zinc-500 space-y-2 border-t border-zinc-800/50 pt-3">
                                                        <p>1. Open <strong className="text-zinc-300">Contacts</strong> on your Mac.</p>
                                                        <p>2. Select all contacts (<strong className="text-zinc-300">⌘ + A</strong>).</p>
                                                        <p>3. <strong className="text-zinc-300">File → Export → Export vCard</strong> — save the <code className="text-zinc-400 bg-zinc-900 px-1.5 py-0.5 rounded">.vcf</code> file.</p>
                                                    </div>
                                                </details>

                                                <details className="group rounded-xl border border-zinc-800 overflow-hidden">
                                                    <summary className="flex items-center justify-between p-4 cursor-pointer text-sm font-medium text-zinc-400 hover:text-zinc-200 transition-colors">
                                                        <span>{t('exportGoogle')}</span>
                                                        <span className="text-zinc-600 group-open:rotate-45 transition-transform duration-200 text-lg leading-none">+</span>
                                                    </summary>
                                                    <div className="px-4 pb-4 text-sm text-zinc-500 space-y-2 border-t border-zinc-800/50 pt-3">
                                                        <p>1. Go to <strong className="text-zinc-300">contacts.google.com</strong>.</p>
                                                        <p>2. Click <strong className="text-zinc-300">Export</strong> in the left sidebar.</p>
                                                        <p>3. Choose <strong className="text-zinc-300">vCard</strong> or <strong className="text-zinc-300">Google CSV</strong> and download.</p>
                                                    </div>
                                                </details>
                                            </div>

                                            {/* Drop Zone */}
                                            <div
                                                onDrop={handleDrop}
                                                onDragOver={handleDragOver}
                                                onDragLeave={handleDragLeave}
                                                className={cn(
                                                    "relative rounded-2xl border-2 border-dashed p-10 sm:p-14 flex flex-col items-center justify-center transition-all duration-200 cursor-pointer mb-6",
                                                    isDragging
                                                        ? "border-white/40 bg-zinc-900/80"
                                                        : "border-zinc-800 bg-zinc-900/30 hover:border-zinc-700 hover:bg-zinc-900/50"
                                                )}
                                                onClick={() => fileInputRef.current?.click()}
                                            >
                                                <Upload className={cn(
                                                    "w-8 h-8 mb-4 transition-colors",
                                                    isDragging ? "text-white" : "text-zinc-600"
                                                )} />
                                                <p className="text-sm text-zinc-400 text-center mb-1">
                                                    {isDragging ? (
                                                        <span className="text-white font-medium">{t('dropToAnalyze')}</span>
                                                    ) : (
                                                        <>{t('dragAndDrop')}</>
                                                    )}
                                                </p>
                                                <p className="text-xs text-zinc-600">
                                                    {t('fileTypes')}
                                                </p>

                                                <input
                                                    ref={fileInputRef}
                                                    type="file"
                                                    accept=".vcf,.csv"
                                                    onChange={handleFileInput}
                                                    className="hidden"
                                                />
                                            </div>

                                            {/* File Select Button */}
                                            <button
                                                onClick={() => fileInputRef.current?.click()}
                                                className="w-full py-4 px-8 rounded-full bg-white text-black font-bold text-base tracking-tight
                                                           hover:bg-zinc-200 active:scale-[0.98] transition-all duration-150 flex items-center justify-center gap-2"
                                            >
                                                <FileText className="w-4 h-4" />
                                                {t('selectFile')}
                                            </button>
                                        </motion.div>
                                    )}

                                </AnimatePresence>

                                {/* Skip */}
                                <button
                                    onClick={handleSkip}
                                    className="w-full mt-5 text-zinc-600 text-sm hover:text-zinc-400 transition-colors py-3 text-center"
                                >
                                    {t('skipForNow')}
                                </button>
                            </motion.div>
                        )}

                        {/* ── PROCESSING STATE ── */}
                        {state === 'processing' && (
                            <motion.div
                                key="processing"
                                className="flex flex-col items-center w-full"
                                initial={{ opacity: 0, y: 12 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -12 }}
                                transition={{ duration: 0.3 }}
                            >
                                <div className="w-full max-w-md py-4 px-8 rounded-full border border-zinc-800 bg-zinc-950 text-center">
                                    <span className="font-mono text-base text-white tabular-nums tracking-wider">
                                        {t('hashing')}{' '}
                                        <motion.span
                                            key={hashCount}
                                            initial={{ opacity: 0.4, y: 4 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ duration: 0.08 }}
                                            className="inline-block min-w-[3ch]"
                                        >
                                            {hashCount}
                                        </motion.span>
                                        {' '}{t('identities')}
                                    </span>
                                </div>
                                <p className="mt-5 text-zinc-600 text-xs tracking-wide">
                                    {t('hashingDesc')}
                                </p>
                            </motion.div>
                        )}

                        {/* ── SUCCESS STATE ── */}
                        {state === 'success' && (
                            <motion.div
                                key="success"
                                className="flex flex-col items-center w-full"
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                            >
                                <motion.div
                                    initial={{ scale: 0, rotate: -20 }}
                                    animate={{ scale: 1, rotate: 0 }}
                                    transition={{ delay: 0.1, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                                    className="mb-6"
                                >
                                    <div className="w-16 h-16 rounded-full border border-zinc-700 flex items-center justify-center">
                                        <ShieldCheck className="w-8 h-8 text-white" />
                                    </div>
                                </motion.div>

                                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white mb-2 text-center">
                                    {t('firewallActive')}
                                </h2>
                                <p className="text-sm text-zinc-400 text-center mb-10">
                                    {finalCount === 1 ? t('identitySecured', { count: finalCount }) : t('identitiesSecured', { count: finalCount })}
                                </p>

                                <button
                                    onClick={handleEnter}
                                    className="w-full max-w-md py-4 px-8 rounded-full bg-white text-black font-bold text-base tracking-tight
                                               hover:bg-zinc-200 active:scale-[0.98] transition-all duration-150"
                                >
                                    {t('enterCommandCenter')}
                                </button>
                            </motion.div>
                        )}

                        {/* ── ERROR STATE ── */}
                        {state === 'error' && (
                            <motion.div
                                key="error"
                                className="flex flex-col items-center w-full"
                                initial={{ opacity: 0, y: 12 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -12 }}
                                transition={{ duration: 0.3 }}
                            >
                                <div className="w-full max-w-md p-4 rounded-xl border border-red-500/20 bg-red-500/10 text-red-400 text-sm text-center mb-6">
                                    {errorMsg || 'Something went wrong. Please try again.'}
                                </div>
                                <button
                                    onClick={() => { setState('idle'); setSelectedFile(null); }}
                                    className="w-full max-w-md py-4 px-8 rounded-full bg-white text-black font-bold text-base tracking-tight
                                               hover:bg-zinc-200 active:scale-[0.98] transition-all duration-150 mb-3"
                                >
                                    {t('tryAgain')}
                                </button>
                                <button
                                    onClick={handleSkip}
                                    className="text-zinc-600 text-sm hover:text-zinc-400 transition-colors py-3"
                                >
                                    {t('skipShort')}
                                </button>
                            </motion.div>
                        )}

                    </AnimatePresence>
                </motion.div>

            </div>
        </main>
    );
}

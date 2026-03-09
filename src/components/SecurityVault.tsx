"use client";

import React, { useState, useEffect, useCallback } from "react";
import { X, Shield, ShieldCheck, Radio, Flame, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth/AuthContext";
import { updateCharacterProfile } from "@/lib/firebase/character";
import { CharacterProfile } from "@/types/character";
import {
    collection,
    getDocs,
    writeBatch,
    doc,
    deleteDoc,
    query,
    where,
} from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import {
    extractContactPhoneNumbers,
    normalizePhoneNumber,
    hashPhoneNumber,
    syncFirewallHashes,
    ContactPickerUnsupportedError,
} from "@/lib/security/contactFirewall";

// ─── Types ─────────────────────────────────────────────────────────
interface SecurityVaultProps {
    isOpen: boolean;
    onClose: () => void;
    profile: CharacterProfile | null;
}

// ─── Component ─────────────────────────────────────────────────────
export function SecurityVault({ isOpen, onClose, profile }: SecurityVaultProps) {
    const { user } = useAuth();
    const [blockedCount, setBlockedCount] = useState<number | null>(null);
    const [isResyncing, setIsResyncing] = useState(false);
    const [isPurging, setIsPurging] = useState(false);
    const [isBurning, setIsBurning] = useState(false);
    const [burnConfirm, setBurnConfirm] = useState(false);
    const [purgeConfirm, setPurgeConfirm] = useState(false);
    const [routing, setRouting] = useState<'public' | 'private'>(
        profile?.default_post_routing || 'public'
    );
    const [statusMessage, setStatusMessage] = useState<string | null>(null);

    // Fetch blocked hash count
    useEffect(() => {
        if (!user || !isOpen) return;
        const fetchCount = async () => {
            try {
                const snap = await getDocs(collection(db, "users", user.uid, "blocked_hashes"));
                setBlockedCount(snap.size);
            } catch {
                setBlockedCount(0);
            }
        };
        fetchCount();
    }, [user, isOpen, isResyncing, isPurging]);

    // Sync routing from profile
    useEffect(() => {
        setRouting(profile?.default_post_routing || 'public');
    }, [profile?.default_post_routing]);

    // Close on escape
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape" && isOpen) onClose();
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isOpen, onClose]);

    // ── Handlers ──

    const handleResync = useCallback(async () => {
        if (!user) return;
        setIsResyncing(true);
        setStatusMessage(null);

        try {
            const rawNumbers = await extractContactPhoneNumbers();
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
            setStatusMessage(`Perimeter updated. ${unique.length} identities secured.`);
        } catch (err) {
            if (err instanceof ContactPickerUnsupportedError) {
                setStatusMessage("Contact sync unavailable on this browser.");
            } else {
                setStatusMessage("Resync failed. Try again.");
            }
        } finally {
            setIsResyncing(false);
        }
    }, [user]);

    const handlePurge = useCallback(async () => {
        if (!user || !purgeConfirm) return;
        setIsPurging(true);

        try {
            const colRef = collection(db, "users", user.uid, "blocked_hashes");
            const snap = await getDocs(colRef);

            // Delete in batches of 500
            const batches: ReturnType<typeof writeBatch>[] = [];
            let currentBatch = writeBatch(db);
            let count = 0;

            snap.docs.forEach((docSnap) => {
                currentBatch.delete(docSnap.ref);
                count++;
                if (count % 500 === 0) {
                    batches.push(currentBatch);
                    currentBatch = writeBatch(db);
                }
            });
            batches.push(currentBatch);

            await Promise.all(batches.map(b => b.commit()));
            await updateCharacterProfile(user.uid, { firewall_synced: false });

            setBlockedCount(0);
            setPurgeConfirm(false);
            setStatusMessage("Firewall purged. Perimeter is open.");
        } catch {
            setStatusMessage("Purge failed.");
        } finally {
            setIsPurging(false);
        }
    }, [user, purgeConfirm]);

    const handleRoutingChange = useCallback(async (value: 'public' | 'private') => {
        if (!user) return;
        setRouting(value);
        try {
            await updateCharacterProfile(user.uid, { default_post_routing: value });
        } catch {
            // Revert on failure
            setRouting(routing);
        }
    }, [user, routing]);

    const handleBurnLedger = useCallback(async () => {
        if (!user || !burnConfirm) return;
        setIsBurning(true);

        try {
            const postsSnap = await getDocs(
                query(collection(db, "posts"), where("authorId", "==", user.uid))
            );

            const batches: ReturnType<typeof writeBatch>[] = [];
            let currentBatch = writeBatch(db);
            let count = 0;

            postsSnap.docs.forEach((docSnap) => {
                currentBatch.delete(docSnap.ref);
                count++;
                if (count % 500 === 0) {
                    batches.push(currentBatch);
                    currentBatch = writeBatch(db);
                }
            });
            batches.push(currentBatch);

            await Promise.all(batches.map(b => b.commit()));

            setBurnConfirm(false);
            setStatusMessage(`${postsSnap.size} records destroyed. The ledger is clean.`);
        } catch {
            setStatusMessage("Destruction failed. Records persist.");
        } finally {
            setIsBurning(false);
        }
    }, [user, burnConfirm]);

    const firewallActive = profile?.firewall_synced && (blockedCount ?? 0) > 0;

    return (
        <>
            {/* Backdrop */}
            {isOpen && (
                <div
                    className="fixed inset-0 z-[100] flex justify-end bg-black/70 backdrop-blur-sm transition-opacity"
                    onClick={onClose}
                />
            )}

            {/* Slide-over Panel */}
            <div
                className={cn(
                    "fixed inset-y-0 right-0 w-full sm:w-[420px] h-full bg-zinc-950 border-l border-zinc-800 shadow-2xl z-[101] flex flex-col transform transition-transform duration-300 ease-in-out",
                    isOpen ? "translate-x-0" : "translate-x-full"
                )}
            >
                {/* ── Header ── */}
                <div className="flex items-center justify-between px-6 py-5 border-b border-zinc-800/80">
                    <div className="flex items-center gap-3">
                        <Shield className="w-5 h-5 text-zinc-400" />
                        <h2 className="text-xs font-bold tracking-[0.2em] uppercase text-zinc-100">
                            Security & Routing
                        </h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-zinc-500 hover:text-zinc-200 transition-colors rounded-full hover:bg-zinc-900"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* ── Content ── */}
                <div className="flex-1 overflow-y-auto">

                    {/* STATUS MESSAGE */}
                    {statusMessage && (
                        <div className="mx-6 mt-5 p-3 rounded-lg border border-zinc-800 bg-zinc-900/80">
                            <p className="text-xs text-zinc-300 font-mono">{statusMessage}</p>
                        </div>
                    )}

                    {/* ═══ SECTION 1: PERIMETER CONTROL ═══ */}
                    <div className="px-6 py-8 border-b border-zinc-800/50">
                        <h3 className="text-[10px] font-bold tracking-[0.25em] uppercase text-zinc-500 mb-5">
                            Perimeter Control
                        </h3>

                        {/* Status Readout */}
                        <div className="flex items-center gap-3 mb-6">
                            <div className="relative flex items-center justify-center w-2.5 h-2.5">
                                {firewallActive ? (
                                    <>
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-40" />
                                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white" />
                                    </>
                                ) : (
                                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-zinc-700" />
                                )}
                            </div>
                            <p className="font-mono text-sm text-zinc-200 tracking-wide">
                                STATUS: {firewallActive ? "LOCKED" : "OPEN"}.{" "}
                                {blockedCount !== null ? (
                                    <span className="text-white font-semibold">{blockedCount}</span>
                                ) : (
                                    <Loader2 className="w-3 h-3 inline animate-spin" />
                                )}{" "}
                                {blockedCount === 1 ? "Identity" : "Identities"} Secured.
                            </p>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex gap-3">
                            <button
                                onClick={handleResync}
                                disabled={isResyncing}
                                className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl border border-zinc-700 text-zinc-300 text-xs font-bold uppercase tracking-widest hover:border-zinc-500 hover:text-white transition-all disabled:opacity-40"
                            >
                                {isResyncing ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                    <RefreshCw className="w-3.5 h-3.5" />
                                )}
                                Resync
                            </button>
                            {!purgeConfirm ? (
                                <button
                                    onClick={() => setPurgeConfirm(true)}
                                    disabled={isPurging || (blockedCount ?? 0) === 0}
                                    className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl border border-zinc-800 text-zinc-600 text-xs font-bold uppercase tracking-widest hover:text-red-400/70 hover:border-red-900/40 transition-all disabled:opacity-20"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    Purge
                                </button>
                            ) : (
                                <button
                                    onClick={handlePurge}
                                    disabled={isPurging}
                                    className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl border border-red-900/50 bg-red-950/30 text-red-400/80 text-xs font-bold uppercase tracking-widest hover:bg-red-950/50 transition-all disabled:opacity-40"
                                >
                                    {isPurging ? (
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                        "Confirm Purge"
                                    )}
                                </button>
                            )}
                        </div>
                    </div>

                    {/* ═══ SECTION 2: DEFAULT POST ROUTING ═══ */}
                    <div className="px-6 py-8 border-b border-zinc-800/50">
                        <h3 className="text-[10px] font-bold tracking-[0.25em] uppercase text-zinc-500 mb-2">
                            Default Post Routing
                        </h3>
                        <p className="text-xs text-zinc-600 mb-6">
                            Determine where your friction is logged by default.
                        </p>

                        {/* Custom Radio Group */}
                        <div className="space-y-3">
                            {/* Public */}
                            <button
                                onClick={() => handleRoutingChange('public')}
                                className={cn(
                                    "w-full flex items-start gap-4 p-4 rounded-xl border text-left transition-all duration-200",
                                    routing === 'public'
                                        ? "border-white/30 bg-zinc-900"
                                        : "border-zinc-800 bg-zinc-950 hover:border-zinc-700"
                                )}
                            >
                                {/* Custom Radio Indicator */}
                                <div className="mt-0.5 shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all duration-200"
                                    style={{
                                        borderColor: routing === 'public' ? 'rgba(255,255,255,0.8)' : 'rgba(113,113,122,0.5)',
                                    }}
                                >
                                    {routing === 'public' && (
                                        <div className="w-2.5 h-2.5 rounded-full bg-white" />
                                    )}
                                </div>
                                <div>
                                    <span className={cn(
                                        "text-sm font-bold block mb-1 transition-colors",
                                        routing === 'public' ? "text-white" : "text-zinc-400"
                                    )}>
                                        Public (Dear Earnest Feed)
                                    </span>
                                    <span className="text-xs text-zinc-600 leading-relaxed block">
                                        Anonymized friction routed to the network.
                                    </span>
                                </div>
                            </button>

                            {/* Private */}
                            <button
                                onClick={() => handleRoutingChange('private')}
                                className={cn(
                                    "w-full flex items-start gap-4 p-4 rounded-xl border text-left transition-all duration-200",
                                    routing === 'private'
                                        ? "border-white/30 bg-zinc-900"
                                        : "border-zinc-800 bg-zinc-950 hover:border-zinc-700"
                                )}
                            >
                                <div className="mt-0.5 shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all duration-200"
                                    style={{
                                        borderColor: routing === 'private' ? 'rgba(255,255,255,0.8)' : 'rgba(113,113,122,0.5)',
                                    }}
                                >
                                    {routing === 'private' && (
                                        <div className="w-2.5 h-2.5 rounded-full bg-white" />
                                    )}
                                </div>
                                <div>
                                    <span className={cn(
                                        "text-sm font-bold block mb-1 transition-colors",
                                        routing === 'private' ? "text-white" : "text-zinc-400"
                                    )}>
                                        Private (Personal Ledger)
                                    </span>
                                    <span className="text-xs text-zinc-600 leading-relaxed block">
                                        Strict historical logging. No external visibility.
                                    </span>
                                </div>
                            </button>
                        </div>
                    </div>

                    {/* ═══ SECTION 3: DATA DESTRUCTION ═══ */}
                    <div className="px-6 py-8">
                        <h3 className="text-[10px] font-bold tracking-[0.25em] uppercase text-zinc-500 mb-2">
                            Data Destruction
                        </h3>
                        <p className="text-xs text-zinc-600 mb-6 leading-relaxed">
                            Permanently and irrevocably delete your entire history of friction
                            and tactical plans. We hold nothing back.
                        </p>

                        {!burnConfirm ? (
                            <button
                                onClick={() => setBurnConfirm(true)}
                                disabled={isBurning}
                                className="w-full flex items-center justify-center gap-2.5 py-3.5 px-6 rounded-xl border border-zinc-800 text-zinc-500 text-xs font-bold uppercase tracking-[0.15em] hover:text-red-400/60 hover:border-red-900/30 transition-all duration-200 disabled:opacity-30"
                            >
                                <Flame className="w-4 h-4" />
                                Burn the Ledger
                            </button>
                        ) : (
                            <div className="space-y-3">
                                <p className="text-xs text-red-400/70 font-mono text-center">
                                    This action is irreversible. All posts will be destroyed.
                                </p>
                                <div className="flex gap-3">
                                    <button
                                        onClick={() => setBurnConfirm(false)}
                                        className="flex-1 py-3 px-4 rounded-xl border border-zinc-800 text-zinc-400 text-xs font-bold uppercase tracking-widest hover:text-white hover:border-zinc-600 transition-all"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleBurnLedger}
                                        disabled={isBurning}
                                        className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl border border-red-900/50 bg-red-950/30 text-red-400/80 text-xs font-bold uppercase tracking-widest hover:bg-red-950/50 transition-all disabled:opacity-40"
                                    >
                                        {isBurning ? (
                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        ) : (
                                            <>
                                                <Flame className="w-3.5 h-3.5" />
                                                Confirm
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* ── Footer ── */}
                <div className="px-6 py-4 border-t border-zinc-800/50 bg-black/30">
                    <div className="flex items-center justify-center gap-2">
                        <ShieldCheck className="w-3.5 h-3.5 text-zinc-700" />
                        <span className="text-[10px] text-zinc-700 uppercase tracking-[0.2em] font-semibold">
                            Vault Secured
                        </span>
                    </div>
                </div>
            </div>
        </>
    );
}

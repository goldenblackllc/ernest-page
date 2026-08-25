"use client";

import React, { useState, useEffect } from "react";
import { X, Shield, ShieldCheck, Loader2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth/AuthContext";
import { CharacterProfile } from "@/types/character";
import { useTranslations } from "next-intl";

// ─── Types ─────────────────────────────────────────────────────────
interface SecurityVaultProps {
    isOpen: boolean;
    onClose: () => void;
    profile: CharacterProfile | null;
}

// ─── Component ─────────────────────────────────────────────────────
export function SecurityVault({ isOpen, onClose, profile }: SecurityVaultProps) {
    const { user } = useAuth();
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [deleteConfirm, setDeleteConfirm] = useState(false);
    const [deleteInput, setDeleteInput] = useState('');
    const [isDeleting, setIsDeleting] = useState(false);
    const t = useTranslations('securityVault');

    // Close on escape
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape" && isOpen) onClose();
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isOpen, onClose]);

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
                            {t('title')}
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
                            <p className="text-xs text-zinc-300">{statusMessage}</p>
                        </div>
                    )}

                    {/* ═══ SECTION 5: ACCOUNT DELETION ═══ */}
                    <div className="px-6 py-8 border-t border-zinc-800/50">
                        <h3 className="text-[10px] font-bold tracking-[0.25em] uppercase text-zinc-500 mb-2">
                            {t('accountDeletionTitle')}
                        </h3>
                        <p className="text-xs text-zinc-600 mb-6 leading-relaxed">
                            {t('accountDeletionDesc')}
                        </p>

                        {!deleteConfirm ? (
                            <button
                                onClick={() => setDeleteConfirm(true)}
                                disabled={isDeleting}
                                className="w-full flex items-center justify-center gap-2.5 py-3.5 px-6 rounded-xl border border-zinc-800 text-zinc-500 text-xs font-bold uppercase tracking-[0.15em] hover:text-red-400/60 hover:border-red-900/30 transition-all duration-200 disabled:opacity-30"
                            >
                                <AlertTriangle className="w-4 h-4" />
                                {t('deleteMyAccount')}
                            </button>
                        ) : (
                            <div className="space-y-3">
                                <div className="p-3 rounded-xl border border-red-900/30 bg-red-950/20">
                                    <p className="text-xs text-red-400/80 text-center mb-3">
                                        {t('deleteWarning')}
                                    </p>
                                    <input
                                        type="text"
                                        value={deleteInput}
                                        onChange={(e) => setDeleteInput(e.target.value)}
                                        placeholder={t('typeDelete')}
                                        className="w-full bg-black/50 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white font-mono text-center placeholder:text-zinc-700 focus:outline-none focus:border-red-800/50"
                                    />
                                </div>
                                <div className="flex gap-3">
                                    <button
                                        onClick={() => { setDeleteConfirm(false); setDeleteInput(''); }}
                                        className="flex-1 py-3 px-4 rounded-xl border border-zinc-800 text-zinc-400 text-xs font-bold uppercase tracking-widest hover:text-white hover:border-zinc-600 transition-all"
                                    >
                                        {t('cancel')}
                                    </button>
                                    <button
                                        onClick={async () => {
                                            if (deleteInput !== 'DELETE' || !user) return;
                                            setIsDeleting(true);
                                            try {
                                                const idToken = await user.getIdToken();
                                                const res = await fetch('/api/account/delete', {
                                                    method: 'DELETE',
                                                    headers: { 'Authorization': `Bearer ${idToken}` },
                                                });
                                                if (res.ok) {
                                                    // Account is gone — sign out client
                                                    const { clearFeedCache } = await import('@/lib/feedCache');
                                                    clearFeedCache();
                                                    const { signOut: fbSignOut } = await import('firebase/auth');
                                                    const { auth } = await import('@/lib/firebase/config');
                                                    await fbSignOut(auth);
                                                    window.location.href = '/';
                                                } else {
                                                    const data = await res.json();
                                                    setStatusMessage(data.error || 'Deletion failed.');
                                                    setIsDeleting(false);
                                                }
                                            } catch (err) {
                                                console.error('Account deletion failed:', err);
                                                setStatusMessage('Account deletion failed. Contact support.');
                                                setIsDeleting(false);
                                            }
                                        }}
                                        disabled={isDeleting || deleteInput !== 'DELETE'}
                                        className={cn(
                                            "flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl border text-xs font-bold uppercase tracking-widest transition-all disabled:opacity-40",
                                            deleteInput === 'DELETE'
                                                ? "border-red-900/50 bg-red-950/30 text-red-400/80 hover:bg-red-950/50"
                                                : "border-zinc-800 text-zinc-600 cursor-not-allowed"
                                        )}
                                    >
                                        {isDeleting ? (
                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        ) : (
                                            <>
                                                <AlertTriangle className="w-3.5 h-3.5" />
                                                {t('deleteForever')}
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
                            {t('vaultSecured')}
                        </span>
                    </div>
                </div>
            </div>
        </>
    );
}

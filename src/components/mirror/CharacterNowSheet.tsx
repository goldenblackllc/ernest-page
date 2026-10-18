"use client";

import React, { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useDragControls, type PanInfo } from "framer-motion";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils/cn";
import type { Situation } from "@functions/lib/character/situations";

interface CharacterNowSheetProps {
    isOpen: boolean;
    onClose: () => void;
    displayName: string;
    /** The situation the character is in right now */
    current?: Situation;
    /** All of the character's situations, the main portrait first */
    situations: Situation[];
    /** Situation id → avatar URL */
    situationAvatars: Record<string, string>;
    /** Shown for a situation that has no avatar of its own */
    fallbackAvatarUrl?: string;
}

/**
 * A bottom sheet with the character's large portrait, where it is and what
 * it's wearing (the situation's own description), and the other situations
 * of its week. Closes by tapping outside, the close button, or dragging the
 * handle down.
 */
export function CharacterNowSheet({
    isOpen, onClose, displayName, current, situations, situationAvatars, fallbackAvatarUrl,
}: CharacterNowSheetProps) {
    const t = useTranslations();
    const dragControls = useDragControls();
    // null shows where the character is now; each opening starts there.
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const close = useCallback(() => {
        setSelectedId(null);
        onClose();
    }, [onClose]);

    useEffect(() => {
        if (!isOpen) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [isOpen, close]);

    const selected = situations.find(s => s.id === selectedId) || current;
    const imageUrl = (selected && situationAvatars[selected.id]) || fallbackAvatarUrl;

    const handleDragEnd = (_: unknown, info: PanInfo) => {
        if (info.offset.y > 100 || info.velocity.y > 500) close();
    };

    if (typeof document === 'undefined') return null;

    return createPortal(
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label={displayName}>
                    <motion.div
                        className="absolute inset-0 bg-black/70"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        onClick={close}
                    />
                    <motion.div
                        className="absolute left-0 right-0 bottom-0 mx-auto max-w-lg max-h-[92dvh] flex flex-col bg-zinc-950 border-t border-x border-white/10 rounded-t-2xl overflow-hidden"
                        initial={{ y: '100%' }}
                        animate={{ y: 0 }}
                        exit={{ y: '100%' }}
                        transition={{ type: 'tween', duration: 0.2, ease: 'easeOut' }}
                        drag="y"
                        dragListener={false}
                        dragControls={dragControls}
                        dragConstraints={{ top: 0, bottom: 0 }}
                        dragElastic={{ top: 0, bottom: 0.6 }}
                        onDragEnd={handleDragEnd}
                    >
                        {/* Handle — drag down to close */}
                        <div
                            className="relative shrink-0 flex items-center justify-center h-11 cursor-grab touch-none"
                            onPointerDown={e => dragControls.start(e)}
                        >
                            <div className="w-10 h-1 rounded-full bg-zinc-700" />
                            <button
                                onClick={close}
                                onPointerDown={e => e.stopPropagation()}
                                className="absolute right-3 top-1.5 w-8 h-8 flex items-center justify-center text-zinc-500 hover:text-white border border-zinc-700 hover:border-zinc-500 rounded-full transition-colors"
                                aria-label={t('common.close')}
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 pb-[max(20px,env(safe-area-inset-bottom))]">
                            {/* Portrait — square, but never taller than half the screen */}
                            <div className="mx-auto w-full max-w-[min(100%,48dvh)] aspect-square rounded-xl overflow-hidden bg-zinc-900 border border-white/10">
                                {imageUrl ? (
                                    <img src={imageUrl} alt={displayName} className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-6xl font-bold text-zinc-600 select-none">
                                        {displayName.charAt(0).toUpperCase()}
                                    </div>
                                )}
                            </div>

                            {selected && (
                                <div className="mt-4">
                                    {selected.id === current?.id && (
                                        <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-bold text-emerald-500">
                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                            {t('mirrorChat.rightNow')}
                                        </p>
                                    )}
                                    <h3 className="mt-1 text-lg font-bold text-white leading-snug">{selected.label}</h3>
                                    <p className="mt-2 text-[15px] text-zinc-300 leading-relaxed">{selected.portrait}</p>
                                </div>
                            )}

                            {/* The rest of the week */}
                            {situations.length > 1 && (
                                <div className="mt-6">
                                    <p className="text-[10px] uppercase tracking-widest font-bold text-zinc-500">
                                        {t('mirrorChat.throughTheWeek')}
                                    </p>
                                    <div className="mt-2 -mx-4 px-4 flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
                                        {situations.map(s => {
                                            const url = situationAvatars[s.id] || fallbackAvatarUrl;
                                            const isSelected = s.id === selected?.id;
                                            return (
                                                <button
                                                    key={s.id}
                                                    onClick={() => setSelectedId(s.id)}
                                                    className="shrink-0 w-16 flex flex-col items-center gap-1"
                                                    aria-pressed={isSelected}
                                                    aria-label={s.label}
                                                >
                                                    <div className={cn(
                                                        "relative w-14 h-14 rounded-full overflow-hidden bg-zinc-800 border-2 transition-colors",
                                                        isSelected ? "border-white" : "border-zinc-800"
                                                    )}>
                                                        {url && <img src={url} alt="" className="w-full h-full object-cover" />}
                                                        {s.id === current?.id && (
                                                            <span className="absolute bottom-0.5 right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-zinc-950" />
                                                        )}
                                                    </div>
                                                    <span className={cn(
                                                        "w-full text-[11px] leading-tight line-clamp-2 text-center",
                                                        isSelected ? "text-zinc-200" : "text-zinc-500"
                                                    )}>
                                                        {s.label}
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>,
        document.body
    );
}

"use client";

import React from "react";
import { X, Volume2, VolumeX } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils/cn";
import { MAX_EXCHANGES } from "@/hooks/useMirrorSession";

interface MirrorHeaderProps {
    headerRef: React.RefObject<HTMLDivElement | null>;
    displayName: string;
    characterName: string | null;
    characterArchetype: string | null;
    avatarUrl?: string;
    showExchangeCount: boolean;
    exchangeCount: number;
    hasVoice: boolean;
    autoSpeak: boolean;
    isSpeaking: boolean;
    onToggleAutoSpeak: () => void;
    onClose: () => void;
}

export function MirrorHeader({
    headerRef, displayName, characterName, characterArchetype, avatarUrl,
    showExchangeCount, exchangeCount, hasVoice, autoSpeak, isSpeaking, onToggleAutoSpeak, onClose,
}: MirrorHeaderProps) {
    const t = useTranslations();

    return (
        <div
            ref={headerRef}
            className="absolute top-0 left-0 right-0 z-10 flex items-center gap-3 px-4 sm:px-6 py-3 border-b border-zinc-800/50 bg-zinc-950 pt-[max(12px,env(safe-area-inset-top))]"
        >
            {/* Avatar — prominent face */}
            <div className="w-16 h-16 rounded-full bg-zinc-800 border-2 border-zinc-700 overflow-hidden flex items-center justify-center shrink-0">
                {avatarUrl ? (
                    <img src={avatarUrl} alt={displayName} className="w-full h-full object-cover" />
                ) : (
                    <span className="text-2xl font-bold text-zinc-400 select-none">
                        {displayName.charAt(0).toUpperCase()}
                    </span>
                )}
            </div>

            {/* Character identity */}
            <div className="flex-1 min-w-0">
                <h3 className="font-bold text-white text-base leading-tight flex items-center gap-2 truncate">
                    {displayName}
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                </h3>
                {characterArchetype && characterName && (
                    <p className="text-xs text-zinc-500 font-medium truncate mt-0.5">{characterArchetype}</p>
                )}
            </div>

            {/* Exchange counter */}
            {showExchangeCount && (
                <span className={cn(
                    "text-[10px] uppercase tracking-widest font-bold shrink-0",
                    exchangeCount >= MAX_EXCHANGES - 5 ? "text-amber-500" : "text-zinc-700"
                )}>
                    {exchangeCount}/{MAX_EXCHANGES}
                </span>
            )}

            {/* Voice toggle — auto-speak on/off */}
            {hasVoice && (
                <button
                    onClick={onToggleAutoSpeak}
                    className={cn(
                        "shrink-0 w-8 h-8 flex items-center justify-center rounded-full border transition-all",
                        autoSpeak
                            ? "text-white border-zinc-500 bg-zinc-800"
                            : "text-zinc-600 border-zinc-700 hover:text-zinc-400 hover:border-zinc-500",
                        isSpeaking && "animate-pulse"
                    )}
                    aria-label={autoSpeak ? 'Turn off voice' : 'Turn on voice'}
                >
                    {autoSpeak ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                </button>
            )}

            {/* Close */}
            <button
                onClick={onClose}
                className="shrink-0 w-8 h-8 flex items-center justify-center text-zinc-500 hover:text-white border border-zinc-700 hover:border-zinc-500 rounded-full transition-colors"
                aria-label={t('common.close')}
            >
                <X className="w-4 h-4" />
            </button>
        </div>
    );
}

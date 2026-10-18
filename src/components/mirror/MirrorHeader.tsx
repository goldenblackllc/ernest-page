"use client";

import React from "react";
import { X, Volume2, VolumeX, Maximize2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils/cn";
import { MAX_EXCHANGES } from "@/hooks/useMirrorSession";

interface MirrorHeaderProps {
    headerRef: React.RefObject<HTMLDivElement | null>;
    displayName: string;
    characterName: string | null;
    characterArchetype: string | null;
    avatarUrl?: string;
    /** What the character is doing right now (its current situation) */
    status?: string;
    showExchangeCount: boolean;
    exchangeCount: number;
    hasVoice: boolean;
    autoSpeak: boolean;
    isSpeaking: boolean;
    onToggleAutoSpeak: () => void;
    onClose: () => void;
    /** Opens the large portrait with what the character is doing and wearing */
    onAvatarClick: () => void;
}

export function MirrorHeader({
    headerRef, displayName, characterName, characterArchetype, avatarUrl, status,
    showExchangeCount, exchangeCount, hasVoice, autoSpeak, isSpeaking, onToggleAutoSpeak, onClose, onAvatarClick,
}: MirrorHeaderProps) {
    const t = useTranslations();

    return (
        <div
            ref={headerRef}
            className="absolute top-0 left-0 right-0 z-10 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 px-4 sm:px-6 py-2.5 border-b border-zinc-800/50 bg-zinc-950 pt-[max(10px,env(safe-area-inset-top))]"
        >
            {/* Avatar — tap to see the character large, and what it's wearing */}
            <button
                type="button"
                onClick={onAvatarClick}
                className="relative row-span-2 self-center shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                aria-label={t('mirrorChat.seeCharacterNow', { name: displayName })}
            >
                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-zinc-800 border-2 border-zinc-700 overflow-hidden flex items-center justify-center">
                    {avatarUrl ? (
                        <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                        <span className="text-xl font-bold text-zinc-400 select-none">
                            {displayName.charAt(0).toUpperCase()}
                        </span>
                    )}
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-zinc-900 border border-zinc-700 flex items-center justify-center text-zinc-300">
                    <Maximize2 className="w-2.5 h-2.5" />
                </span>
            </button>

            {/* Name, live dot and exchange counter */}
            <div className="min-w-0 flex items-center gap-2">
                <h3 className="font-bold text-white text-base leading-tight truncate">{displayName}</h3>
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                {showExchangeCount && (
                    <span className={cn(
                        "ml-auto text-[10px] tabular-nums tracking-widest font-bold shrink-0",
                        exchangeCount >= MAX_EXCHANGES - 5 ? "text-amber-500" : "text-zinc-600"
                    )}>
                        {exchangeCount}/{MAX_EXCHANGES}
                    </span>
                )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
                {/* Voice toggle — auto-speak on/off */}
                {hasVoice && (
                    <button
                        onClick={onToggleAutoSpeak}
                        className={cn(
                            "shrink-0 w-9 h-9 flex items-center justify-center rounded-full border transition-all",
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
                    className="shrink-0 w-9 h-9 flex items-center justify-center text-zinc-500 hover:text-white border border-zinc-700 hover:border-zinc-500 rounded-full transition-colors"
                    aria-label={t('common.close')}
                >
                    <X className="w-4 h-4" />
                </button>
            </div>

            {/* What the character is doing right now — the full width beside the avatar */}
            {status ? (
                <button
                    type="button"
                    onClick={onAvatarClick}
                    className="col-start-2 col-span-2 mt-0.5 text-left text-sm text-zinc-400 leading-snug line-clamp-2"
                >
                    {status}
                </button>
            ) : characterArchetype && characterName ? (
                <p className="col-start-2 col-span-2 mt-0.5 text-xs text-zinc-500 font-medium truncate">{characterArchetype}</p>
            ) : null}
        </div>
    );
}

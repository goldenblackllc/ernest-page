"use client";

import React from "react";
import { Square, ArrowUp } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils/cn";

interface MirrorInputBarProps {
    textareaRef: React.RefObject<HTMLTextAreaElement | null>;
    input: string;
    onInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
    onSubmit: () => void;
    onStop: () => void;
    isLoading: boolean;
    isSessionLimited: boolean;
}

/** Textarea with the inline send / stop button. */
export function MirrorInputBar({ textareaRef, input, onInputChange, onSubmit, onStop, isLoading, isSessionLimited }: MirrorInputBarProps) {
    const t = useTranslations();

    return (
        <div className={cn(
            "relative bg-zinc-900/50 border border-white/10 rounded-xl p-3 transition-all",
            isSessionLimited
                ? "opacity-50 cursor-not-allowed"
                : "focus-within:border-zinc-500 focus-within:ring-1 focus-within:ring-zinc-500"
        )}>
            <textarea
                ref={textareaRef}
                className="w-full bg-transparent text-white px-1 pr-12 min-h-[44px] max-h-[120px] resize-none focus:outline-none placeholder:text-zinc-600 custom-scrollbar text-base leading-relaxed"
                value={input}
                onChange={onInputChange}
                placeholder={isSessionLimited ? t('mirrorChat.placeholderEnded') : t('mirrorChat.placeholderDefault')}
                disabled={isSessionLimited}
                onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        if (input.trim() && !isLoading && !isSessionLimited) {
                            onSubmit();
                        }
                    }
                }}
                rows={1}
            />

            {/* Send / Stop — absolute inside textarea wrapper */}
            <div className="absolute right-3 bottom-3">
                {isLoading ? (
                    <button
                        onClick={onStop}
                        className="w-9 h-9 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-400 hover:text-red-400 hover:border-red-800 transition-colors"
                        aria-label={t('mirrorChat.stop')}
                    >
                        <Square className="w-3.5 h-3.5 fill-current" />
                    </button>
                ) : (
                    <button
                        onClick={() => onSubmit()}
                        disabled={!input.trim()}
                        className={cn(
                            "w-9 h-9 rounded-full flex items-center justify-center transition-all",
                            input.trim()
                                ? "bg-white text-black shadow-lg hover:bg-zinc-200"
                                : "bg-zinc-800/80 text-zinc-600 cursor-not-allowed"
                        )}
                        aria-label={t('mirrorChat.send')}
                    >
                        <ArrowUp className="w-4 h-4" />
                    </button>
                )}
            </div>
        </div>
    );
}

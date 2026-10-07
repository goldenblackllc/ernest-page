"use client";

import React from "react";
import { Target, Lock, Loader2, Play, Pause } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils/cn";
import type { Message } from "@/types/chat";

interface MirrorMessageListProps {
    messages: Message[];
    hiddenMessageId: string | null;
    showTypingIndicator: boolean;
    hasVoice: boolean;
    isLoadingTTS: boolean;
    isSpeaking: boolean;
    onPlayPause: () => void;
    canExtractDirectives: boolean;
    isGeneratingPlan: boolean;
    onExtractDirectives: () => void;
}

export function MirrorMessageList({
    messages, hiddenMessageId, showTypingIndicator, hasVoice, isLoadingTTS, isSpeaking,
    onPlayPause, canExtractDirectives, isGeneratingPlan, onExtractDirectives,
}: MirrorMessageListProps) {
    const t = useTranslations();

    return (
        <div className="max-w-3xl mx-auto px-5 sm:px-8 lg:px-12 py-6 space-y-3">
            {messages.length === 0 ? (
                <div className="h-full min-h-[60vh] flex flex-col items-center justify-center text-center space-y-4 opacity-70">
                    <div className="w-16 h-16 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center">
                        <Lock className="w-8 h-8 text-zinc-500" />
                    </div>
                    <div>
                        <p className="text-zinc-400 mb-2">{t('mirrorChat.connectionSecured')}</p>
                        <p className="text-sm font-medium text-zinc-300 max-w-xs mx-auto">
                            {t('mirrorChat.promptFriction')}
                        </p>
                    </div>
                </div>
            ) : (
                messages.filter(m => m.id !== hiddenMessageId).map((m, idx, filteredArr) => (
                    <div key={m.id}>
                        {/* Message bubble — no per-message avatars */}
                        <div
                            className={cn(
                                "flex w-full",
                                m.role === "user" ? "justify-end" : "justify-start"
                            )}
                        >
                            <div
                                className={cn(
                                    "rounded-2xl px-4 py-3 text-[15px] leading-relaxed max-w-[92%]",
                                    m.role === "user"
                                        ? "bg-zinc-800 text-zinc-100 rounded-tr-sm"
                                        : "bg-zinc-900/60 border border-white/10 text-zinc-100 rounded-tl-sm"
                                )}
                            >
                                {m.role === "assistant" ? (
                                    <div className="prose prose-invert prose-sm prose-p:leading-relaxed prose-a:text-zinc-200 prose-strong:text-white max-w-none whitespace-pre-wrap">
                                        <ReactMarkdown>{m.content}</ReactMarkdown>
                                    </div>
                                ) : (
                                    <p className="whitespace-pre-wrap">{m.content}</p>
                                )}
                            </div>

                            {/* Play/Pause button — always visible on last assistant message when voice exists */}
                            {m.role === 'assistant' && idx === filteredArr.length - 1 && hasVoice && (
                                <button
                                    onClick={onPlayPause}
                                    disabled={isLoadingTTS}
                                    className={cn(
                                        "ml-1 shrink-0 self-end w-7 h-7 flex items-center justify-center border rounded-full transition-all",
                                        isLoadingTTS
                                            ? "text-zinc-600 border-zinc-700/50 cursor-wait"
                                            : isSpeaking
                                                ? "text-white border-zinc-500 bg-zinc-800"
                                                : "text-zinc-600 hover:text-white border-zinc-700/50 hover:border-zinc-500"
                                    )}
                                    aria-label={isLoadingTTS ? 'Loading audio' : isSpeaking ? 'Pause audio' : 'Play audio'}
                                >
                                    {isLoadingTTS ? (
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : isSpeaking ? (
                                        <Pause className="w-3 h-3" />
                                    ) : (
                                        <Play className="w-3 h-3" />
                                    )}
                                </button>
                            )}

                        </div>

                        {/* ═══ EXTRACT DIRECTIVES — compact chip after last assistant message ═══ */}
                        {m.role === 'assistant' && idx === filteredArr.length - 1 && canExtractDirectives && filteredArr.length >= 4 && (
                            <div className="flex justify-end mt-2 pr-1">
                                {isGeneratingPlan ? (
                                    <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 font-bold uppercase tracking-widest px-3 py-1.5">
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                        {t('mirrorChat.extractingDirectives')}
                                    </div>
                                ) : (
                                    <button
                                        onClick={onExtractDirectives}
                                        className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 border border-zinc-700 text-zinc-500 hover:text-white hover:border-zinc-500 rounded-full transition-all"
                                    >
                                        <Target className="w-3 h-3" />
                                        {t('mirrorChat.extractDirectives')}
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                ))
            )}

            {showTypingIndicator && (
                <div className="flex justify-start">
                    <div className="bg-zinc-900/60 border border-white/10 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1.5 h-[46px]">
                        <div className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce" style={{ animationDelay: "0ms" }} />
                        <div className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce" style={{ animationDelay: "150ms" }} />
                        <div className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                </div>
            )}

        </div>
    );
}

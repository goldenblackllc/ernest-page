"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils/cn";
import type { CondensedTranscriptMessage } from "@/types/post";

interface PostTextViewProps {
    /** Condensed transcript, when the post has one; otherwise letter/response are shown. */
    transcript?: CondensedTranscriptMessage[];
    /** Label for the user's turns in the transcript. */
    userLabel: string;
    letter: string;
    response: string;
}

function CopyButton({ copied, onCopy, title }: { copied: boolean; onCopy: () => void; title: string }) {
    return (
        <button
            onClick={onCopy}
            className="p-1 rounded text-zinc-600 hover:text-white hover:bg-white/10 transition-all"
            title={title}
        >
            {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
        </button>
    );
}

function CopyAllButton({ copied, onCopy, label }: { copied: boolean; onCopy: () => void; label: string }) {
    const t = useTranslations('feed');
    return (
        <button
            onClick={onCopy}
            className={cn(
                "w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border text-xs font-semibold transition-all duration-200",
                copied
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                    : "bg-zinc-900 border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500"
            )}
        >
            {copied ? (
                <><Check className="w-3.5 h-3.5" /> {t('copied')}</>
            ) : (
                <><Copy className="w-3.5 h-3.5" /> {label}</>
            )}
        </button>
    );
}

/** Readable post text with copy buttons: the condensed transcript, or letter + response. */
export function PostTextView({ transcript, userLabel, letter, response }: PostTextViewProps) {
    const t = useTranslations('feed');
    const [copiedField, setCopiedField] = useState<string | null>(null);

    const copy = async (field: string, text: string) => {
        await navigator.clipboard.writeText(text);
        setCopiedField(field);
        setTimeout(() => setCopiedField(null), 2000);
    };

    const speaker = (role: string) => role === 'user' ? userLabel : '✦ Ideal Self';

    return (
        <div className="border-t border-white/5 bg-zinc-950">
            <div className="p-4 space-y-4">
                {transcript && transcript.length > 0 ? (
                    // ── CONDENSED TRANSCRIPT TEXT VIEW ──
                    <>
                        {transcript.map((msg, idx) => (
                            <div key={idx} className="space-y-1.5">
                                {idx > 0 && <div className="border-t border-white/5" />}
                                <div className="flex items-center justify-between pt-1">
                                    <span className={cn(
                                        "text-[10px] font-bold uppercase tracking-widest",
                                        msg.role === 'user' ? 'text-zinc-500' : 'text-amber-500/70'
                                    )}>
                                        {speaker(msg.role)}
                                    </span>
                                    <CopyButton copied={copiedField === `msg-${idx}`} onCopy={() => copy(`msg-${idx}`, msg.text)} title="Copy message" />
                                </div>
                                <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                            </div>
                        ))}

                        {/* Copy all as caption */}
                        <CopyAllButton
                            copied={copiedField === 'all'}
                            onCopy={() => copy('all', transcript.map(m => `${speaker(m.role)}:\n${m.text}`).join('\n\n'))}
                            label={t('copyFullTranscript')}
                        />
                    </>
                ) : (
                    // ── LEGACY LETTER/RESPONSE TEXT VIEW ──
                    <>
                        <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{t('labelLetter')}</span>
                                <CopyButton copied={copiedField === 'letter'} onCopy={() => copy('letter', letter)} title={t('copyLetter')} />
                            </div>
                            <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">{letter}</p>
                        </div>

                        <div className="border-t border-white/5" />

                        <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{t('labelResponse')}</span>
                                <CopyButton copied={copiedField === 'response'} onCopy={() => copy('response', response)} title={t('copyResponse')} />
                            </div>
                            <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">{response}</p>
                        </div>

                        {/* Copy all as caption */}
                        <CopyAllButton
                            copied={copiedField === 'all'}
                            onCopy={() => copy('all', `${letter}\n\n${response}`.trim())}
                            label={t('copyFullCaption')}
                        />
                    </>
                )}
            </div>
        </div>
    );
}

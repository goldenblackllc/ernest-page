"use client";

import { useState } from "react";
import { Newspaper, TrendingUp, Sparkles, ChevronDown, ChevronUp, ExternalLink, RefreshCw, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

export interface SignalData {
    id: string;
    _type: 'signal';
    type: 'event' | 'context' | 'bright_spot';
    headline: string;
    summary: string;
    context: string;
    category: string;
    source_urls: string[];
    source_names: string[];
    image_url: string | null;
    news_date: string;
    bright_spot_type?: 'macro_trend' | 'micro_moment' | null;
    thread_id?: string | null;
    thread_label?: string | null;
    is_update?: boolean;
    created_at: { _seconds: number; _nanoseconds: number } | null;
}

const TYPE_CONFIG = {
    event: {
        label: 'THE SIGNAL',
        icon: Newspaper,
        borderClass: 'border-amber-500/20',
        bgClass: 'bg-amber-500/5',
        labelClass: 'text-amber-500',
        iconClass: 'text-amber-500',
        dotClass: 'bg-amber-500',
    },
    context: {
        label: 'THE SIGNAL',
        icon: TrendingUp,
        borderClass: 'border-blue-500/20',
        bgClass: 'bg-blue-500/5',
        labelClass: 'text-blue-500',
        iconClass: 'text-blue-500',
        dotClass: 'bg-blue-500',
    },
    bright_spot: {
        label: 'BRIGHT SPOT',
        icon: Sparkles,
        borderClass: 'border-emerald-500/20',
        bgClass: 'bg-emerald-500/5',
        labelClass: 'text-emerald-500',
        iconClass: 'text-emerald-500',
        dotClass: 'bg-emerald-500',
    },
};

export function SignalCard({ signal }: { signal: SignalData }) {
    const [isContextExpanded, setIsContextExpanded] = useState(false);

    const config = TYPE_CONFIG[signal.type] || TYPE_CONFIG.event;
    const Icon = config.icon;

    const timeAgo = signal.created_at
        ? formatDistanceToNow(new Date(signal.created_at._seconds * 1000), { addSuffix: true })
        : signal.news_date || 'today';

    const handleProcessWithCharacter = () => {
        const detail = {
            headline: signal.headline,
            summary: signal.summary,
            context: signal.context,
        };
        window.dispatchEvent(new CustomEvent('signal-process-with-character', { detail }));
    };

    return (
        <article className={cn(
            "bg-[#1a1a1a] border-b sm:border sm:rounded-xl overflow-hidden shadow-sm font-sans relative",
            "border-white/10",
        )}>
            {/* Accent strip */}
            <div className={cn(
                "absolute left-0 top-0 bottom-0 w-[3px] sm:rounded-l-xl",
                config.dotClass,
                "opacity-60"
            )} />

            {/* Header */}
            <div className="flex items-center gap-2 px-4 sm:px-5 pt-4 pb-2">
                <Icon className={cn("w-3.5 h-3.5", config.iconClass)} />
                <span className={cn("text-[10px] font-bold uppercase tracking-widest", config.labelClass)}>
                    {config.label}
                </span>

                {/* Developing thread chip */}
                {signal.thread_label && (
                    <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded-full">
                        <RefreshCw className="w-2.5 h-2.5" />
                        {signal.is_update ? 'UPDATE' : 'DEVELOPING'}: {signal.thread_label}
                    </span>
                )}

                <span className="text-[10px] text-zinc-600 ml-auto">
                    {timeAgo}
                </span>
            </div>

            {/* Hero Image */}
            {signal.image_url && (
                <div className="px-3 sm:px-4 mb-2">
                    <div className="relative w-full aspect-[21/9] sm:aspect-video rounded-xl overflow-hidden bg-zinc-900 border border-zinc-800">
                        <img
                            src={signal.image_url}
                            alt={signal.headline}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                            }}
                        />
                    </div>
                </div>
            )}

            {/* Headline */}
            <div className="px-4 sm:px-5 pb-2">
                <h3 className="text-base sm:text-lg font-bold text-white leading-tight">
                    {signal.headline}
                </h3>
            </div>

            {/* Summary */}
            <div className="px-4 sm:px-5 pb-3">
                <p className="text-sm sm:text-[15px] text-zinc-300 leading-relaxed whitespace-pre-wrap">
                    {signal.summary}
                </p>
            </div>

            {/* Context (expandable) */}
            {signal.context && (
                <div className="px-4 sm:px-5 pb-3">
                    {!isContextExpanded ? (
                        <button
                            onClick={() => setIsContextExpanded(true)}
                            className={cn(
                                "text-sm font-semibold transition-colors flex items-center gap-1",
                                config.labelClass,
                                "hover:opacity-80"
                            )}
                        >
                            See the bigger picture <ChevronDown className="w-4 h-4" />
                        </button>
                    ) : (
                        <>
                            <div className={cn(
                                "rounded-lg border p-3 sm:p-4 mb-2",
                                config.borderClass,
                                config.bgClass,
                            )}>
                                <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">
                                    {signal.context}
                                </p>
                            </div>
                            <button
                                onClick={() => setIsContextExpanded(false)}
                                className={cn(
                                    "text-sm font-semibold transition-colors flex items-center gap-1",
                                    config.labelClass,
                                    "hover:opacity-80"
                                )}
                            >
                                Show less <ChevronUp className="w-4 h-4" />
                            </button>
                        </>
                    )}
                </div>
            )}

            {/* Footer — sources + category + character CTA */}
            <div className="px-4 sm:px-5 pb-3 sm:pb-4 flex items-center justify-between">
                <div className="flex items-center gap-2 flex-wrap">
                    {signal.source_names?.length > 0 && (
                        <span className="text-[10px] text-zinc-600 font-medium">
                            via {signal.source_names.join(', ')}
                        </span>
                    )}
                    {signal.category && (
                        <span className={cn(
                            "text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border",
                            config.borderClass,
                            config.labelClass,
                            "opacity-60"
                        )}>
                            {signal.category}
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-3">
                    {/* Character Integration CTA */}
                    <button
                        onClick={handleProcessWithCharacter}
                        className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-500 hover:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 px-3 py-1.5 rounded-full border border-emerald-500/20 transition-all"
                    >
                        <MessageCircle className="w-3 h-3" />
                        Process with Character
                    </button>

                    {signal.source_urls?.[0] && (
                        <a
                            href={signal.source_urls[0]}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-zinc-600 hover:text-zinc-400 transition-colors"
                            title="Read original source"
                        >
                            <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                    )}
                </div>
            </div>
        </article>
    );
}

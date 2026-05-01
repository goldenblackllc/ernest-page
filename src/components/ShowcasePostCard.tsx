"use client";

import { useState } from "react";
import { User, Heart, MessageCircle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';

interface ShowcasePost {
    id: string;
    type: string;
    post_type?: string | null;
    title?: string | null;
    pseudonym?: string | null;
    letter?: string | null;
    response?: string | null;
    imagen_url?: string | null;
    directive_title?: string | null;
    unexpected_yield?: string | null;
    author_avatar_url?: string | null;
    like_count?: number;
    comments?: number;
    created_at?: { _seconds: number; _nanoseconds: number } | null;
}

interface ShowcasePostCardProps {
    post: ShowcasePost;
    onInteract: () => void;
    onExpandChange?: (expanded: boolean) => void;
}

function timeAgo(seconds: number): string {
    const now = Math.floor(Date.now() / 1000);
    const diff = now - seconds;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return `${Math.floor(diff / 604800)}w ago`;
}

export function ShowcasePostCard({ post, onInteract, onExpandChange }: ShowcasePostCardProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const pseudonym = post.pseudonym || 'Anonymous';
    const isRealityShift = post.post_type === 'reality_shift';
    const title = post.title || post.directive_title;

    // Parse letter content
    const rawLetter = isRealityShift ? (post.unexpected_yield || '') : (post.letter || '');
    const rawResponse = post.response || '';

    // Parse letter: extract greeting and body
    let greeting: string | null = null;
    let letterBody = rawLetter;
    if (!isRealityShift && rawLetter) {
        const lines = rawLetter.split('\n');
        if (/^dear\s/i.test(lines[0]?.trim() || '')) {
            greeting = lines[0].trim();
            letterBody = lines.slice(1).join('\n').trimStart();
        }
        // Strip trailing pseudonym sign-off
        letterBody = letterBody.replace(/\n-\s*.+$/, '').trim();
    }

    const timestamp = post.created_at?._seconds
        ? timeAgo(post.created_at._seconds)
        : '';

    const likes = post.like_count || 0;
    const commentCount = post.comments || 0;

    return (
        <div className="bg-[#1a1a1a] border-b sm:border border-white/10 sm:rounded-xl overflow-hidden shadow-sm backdrop-blur-sm relative group font-sans">
            {/* Subtle top accent */}
            <div className="h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

            {/* Header — same structure as FeedPostCard */}
            <div className="flex flex-row items-center gap-3 px-3 sm:px-4 py-3 sm:py-4 border-b border-white/5 bg-black/20 mb-2 w-full">
                <div className="shrink-0">
                    <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center border border-zinc-700 overflow-hidden relative">
                        {post.author_avatar_url ? (
                            <img
                                src={post.author_avatar_url}
                                alt=""
                                className="w-full h-full object-cover"
                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                        ) : null}
                        <User className={cn("w-5 h-5 text-zinc-400", post.author_avatar_url && "hidden")} />
                    </div>
                </div>
                <div className="flex flex-col flex-1 min-w-0">
                    <span className="text-sm font-semibold text-white truncate">{pseudonym}</span>
                    {timestamp && (
                        <div className="text-xs text-zinc-500 mt-0.5 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            <span>{timestamp}</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Body */}
            <div className="p-0 flex flex-col pt-4">
                {/* Image */}
                {post.imagen_url && (
                    <div className="px-3 sm:px-4 mb-2">
                        <div className="relative w-full aspect-[21/9] sm:aspect-video object-cover rounded-xl overflow-hidden bg-zinc-900 border border-zinc-800">
                            <img
                                src={post.imagen_url}
                                alt={title || "Post image"}
                                className="w-full h-full object-cover transition-all duration-500"
                            />
                        </div>
                    </div>
                )}

                {title && (
                    <div className="px-3 sm:px-4">
                        <h2 className="text-base sm:text-lg font-bold text-white mb-1 sm:mb-2 leading-tight">
                            {title}
                        </h2>
                    </div>
                )}

                {/* Letter & Response — same Q&A layout as FeedPostCard */}
                <div className={cn("px-3 sm:px-4 pb-3 sm:pb-4 mt-1", !isExpanded && "mb-2")}>
                    {/* Letter Block */}
                    {!isRealityShift && (
                        <div className="mb-4">
                            {greeting && (
                                <p className="text-sm sm:text-[15px] italic text-zinc-400 whitespace-pre-wrap leading-relaxed mb-1">
                                    {greeting}
                                </p>
                            )}
                            <p className={cn(
                                "text-sm sm:text-[15px] not-italic leading-relaxed text-zinc-300 whitespace-pre-wrap",
                                !isExpanded && "line-clamp-3"
                            )}>
                                {letterBody}
                            </p>
                        </div>
                    )}

                    {/* Reality Shift body */}
                    {isRealityShift && (
                        <p className={cn(
                            "text-sm sm:text-[15px] text-zinc-200 leading-relaxed whitespace-pre-wrap",
                            !isExpanded && "line-clamp-4"
                        )}>
                            {letterBody}
                        </p>
                    )}

                    {!isExpanded ? (
                        <button
                            onClick={(e) => { e.stopPropagation(); setIsExpanded(true); onExpandChange?.(true); }}
                            className="text-sm font-semibold text-zinc-400 hover:text-white mt-1 transition-colors duration-200"
                        >
                            Read more
                        </button>
                    ) : (
                        <>
                            {/* Response Block — the Ideal Self's advice */}
                            {!isRealityShift && rawResponse && (
                                <div className="text-zinc-100 not-italic text-sm sm:text-[15px] leading-relaxed [&_strong]:font-bold [&_strong]:text-white [&_em]:italic [&>p]:mb-4 [&>p:last-child]:mb-0">
                                    <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
                                        {rawResponse.replace(/^THE COUNSEL:\s*/i, '')}
                                    </ReactMarkdown>
                                </div>
                            )}

                            <button
                                onClick={(e) => { e.stopPropagation(); setIsExpanded(false); onExpandChange?.(false); }}
                                className="text-sm font-semibold text-zinc-400 hover:text-white mt-3 transition-colors duration-200"
                            >
                                Show less
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* Footer — like & comment counts, clicking scrolls to auth */}
            <div className="px-3 sm:px-4 py-3 sm:py-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <button
                        onClick={(e) => { e.stopPropagation(); onInteract(); }}
                        className={cn("flex items-center gap-1 transition-transform active:scale-75 hover:scale-110",
                            likes >= 1 ? "text-red-500" : "text-zinc-500 hover:text-red-500/80"
                        )}
                    >
                        <Heart className={cn("w-5 h-5", likes >= 1 && "fill-red-500")} />
                        {likes > 1 && <span className="text-xs font-medium">{likes}</span>}
                    </button>

                    <button
                        onClick={(e) => { e.stopPropagation(); onInteract(); }}
                        className="flex items-center gap-1 text-zinc-400 hover:text-white transition-colors active:scale-75 hover:scale-110"
                    >
                        <MessageCircle className={cn("w-5 h-5", commentCount >= 1 && "fill-zinc-400")} />
                        {commentCount > 1 && <span className="text-xs font-medium">{commentCount}</span>}
                    </button>
                </div>
            </div>
        </div>
    );
}

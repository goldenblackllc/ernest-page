"use client";

import { Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils/cn";
import type { Post } from "@/types/post";

interface ChatLine {
    role: string;
    content: string;
}

/** Parse content_raw (old format: "user: … assistant: …") into chat bubbles. */
function parseRaw(raw: string): ChatLine[] {
    const parts = raw.split(/(?=\b(?:user|assistant):\s)/i).filter(Boolean);
    return parts.flatMap(part => {
        const match = part.match(/^(user|assistant):\s*([\s\S]*)/i);
        return match ? [{ role: match[1].toLowerCase(), content: match[2].trim() }] : [];
    });
}

/** True when the post still carries the author's private conversation in some format. */
export function hasPrivateChat(post: Post): boolean {
    return Boolean(
        (post.conversation_messages && post.conversation_messages.length > 0) ||
        post.content_raw ||
        (post.rant && post.counsel)
    );
}

/** The author's original chat, shown only to them when they tap "Chat". */
export function AuthorChatTranscript({ post }: { post: Post }) {
    const t = useTranslations('feed');

    const messages: ChatLine[] = post.conversation_messages && post.conversation_messages.length > 0
        ? post.conversation_messages
        : post.content_raw ? parseRaw(post.content_raw) : [];

    return (
        <div className="border-t border-white/5 bg-zinc-950">
            <div className="p-4">
                <div className="flex items-center gap-2 mb-4">
                    <Lock className="w-3.5 h-3.5 text-emerald-500" />
                    <h3 className="text-xs font-bold text-emerald-500 uppercase tracking-widest">{t('originalChat')}</h3>
                </div>
                <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-1">
                    {messages.length > 0 ? messages.map((msg, idx) => (
                        <div key={idx} className={cn("flex", msg.role === 'user' ? "justify-end" : "justify-start")}>
                            <div className={cn(
                                "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                                msg.role === 'user'
                                    ? "bg-zinc-800 text-zinc-200 rounded-br-sm"
                                    : "bg-zinc-900/80 text-zinc-300 rounded-bl-sm border border-zinc-800"
                            )}>
                                {msg.content}
                            </div>
                        </div>
                    )) : (
                        // Final fallback — rant/counsel format
                        <div className="space-y-4">
                            {post.rant && <p className="text-sm text-zinc-300 leading-relaxed">{post.rant}</p>}
                            {post.counsel && (
                                <>
                                    <div className="border-t border-zinc-800" />
                                    <p className="text-sm text-zinc-400 leading-relaxed">{post.counsel}</p>
                                </>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

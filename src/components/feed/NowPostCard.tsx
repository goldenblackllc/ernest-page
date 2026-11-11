"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Lock, Trash2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/lib/auth/authFetch";
import { reviveCreatedAt, timestampToDate } from "@/lib/posts/timestamps";
import { formatMinutes, formatNowDate } from "@/components/now/format";
import { shownText } from "@functions/lib/now";
import type { NowPost } from "@/types/post";

/** How long to wait between checks for the polished text, which comes from a background function. */
const POLISH_CHECKS_MS = [4000, 6000, 8000, 12000, 20000, 30000, 45000, 60000];

/**
 * A Now post in the feed (functions/src/lib/now.ts): a page of the person's
 * scrapbook. Their photo, the action as the title, what happened. Only they ever
 * see it, so there's nothing to like, comment on or share; they can switch between
 * the polished words and their own, and delete it.
 */
export function NowPostCard({ post, onChange, onRequestDelete }: {
    post: NowPost;
    onChange: (post: NowPost) => void;
    onRequestDelete: (id: string) => void;
}) {
    const t = useTranslations("now");
    const tFeed = useTranslations("feed");
    const locale = useLocale();
    const { user } = useAuth();
    const [now] = useState(() => new Date());
    const created = timestampToDate(post.created_at);
    const text = shownText(post);

    // The polished text is written by a background function; pick it up when it lands
    useEffect(() => {
        if (!post.polishing || !user) return;
        let cancelled = false;
        let attempt = 0;
        let timer: ReturnType<typeof setTimeout>;
        const check = async () => {
            try {
                const res = await authFetch(user, `/api/now/posts?id=${encodeURIComponent(post.id)}`, { cache: "no-store" });
                if (res.ok) {
                    const { post: fresh } = (await res.json()) as { post?: NowPost };
                    if (!cancelled && fresh && !fresh.polishing) {
                        onChange(reviveCreatedAt(fresh));
                        return;
                    }
                }
            } catch {
                // checked again below
            }
            attempt += 1;
            if (!cancelled && attempt < POLISH_CHECKS_MS.length) timer = setTimeout(check, POLISH_CHECKS_MS[attempt]);
        };
        timer = setTimeout(check, POLISH_CHECKS_MS[0]);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [post.polishing, post.id, user, onChange]);

    const toggleRaw = async () => {
        if (!user) return;
        const showRaw = !post.show_raw;
        onChange({ ...post, show_raw: showRaw });
        try {
            const res = await authFetch(user, "/api/now/posts", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: post.id, show_raw: showRaw }),
            });
            if (!res.ok) throw new Error(`Now post update returned ${res.status}`);
        } catch (error) {
            console.error("Failed to switch the Now post's words:", error);
            onChange({ ...post, show_raw: !showRaw });
        }
    };

    return (
        <article className="bg-black border-b sm:border border-white/10 sm:rounded-xl overflow-hidden font-sans">
            {post.photo_url && (
                <img src={post.photo_url} alt="" loading="lazy" className="block w-full max-h-[80vh] object-cover" />
            )}
            <div className="px-4 pt-3 pb-3">
                <div className="flex items-center justify-between gap-3 text-[11px] text-zinc-400">
                    <span className="truncate">
                        <span className="font-bold text-white">{t("pill")}</span>
                        {created && ` · ${formatNowDate(created, now, locale, t)}`}
                        {post.minutes !== null && ` · ${formatMinutes(post.minutes, t)}`}
                    </span>
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-white/20 bg-black/50 px-1.5 py-0.5 font-bold tracking-wide text-white/70">
                        <Lock className="h-3 w-3" aria-hidden="true" />
                        {tFeed("visibilityPrivate")}
                    </span>
                </div>
                <h2 className="mt-1.5 text-2xl font-bold leading-tight tracking-tight text-white break-words">{post.action}</h2>
                {text && <p className="mt-1.5 whitespace-pre-line break-words text-sm leading-relaxed text-zinc-300">{text}</p>}
                <div className="mt-2.5 flex items-center justify-end gap-4 text-[11px] text-zinc-500">
                    {post.polishing ? (
                        <span>{t("polishing")}</span>
                    ) : post.polished_text ? (
                        <button type="button" onClick={toggleRaw} className="transition-colors duration-150 hover:text-white">
                            {post.show_raw ? t("showPolished") : t("showRaw")}
                        </button>
                    ) : null}
                    <button
                        type="button"
                        onClick={() => onRequestDelete(post.id)}
                        aria-label={t("delete")}
                        className="transition-colors duration-150 hover:text-white"
                    >
                        <Trash2 className="h-4 w-4" />
                    </button>
                </div>
            </div>
        </article>
    );
}

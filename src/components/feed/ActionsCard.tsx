"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check, X } from "lucide-react";
import type { User } from "firebase/auth";
import { authFetch } from "@/lib/auth/authFetch";
import type { Action } from "@functions/lib/actions";

type Pending = { done: boolean } | "removed";

/** Whether the saved list already shows the change. */
function isSaved(actions: Action[], id: string, change: Pending): boolean {
    const saved = actions.find(c => c.id === id);
    return change === "removed" ? !saved : !!saved && !!saved.done_at === change.done;
}

/**
 * Top of the feed: the actions the person decided on in their sessions
 * (functions/src/lib/actions.ts). Ticking one marks it done; it stays ticked
 * until the next session ends. Changes show at once and are sent to
 * /api/actions. Each one is shown until the profile subscription brings back
 * the saved list with it, so nothing flickers back in between.
 */
export function ActionsCard({ user, actions }: { user: User; actions: Action[] }) {
    const t = useTranslations("actions");
    const [pending, setPending] = useState<Record<string, Pending>>({});

    // The saved list changed: drop the changes it now shows.
    const [savedActions, setSavedActions] = useState(actions);
    if (actions !== savedActions) {
        setSavedActions(actions);
        setPending(prev => Object.fromEntries(Object.entries(prev).filter(([id, change]) => !isSaved(actions, id, change))));
    }

    const shown = actions.flatMap(c => {
        const p = pending[c.id];
        if (p === "removed") return [];
        return [{ ...c, done: p ? p.done : !!c.done_at }];
    });
    if (shown.length === 0) return null;

    async function send(id: string, change: Pending) {
        setPending(prev => ({ ...prev, [id]: change }));
        try {
            const res = await authFetch(user, "/api/actions", {
                method: change === "removed" ? "DELETE" : "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(change === "removed" ? { id } : { id, done: change.done }),
            });
            if (!res.ok) throw new Error(`Actions API returned ${res.status}`);
        } catch (error) {
            console.error("Action update failed:", error);
            // Not saved: show the saved list again, unless a newer change to this action is waiting.
            setPending(prev => {
                if (prev[id] !== change) return prev;
                const { [id]: _, ...rest } = prev;
                return rest;
            });
        }
    }

    return (
        <section className="bg-zinc-900/50 border border-white/10 rounded-xl px-4 py-3">
            <h2 className="text-[10px] text-zinc-400 uppercase tracking-widest font-bold">{t("title")}</h2>
            {/* The circle and the × are small, but each button reaches 8px around them so they're easy to tap. */}
            <ul className="mt-2 flex flex-col gap-2.5">
                {shown.map(c => (
                    <li key={c.id} className="flex items-start gap-3">
                        <button
                            type="button"
                            role="checkbox"
                            aria-checked={c.done}
                            aria-label={c.done ? t("markOpen") : t("markDone")}
                            onClick={() => send(c.id, { done: !c.done })}
                            className="-m-2 p-2 shrink-0 group"
                        >
                            <span className={`h-5 w-5 rounded-full border flex items-center justify-center transition-colors duration-150 ${c.done ? "bg-emerald-500 border-emerald-500" : "border-white/30 group-hover:border-white/60"}`}>
                                {c.done && <Check className="h-3 w-3 text-black" strokeWidth={3} />}
                            </span>
                        </button>
                        <p className={`min-w-0 flex-1 text-sm leading-5 transition-colors duration-150 ${c.done ? "text-zinc-400" : "text-zinc-100"}`}>{c.text}</p>
                        <button
                            type="button"
                            aria-label={t("remove")}
                            onClick={() => send(c.id, "removed")}
                            className="-m-2 p-2 shrink-0 text-zinc-600 hover:text-zinc-300 transition-colors duration-150"
                        >
                            <X className="h-4 w-4 mt-0.5" />
                        </button>
                    </li>
                ))}
            </ul>
        </section>
    );
}

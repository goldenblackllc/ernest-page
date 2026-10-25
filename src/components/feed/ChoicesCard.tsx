"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Check, X } from "lucide-react";
import type { User } from "firebase/auth";
import { authFetch } from "@/lib/auth/authFetch";
import type { Choice } from "@functions/lib/choices";

type Pending = { done: boolean } | "removed";

/**
 * Top of the feed: the choices the person made in their sessions
 * (functions/src/lib/choices.ts). Ticking one marks it done; it stays ticked
 * until the next session ends. Changes show at once and are sent to
 * /api/choices; the profile subscription brings back what was saved.
 */
export function ChoicesCard({ user, choices }: { user: User; choices: Choice[] }) {
    const t = useTranslations("choices");
    const format = useFormatter();
    const [pending, setPending] = useState<Record<string, Pending>>({});

    const shown = choices.flatMap(c => {
        const p = pending[c.id];
        if (p === "removed") return [];
        return [{ ...c, done: p ? p.done : !!c.done_at }];
    });
    if (shown.length === 0) return null;

    async function send(id: string, change: Pending) {
        setPending(prev => ({ ...prev, [id]: change }));
        try {
            const res = await authFetch(user, "/api/choices", {
                method: change === "removed" ? "DELETE" : "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(change === "removed" ? { id } : { id, done: change.done }),
            });
            if (!res.ok) throw new Error(`Choices API returned ${res.status}`);
        } catch (error) {
            console.error("Choice update failed:", error);
        } finally {
            // Saved or not, the subscription's copy is the truth again.
            setPending(prev => {
                const { [id]: _, ...rest } = prev;
                return rest;
            });
        }
    }

    return (
        <section className="bg-zinc-900/50 border border-white/10 rounded-xl px-5 py-4">
            <h2 className="text-[10px] text-zinc-400 uppercase tracking-widest font-bold">{t("title")}</h2>
            <ul className="mt-3 flex flex-col gap-3">
                {shown.map(c => (
                    <li key={c.id} className="flex items-start gap-3">
                        <button
                            type="button"
                            role="checkbox"
                            aria-checked={c.done}
                            aria-label={c.done ? t("markOpen") : t("markDone")}
                            onClick={() => send(c.id, { done: !c.done })}
                            className={`mt-0.5 h-5 w-5 shrink-0 rounded-full border flex items-center justify-center transition-colors duration-150 ${c.done ? "bg-emerald-500 border-emerald-500" : "border-white/30 hover:border-white/60"}`}
                        >
                            {c.done && <Check className="h-3 w-3 text-black" strokeWidth={3} />}
                        </button>
                        <div className="min-w-0 flex-1">
                            <p className={`text-sm transition-colors duration-150 ${c.done ? "text-zinc-400" : "text-zinc-100"}`}>{c.text}</p>
                            <p className="text-xs text-zinc-500 mt-0.5">
                                {t("chosenOn", { date: format.dateTime(new Date(`${c.chosen_on}T12:00:00`), { month: "short", day: "numeric" }) })}
                            </p>
                        </div>
                        <button
                            type="button"
                            aria-label={t("remove")}
                            onClick={() => send(c.id, "removed")}
                            className="mt-0.5 shrink-0 text-zinc-600 hover:text-zinc-300 transition-colors duration-150"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </li>
                ))}
            </ul>
        </section>
    );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import type { User } from "firebase/auth";
import { authFetch } from "@/lib/auth/authFetch";
import { cn } from "@/lib/utils/cn";
import { cleanOptions, MAX_OPTIONS, MAX_OPTION_LENGTH } from "@functions/lib/now";

/** The typed options, with one empty row at the end to add another (until the list is full). */
function withEmptyRow(options: string[]): string[] {
    const typed = options.filter((o) => o.trim());
    return typed.length < MAX_OPTIONS ? [...typed, ""] : typed;
}

/**
 * Take action: the person lists the options they have right now, a word or two
 * each, picks the one with the most pull and commits to it. With a single option
 * there is nothing to pick, so Commit takes it.
 */
export function TakeActionSheet({ user, startWith, onCommitted, onClose }: {
    user: User;
    /** Options to start the list with: the ones not picked last time, after Next. */
    startWith: string[];
    onCommitted: () => void;
    onClose: () => void;
}) {
    const t = useTranslations("now");
    const [options, setOptions] = useState(() => withEmptyRow(startWith));
    const [picked, setPicked] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const inputs = useRef<(HTMLInputElement | null)[]>([]);

    // A fresh list starts with the keyboard up, ready to type
    useEffect(() => {
        if (startWith.length === 0) inputs.current[0]?.focus();
    }, [startWith.length]);

    const isPicked = (option: string) => !!picked && !!option.trim() && option.trim().toLowerCase() === picked.toLowerCase();

    const change = (index: number, value: string) => {
        setError(null);
        setOptions((prev) => {
            const next = [...prev];
            next[index] = value;
            return next[next.length - 1].trim() && next.length < MAX_OPTIONS ? [...next, ""] : next;
        });
    };

    const pick = (option: string) => {
        setError(null);
        setPicked(option.trim());
    };

    const commit = async () => {
        const list = cleanOptions(options);
        const choice = list.length === 1 ? list[0] : list.find((o) => o.toLowerCase() === picked?.toLowerCase());
        if (list.length === 0) return setError(t("listFirst"));
        if (!choice) return setError(t("pickOne"));
        setSaving(true);
        setError(null);
        try {
            const res = await authFetch(user, "/api/now", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ options: list, action: choice }),
            });
            if (!res.ok) throw new Error(`Now commit returned ${res.status}`);
            onCommitted();
        } catch (err) {
            console.error("Failed to commit to the action:", err);
            setError(t("error"));
            setSaving(false);
        }
    };

    return (
        <div>
            <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-bold tracking-tight text-white">{t("takeAction")}</h2>
                <button type="button" onClick={onClose} aria-label={t("close")} className="-m-2 p-2 text-zinc-500 transition-colors duration-150 hover:text-white">
                    <X className="h-5 w-5" />
                </button>
            </div>
            <p className="mt-0.5 text-xs text-zinc-400">{t("takeActionHint")}</p>

            <div role="radiogroup" aria-label={t("takeAction")} className="mt-2">
                {options.map((option, i) => {
                    const empty = !option.trim();
                    const chosen = isPicked(option);
                    return (
                        <div
                            key={i}
                            className={cn(
                                "mt-2 flex h-11 items-center gap-3 rounded-xl border px-3 transition-colors duration-150",
                                chosen ? "border-white/50" : empty ? "border-dashed border-white/10" : "border-white/10",
                            )}
                        >
                            <button
                                type="button"
                                role="radio"
                                aria-checked={chosen}
                                aria-label={option.trim() || t("addOption")}
                                disabled={empty}
                                onClick={() => pick(option)}
                                className="-m-2 shrink-0 p-2"
                            >
                                <span className={cn(
                                    "flex h-4 w-4 items-center justify-center rounded-full border-[1.5px] transition-colors duration-150",
                                    chosen ? "border-white" : empty ? "border-zinc-700" : "border-zinc-500",
                                )}>
                                    {chosen && <span className="h-2 w-2 rounded-full bg-white" />}
                                </span>
                            </button>
                            <input
                                ref={(el) => { inputs.current[i] = el; }}
                                value={option}
                                onChange={(e) => change(i, e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key !== "Enter") return;
                                    e.preventDefault();
                                    inputs.current[i + 1]?.focus();
                                }}
                                placeholder={empty && i === options.length - 1 ? t("addOption") : undefined}
                                maxLength={MAX_OPTION_LENGTH}
                                enterKeyHint="next"
                                aria-label={t("option", { number: i + 1 })}
                                className="min-w-0 flex-1 bg-transparent text-sm font-bold text-white outline-none placeholder:font-medium placeholder:text-zinc-600"
                            />
                        </div>
                    );
                })}
            </div>

            {error && <p className="mt-3 text-xs text-red-400" role="alert">{error}</p>}
            <button
                type="button"
                onClick={commit}
                disabled={saving}
                className="mt-4 h-11 w-full rounded-full bg-emerald-500 text-sm font-bold text-black transition-transform duration-150 active:scale-[0.98] disabled:opacity-60"
            >
                {t("commit")}
            </button>
        </div>
    );
}

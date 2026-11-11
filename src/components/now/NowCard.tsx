"use client";

import { useTranslations } from "next-intl";
import type { Timestamp } from "firebase/firestore";
import type { NowUnderway } from "@functions/lib/now";
import { formatMinutes } from "./format";
import { openNowSheet } from "./nowSheet";
import { useElapsedMinutes } from "./useElapsedMinutes";

/**
 * The action underway, docked above the footer like a now-playing bar: what the
 * person committed to and for how long so far. Tapping it opens Finish.
 * The pages' bottom padding grows while it shows (data-now-card).
 */
export function NowCard({ underway }: { underway: NowUnderway<Timestamp> }) {
    const t = useTranslations("now");
    const minutes = useElapsedMinutes(underway.started_at);
    return (
        <div data-now-card className="px-4 pt-2">
            <button
                type="button"
                onClick={() => openNowSheet("finish")}
                aria-label={t("cardLabel", { action: underway.action })}
                className="flex h-11 w-full items-center gap-2.5 rounded-2xl border border-emerald-500/40 bg-zinc-900 pl-3.5 pr-1.5 text-left transition-transform duration-150 active:scale-[0.99]"
            >
                <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_0_4px_rgba(52,211,153,0.15)]" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-sm font-bold">
                    <span className="text-emerald-400">{t("pill")}</span>
                    <span className="text-white"> · {underway.action}</span>
                </span>
                {minutes !== null && <span className="shrink-0 text-xs tabular-nums text-zinc-500">{formatMinutes(minutes, t)}</span>}
                <span className="shrink-0 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-black">{t("finish")}</span>
            </button>
        </div>
    );
}

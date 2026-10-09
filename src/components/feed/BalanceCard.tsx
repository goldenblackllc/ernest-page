"use client";

import { useFormatter, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { AccessSummary } from "@functions/lib/access/sessionAccess";

/**
 * Top of the feed: how many sessions the person has (free + purchased), with
 * a link to Billing. Not shown to members; they have a session every day.
 */
export function BalanceCard({ summary }: { summary: AccessSummary }) {
    const t = useTranslations("payments");
    const format = useFormatter();
    if (summary.membership) return null;

    const available = summary.freeRemaining + summary.credits;
    const parts = [
        summary.freeRemaining > 0 ? t("balanceFree", { count: summary.freeRemaining }) : null,
        summary.credits > 0 ? t("balancePurchased", { count: summary.credits }) : null,
    ].filter(Boolean);

    return (
        <Link
            href="/billing"
            className="flex items-center justify-between gap-4 bg-zinc-900/50 border border-white/10 rounded-xl px-5 py-4 hover:border-white/20 transition-colors duration-150"
        >
            <div className="min-w-0">
                <p className="text-sm font-bold text-white">{t("balanceAvailable", { count: available })}</p>
                <p className="text-xs text-zinc-500 mt-0.5">
                    {available > 0
                        ? parts.join(" · ")
                        : summary.freeRenewsAt
                            ? t("balanceRenews", { date: format.dateTime(new Date(summary.freeRenewsAt), { month: "long", day: "numeric" }) })
                            : t("addSessions")}
                </p>
            </div>
            <span className="text-[10px] text-zinc-400 uppercase tracking-widest font-bold shrink-0">{t("billingTitle")}</span>
        </Link>
    );
}

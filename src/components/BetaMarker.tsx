"use client";

import { useTranslations } from "next-intl";

/** True when this build talks to the beta project: beta.earnestpage.com, or `npm run dev:beta`. */
const IS_BETA = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID === "earnest-page-beta";

/** A small "Beta" pill beside the brand, so a beta page is never mistaken for live. */
export function BetaMarker() {
    const t = useTranslations("common");
    if (!IS_BETA) return null;
    return (
        <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-amber-400">
            {t("betaMarker")}
        </span>
    );
}

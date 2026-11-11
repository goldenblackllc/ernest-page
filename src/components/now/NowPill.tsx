"use client";

import { useTranslations } from "next-intl";
import type { User } from "firebase/auth";
import type { CharacterProfile } from "@/types/character";
import { NowSheets } from "./NowSheets";
import { openNowSheet } from "./nowSheet";

/** The header's Now pill, beside Be: opens Take action, or Finish while an action is underway. */
export function NowPill({ user, profile }: { user: User; profile: CharacterProfile }) {
    const t = useTranslations("now");
    const underway = !!profile.now?.underway;
    return (
        <>
            <button
                type="button"
                onClick={() => openNowSheet(underway ? "finish" : "take")}
                className="rounded-full border border-white/25 px-3 py-1 text-sm font-bold text-white transition-transform duration-150 active:scale-95"
            >
                {t("pill")}
            </button>
            <NowSheets user={user} profile={profile} />
        </>
    );
}

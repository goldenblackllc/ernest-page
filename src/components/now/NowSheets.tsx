"use client";

import { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import type { User } from "firebase/auth";
import { MyLifeDrawer } from "@/components/mylife/MyLifeDrawer";
import type { CharacterProfile } from "@/types/character";
import type { NowPost } from "@/types/post";
import { EMPTY_DRAFT, FinishSheet, type FinishDraft } from "./FinishSheet";
import { TakeActionSheet } from "./TakeActionSheet";
import { NOW_POSTED_EVENT, openNowSheet, useNowSheet } from "./nowSheet";

/**
 * The Now drawer: Take action, then Finish, then Posted with Next (Take action
 * again, starting from the options not picked) or Close. What the person writes in
 * Finish waits here until they post or drop it.
 */
export function NowSheets({ user, profile }: { user: User; profile: CharacterProfile }) {
    const t = useTranslations("now");
    const sheet = useNowSheet();
    const [draft, setDraft] = useState<FinishDraft>(EMPTY_DRAFT);
    const [remaining, setRemaining] = useState<string[] | null>(null);
    const [startWith, setStartWith] = useState<string[]>([]);
    const underway = profile.now?.underway;

    const close = useCallback(() => {
        openNowSheet(null);
        setRemaining(null);
        setStartWith([]);
    }, []);

    if (!sheet) return null;

    const posted = (post: NowPost, left: string[]) => {
        setDraft(EMPTY_DRAFT);
        setRemaining(left);
        window.dispatchEvent(new CustomEvent(NOW_POSTED_EVENT, { detail: post }));
    };
    const dropped = () => {
        setDraft(EMPTY_DRAFT);
        close();
    };
    const next = () => {
        setStartWith(remaining || []);
        setRemaining(null);
        openNowSheet("take");
    };

    // In the page body: the header's backdrop blur would trap a fixed drawer inside it
    return createPortal(
        <MyLifeDrawer isOpen onClose={close} label={t("pill")} className="pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
            {remaining !== null ? (
                <div>
                    <p role="status" className="flex items-center gap-2 text-[15px] font-bold text-white">
                        <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-emerald-500 text-black" aria-hidden="true">
                            <Check className="h-3.5 w-3.5" strokeWidth={3} />
                        </span>
                        {t("posted")}
                    </p>
                    <div className="mt-4 flex gap-2">
                        <button
                            type="button"
                            onClick={next}
                            className="h-11 flex-1 rounded-full bg-white text-sm font-bold text-black transition-transform duration-150 active:scale-[0.98]"
                        >
                            {t("next")}
                        </button>
                        <button
                            type="button"
                            onClick={close}
                            className="h-11 flex-1 rounded-full border border-white/20 text-sm font-bold text-white transition-colors duration-150 hover:bg-white/10"
                        >
                            {t("close")}
                        </button>
                    </div>
                </div>
            ) : sheet === "finish" && underway ? (
                <FinishSheet
                    user={user}
                    underway={underway}
                    polishDefault={profile.now?.polish === true}
                    draft={draft}
                    setDraft={setDraft}
                    onPosted={posted}
                    onDropped={dropped}
                    onClose={close}
                />
            ) : (
                <TakeActionSheet user={user} startWith={startWith} onCommitted={close} onClose={close} />
            )}
        </MyLifeDrawer>,
        document.body,
    );
}

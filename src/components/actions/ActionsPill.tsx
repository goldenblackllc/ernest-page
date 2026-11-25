"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import type { User } from "firebase/auth";
import { MyLifeDrawer } from "@/components/mylife/MyLifeDrawer";
import { ActionsList, type SavedActions } from "@/components/actions/ActionsList";
import { useSeenActions } from "@/hooks/useSeenActions";
import type { CharacterProfile } from "@/types/character";
import { currentActions } from "@functions/lib/actions";
import { localDateKey, safeTimeZone } from "@functions/lib/utils/relativeDates";

/**
 * The header's score pill: "Be" and the lifetime score, a point for every tick.
 * It pulses while the list holds actions the person hasn't seen yet. Tapping it
 * opens the actions drawer: who they decided to be, then their actions.
 *
 * The list and score are the profile subscription's, or the newer ones the
 * drawer read from /api/actions since the subscription last changed them.
 */
export function ActionsPill({ user, profile }: { user: User; profile: CharacterProfile }) {
    const t = useTranslations("actions");
    const [isOpen, setIsOpen] = useState(false);
    const timeZone = safeTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
    const today = localDateKey(new Date(), timeZone);
    const subscribed: SavedActions = { actions: profile.actions || [], score: profile.action_score || 0 };
    const subscribedKey = JSON.stringify(subscribed);
    const [reply, setReply] = useState<{ since: string; saved: SavedActions } | null>(null);
    const { actions, score } = reply?.since === subscribedKey ? reply.saved : subscribed;
    const identity = profile.identity?.text;
    const ids = currentActions(actions, today).map(c => c.id);
    const { unseen, markSeen } = useSeenActions(user.uid, ids);

    if (ids.length === 0 && !identity) return null;

    const open = () => {
        setIsOpen(true);
        markSeen();
    };
    const close = () => {
        setIsOpen(false);
        markSeen();
    };

    return (
        <>
            <button
                type="button"
                onClick={open}
                aria-label={t("open", { count: score })}
                className="relative flex items-center gap-1.5 rounded-full bg-emerald-500 px-3 py-1 text-sm font-bold text-black transition-transform duration-150 active:scale-95"
            >
                {unseen && <span className="absolute inset-0 rounded-full bg-emerald-500 animate-ping" aria-hidden="true" />}
                <span className="relative">{t("pill")}</span>
                <span className="relative tabular-nums">{score}</span>
            </button>
            {/* In the page body: the header's backdrop blur would trap a fixed drawer inside it */}
            {isOpen && createPortal(
                <MyLifeDrawer isOpen onClose={close} label={t("title")} className="pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
                    {identity && <p className="mb-3 text-lg font-bold leading-snug text-white">{identity}</p>}
                    <ActionsList user={user} actions={actions} score={score} today={today} timeZone={timeZone} onSaved={saved => setReply({ since: subscribedKey, saved })} />
                </MyLifeDrawer>,
                document.body,
            )}
        </>
    );
}

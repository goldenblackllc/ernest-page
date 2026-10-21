"use client";

import { useEffect, useState } from "react";
import { currentSituation, type Situation } from "@functions/lib/character/situations";
import type { CharacterProfile } from "@/types/character";

const REFRESH_MS = 5 * 60 * 1000;

/**
 * Where the character is, by its weekly routine, and the avatar for that place
 * (the main avatar when the place has none). During a session (`sessionStartedAt`
 * set) it's where the character was when the session started, as in mirrorReply's
 * prompt; otherwise it re-checks every few minutes so a page left open follows
 * the character through its day.
 */
export function useCharacterNow(profile: CharacterProfile | null, sessionStartedAt?: number | null): { situation?: Situation; avatarUrl?: string } {
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const id = setInterval(() => setNow(new Date()), REFRESH_MS);
        return () => clearInterval(id);
    }, []);

    const at = sessionStartedAt ? new Date(sessionStartedAt) : now;
    const situation = currentSituation(profile?.bible?.style, at.getDay(), at.getHours());
    const avatarUrl = (situation && profile?.avatar?.situations?.[situation.id]) || profile?.avatar?.url;
    return { situation, avatarUrl };
}

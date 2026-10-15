"use client";

import { useEffect, useState } from "react";
import { currentSituation, type Situation } from "@functions/lib/character/situations";
import type { CharacterProfile } from "@/types/character";

const REFRESH_MS = 5 * 60 * 1000;

/**
 * Where the character is right now, by its weekly routine, and the avatar for
 * that place (the main avatar when the place has none). Re-checks every few
 * minutes so a page left open follows the character through its day.
 */
export function useCharacterNow(profile: CharacterProfile | null): { situation?: Situation; avatarUrl?: string } {
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const id = setInterval(() => setNow(new Date()), REFRESH_MS);
        return () => clearInterval(id);
    }, []);

    const situation = currentSituation(profile?.bible?.style, now.getDay(), now.getHours());
    const avatarUrl = (situation && profile?.avatar?.situations?.[situation.id]) || profile?.avatar?.url;
    return { situation, avatarUrl };
}

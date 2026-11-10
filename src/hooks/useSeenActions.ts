import { useCallback, useState } from "react";

const keyFor = (uid: string) => `ep-seen-actions-${uid}`;

function readSeen(uid: string): string[] {
    try {
        const stored = JSON.parse(localStorage.getItem(keyFor(uid)) || "[]");
        return Array.isArray(stored) ? stored : [];
    } catch {
        return [];
    }
}

/**
 * Whether the list holds actions the person hasn't seen in the actions drawer
 * yet, such as the ones a session just added. Remembered on this device only;
 * without storage every action counts as new.
 */
export function useSeenActions(uid: string, ids: string[]) {
    const [seen, setSeen] = useState(() => readSeen(uid));
    const unseen = ids.some(id => !seen.includes(id));
    const markSeen = useCallback(() => {
        setSeen(ids);
        try {
            localStorage.setItem(keyFor(uid), JSON.stringify(ids));
        } catch { /* storage blocked: the pulse comes back next visit */ }
    }, [uid, ids]);
    return { unseen, markSeen };
}

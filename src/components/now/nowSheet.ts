import { useSyncExternalStore } from "react";

/**
 * Which Now sheet is open (functions/src/lib/now.ts). The header's Now pill and the
 * card docked above the footer both open them, and NowSheets shows them.
 * - take: list the options right now, pick one, Commit.
 * - finish: say what happened, add a photo, Done.
 */
export type NowSheet = "take" | "finish" | null;

/** Sent on window with the new NowPost as its detail, so the feed shows it at once. */
export const NOW_POSTED_EVENT = "now-posted";

let current: NowSheet = null;
const listeners = new Set<() => void>();

export function openNowSheet(sheet: NowSheet) {
    current = sheet;
    listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

export function useNowSheet(): NowSheet {
    return useSyncExternalStore(subscribe, () => current, () => null);
}

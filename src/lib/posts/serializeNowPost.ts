import type { DocumentData } from "firebase-admin/firestore";
import type { NowPost } from "@/types/post";
import { POLISH_WAIT_MS, shownMinutes } from "@functions/lib/now";

/** A stored time in milliseconds (an admin Timestamp or its JSON form), NaN when missing. */
function timeMs(value: unknown): number {
    const time = value as { toMillis?: () => number; _seconds?: number } | null | undefined;
    if (typeof time?.toMillis === "function") return time.toMillis();
    return typeof time?._seconds === "number" ? time._seconds * 1000 : NaN;
}

/**
 * A Now post (functions/src/lib/now.ts) as the feed and /api/now/posts send it.
 * Only its author is ever sent one. The photo's storage path stays on the server.
 */
export function serializeNowPost(id: string, data: DocumentData, now = Date.now()): NowPost {
    const created = timeMs(data.created_at);
    return {
        kind: "now",
        id,
        action: data.action || "",
        raw_text: data.raw_text || "",
        polished_text: data.polished_text || null,
        show_raw: data.show_raw === true,
        photo_url: data.photo_url || null,
        minutes: shownMinutes(timeMs(data.started_at), created),
        polishing: data.polish === true && !data.polished_text && now - created < POLISH_WAIT_MS,
        created_at: Number.isNaN(created) ? null : { _seconds: Math.floor(created / 1000), _nanoseconds: 0 },
    };
}

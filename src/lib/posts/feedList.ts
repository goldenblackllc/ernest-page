import type { FeedEntry, NowPost } from "@/types/post";
import { timestampToDate } from "@/lib/posts/timestamps";

/** Whether a feed entry is one of the person's Now posts (functions/src/lib/now.ts) rather than a post. */
export function isNowPost(entry: FeedEntry): entry is NowPost {
    return "kind" in entry && entry.kind === "now";
}

/** The entries of `batch` created after `since` (ISO time) that the feed doesn't show yet. */
export function newerPosts<T extends FeedEntry>(shown: FeedEntry[], batch: T[], since: string | null): T[] {
    const sinceMs = since ? Date.parse(since) : 0;
    const shownIds = new Set(shown.map((p) => p.id));
    return batch.filter((p) => (timestampToDate(p.created_at)?.getTime() ?? 0) > sinceMs && !shownIds.has(p.id));
}

/** The feed with the entries of `batch` it doesn't show yet added at the end. */
export function appendPosts<T extends FeedEntry>(shown: T[], batch: T[]): T[] {
    const shownIds = new Set(shown.map((p) => p.id));
    return [...shown, ...batch.filter((p) => !shownIds.has(p.id))];
}

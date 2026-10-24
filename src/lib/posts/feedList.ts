import type { Post } from "@/types/post";
import { timestampToDate } from "@/lib/posts/timestamps";

/** The posts of `batch` created after `since` (ISO time) that the feed doesn't show yet. */
export function newerPosts(shown: Post[], batch: Post[], since: string | null): Post[] {
    const sinceMs = since ? Date.parse(since) : 0;
    const shownIds = new Set(shown.map((p) => p.id));
    return batch.filter((p) => (timestampToDate(p.created_at)?.getTime() ?? 0) > sinceMs && !shownIds.has(p.id));
}

/** The feed with the posts of `batch` it doesn't show yet added at the end. */
export function appendPosts(shown: Post[], batch: Post[]): Post[] {
    const shownIds = new Set(shown.map((p) => p.id));
    return [...shown, ...batch.filter((p) => !shownIds.has(p.id))];
}

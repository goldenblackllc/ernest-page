/**
 * Module-level in-memory feed cache.
 *
 * Because Next.js client-side navigation preserves the JS module scope,
 * this cache survives route changes (e.g. Home → Profile → Home).
 * The Ledger component reads from here on mount so it can render
 * instantly without showing a skeleton loader or re-fetching.
 */

let cachedEntries: any[] | null = null;
let cachedFollowingMap: Record<string, string> | null = null;
let cachedNewestPostTime: string | null = null;

export function getFeedCache() {
    return {
        entries: cachedEntries,
        followingMap: cachedFollowingMap,
        newestPostTime: cachedNewestPostTime,
    };
}

export function setFeedCache(
    entries: any[],
    followingMap: Record<string, string>,
    newestPostTime: string | null,
) {
    cachedEntries = entries;
    cachedFollowingMap = followingMap;
    cachedNewestPostTime = newestPostTime;
}

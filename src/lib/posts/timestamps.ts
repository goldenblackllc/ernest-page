import { Timestamp } from "firebase/firestore";

/** created_at as it arrives from the API ({ _seconds, _nanoseconds }) or from the client SDK (Timestamp). */
export type SerializedTimestamp = { _seconds: number; _nanoseconds?: number };

/** Converts a Timestamp or serialized { _seconds } object to a Date; null when absent or unrecognized. */
export function timestampToDate(value: Timestamp | SerializedTimestamp | null | undefined): Date | null {
    if (!value) return null;
    if ('toDate' in value && typeof value.toDate === 'function') return value.toDate();
    if ('_seconds' in value) return new Date(value._seconds * 1000);
    return null;
}

/** Turns a post's serialized created_at back into a Firestore Timestamp (mutates and returns the post). */
export function reviveCreatedAt<T extends { created_at?: unknown }>(post: T): T {
    const ts = post.created_at as Partial<SerializedTimestamp> | null | undefined;
    if (ts && ts._seconds !== undefined) {
        (post as { created_at?: unknown }).created_at = new Timestamp(ts._seconds, ts._nanoseconds || 0);
    }
    return post;
}

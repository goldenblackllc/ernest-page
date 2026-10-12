/**
 * Per-user data keys (envelope encryption). Each user has one random 256-bit
 * data key, stored only wrapped by the KMS key in `user_keys/{uid}` (no
 * client access, see firestore.rules). Unwrapped keys are cached in memory
 * briefly so a busy function makes about one KMS call per user per instance.
 */
import { randomBytes } from 'node:crypto';
import { DATA_KEY_BYTES } from './sealing.js';

/** Wraps and unwraps data keys with the master key (Cloud KMS in production). */
export interface KeyWrapper {
    /** Name of the master key, recorded with each wrapped key. */
    readonly keyName: string;
    wrap(dataKey: Buffer, aad: string): Promise<Buffer>;
    unwrap(wrapped: Buffer, aad: string): Promise<Buffer>;
}

export interface KeyRecord {
    /** base64 */
    wrapped_key: string;
    /** KMS key that wrapped it */
    kms_key: string;
    /** ms */
    created_at: number;
}

/** Where wrapped keys live (Firestore in production). */
export interface KeyRecordStore {
    get(uid: string): Promise<KeyRecord | null>;
    /** Create only if absent; false when another instance created one first. */
    create(uid: string, record: KeyRecord): Promise<boolean>;
}

export const KEY_CACHE_MS = 5 * 60 * 1000;

function wrapAad(uid: string): string {
    return `earnest-page/v1/user-key/${uid}`;
}

export function createUserKeys(store: KeyRecordStore, wrapper: KeyWrapper, now: () => number = Date.now) {
    const cache = new Map<string, { key: Buffer; expires: number }>();
    const pending = new Map<string, Promise<Buffer>>();

    async function load(uid: string): Promise<Buffer> {
        const existing = await store.get(uid);
        if (existing) return wrapper.unwrap(Buffer.from(existing.wrapped_key, 'base64'), wrapAad(uid));

        const dataKey = randomBytes(DATA_KEY_BYTES);
        const wrapped = await wrapper.wrap(dataKey, wrapAad(uid));
        const created = await store.create(uid, {
            wrapped_key: wrapped.toString('base64'),
            kms_key: wrapper.keyName,
            created_at: now(),
        });
        if (created) return dataKey;

        // Lost a race with another instance: use the key it saved.
        const winner = await store.get(uid);
        if (!winner) throw new Error(`User key for ${uid} vanished after a create conflict`);
        return wrapper.unwrap(Buffer.from(winner.wrapped_key, 'base64'), wrapAad(uid));
    }

    /** The user's data key, creating it on first use. */
    async function getDataKey(uid: string): Promise<Buffer> {
        if (!uid) throw new Error('Missing uid');
        const hit = cache.get(uid);
        if (hit && hit.expires > now()) return hit.key;

        let inflight = pending.get(uid);
        if (!inflight) {
            inflight = load(uid).finally(() => pending.delete(uid));
            pending.set(uid, inflight);
        }
        const key = await inflight;
        cache.set(uid, { key, expires: now() + KEY_CACHE_MS });
        return key;
    }

    return { getDataKey };
}

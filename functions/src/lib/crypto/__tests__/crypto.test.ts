// @vitest-environment node
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { fieldAad, isSealed, openWithKey, sealWithKey } from '../sealing';
import { createUserKeys, KEY_CACHE_MS, type KeyRecord, type KeyRecordStore, type KeyWrapper } from '../userKeys';

const key = randomBytes(32);

describe('sealing', () => {
    it('round-trips text, including non-ASCII', () => {
        const aad = fieldAad('u1', 'dossier');
        const sealed = sealWithKey(key, 'Hola — café ☕', aad);
        expect(isSealed(sealed)).toBe(true);
        expect(sealed).not.toContain('café');
        expect(openWithKey(key, sealed, aad)).toBe('Hola — café ☕');
    });

    it('uses a fresh IV each time', () => {
        const aad = fieldAad('u1', 'dossier');
        expect(sealWithKey(key, 'same', aad)).not.toBe(sealWithKey(key, 'same', aad));
    });

    it('refuses a value moved to another user or field', () => {
        const sealed = sealWithKey(key, 'secret', fieldAad('u1', 'dossier'));
        expect(() => openWithKey(key, sealed, fieldAad('u2', 'dossier'))).toThrow();
        expect(() => openWithKey(key, sealed, fieldAad('u1', 'session_recaps'))).toThrow();
    });

    it('refuses the wrong key and tampered ciphertext', () => {
        const aad = fieldAad('u1', 'dossier');
        const sealed = sealWithKey(key, 'secret', aad);
        expect(() => openWithKey(randomBytes(32), sealed, aad)).toThrow();
        const tampered = sealed.slice(0, -2) + (sealed.endsWith('A') ? 'B' : 'A') + sealed.slice(-1);
        expect(() => openWithKey(key, tampered, aad)).toThrow();
    });

    it('treats plaintext as not sealed', () => {
        expect(isSealed('DOSSIER\nUpdated: 2026-10-12')).toBe(false);
        expect(isSealed(['a'])).toBe(false);
        expect(isSealed(undefined)).toBe(false);
    });
});

/** A stand-in for KMS: AES-GCM with a fixed master key, plus call counts. */
function fakeWrapper(): KeyWrapper & { wraps: number; unwraps: number } {
    const master = randomBytes(32);
    const w = {
        keyName: 'projects/p/locations/global/keyRings/r/cryptoKeys/k',
        wraps: 0,
        unwraps: 0,
        async wrap(dataKey: Buffer, aad: string) {
            w.wraps++;
            const iv = randomBytes(12);
            const c = createCipheriv('aes-256-gcm', master, iv);
            c.setAAD(Buffer.from(aad));
            return Buffer.concat([iv, c.update(dataKey), c.final(), c.getAuthTag()]);
        },
        async unwrap(wrapped: Buffer, aad: string) {
            w.unwraps++;
            const d = createDecipheriv('aes-256-gcm', master, wrapped.subarray(0, 12));
            d.setAAD(Buffer.from(aad));
            d.setAuthTag(wrapped.subarray(wrapped.length - 16));
            return Buffer.concat([d.update(wrapped.subarray(12, wrapped.length - 16)), d.final()]);
        },
    };
    return w;
}

function memoryStore(): KeyRecordStore & { records: Map<string, KeyRecord> } {
    const records = new Map<string, KeyRecord>();
    return {
        records,
        async get(uid) { return records.get(uid) ?? null; },
        async create(uid, record) {
            if (records.has(uid)) return false;
            records.set(uid, record);
            return true;
        },
    };
}

describe('user keys', () => {
    it('creates a key once, stores it only wrapped, and reuses it', async () => {
        const store = memoryStore();
        const wrapper = fakeWrapper();
        const { getDataKey } = createUserKeys(store, wrapper);

        const first = await getDataKey('u1');
        expect(first).toHaveLength(32);
        const record = store.records.get('u1')!;
        expect(record.kms_key).toBe(wrapper.keyName);
        expect(Buffer.from(record.wrapped_key, 'base64').includes(first)).toBe(false);

        expect((await getDataKey('u1')).equals(first)).toBe(true);
        expect(wrapper.wraps).toBe(1);
    });

    it('gives each user a different key', async () => {
        const { getDataKey } = createUserKeys(memoryStore(), fakeWrapper());
        expect((await getDataKey('u1')).equals(await getDataKey('u2'))).toBe(false);
    });

    it('caches the unwrapped key, then unwraps again after it expires', async () => {
        const store = memoryStore();
        const wrapper = fakeWrapper();
        let t = 1_000;
        const first = await createUserKeys(store, wrapper, () => t).getDataKey('u1');

        const { getDataKey } = createUserKeys(store, wrapper, () => t);
        expect((await getDataKey('u1')).equals(first)).toBe(true);
        await getDataKey('u1');
        expect(wrapper.unwraps).toBe(1);
        t += KEY_CACHE_MS + 1;
        await getDataKey('u1');
        expect(wrapper.unwraps).toBe(2);
    });

    it('shares one load between concurrent callers', async () => {
        const store = memoryStore();
        const wrapper = fakeWrapper();
        const { getDataKey } = createUserKeys(store, wrapper);
        const [a, b] = await Promise.all([getDataKey('u1'), getDataKey('u1')]);
        expect(a.equals(b)).toBe(true);
        expect(wrapper.wraps).toBe(1);
    });

    it('uses the saved key when another instance created one first', async () => {
        const store = memoryStore();
        const wrapper = fakeWrapper();
        const other = await createUserKeys(store, wrapper).getDataKey('u1');

        // This instance looks before the other one saves, then loses the create.
        const racing: KeyRecordStore = {
            get: vi.fn().mockResolvedValueOnce(null).mockImplementation(store.get),
            create: async () => false,
        };
        const { getDataKey } = createUserKeys(racing, wrapper);
        expect((await getDataKey('u1')).equals(other)).toBe(true);
    });

    it('refuses a wrapped key moved to another user', async () => {
        const store = memoryStore();
        const wrapper = fakeWrapper();
        await createUserKeys(store, wrapper).getDataKey('u1');
        store.records.set('u2', store.records.get('u1')!);
        await expect(createUserKeys(store, wrapper).getDataKey('u2')).rejects.toThrow();
    });
});

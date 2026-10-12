/**
 * Field encryption for private user data (dossier, recaps, transcripts).
 *
 * Only Cloud Functions decrypt: the KMS key (PRIVACY_KMS_KEY, a full
 * `projects/…/cryptoKeys/…` name) lives in a project the company doesn't
 * administer, and only the Functions runtime service account may use it. The
 * website never imports this module; it asks a function for plaintext.
 *
 * openField passes plaintext through unchanged, so readers work on both
 * encrypted and not-yet-migrated values.
 */
import { KeyManagementServiceClient } from '@google-cloud/kms';
import { db } from '../firebase/admin.js';
import { fieldAad, isSealed, openWithKey, sealWithKey } from './sealing.js';
import { createUserKeys, type KeyRecord, type KeyRecordStore, type KeyWrapper } from './userKeys.js';

export { isSealed } from './sealing.js';

const ALREADY_EXISTS = 6;

function cloudKmsWrapper(keyName: string): KeyWrapper {
    const client = new KeyManagementServiceClient();
    return {
        keyName,
        async wrap(dataKey, aad) {
            const [res] = await client.encrypt({ name: keyName, plaintext: dataKey, additionalAuthenticatedData: Buffer.from(aad) });
            if (!res.ciphertext) throw new Error('KMS returned no ciphertext');
            return Buffer.from(res.ciphertext as Uint8Array);
        },
        async unwrap(wrapped, aad) {
            const [res] = await client.decrypt({ name: keyName, ciphertext: wrapped, additionalAuthenticatedData: Buffer.from(aad) });
            if (!res.plaintext) throw new Error('KMS returned no plaintext');
            return Buffer.from(res.plaintext as Uint8Array);
        },
    };
}

const firestoreKeyStore: KeyRecordStore = {
    async get(uid) {
        const snap = await db.collection('user_keys').doc(uid).get();
        return snap.exists ? (snap.data() as KeyRecord) : null;
    },
    async create(uid, record) {
        try {
            await db.collection('user_keys').doc(uid).create(record);
            return true;
        } catch (err) {
            if ((err as { code?: number }).code === ALREADY_EXISTS) return false;
            throw err;
        }
    },
};

let userKeys: ReturnType<typeof createUserKeys> | null = null;

export function encryptionConfigured(): boolean {
    return !!process.env.PRIVACY_KMS_KEY;
}

function keys() {
    const keyName = process.env.PRIVACY_KMS_KEY;
    if (!keyName) throw new Error('PRIVACY_KMS_KEY is not set');
    userKeys ??= createUserKeys(firestoreKeyStore, cloudKmsWrapper(keyName));
    return userKeys;
}

/** Encrypt any JSON value for one user's field. */
export async function sealField(uid: string, field: string, value: unknown): Promise<string> {
    const key = await keys().getDataKey(uid);
    return sealWithKey(key, JSON.stringify(value), fieldAad(uid, field));
}

/** Decrypt a value from sealField; anything not sealed is returned as is. */
export async function openField<T>(uid: string, field: string, value: unknown): Promise<T> {
    if (!isSealed(value)) return value as T;
    const key = await keys().getDataKey(uid);
    return JSON.parse(openWithKey(key, value, fieldAad(uid, field))) as T;
}

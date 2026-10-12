/**
 * AES-256-GCM sealing of one field value with a user's data key. Pure: no
 * Firestore, no KMS (see userKeys.ts and index.ts for those).
 *
 * A sealed value is a string: `ep1.<iv>.<ciphertext+tag>` (base64url). The
 * associated data binds it to one user and one field, so a sealed value
 * copied to another user or another field fails to open.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const PREFIX = 'ep1.';
const IV_BYTES = 12;
const TAG_BYTES = 16;
export const DATA_KEY_BYTES = 32;

export function isSealed(value: unknown): value is string {
    return typeof value === 'string' && value.startsWith(PREFIX);
}

export function sealWithKey(key: Buffer, plaintext: string, aad: string): string {
    if (key.length !== DATA_KEY_BYTES) throw new Error('Data key must be 32 bytes');
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from(aad, 'utf8'));
    const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final(), cipher.getAuthTag()]);
    return `${PREFIX}${iv.toString('base64url')}.${body.toString('base64url')}`;
}

export function openWithKey(key: Buffer, sealed: string, aad: string): string {
    if (!isSealed(sealed)) throw new Error('Not a sealed value');
    const [ivPart, bodyPart] = sealed.slice(PREFIX.length).split('.');
    const iv = Buffer.from(ivPart || '', 'base64url');
    const body = Buffer.from(bodyPart || '', 'base64url');
    if (iv.length !== IV_BYTES || body.length < TAG_BYTES) throw new Error('Malformed sealed value');
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAAD(Buffer.from(aad, 'utf8'));
    decipher.setAuthTag(body.subarray(body.length - TAG_BYTES));
    return Buffer.concat([decipher.update(body.subarray(0, body.length - TAG_BYTES)), decipher.final()]).toString('utf8');
}

/** Associated data for a field: binds the sealed value to its owner and field name. */
export function fieldAad(uid: string, field: string): string {
    return `earnest-page/v1/${uid}/${field}`;
}

/**
 * Loads a user's reference image (avatar) from Cloud Storage for use
 * as a character identity anchor in image generation.
 *
 * The reference image is stored at `avatars/{uid}_reference.jpg` (512px)
 * by the avatar generation endpoint. Falls back to the standard 256px
 * avatar at `avatars/{uid}.jpg` if no high-res reference exists.
 *
 * Returns null if no avatar exists (user hasn't completed onboarding).
 */

import { storage } from '@/lib/firebase/admin';

/**
 * Load the user's avatar reference image as a Buffer.
 * Returns null if no avatar is available.
 */
export async function loadUserReferenceImage(uid: string): Promise<Buffer | null> {
    const bucket = storage.bucket();

    // Prefer the high-res reference (512px), fall back to standard avatar (256px)
    const candidates = [
        `avatars/${uid}_reference.jpg`,
        `avatars/${uid}.jpg`,
    ];

    for (const fileName of candidates) {
        try {
            const file = bucket.file(fileName);
            const [exists] = await file.exists();
            if (!exists) continue;

            const [buffer] = await file.download();
            console.log(`[ReferenceImage] Loaded ${fileName} for user ${uid} (${buffer.length} bytes)`);
            return buffer;
        } catch (err: any) {
            console.warn(`[ReferenceImage] Failed to load ${fileName}:`, err.message);
        }
    }

    console.log(`[ReferenceImage] No avatar found for user ${uid} — generating without reference`);
    return null;
}

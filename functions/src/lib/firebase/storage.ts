import { storage } from './admin.js';

/**
 * Save a buffer to the default bucket, make it public, and return its URL.
 */
export async function uploadPublicFile(
    path: string,
    buffer: Buffer,
    metadata: { contentType: string; cacheControl?: string },
): Promise<string> {
    const bucket = storage.bucket();
    const file = bucket.file(path);

    await file.save(buffer, { metadata });

    // Try to make public; skip silently if Uniform Bucket-Level Access is on
    try { await file.makePublic(); } catch { /* UBLA enabled */ }

    return `https://storage.googleapis.com/${bucket.name}/${path}`;
}

/**
 * generateThumbnail.ts
 *
 * Generates a thumbnail image for a post using the v4 approach:
 *   1. Load the user's reference image (avatar)
 *   2. Send transcript + reference to Gemini Flash Image
 *   3. Let the AI figure out the visual — match the emotional tone
 *   4. Upload to GCS and return the public URL
 *
 * The thumbnail serves as the hero/preview image in the feed.
 */

import { generateImage } from './generateImage.js';
import { loadUserReferenceImage } from './loadUserReferenceImage.js';
import { uploadImageBuffer } from './generatePostImage.js';

interface GenerateThumbnailOptions {
    /** Condensed transcript messages */
    messages: Array<{ role: 'user' | 'ideal_self'; text: string }>;
    /** Post title */
    title: string | null;
    /** User ID — for loading reference image */
    uid: string;
    /** Post document ID — for GCS file naming */
    postId: string;
    /** Log prefix */
    logPrefix?: string;
}

/**
 * Generate a thumbnail image for a post.
 * Returns the public URL, or null if generation fails.
 */
export async function generateThumbnail(
    options: GenerateThumbnailOptions
): Promise<string | null> {
    const {
        messages,
        title,
        uid,
        postId,
        logPrefix = 'Thumbnail',
    } = options;

    try {
        // Format the conversation for the prompt, stripping "Dear Earnest" salutations
        const conversation = messages
            .map(m => `${m.role === 'user' ? 'Person' : 'Advisor'}: ${m.text.replace(/^Dear\s+Earnest[,:]?\s*/i, '')}`)
            .join('\n\n');

        // Load reference image for character consistency
        const referenceImage = await loadUserReferenceImage(uid);

        // The v4 prompt — let the AI figure it out, match the tone
        const prompt = `Generate a thumbnail image for this conversation.

TITLE: "${title || 'Untitled'}"

CONVERSATION:
${conversation.substring(0, 6000)}

INSTRUCTIONS:
- The thumbnail should communicate the subject matter so someone can tell what it's about at a glance
- Match the emotional tone — if the conversation is heavy, the thumbnail should feel heavy; if it's light, it should feel light
- Include short hook text overlay that fits the mood (use the title or a punchy version of it)
- Be visually creative and unique — think elevated YouTube, not cheap clickbait
- The typography, colors, and composition should all reflect the emotional tone
- No emojis, arrows, or red circles
- 16:9 landscape format`;

        console.log(`[${logPrefix}] Generating thumbnail for "${title}"...`);

        const result = await generateImage({
            prompt,
            aspectRatio: '16:9',
            logPrefix,
            referenceImages: referenceImage ? [referenceImage] : undefined,
            referenceMode: 'full',
        });

        if (!result) {
            console.warn(`[${logPrefix}] Thumbnail generation returned null`);
            return null;
        }

        // Upload to GCS under post-thumbnails/
        const url = await uploadThumbnailBuffer(result.buffer, postId);
        console.log(`[${logPrefix}] ✅ Thumbnail uploaded: ${url}`);
        return url;
    } catch (err: any) {
        // Don't let thumbnail failure crash the pipeline
        console.error(`[${logPrefix}] Thumbnail generation failed:`, err.message);
        return null;
    }
}

/**
 * Upload a thumbnail buffer to Cloud Storage and return its public URL.
 * Stored separately from per-message images at `post-thumbnails/`.
 */
async function uploadThumbnailBuffer(buffer: Buffer, postId: string): Promise<string> {
    // Reuse the existing upload infrastructure from generatePostImage
    // but with a distinct path prefix for thumbnails
    const { storage } = await import('../firebase/admin.js');
    const bucket = storage.bucket();
    const fileName = `post-thumbnails/${postId}.jpg`;
    const file = bucket.file(fileName);

    await file.save(buffer, {
        metadata: {
            contentType: 'image/jpeg',
            cacheControl: 'public, max-age=86400',
        },
    });

    try { await file.makePublic(); } catch { /* UBLA enabled */ }

    return `https://storage.googleapis.com/${bucket.name}/${fileName}`;
}

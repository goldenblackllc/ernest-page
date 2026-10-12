/**
 * generateThumbnail.ts
 *
 * Generates a thumbnail image for a post:
 *   1. Load the user's reference image (avatar)
 *   2. With a brief (posts): the Ideal Self doing the session's action,
 *      captioned with its insight. Only the brief goes to the image model,
 *      never the conversation. The thumbnail is a public file, so it shows the
 *      way forward, not the problem.
 *      Without one (the daily digest): the conversation, matching its tone.
 *   3. Upload to GCS and return the public URL
 *
 * The thumbnail serves as the hero/preview image in the feed.
 */

import { generateImage } from './generateImage.js';
import { loadUserReferenceImage } from './loadUserReferenceImage.js';
import { uploadPublicFile } from '../firebase/storage.js';
import { errorMessage } from '../utils/errors.js';
import type { ThumbnailBrief } from './condensedTranscript.js';

interface GenerateThumbnailOptions {
    /** Condensed transcript messages */
    messages: Array<{ role: 'user' | 'ideal_self'; text: string }>;
    /** Post title */
    title: string | null;
    /** User ID — for loading reference image */
    uid: string;
    /** Post document ID — for GCS file naming */
    postId: string;
    /** Insight, action and scene from the condensed transcript (posts; not the digest) */
    brief?: ThumbnailBrief | null;
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
        brief,
        logPrefix = 'Thumbnail',
    } = options;

    try {
        // Load reference image for character consistency
        const referenceImage = await loadUserReferenceImage(uid);

        const prompt = brief
            ? buildBriefThumbnailPrompt(brief, !!referenceImage)
            : buildConversationThumbnailPrompt(messages, title);

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
    } catch (err) {
        // Don't let thumbnail failure crash the pipeline
        console.error(`[${logPrefix}] Thumbnail generation failed:`, errorMessage(err));
        return null;
    }
}

/**
 * Upload a thumbnail buffer to Cloud Storage and return its public URL.
 * Stored separately from per-message images at `post-thumbnails/`.
 */
function uploadThumbnailBuffer(buffer: Buffer, postId: string): Promise<string> {
    return uploadPublicFile(`post-thumbnails/${postId}.jpg`, buffer, {
        contentType: 'image/jpeg',
        cacheControl: 'public, max-age=86400',
    });
}

/** The post thumbnail: the Ideal Self doing the action, with the insight as its only text. */
export function buildBriefThumbnailPrompt(brief: ThumbnailBrief, hasReference: boolean): string {
    return `Generate a thumbnail image.

SCENE: ${brief.scene}
${hasReference ? 'The person in the scene is the person in the reference image, as their best self: same face, at ease, unposed.\n' : ''}
TEXT: Set exactly these words on the image, and no other text: "${brief.insight}"
The words are calm and well typeset, legible at a small size, and part of the composition, not a banner over it.

STYLE:
- A single moment from everyday life, like a candid editorial photograph: natural light, warm, quiet and hopeful
- The action is what the image is about; the setting supports it
- No one else identifiable: anyone else is out of frame or out of focus
- No readable text besides the words above: no signs, screens with words, logos or brands
- No emojis, arrows or red circles
- 16:9 landscape format`;
}

/** The daily digest thumbnail: drawn from the conversation, matching its tone. */
function buildConversationThumbnailPrompt(messages: GenerateThumbnailOptions['messages'], title: string | null): string {
    // Strip "Dear Earnest" salutations
    const conversation = messages
        .map(m => `${m.role === 'user' ? 'Person' : 'Advisor'}: ${m.text.replace(/^Dear\s+Earnest[,:]?\s*/i, '')}`)
        .join('\n\n');

    return `Generate a thumbnail image for this conversation.

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
}

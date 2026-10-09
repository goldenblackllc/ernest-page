/**
 * Shared Image Generation Pipeline
 *
 * Extracted from cleanup-chats to be reused by any pipeline that needs
 * storyboard-style image generation (posts, daily digest, etc.).
 *
 * Single source of truth for: style selection, prompt construction,
 * image generation, validation, retry, resize, and upload.
 */

import sharp from 'sharp';
import { z } from 'zod';
import { uploadPublicFile } from '../firebase/storage.js';
import { generateImage } from './generateImage.js';
import { validateGeneratedImage } from './validateImage.js';
import { generateWithFallback, OPUS_MODEL, OPUS_FALLBACK } from './models.js';
import { buildBatchRequest, type BatchRequestEntry } from './batchImageGeneration.js';
import type { BibleSection } from '../bible.js';
import { errorMessage, isQuotaError } from '../utils/errors.js';


// ─── Low-level helpers ───────────────────────────────────────────────────────

/**
 * Resize a generated image to the standard 1280×720 JPEG used for post images.
 */
export function resizeToPostImage(buffer: Buffer): Promise<Buffer> {
    return sharp(buffer)
        .resize(1280, 720, { fit: 'cover', position: 'center' })
        .jpeg({ quality: 82 })
        .toBuffer();
}

/**
 * Generate a single image: prompt → Imagen → sharp resize → Buffer.
 */
async function generateSingleImage(
    prompt: string,
    fileId: string,
    referenceImages?: Buffer[],
    referenceMode?: 'full' | 'face-only',
): Promise<{ buffer: Buffer; prompt: string } | null> {
    const result = await generateImage({
        prompt,
        aspectRatio: '16:9',
        logPrefix: 'Storyboard',
        referenceImages,
        referenceMode,
    });
    if (!result) return null;

    return { buffer: await resizeToPostImage(result.buffer), prompt };
}

/**
 * Generate an image with validation + one retry using a reinforced prompt.
 * Returns the public GCS URL on success, or null on failure.
 * Throws quota errors so callers can stop batch processing.
 */
async function generateVerdictImage(
    prompt: string,
    fileId: string,
    referenceImages?: Buffer[],
    referenceMode?: 'full' | 'face-only',
): Promise<string | null> {
    try {
        // Attempt 1: Generate and validate
        const result = await generateSingleImage(prompt, fileId, referenceImages, referenceMode);
        if (!result) return null;

        const validation = await validateGeneratedImage(result.buffer, prompt);
        if (validation.pass) {
            return await uploadImageBuffer(result.buffer, fileId);
        }

        // Validation failed — retry once with reinforced prompt
        console.warn(`[Storyboard] Image validation failed for ${fileId} (attempt 1):`, validation.summary, validation.issues);
        const reinforcedPrompt = `${prompt} CRITICAL: Do not include any text, watermarks, metadata, words, letters, or numbers anywhere in the image. The image must be purely visual with zero text elements.`;
        const retry = await generateSingleImage(reinforcedPrompt, fileId, referenceImages, referenceMode);
        if (!retry) return null;

        const retryValidation = await validateGeneratedImage(retry.buffer, reinforcedPrompt);
        if (retryValidation.pass) {
            console.log(`[Storyboard] Image passed validation on retry for ${fileId}`);
            return await uploadImageBuffer(retry.buffer, fileId);
        }

        // Both attempts failed validation
        console.warn(`[Storyboard] Image validation failed on retry for ${fileId}:`, retryValidation.summary, '— skipping image for now');
        return null;
    } catch (err) {
        console.error("[Storyboard] Verdict image generation failed:", err);
        if (isQuotaError(err)) throw err; // propagate so callers can stop the batch
        return null;
    }
}

/**
 * Upload a JPEG buffer to Cloud Storage and return its public URL.
 */
export async function uploadImageBuffer(buffer: Buffer, fileId: string): Promise<string> {
    const url = await uploadPublicFile(`post-images/${fileId}_imagen_${Date.now()}.jpg`, buffer, {
        contentType: 'image/jpeg',
        cacheControl: 'public, max-age=86400',
    });
    console.log(`[Storyboard] Image uploaded for ${fileId}`);
    return url;
}

// ─── High-level orchestrator ─────────────────────────────────────────────────

// ─── Per-Message Image System ────────────────────────────────────────────────

export interface MessageImagePromptOptions {
    /** Condensed transcript messages (role + text) */
    messages: Array<{ role: 'user' | 'ideal_self'; text: string }>;
    /** Compiled character bible sections */
    compiledBible?: BibleSection[];
    /** Demographic appearance hint */
    demographicHint: string;
}

/**
 * Generate one Imagen prompt per conversation message via an AI director.
 *
 * The AI sees the full conversation and character bible, producing prompts
 * that carry the conversation arc forward and use camera-perspective
 * conventions (user = close/active, ideal_self = wider/environmental).
 *
 * This is a TEXT-ONLY call — no images are generated here. The prompts
 * are stored on the post for deferred image generation (Phase 2).
 */
export async function generateMessageImagePrompts(
    opts: MessageImagePromptOptions
): Promise<string[]> {
    const { messages, compiledBible, demographicHint } = opts;
    const numMessages = messages.length;

    const conversationText = messages
        .map((m, i) => `[${i + 1}] ${m.role === 'user' ? 'PERSON' : 'CONSULTANT'}: ${m.text}`)
        .join('\n\n');

    const bibleContext = compiledBible ? JSON.stringify(compiledBible) : '';

    const directorPrompt = `You are a Visual Director for an advice column called Earnest Page.
You're designing one photograph per message in this conversation.

For each message, create an image prompt that:
1. ILLUSTRATES the specific content of that message — what's being discussed, the situation, the setting.
2. Is grounded in this person's actual life (use their character bible for specific details about their world, style, spaces, people).
3. Carries forward the context of everything said before it — each image should make sense as part of the unfolding conversation.
4. Follows the camera perspective for the speaker:
   - PERSON messages: The character is IN the scene, active, close. We're right there with them in the moment they're describing. First-person energy.
   - CONSULTANT messages: The camera pulls wider. The character is still visible but smaller in the frame — seen from a distance, from behind, as a silhouette, or partially obscured by the environment. The world is the subject, but the person is still present.

Rules:
- Photorealistic. Cinematic lighting. 16:9 landscape orientation (1280×720).
- NO text, watermarks, words, letters, or numbers anywhere in the image.
- Ground every image in specific details from the character bible and the conversation. No generic stock-photo scenes.
- The tone of each image comes from the MESSAGE CONTENT, not from assumptions about the speaker's emotional state. A person asking about buying a suit gets an energetic shopping image. A person celebrating gets a celebratory image. Let the words drive the mood.
- Vary composition across images: mix close-ups, medium shots, wide shots, object details, environmental shots.
- Each prompt must be fully self-contained — it should describe the complete scene without referencing other prompts.

CHARACTER BIBLE:
${bibleContext}

CHARACTER APPEARANCE:
${demographicHint}

CONVERSATION (generate one prompt per message, in order):
${conversationText}

Return exactly ${numMessages} image prompts, one per message, in conversation order.`;

    try {
        const result = await generateWithFallback({
            primaryModelId: OPUS_MODEL,
            fallbackModelId: OPUS_FALLBACK,
            schema: z.object({
                prompts: z.array(z.string()).min(numMessages).max(numMessages),
            }),
            prompt: directorPrompt,
        });

        const prompts = result.object.prompts;
        console.log(`[MessageImages] Generated ${prompts.length} prompts for ${numMessages} messages`);
        return prompts;
    } catch (err) {
        console.error(`[MessageImages] Prompt generation failed:`, errorMessage(err));
        return [];
    }
}

export interface GenerateMessageImagesOptions {
    /** Pre-generated prompts (one per message) */
    prompts: string[];
    /** User ID for loading reference images */
    uid: string;
    /** File prefix for GCS uploads (typically post ID) */
    filePrefix: string;
    /** Reference images for character consistency */
    referenceImages?: Buffer[];
    /** Existing image URLs from a previous run — non-empty slots are skipped */
    existingUrls?: string[];
}

/**
 * Generate images from stored per-message prompts.
 *
 * Supports gap-filling: if `existingUrls` is provided, only generates
 * images for slots that are empty/falsy. This allows retries across
 * cron cycles without re-generating images that already succeeded.
 *
 * Returns an array of image URLs (index-aligned with prompts).
 * Missing images are represented as empty strings.
 */
export async function generateMessageImages(
    opts: GenerateMessageImagesOptions
): Promise<string[]> {
    const { prompts, filePrefix, referenceImages, existingUrls } = opts;

    const CONCURRENCY = 3;
    // Start with existing results (gap-filling) or empty array.
    // Always size to prompts.length so we never create a sparse array
    // (sparse gaps → undefined → Firestore rejects undefined values).
    const results: string[] = new Array(prompts.length).fill('');
    if (existingUrls) {
        for (let i = 0; i < Math.min(existingUrls.length, prompts.length); i++) {
            results[i] = existingUrls[i] || '';
        }
    }
    let quotaExhausted = false;

    // Only generate for missing indices
    const missingIndices = prompts
        .map((_, i) => (!results[i] && prompts[i]) ? i : -1)
        .filter(i => i >= 0);

    if (missingIndices.length === 0) {
        console.log(`[MessageImages] All ${prompts.length} images already present for ${filePrefix}`);
        return results;
    }

    console.log(`[MessageImages] Generating ${missingIndices.length}/${prompts.length} missing images for ${filePrefix}`);

    // Process missing images in batches of CONCURRENCY
    for (let batchStart = 0; batchStart < missingIndices.length; batchStart += CONCURRENCY) {
        if (quotaExhausted) break;

        const batchEnd = Math.min(batchStart + CONCURRENCY, missingIndices.length);
        const batchSlice = missingIndices.slice(batchStart, batchEnd);

        console.log(`[MessageImages] Batch ${Math.floor(batchStart / CONCURRENCY) + 1}: generating images ${batchSlice.map(i => i + 1).join(',')} of ${prompts.length}`);

        const batchResults = await Promise.allSettled(
            batchSlice.map(async (i) => {
                if (quotaExhausted) return null;
                try {
                    const url = await generateVerdictImage(
                        prompts[i],
                        `${filePrefix}_msg${i}`,
                        referenceImages,
                        i < 2 ? 'face-only' : 'full',
                    );
                    return { index: i, url };
                } catch (err) {
                    if (isQuotaError(err)) {
                        quotaExhausted = true;
                        console.warn(`[MessageImages] Quota exhausted at image ${i}/${prompts.length}`);
                    }
                    return { index: i, url: null };
                }
            })
        );

        for (const result of batchResults) {
            if (result.status === 'fulfilled' && result.value?.url) {
                results[result.value.index] = result.value.url;
            }
        }
    }

    const successCount = results.filter(Boolean).length;
    const prevCount = existingUrls?.filter(Boolean).length || 0;
    console.log(`[MessageImages] ${filePrefix}: ${successCount}/${prompts.length} total images (${successCount - prevCount} new this run)`);
    return results;
}

// ─── Batch API Support ───────────────────────────────────────────────────────

export interface BuildMessageImageBatchOptions {
    /** Pre-generated prompts (one per message) */
    prompts: string[];
    /** File prefix for GCS uploads and batch request keys */
    filePrefix: string;
    /** Reference images for character consistency */
    referenceImages?: Buffer[];
    /** Existing image URLs from a previous run — non-empty slots are skipped */
    existingUrls?: string[];
}

/**
 * Build batch request objects for missing per-message images.
 *
 * Instead of calling `generateVerdictImage()` directly (synchronous, full price),
 * this function creates batch request objects that can be submitted to the
 * Gemini Batch API at 50% cost.
 *
 * Returns an array of batch request objects (one per missing image) and
 * the indices they correspond to.
 */
export function buildMessageImageBatchRequests(
    opts: BuildMessageImageBatchOptions
): { requests: BatchRequestEntry[]; missingIndices: number[] } {
    const { prompts, filePrefix, referenceImages, existingUrls } = opts;

    // Build existing results array to identify gaps
    const existing: string[] = new Array(prompts.length).fill('');
    if (existingUrls) {
        for (let i = 0; i < Math.min(existingUrls.length, prompts.length); i++) {
            existing[i] = existingUrls[i] || '';
        }
    }

    // Only build requests for missing indices
    const missingIndices = prompts
        .map((_, i) => (!existing[i] && prompts[i]) ? i : -1)
        .filter(i => i >= 0);

    if (missingIndices.length === 0) {
        console.log(`[MessageImages] All ${prompts.length} images already present for ${filePrefix} — nothing to batch`);
        return { requests: [], missingIndices: [] };
    }

    console.log(`[MessageImages] Building batch requests for ${missingIndices.length}/${prompts.length} missing images for ${filePrefix}`);

    const requests = missingIndices.map(i => buildBatchRequest({
        key: `${filePrefix}_msg${i}`,
        prompt: prompts[i],
        referenceImages,
        // First 2 images use face-only mode (transformation arc)
        referenceMode: i < 2 ? 'face-only' : 'full',
        aspectRatio: '16:9',
    }));

    return { requests, missingIndices };
}

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
import { storage } from '@/lib/firebase/admin';
import { generateImage } from '@/lib/ai/generateImage';
import { validateGeneratedImage } from '@/lib/ai/validateImage';
import { loadUserReferenceImage } from '@/lib/ai/loadUserReferenceImage';
import { VISUAL_STYLES } from '@/lib/ai/visualStyles';
import { generateWithFallback, OPUS_MODEL, OPUS_FALLBACK } from '@/lib/ai/models';

const IMAGE_STAGGER_MS = 1500;

// ─── Low-level helpers ───────────────────────────────────────────────────────

/**
 * Generate a single image: prompt → Imagen → sharp resize → Buffer.
 */
export async function generateSingleImage(
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

    const finalBuffer = await sharp(result.buffer)
        .resize(1920, 1080, { fit: 'cover', position: 'center' })
        .png()
        .toBuffer();

    return { buffer: finalBuffer, prompt };
}

/**
 * Generate an image with validation + one retry using a reinforced prompt.
 * Returns the public GCS URL on success, or null on failure.
 * Throws quota errors so callers can stop batch processing.
 */
export async function generateVerdictImage(
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
    } catch (err: any) {
        console.error("[Storyboard] Verdict image generation failed:", err);
        if (err?.isQuotaError) throw err; // propagate so callers can stop the batch
        return null;
    }
}

/**
 * Upload a PNG buffer to Cloud Storage and return its public URL.
 */
export async function uploadImageBuffer(buffer: Buffer, fileId: string): Promise<string> {
    const bucket = storage.bucket();
    const ts = Date.now();
    const fileName = `post-images/${fileId}_imagen_${ts}.png`;
    const file = bucket.file(fileName);

    await file.save(buffer, {
        metadata: { contentType: 'image/png' },
    });

    try { await file.makePublic(); } catch { /* UBLA enabled */ }

    console.log(`[Storyboard] Image uploaded for ${fileId}`);
    return `https://storage.googleapis.com/${bucket.name}/${fileName}`;
}

// ─── High-level orchestrator ─────────────────────────────────────────────────

export interface StoryboardOptions {
    /** The text content to visualize (character bible section OR condensed transcript) */
    content: string;
    /** Full compiled character bible (used by cinematic/landscape styles for richer context) */
    compiledBible?: any[];
    /** User's demographic hint for character appearance in images */
    demographicHint: string;
    /** User ID — for loading reference images and file naming */
    uid: string;
    /** File prefix for GCS uploads (e.g. postDocRef.id or `digest_${uid}`) */
    filePrefix: string;
    /** Number of images to generate (default: 8 for posts, pass 3 for digest) */
    numImages?: number;
}

/**
 * Generate a set of storyboard images for a post or digest card.
 *
 * This is the SINGLE function both cleanup-chats (posts) and daily-digest call.
 * It handles: style selection → prompt construction → sequential generation →
 * validation + retry → upload. Returns an array of public image URLs.
 *
 * Any changes to styles, validation logic, retry behavior, or image processing
 * automatically apply to ALL pipelines that call this function.
 */
export async function generateStoryboardImages(opts: StoryboardOptions): Promise<string[]> {
    const { content, compiledBible, demographicHint, uid, filePrefix, numImages = 8 } = opts;

    // 1. Pick a random visual style
    const randomStyle = VISUAL_STYLES[Math.floor(Math.random() * VISUAL_STYLES.length)];
    console.log(`[Storyboard] Style — selected: "${randomStyle.id}" (${randomStyle.name}, category: ${randomStyle.category}) for ${filePrefix}`);

    // 2. Load reference image for character consistency
    const referenceImage = await loadUserReferenceImage(uid);
    let useReferenceImages = referenceImage ? [referenceImage] : undefined;

    // 3. Build prompts based on style category
    //    Uses compiledBible for landscape/cinematic styles (richer context),
    //    falls back to content for photographer styles (specific conversation/section).
    const contextForBible = compiledBible ? JSON.stringify(compiledBible) : content;
    let prompts: string[] = [];

    if (randomStyle.category === 'landscape') {
        // Landscape without the person — character bible, no reference images
        const prompt = `${randomStyle.imagenTag} ${contextForBible}`;
        prompts = Array(numImages).fill(prompt);
        useReferenceImages = undefined;

    } else if (randomStyle.category === 'landscape-with-person') {
        // Landscape with the person — character bible, with reference images
        const prompt = `${randomStyle.imagenTag} ${contextForBible}`;
        prompts = Array(numImages).fill(prompt);

    } else if (randomStyle.category === 'cinematic') {
        // AI generates bespoke prompts from character context
        console.log(`[Storyboard] Generating cinematic prompts for style "${randomStyle.id}" via AI...`);
        const styleDirection = randomStyle.id === 'life-magazine'
            ? `You are a photo editor at Life Magazine in its golden era. You're commissioning ${numImages} photographs for a photo essay about this person's life. Think like the great Life photographers — Gordon Parks, Margaret Bourke-White, W. Eugene Smith. Some images should be in vivid color, others in dramatic black and white. Each image should tell a story on its own — intimate, human, unforgettable. Documentary realism with cinematic beauty.`
            : `You are a Visual Director for an advice column called Earnest Page. You're creating ${numImages} photographs that capture moments from this person's life.`;

        try {
            const aiResult = await generateWithFallback({
                primaryModelId: OPUS_MODEL,
                fallbackModelId: OPUS_FALLBACK,
                schema: z.object({
                    prompts: z.array(z.string()).min(numImages).max(numImages),
                }),
                prompt: `${styleDirection}\n\nFirst, read the character's identity. For each image, choose:\n- A VIBE: the emotional feeling (luxury, grit, serenity, chaos, warmth, ambition, defiance, tenderness, solitude, celebration)\n- A SCALE: the shot type\n\nSCALE types:\n- "macro": Extreme close-up of an object, texture, or detail from their life.\n- "lifestyle": A composed scene or environment that tells a story — their workspace, kitchen, car, bedroom.\n- "wide": An aspirational landscape, cityscape, or architectural shot from their world.\n- "human": The person in the scene — hands doing something, walking, sitting, from behind, over-the-shoulder.\n\nRULES:\n- Highly photorealistic. Cinematic lighting. Instagram-quality.\n- 16:9 landscape orientation (1920×1080). No text or watermarks.\n- Vary the scales and vibes across all ${numImages} images.\n- The images should feel like snapshots from a real person's life — intimate, authentic, with depth.\n- Ground every image in specific details from the character.\n\nCHARACTER:\n${contextForBible}\nReturn exactly ${numImages} detailed Imagen prompts. Each should be a self-contained image description.`,
            });
            prompts = (aiResult.object as any).prompts;
            console.log(`[Storyboard] Generated ${prompts.length} cinematic prompts`);
        } catch (err: any) {
            console.error(`[Storyboard] Cinematic prompt generation failed:`, err.message);
        }

    } else if (randomStyle.variations && randomStyle.variations.length > 0) {
        // Studio poses — rotate through pose variations
        prompts = Array.from({ length: numImages }, (_, i) =>
            `${randomStyle.variations![i % randomStyle.variations!.length]} ${contextForBible}`
        );

    } else {
        // Photographer styles — imagenTag + content
        const tag = randomStyle.imagenTag || '';
        const prompt = tag ? `${tag}\n${content}` : content;
        prompts = Array(numImages).fill(prompt);
    }

    if (prompts.length === 0) {
        console.warn(`[Storyboard] No prompts generated for ${filePrefix} — returning empty`);
        return [];
    }

    // 4. Sequential generation with stagger delay to avoid 429 rate limits
    const imagen_urls: string[] = [];
    let quotaExhausted = false;

    for (let i = 0; i < prompts.length; i++) {
        if (quotaExhausted) break;
        if (i > 0) await new Promise(r => setTimeout(r, IMAGE_STAGGER_MS));
        try {
            const url = await generateVerdictImage(
                prompts[i], `${filePrefix}_${i}`,
                useReferenceImages, i < 2 ? 'face-only' : 'full'
            );
            if (url) imagen_urls.push(url);
        } catch (err: any) {
            if (err?.isQuotaError) {
                quotaExhausted = true;
                console.warn(`[Storyboard] Quota exhausted after ${imagen_urls.length}/${prompts.length} images for ${filePrefix} — stopping batch`);
            }
            // other errors already logged by generateVerdictImage
        }
    }

    console.log(`[Storyboard] Generated ${imagen_urls.length}/${prompts.length} images for ${filePrefix}`);
    return imagen_urls;
}

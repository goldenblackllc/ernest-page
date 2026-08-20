/**
 * Centralized image generation using Nano Banana 2 (Gemini 3.1 Flash Image).
 *
 * Upgraded from Flash-Lite to Flash for character consistency:
 * - Supports reference image inputs (up to 14) for identity anchoring
 * - Multi-turn editing and subject consistency via visual references
 * - Higher quality output at the cost of ~$0.045–0.067 per image (vs ~$0.00003 for Lite)
 *
 * Uses the @google/genai SDK to support the new AQ.-format API keys.
 */

import { GoogleGenAI } from '@google/genai';

const NANO_BANANA_MODEL = 'gemini-3.1-flash-image';

interface GenerateImageOptions {
    prompt: string;
    /** Aspect ratio — default '16:9' for landscape video feed */
    aspectRatio?: '1:1' | '9:16' | '16:9' | '4:3' | '3:4' | '4:5';
    /** Label for logs (e.g. 'Cron', 'RegeneratePost') */
    logPrefix?: string;
    /**
     * Reference images to anchor character identity.
     * Pass the user's avatar / hero reference as Buffer(s) so the model
     * maintains consistent facial geometry, hairstyle, build, and clothing.
     * The model supports up to 14 reference images per call.
     */
    referenceImages?: Buffer[];
    /**
     * Controls how strongly the reference image anchors the output.
     * - 'full' (default): Anchor on face, build, hair, and personal style.
     * - 'face-only': Anchor on face, hair, and ethnic features ONLY.
     *   The model is told to ignore the reference's body type/build and
     *   follow the text prompt instead. Used for early storyboard beats
     *   where the character's current physical state may differ from the
     *   aspirational avatar (transformation arc).
     */
    referenceMode?: 'full' | 'face-only';
}

interface GenerateImageResult {
    /** Raw image buffer (decoded from base64) */
    buffer: Buffer;
    /** MIME type of the generated image */
    mimeType: string;
}

/**
 * Generate an image using Nano Banana 2 (Gemini 3.1 Flash Image).
 * Returns the image buffer and MIME type, or null on failure.
 *
 * When `referenceImages` are provided, they are included as inlineData
 * parts in the request alongside the text prompt. This anchors the
 * model's output to the visual identity in the reference images,
 * producing consistent characters across multiple generations.
 */
export async function generateImage(options: GenerateImageOptions): Promise<GenerateImageResult | null> {
    const { prompt, aspectRatio = '16:9', logPrefix = 'ImageGen', referenceImages, referenceMode = 'full' } = options;
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;

    if (!apiKey) {
        console.error(`[${logPrefix}] No API key found (GEMINI_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY)`);
        return null;
    }

    try {
        const ai = new GoogleGenAI({ apiKey });

        // Build the parts array: reference images first (identity anchors), then text prompt
        const parts: any[] = [];

        if (referenceImages && referenceImages.length > 0) {
            for (const imgBuffer of referenceImages) {
                parts.push({
                    inlineData: {
                        mimeType: 'image/jpeg',
                        data: imgBuffer.toString('base64'),
                    },
                });
            }
            console.log(`[${logPrefix}] Including ${referenceImages.length} reference image(s) for character anchoring`);
        }

        // When using reference images, instruct the model on how to anchor identity.
        // 'full' mode anchors on everything (face, build, style).
        // 'face-only' mode anchors on face/hair only — lets the text prompt control
        // body type for transformation arc (e.g., early beats show current state).
        let referencePrefix = '';
        if (referenceImages && referenceImages.length > 0) {
            if (referenceMode === 'face-only') {
                referencePrefix = 'Use the reference image ONLY to maintain the character\'s face, hair, and ethnic features. Do NOT copy the body type, weight, build, or physique from the reference image — follow the body description in the text prompt below instead. Keep their facial identity consistent but let the scene dictate their physical state.\n\n';
            } else {
                referencePrefix = 'Use the reference image to maintain the character\'s identity — their face, build, hair, and personal style. Keep their clothing style consistent BUT remove any activity-specific gear (goggles, helmets, sports equipment) that does not fit the scene described below.\n\n';
            }
        }

        // Append aspect ratio instruction to the prompt so the model generates
        // in the correct orientation (the API doesn't support aspectRatio in generationConfig)
        const aspectRatioHint = aspectRatio === '9:16' ? ' 9:16 portrait orientation (1080×1920). Do not generate in landscape or square format.'
            : aspectRatio === '16:9' ? ' 16:9 landscape orientation. Do not generate in portrait or square format.'
            : aspectRatio === '4:3' ? ' 4:3 landscape orientation.'
            : aspectRatio === '3:4' ? ' 3:4 portrait orientation.'
            : aspectRatio === '4:5' ? ' 4:5 portrait orientation (1080×1350). Do not generate in landscape or square format.'
            : '';

        parts.push({ text: referencePrefix + prompt + aspectRatioHint });

        const response = await ai.models.generateContent({
            model: NANO_BANANA_MODEL,
            contents: [{ role: 'user', parts }],
            config: { responseModalities: ['IMAGE'] },
        });

        // Extract image from response
        const responseParts = response.candidates?.[0]?.content?.parts;
        if (!responseParts || responseParts.length === 0) {
            console.warn(`[${logPrefix}] No parts in response`);
            return null;
        }

        // Find the image part (inlineData with image MIME type)
        const imagePart = responseParts.find((p: any) => p.inlineData?.mimeType?.startsWith('image/'));
        if (!imagePart) {
            // Check for text-only response (possible safety filter)
            const textPart = responseParts.find((p: any) => p.text);
            if (textPart) {
                console.warn(`[${logPrefix}] Got text instead of image (possible safety filter):`, (textPart.text as string).slice(0, 200));
            } else {
                console.warn(`[${logPrefix}] No image data in response parts`);
            }
            return null;
        }

        const buffer = Buffer.from(imagePart.inlineData!.data as string, 'base64');
        return {
            buffer,
            mimeType: imagePart.inlineData!.mimeType as string,
        };
    } catch (err: any) {
        // Surface quota errors distinctly
        if (err.status === 429 || err.message?.includes('quota')) {
            const error = new Error('Image generation quota exhausted');
            (error as any).isQuotaError = true;
            throw error;
        }
        if ((err as any).isQuotaError) throw err;
        console.error(`[${logPrefix}] Image generation exception:`, err.message);
        return null;
    }
}


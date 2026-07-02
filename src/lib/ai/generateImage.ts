/**
 * Centralized image generation using Nano Banana 2 (Gemini 3.1 Flash Image).
 *
 * Upgraded from Flash-Lite to Flash for character consistency:
 * - Supports reference image inputs (up to 14) for identity anchoring
 * - Multi-turn editing and subject consistency via visual references
 * - Higher quality output at the cost of ~$0.045–0.067 per image (vs ~$0.00003 for Lite)
 *
 * Previous Lite model retained as fallback constant if needed.
 */

const NANO_BANANA_MODEL = 'gemini-3.1-flash-image';
// Retained for potential fallback on non-character images (landscapes, objects, etc.)
// const NANO_BANANA_LITE_MODEL = 'gemini-3.1-flash-lite-image';

interface GenerateImageOptions {
    prompt: string;
    /** Aspect ratio — default '9:16' for vertical shorts */
    aspectRatio?: '1:1' | '9:16' | '16:9' | '4:3' | '3:4';
    /** Label for logs (e.g. 'Cron', 'RegeneratePost') */
    logPrefix?: string;
    /**
     * Reference images to anchor character identity.
     * Pass the user's avatar / hero reference as Buffer(s) so the model
     * maintains consistent facial geometry, hairstyle, build, and clothing.
     * The model supports up to 14 reference images per call.
     */
    referenceImages?: Buffer[];
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
    const { prompt, aspectRatio = '9:16', logPrefix = 'ImageGen', referenceImages } = options;
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;

    if (!apiKey) {
        console.error(`[${logPrefix}] No API key found (GEMINI_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY)`);
        return null;
    }

    try {
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

        parts.push({ text: prompt });

        const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${NANO_BANANA_MODEL}:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        role: 'user',
                        parts,
                    }],
                    generationConfig: {
                        responseModalities: ['IMAGE'],
                        // Aspect ratio hint appended to the prompt since Nano Banana
                        // uses generationConfig differently from Imagen's parameters
                    },
                }),
            }
        );

        if (!res.ok) {
            const errText = await res.text().catch(() => '(unreadable)');
            console.error(`[${logPrefix}] Nano Banana API error ${res.status}:`, errText.slice(0, 500));

            // Surface quota errors distinctly
            if (res.status === 429) {
                const error = new Error('Image generation quota exhausted');
                (error as any).isQuotaError = true;
                throw error;
            }
            return null;
        }

        const data = await res.json();

        // Nano Banana returns image data in candidates[0].content.parts[]
        const responseParts = data.candidates?.[0]?.content?.parts;
        if (!responseParts || responseParts.length === 0) {
            console.warn(`[${logPrefix}] No parts in response:`, JSON.stringify(data).slice(0, 300));
            return null;
        }

        // Find the image part (inlineData with image MIME type)
        const imagePart = responseParts.find((p: any) => p.inlineData?.mimeType?.startsWith('image/'));
        if (!imagePart) {
            // Check for text-only response (possible safety filter)
            const textPart = responseParts.find((p: any) => p.text);
            if (textPart) {
                console.warn(`[${logPrefix}] Got text instead of image (possible safety filter):`, textPart.text.slice(0, 200));
            } else {
                console.warn(`[${logPrefix}] No image data in response parts:`, JSON.stringify(responseParts).slice(0, 300));
            }
            return null;
        }

        const buffer = Buffer.from(imagePart.inlineData.data, 'base64');
        return {
            buffer,
            mimeType: imagePart.inlineData.mimeType,
        };
    } catch (err: any) {
        if (err.isQuotaError) throw err; // let callers handle quota errors
        console.error(`[${logPrefix}] Image generation exception:`, err.message);
        return null;
    }
}

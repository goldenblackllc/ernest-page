import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateObject } from 'ai';
import { z } from 'zod';

// ─── Gemini Flash for cheap, fast image validation ───────────────────────────
const google = createGoogleGenerativeAI({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
});

const VALIDATION_MODEL = 'gemini-2.5-flash';

const validationSchema = z.object({
    pass: z.boolean().describe('true if the image is clean and matches the prompt, false otherwise'),
    issues: z.array(z.string()).describe('List of specific problems found. Empty if pass is true.'),
    summary: z.string().describe('One-line human-readable summary of the evaluation'),
});

export type ImageValidationResult = z.infer<typeof validationSchema>;

/**
 * Validates an AI-generated image by feeding it back through Gemini Flash
 * to check for prompt mismatches, burned-in text/metadata, anatomical errors,
 * and other common image generation artifacts.
 *
 * Cost: ~$0.0002 per call (Gemini 2.0 Flash pricing).
 *
 * On internal error (e.g. Gemini is down), returns pass=true so as not to
 * block the pipeline — the validator should never be the reason content fails.
 */
export async function validateGeneratedImage(
    imageBuffer: Buffer,
    originalPrompt: string,
): Promise<ImageValidationResult> {
    try {
        const result = await generateObject({
            model: google(VALIDATION_MODEL),
            schema: validationSchema,
            messages: [
                {
                    role: 'user',
                    content: [
                        {
                            type: 'text',
                            text: `You are an image quality inspector for an AI content platform. You are given an AI-generated image and the prompt that was used to generate it.

Evaluate the image against these criteria:

1. **TEXT ARTIFACTS** (most critical) — Does the image contain ANY visible text, letters, numbers, words, metadata, seed numbers, model names, prompt fragments, watermarks, or UI elements burned into it? Even partially legible or garbled text is a FAIL. The only exception is if the prompt explicitly requested text (e.g. a sign or logo).

2. **PROMPT MATCH** — Does the image reasonably match the intent and subject matter of the prompt? It doesn't need to be a literal match, but the general theme, mood, and subject should align.

3. **ANATOMICAL ISSUES** — If the image contains people: are there extra fingers, distorted faces, unnatural body proportions, merged limbs, or other anatomical errors?

4. **QUALITY** — Is the image sharp, well-composed, and free from obvious rendering artifacts like seams, tiling, color banding, or blurriness?

5. **FRAMING** — If the prompt requests a "headshot", "chest up", or "tight portrait", verify the image is framed accordingly. If the subject's waist, hips, legs, or full body are visible, this is a FAIL. The face and upper chest should fill the frame.

Be STRICT about text artifacts — any visible text in the image is a failure unless the prompt explicitly called for it. This is the #1 reason we are running this check.
Be STRICT about framing — if the prompt asks for a headshot and the image shows the full body, that is a failure.

THE PROMPT USED TO GENERATE THIS IMAGE:
"${originalPrompt}"`,
                        },
                        {
                            type: 'image',
                            image: imageBuffer,
                        },
                    ],
                },
            ],
        });

        return result.object;
    } catch (error: any) {
        // Validator should never block the pipeline — pass through on error
        console.warn('[ImageValidator] Validation failed, passing image through:', error.message);
        return {
            pass: true,
            issues: [],
            summary: `Validation skipped: ${error.message}`,
        };
    }
}

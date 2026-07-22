import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateObject } from 'ai';
import { z } from 'zod';

// ─── Gemini 3.6 Flash for cheap, fast image validation ───────────────────────
const google = createGoogleGenerativeAI({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
});

const VALIDATION_MODEL = 'gemini-3.6-flash';

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
 * Cost: ~$0.0002 per call (Gemini Flash pricing).
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

Your job is to catch REAL problems — AI artifacts, anatomical horrors, and completely wrong subjects. You are NOT here to nitpick minor creative differences between the prompt and the output.

Evaluate the image against these criteria:

1. **TEXT ARTIFACTS** (most critical) — Does the image contain burned-in generation artifacts such as: seed numbers, model names, prompt fragments, metadata overlays, garbled random characters, UI elements, or watermarks? These are a FAIL.
   - **EXCEPTION — Scene-appropriate text is ALLOWED**: Text that is a natural, in-context part of the image is NOT a failure. Examples: text on a t-shirt or band tee, patches/pins on a jacket, posters on a wall, signs in a scene, book spines, coffee cup logos, or any text that would realistically exist in the depicted environment. If the text looks like it belongs in the world of the image, it is fine.
   - Only fail for text that looks like it was accidentally burned into the image by the AI model (floating text, metadata, prompt leakage, random character strings, watermarks).
   - **"No text" in the generation prompt** refers ONLY to burned-in AI artifacts, watermarks, and overlaid metadata — NOT to text that naturally exists in the scene. Store signs, street signs, menu boards, book covers, clothing logos, and other real-world text are perfectly fine and should NOT be flagged.

2. **PROMPT MATCH** — Does the image reasonably match the THEME, MOOD, and SUBJECT of the prompt? Apply this LOOSELY:
   - The general scenario and emotional tone should align (e.g., if the prompt describes someone at a grocery store, the scene should be grocery-related, not at a beach).
   - Minor differences in clothing, accessories, exact camera angle, or precise framing are NOT failures. A "mid-shot" that comes out as a full-body shot is fine. A "hoodie" that becomes a jacket is fine. These are creative variations, not errors.
   - Only fail if the image is completely unrelated to the prompt (wrong subject, wrong setting, wrong mood entirely).

3. **ANATOMICAL ISSUES** (critical — HARD FAIL) — If the image contains people, perform an explicit body-part audit:
   - COUNT the arms on each person. Each person must have exactly 2 arms. Three or more arms = FAIL.
   - COUNT the legs on each person. Each person must have exactly 2 legs (unless seated/cropped). Three or more visible legs = FAIL.
   - COUNT the fingers on each visible hand. Each hand must have exactly 5 fingers. Six or more fingers = FAIL.
   - COUNT the heads. Each person must have exactly 1 head.
   - Check for merged, split, or duplicated limbs — two hands emerging from a single wrist, arms fused together, phantom extra appendages partially hidden behind the body.
   - Check for distorted faces — misaligned eyes, warped jaw, melted features, asymmetric proportions beyond what is natural.
   - Check for impossible joint angles, limbs bending the wrong way, or hands/feet attached at wrong positions.
   - ANY anatomical error is an automatic FAIL regardless of how good the rest of the image is. Do NOT apply leniency to anatomy.

4. **QUALITY** — Is the image sharp, well-composed, and free from obvious rendering artifacts like seams, tiling, color banding, or blurriness?

5. **FRAMING** — ONLY apply strict framing checks when the prompt explicitly requests a "headshot", "chest up", or "tight portrait". In those cases, showing the full body is a FAIL. For all other shot types (mid-shot, wide shot, editorial, cinematic, etc.), any reasonable framing is acceptable.

IMPORTANT PRINCIPLES:
- Be STRICT about AI-generated text artifacts, anatomical errors, and severe quality issues. Anatomical errors are NEVER acceptable — they are always a hard FAIL.
- Be LENIENT about creative interpretation — framing, clothing, exact poses, and minor details. The image generator is an artist, not a photocopier. If the image tells the right story in the right setting with the right mood, it passes.
- When in doubt about style/composition/framing, PASS the image. A slightly imperfect image is better than no image.
- When in doubt about anatomy, FAIL the image. A three-armed person is worse than no image.

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

import { NextResponse } from 'next/server';
import { generateImage } from '@/lib/ai/generateImage';
import { db, storage } from '@/lib/firebase/admin';
import { verifyAuth, unauthorizedResponse } from '@/lib/auth/serverAuth';
import sharp from 'sharp';
import { generateWithFallback, SONNET_MODEL } from '@/lib/ai/models';
import { z } from 'zod';
import { validateGeneratedImage } from '@/lib/ai/validateImage';
import { loadUserReferenceImage } from '@/lib/ai/loadUserReferenceImage';
import { computeAge } from '@/lib/utils/parseBirthDate';
import { PHOTOGRAPHER_CATALOG, getVisualStyle } from '@/lib/ai/visualStyles';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * POST /api/admin/regenerate-image
 *
 * Regenerates ALL hero images for an existing post using the
 * editorial storyboard system (5-6 beats: struggle → resolution).
 *
 * Body: { postId: string, prompt?: string, verdict?: string }
 *   - postId: required — the post to regenerate
 *   - prompt: optional — override a single imagen_prompt directly (generates 1 image)
 *   - verdict: optional — override the verdict text directly
 */
export async function POST(req: Request) {
    try {
        const uid = await verifyAuth(req);
        if (!uid) return unauthorizedResponse();

        const { postId, prompt: overridePrompt, verdict: overrideVerdict } = await req.json();
        if (!postId) {
            return NextResponse.json({ error: 'postId is required' }, { status: 400 });
        }

        // Fetch the post
        const postDoc = await db.collection('posts').doc(postId).get();
        if (!postDoc.exists) {
            return NextResponse.json({ error: 'Post not found' }, { status: 404 });
        }

        const postData = postDoc.data()!;

        // Verify ownership
        if (postData.authorId !== uid && postData.uid !== uid) {
            return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
        }

        const letter = postData.public_post?.letter || '';
        const response = postData.public_post?.response || '';

        // Determine the imagen_prompts — use override if provided, otherwise generate fresh via AI.
        let prompts: string[];
        let visualStyleId: string | null = null;

        if (overridePrompt) {
            // Single override prompt — generate just 1 image
            prompts = [overridePrompt];
        } else {
            console.log(`[RegenerateImage] Generating fresh storyboard prompts for post ${postId}`);
            // Build character appearance context for editorial storyboard
            const userDoc = await db.collection('users').doc(uid).get();
            const userData = userDoc.exists ? userDoc.data() : null;
            const identity = userData?.identity;
            const gender = identity?.gender || '';
            const ethnicity = identity?.ethnicity || '';
            const computedAge = computeAge(identity?.age);
            const demographicParts = [
                computedAge ? `approximately ${computedAge} years old` : '',
                ethnicity,
                gender,
            ].filter(Boolean);
            const dreamSelf = identity?.dream_self || '';
            const demographicTag = demographicParts.length > 0 ? demographicParts.join(', ') : '';
            const characterHint = demographicTag
                ? `\nCHARACTER APPEARANCE — MANDATORY: The main character's fixed traits (face, ethnicity, age, gender): ${demographicTag}. You MUST include "${demographicTag}" in EVERY prompt. If you omit this, the generator will default to a generic adult.${dreamSelf ? `\nTheir ASPIRATIONAL self-presentation (use for LATER beats only — pivot, move, outcome): "${dreamSelf}"` : ''}
TRANSFORMATION ARC: If the letter describes a physical state that differs from the aspirational self (e.g., overweight, exhausted, unkempt), show the character's ACTUAL current state in Beats 1-2 (struggle). Transition in Beat 3 (pivot). By Beats 4-5 (move, outcome), the character should embody their resolved/aspirational state. This visual transformation IS the story. The face stays the same — only the body, posture, and energy transform.`
                : '';

            const aiResult = await generateStoryboardPrompts(letter, response, characterHint);
            prompts = aiResult.imagen_prompts;

            const chosenStyle = getVisualStyle(aiResult.visual_style || '');
            const imagenTag = chosenStyle?.imagenTag || '';
            console.log(`[RegenerateImage] Photographer — AI returned: "${aiResult.visual_style}", resolved: "${chosenStyle?.id || 'NONE'}"`);
            // Prepend photographer tag to each prompt
            prompts = prompts.map(p => imagenTag ? `${imagenTag} ${p}` : p);

            // Store visual_style for Firestore update
            visualStyleId = aiResult.visual_style || null;
        }

        if (prompts.length === 0) {
            return NextResponse.json({ error: 'No imagen_prompts available and AI generation failed' }, { status: 400 });
        }

        console.log(`[RegenerateImage] Generating ${prompts.length} storyboard images for post ${postId}`);

        // Load the user's avatar as a character reference anchor.
        const referenceImage = await loadUserReferenceImage(uid);
        const referenceImages = referenceImage ? [referenceImage] : undefined;

        const generateSingleImage = async (prompt: string, idx: number): Promise<string | null> => {
            try {
                // Transformation arc: early beats (0-1) use face-only reference
                // so the text prompt controls body type. Later beats (2+) use
                // full reference to pull in the aspirational build.
                const referenceMode = idx < 2 ? 'face-only' as const : 'full' as const;
                const result = await generateImage({
                    prompt,
                    aspectRatio: '9:16',
                    logPrefix: 'RegenerateImage',
                    referenceImages,
                    referenceMode,
                });
                if (!result) return null;

                const finalBuffer = await sharp(result.buffer)
                    .resize(1080, 1920, { fit: 'cover', position: 'center' })
                    .png()
                    .toBuffer();

                // Validate image quality via Gemini Flash
                const validation = await validateGeneratedImage(finalBuffer, prompt);
                if (!validation.pass) {
                    console.warn(`[RegenerateImage] Image ${idx} failed validation:`, validation.summary, validation.issues);
                    // Continue anyway — don't block the whole storyboard
                }

                const bucket = storage.bucket();
                const ts = Date.now();
                const fileName = `post-images/${postId}_imagen_${ts}_${idx}.png`;
                const file = bucket.file(fileName);
                await file.save(finalBuffer, { metadata: { contentType: 'image/png' } });
                try { await file.makePublic(); } catch { /* UBLA enabled */ }
                return `https://storage.googleapis.com/${bucket.name}/${fileName}`;
            } catch (err: any) {
                console.error(`[RegenerateImage] Image ${idx} exception:`, err.message);
                return null;
            }
        };

        const imageResults = await Promise.allSettled(
            prompts.map((p: string, i: number) => generateSingleImage(p, i))
        );
        const imagen_urls = imageResults
            .map(r => r.status === 'fulfilled' ? r.value : null)
            .filter((url): url is string => url !== null);
        const imagen_url = imagen_urls[0] || null;

        if (imagen_urls.length === 0) {
            return NextResponse.json({ error: 'All image generations failed' }, { status: 502 });
        }

        if (imagen_urls.length < prompts.length) {
            console.warn(`[RegenerateImage] Only ${imagen_urls.length}/${prompts.length} images succeeded for post ${postId}`);
        }

        // Update the post
        await postDoc.ref.update({
            imagen_url,
            imagen_urls,
            imagen_prompt: prompts[0] || null,
            imagen_prompts: prompts,
            visual_style: visualStyleId,
            is_public: postData.visibility !== 'private',
        });

        console.log(`[RegenerateImage] ${imagen_urls.length}/${prompts.length} images updated for post ${postId}`);

        return NextResponse.json({
            success: true,
            imagen_url,
            imagen_urls,
            imagen_count: imagen_urls.length,
            imagen_requested: prompts.length,
        });
    } catch (error: any) {
        console.error('[RegenerateImage] Error:', error);
        return NextResponse.json({ error: error.message || 'Unexpected error' }, { status: 500 });
    }
}

// ─── Helper: Generate editorial storyboard prompts via AI ───
async function generateStoryboardPrompts(
    letter: string, response: string, characterHint: string = '',
): Promise<{ imagen_prompts: string[]; visual_style: string }> {
    const result = await generateWithFallback({
        primaryModelId: SONNET_MODEL,
        schema: z.object({
            imagen_prompts: z.array(z.string()).min(5).max(6).describe('5-6 editorial storyboard prompts for Google Imagen.'),
            visual_style: z.string().describe('The id of the chosen visual style'),
        }),
        prompt: `You are a Visual Director for an advice column on social media.
Your job: generate 5-6 editorial storyboard image prompts that tell this story visually — from struggle to resolution.

Earnest Page is a publication. These images are art-directed editorial photography — like a magazine commissioning a photo essay to accompany an advice column. The character (the person who wrote the letter) appears IN the images as the subject.

THE STORYBOARD ARC — 5-6 BEATS:

Beat 1 — THE STUCK MOMENT: The character in the exact situation described in the letter. Specific, recognizable.
Beat 2 — THE DETAIL (deepener): A closer shot of the object, screen, or environment that makes the situation real.
Beat 3 — THE PIVOT (turning point): A visual shift — lighting changes, scene shifts, the character's posture or energy changes.
Beat 4 — THE MOVE (advice in action): The character doing what the response suggests.
Beat 5 — THE OUTCOME (resolution): The character in the new state — wider shot, breathing room, different energy.
Beat 6 (optional) — THE EXHALE (emotional close): A final environmental or detail shot that leaves the viewer with a feeling.

CHARACTER CONSISTENCY: The same character must appear across all beats. Describe their fixed traits — face, ethnicity, age — consistently in every prompt.
TRANSFORMATION ARC: If the letter describes a physical state (e.g., overweight, exhausted, unkempt), show the character's ACTUAL current state in Beats 1-2. Transition in Beat 3. By Beats 4-5, the character embodies their resolved/aspirational state. The face stays the same — only body, posture, and energy transform.
EDITORIAL PHOTOGRAPHY RULES:
- NEVER have the character look directly at the camera. They are caught in a moment — unaware of the camera. Looking at something, doing something, lost in thought.
- The character must be DOING something in every image — not standing, not posing. The action creates the story.
- Use editorial composition — rule of thirds, intentional angles, depth of field. Every element in the frame is deliberate and art-directed. Shoot from slightly off-center, over-the-shoulder, or at an angle. Never a centered, symmetrical portrait.
- The key insight: show a character FEELING something — not just doing something.
PRODUCT PLACEMENT: If coffee is mentioned, use JURA machine + CREMA beans. If specific brands are mentioned, use exact names.

PHOTOGRAPHER SELECTION:
Choose ONE photographer from the catalog below whose vision best serves this story:
${PHOTOGRAPHER_CATALOG}
Return their id in the visual_style field.
Then BECOME that photographer — write every imagen prompt through their creative eye.

ALL prompts must follow these rules:
- Never CGI, 3D-rendered, or illustrated
- 9:16 portrait orientation (1080×1920)
- No text or watermarks in the image
- Keep the center area relatively uncluttered (subtitle text overlays there during video playback)
${characterHint}

POST:
Letter: ${letter}
Response: ${response}`,
    });

    return result.object as any;
}

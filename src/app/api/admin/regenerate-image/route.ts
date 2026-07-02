import { NextResponse } from 'next/server';
import { generateImage } from '@/lib/ai/generateImage';
import { db, storage } from '@/lib/firebase/admin';
import { verifyAuth, unauthorizedResponse } from '@/lib/auth/serverAuth';
import sharp from 'sharp';
import { generateWithFallback, SONNET_MODEL } from '@/lib/ai/models';
import { z } from 'zod';
import { validateGeneratedImage } from '@/lib/ai/validateImage';
import { computeAge } from '@/lib/utils/parseBirthDate';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * POST /api/admin/regenerate-image
 *
 * Regenerates the hero image for an existing post.
 * Always generates: Imagen background photo + verdict text overlay.
 * Can re-generate both the verdict and the imagen_prompt via AI,
 * or accept manual overrides.
 *
 * Body: { postId: string, prompt?: string, verdict?: string }
 *   - postId: required — the post to regenerate
 *   - prompt: optional — override the imagen_prompt directly
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

        // Determine the imagen_prompt — use override if provided, otherwise generate fresh via AI.
        let prompt = overridePrompt;

        if (!prompt) {
            console.log(`[RegenerateImage] Generating fresh imagen_prompt for post ${postId}`);
            // Build appearance hint from user's identity for accurate human figures
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
            const appearanceParts = [
                demographicParts.length > 0 ? `The user is ${demographicParts.join(', ')}.` : '',
                dreamSelf ? `Self-presentation: "${dreamSelf}"` : '',
            ].filter(Boolean);
            const demographicTag = demographicParts.length > 0 ? demographicParts.join(', ') : '';
            const appearanceHint = appearanceParts.length > 0
                ? `\nAPPEARANCE — MANDATORY: ${appearanceParts.join(' ')} The image generator has NO context about the user — you MUST explicitly describe any person as "${demographicTag}" in the prompt text. If you omit this, the generator will default to a generic adult.`
                : '';
            const aiResult = await generateImagenPrompt(letter, response, appearanceHint);
            prompt = aiResult.imagen_prompt;
        }

        if (!prompt) {
            return NextResponse.json({ error: 'No imagen_prompt available and AI generation failed' }, { status: 400 });
        }

        // Step 1: Generate background photo via Nano Banana
        console.log(`[RegenerateImage] Generating clean background image for post ${postId}`);

        const result = await generateImage({
            prompt,
            aspectRatio: '9:16',
            logPrefix: 'RegenerateImage',
        });

        if (!result) {
            return NextResponse.json({ error: 'Image generation failed' }, { status: 502 });
        }

        const photoBuffer = result.buffer;

        // Resize to 1080×1920 — no text overlay; subtitles are the text layer
        const finalBuffer = await sharp(photoBuffer)
            .resize(1080, 1920, { fit: 'cover', position: 'center' })
            .png()
            .toBuffer();

        // Validate image quality via Gemini Flash
        const validation = await validateGeneratedImage(finalBuffer, prompt);
        if (!validation.pass) {
            console.warn(`[RegenerateImage] Validation failed for post ${postId}:`, validation.summary, validation.issues);
        }

        // Step 3: Upload with cache-busting filename
        const bucket = storage.bucket();
        const ts = Date.now();
        const fileName = `post-images/${postId}_imagen_${ts}.png`;
        const file = bucket.file(fileName);

        await file.save(finalBuffer, { metadata: { contentType: 'image/png' } });
        try { await file.makePublic(); } catch { /* UBLA enabled */ }

        const imagen_url = `https://storage.googleapis.com/${bucket.name}/${fileName}`;

        // Update the post
        await postDoc.ref.update({
            imagen_url,
            imagen_prompt: prompt,
            is_public: postData.visibility !== 'private',
        });

        console.log(`[RegenerateImage] Clean image updated for post ${postId}`);

        return NextResponse.json({
            success: true,
            imagen_url,
            raiFilteredReason: null,
            validation,
        });
    } catch (error: any) {
        console.error('[RegenerateImage] Error:', error);
        return NextResponse.json({ error: error.message || 'Unexpected error' }, { status: 500 });
    }
}

// ─── Helper: Generate imagen_prompt via AI ───
async function generateImagenPrompt(
    letter: string, response: string, appearanceHint: string = '',
): Promise<{ imagen_prompt: string }> {
    const result = await generateWithFallback({
        primaryModelId: SONNET_MODEL,
        schema: z.object({
            imagen_prompt: z.string().describe('A prompt for Google Imagen to generate the background photo.'),
        }),
        prompt: `You are a Visual Director for an advice column on social media.
Your job: generate a background photo prompt for a post. A viewer who has never read the post should glance at this image and immediately know what life domain it's about — style, relationships, career, health, finances, food, body, or similar.

THE IMAGE MUST:
- Show the world of this specific story — the actions, behaviors, and situations described. A viewer scrolling past should instantly understand what this story is about from the image alone.
- You decide what scene best captures the story for social media. Pick the image that would make someone stop scrolling because they recognize the scene.
- Shot with a real camera — genuine, candid, photojournalistic. Never CGI, 3D-rendered, or illustrated.
- 9:16 portrait orientation (1080×1920). No text or watermarks in the image.
- Keep the center area relatively uncluttered — text overlays there during video playback.
${appearanceHint}
POST:
Letter: ${letter}
Response: ${response}`,
    });

    return result.object as any;
}



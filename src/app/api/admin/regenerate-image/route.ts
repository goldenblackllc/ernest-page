import { NextResponse } from 'next/server';
import { db, storage } from '@/lib/firebase/admin';
import { verifyAuth, unauthorizedResponse } from '@/lib/auth/serverAuth';
import sharp from 'sharp';
import { generateWithFallback, SONNET_MODEL } from '@/lib/ai/models';
import { z } from 'zod';

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
            const aiResult = await generateImagenPrompt(letter, response);
            prompt = aiResult.imagen_prompt;
        }

        if (!prompt) {
            return NextResponse.json({ error: 'No imagen_prompt available and AI generation failed' }, { status: 400 });
        }

        console.log(`[RegenerateImage] Generating clean background image for post ${postId}`);

        // Step 1: Generate background photo via Imagen
        const imagenRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    instances: [{ prompt }],
                    parameters: {
                        sampleCount: 1,
                        aspectRatio: '9:16',
                        personGeneration: 'ALLOW_ADULT',
                    },
                }),
            }
        );

        if (!imagenRes.ok) {
            const errorText = await imagenRes.text();
            console.error(`[RegenerateImage] Imagen API Error:`, errorText);
            return NextResponse.json({ error: 'Imagen API error', details: errorText }, { status: 502 });
        }

        const data = await imagenRes.json();
        const prediction = data.predictions?.[0];

        if (prediction?.raiFilteredReason) {
            console.warn(`[RegenerateImage] RAI filter for post ${postId}:`, prediction.raiFilteredReason);
            return NextResponse.json({
                error: 'Image was filtered by safety policy',
                raiFilteredReason: prediction.raiFilteredReason,
            }, { status: 422 });
        }

        if (!prediction?.bytesBase64Encoded) {
            console.warn(`[RegenerateImage] No image in response for post ${postId}:`, JSON.stringify(data));
            return NextResponse.json({ error: 'Imagen returned no image data' }, { status: 502 });
        }

        const photoBuffer = Buffer.from(prediction.bytesBase64Encoded, 'base64');

        // Resize to 1080×1920 — no text overlay; subtitles are the text layer
        const finalBuffer = await sharp(photoBuffer)
            .resize(1080, 1920, { fit: 'cover', position: 'center' })
            .png()
            .toBuffer();

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
            raiFilteredReason: prediction.raiFilteredReason || null,
        });
    } catch (error: any) {
        console.error('[RegenerateImage] Error:', error);
        return NextResponse.json({ error: error.message || 'Unexpected error' }, { status: 500 });
    }
}

// ─── Helper: Generate imagen_prompt via AI ───
async function generateImagenPrompt(
    letter: string, response: string,
): Promise<{ imagen_prompt: string }> {
    const result = await generateWithFallback({
        primaryModelId: SONNET_MODEL,
        schema: z.object({
            imagen_prompt: z.string().describe('A prompt for Google Imagen to generate the background photo.'),
        }),
        prompt: `You are a Visual Director for an advice column on social media.
Your job: generate a background photo prompt for a post. A viewer who has never read the post should glance at this image and immediately know what life domain it's about — style, relationships, career, health, finances, food, body, or similar.

THE IMAGE MUST:
- Show the world of the ANSWER, not the problem. The aspirational state. What life looks like when the advice has been taken.
- Unambiguously signal the topic. Style posts → a beautifully dressed person. Relationship posts → a meaningful human moment. Career posts → someone in their element professionally. Health posts → vitality, movement, the body at its best.
- Be premium, warm, editorial — like a high-end lifestyle brand campaign. Rich, natural light. Never cold, dark, or gloomy.
- Shot with a real camera — genuine, candid, photojournalistic. Never CGI, 3D-rendered, or illustrated.
- 9:16 portrait orientation (1080×1920). No text or watermarks in the image.
- Keep the center area relatively uncluttered — text overlays there during video playback.

POST:
Letter: ${letter}
Response: ${response}`,
    });

    return result.object as any;
}



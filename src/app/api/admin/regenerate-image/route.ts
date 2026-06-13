import { NextResponse } from 'next/server';
import { db, storage } from '@/lib/firebase/admin';
import { verifyAuth, unauthorizedResponse } from '@/lib/auth/serverAuth';
import { renderVerdictCard } from '@/lib/video/renderVerdictCard';
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

        const title = postData.public_post?.title || postData.title || 'Untitled';
        const letter = postData.public_post?.letter || '';
        const response = postData.public_post?.response || '';

        // Determine the verdict and imagen_prompt
        // If user provides overrides, use them. Otherwise, always generate fresh via AI.
        let verdict = overrideVerdict;
        let prompt = overridePrompt;

        if (!verdict || !prompt) {
            console.log(`[RegenerateImage] Generating fresh verdict + prompt for post ${postId}`);
            const aiResult = await generateVerdictAndPrompt(title, letter, response);
            verdict = verdict || aiResult.verdict;
            prompt = prompt || aiResult.imagen_prompt;
        }

        if (!prompt) {
            return NextResponse.json({ error: 'No imagen_prompt available and AI generation failed' }, { status: 400 });
        }

        console.log(`[RegenerateImage] Generating image for post ${postId} (verdict: "${verdict}")`);

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

        // Step 2: Composite verdict text over the photo
        const finalBuffer = await renderVerdictCard(photoBuffer, verdict || title);

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
            verdict,
            is_public: postData.visibility !== 'private',
        });

        console.log(`[RegenerateImage] Image updated for post ${postId}`);

        return NextResponse.json({
            success: true,
            imagen_url,
            verdict,
            raiFilteredReason: prediction.raiFilteredReason || null,
        });
    } catch (error: any) {
        console.error('[RegenerateImage] Error:', error);
        return NextResponse.json({ error: error.message || 'Unexpected error' }, { status: 500 });
    }
}

// ─── Helper: Generate verdict + imagen_prompt via AI ───
async function generateVerdictAndPrompt(
    title: string, letter: string, response: string,
): Promise<{ verdict: string; imagen_prompt: string }> {
    const result = await generateWithFallback({
        primaryModelId: SONNET_MODEL,
        schema: z.object({
            verdict: z.string().max(500).describe('Text overlay for the Instagram image. Summarizes the actual advice.'),
            imagen_prompt: z.string().describe('A prompt for Google Imagen to generate the background photo.'),
        }),
        prompt: `You are a Visual Director for an Instagram advice column called Earnest Page.

Given a post's title, letter, and response, generate:
1. A VERDICT — the text that goes on top of this post's Instagram image. Someone who only sees this text should understand what the advice was.
   BAD (too vague, says nothing): "Be the Gentleman.", "Today Already Counts."
   GOOD (actually says the advice): "A gentleman isn't defined by his wardrobe — it's how he treats people when no one is watching.", "Don't invite your sister. Her presence will make your son's day about her drama, not his achievement."
   Write it the way you'd text a friend the punchline of the article.
2. An IMAGEN_PROMPT — for a beautiful background photo that provides visual context. Warm, aspirational, visually stunning. The center area will have text overlaid, so keep it relatively simple there.

RULES:
- The verdict must actually say the specific advice, not be a generic tagline
- The photo must be visually stunning and attractive for social media
- WARM color grading (golden, natural) — NEVER cold blue/teal
- Photorealistic, 9:16 portrait, no text in the image

POST:
Title: ${title}
Letter: ${letter.slice(0, 500)}
Response: ${response.slice(0, 500)}`,
    });

    return result.object as any;
}


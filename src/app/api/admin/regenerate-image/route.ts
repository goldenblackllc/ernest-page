import { NextResponse } from 'next/server';
import { db, storage } from '@/lib/firebase/admin';
import { verifyAuth, unauthorizedResponse } from '@/lib/auth/serverAuth';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * POST /api/admin/regenerate-image
 *
 * Regenerates the hero image for an existing post using Imagen.
 * Requires the requesting user to be the post author.
 *
 * Body: { postId: string, prompt?: string }
 *   - postId: required — the post to regenerate
 *   - prompt: optional — override the imagen_prompt (otherwise uses stored prompt)
 */
export async function POST(req: Request) {
    try {
        const uid = await verifyAuth(req);
        if (!uid) return unauthorizedResponse();

        const { postId, prompt: overridePrompt } = await req.json();
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

        const prompt = overridePrompt || postData.imagen_prompt;
        if (!prompt) {
            return NextResponse.json({ error: 'No imagen_prompt on this post and no override provided' }, { status: 400 });
        }

        console.log(`[RegenerateImage] Generating image for post ${postId} (prompt override: ${!!overridePrompt})`);

        // Call Imagen API
        const imagenRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    instances: [{ prompt }],
                    parameters: {
                        sampleCount: 1,
                        aspectRatio: '16:9',
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

        // Log safety metadata
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

        // Upload to Cloud Storage
        const buffer = Buffer.from(prediction.bytesBase64Encoded, 'base64');
        const bucket = storage.bucket();
        const fileName = `post-images/${postId}_imagen.jpg`;
        const file = bucket.file(fileName);

        await file.save(buffer, {
            metadata: { contentType: 'image/jpeg' },
        });

        try { await file.makePublic(); } catch { /* UBLA enabled */ }

        const imagen_url = `https://storage.googleapis.com/${bucket.name}/${fileName}`;

        // Update the post
        const updates: Record<string, any> = {
            imagen_url,
            is_public: postData.visibility !== 'private',
        };
        if (overridePrompt) {
            updates.imagen_prompt = overridePrompt;
        }

        await postDoc.ref.update(updates);

        console.log(`[RegenerateImage] Image updated for post ${postId}`);

        return NextResponse.json({
            success: true,
            imagen_url,
            raiFilteredReason: prediction.raiFilteredReason || null,
            safetyAttributes: prediction.safetyAttributes || null,
        });
    } catch (error: any) {
        console.error('[RegenerateImage] Error:', error);
        return NextResponse.json({ error: error.message || 'Unexpected error' }, { status: 500 });
    }
}

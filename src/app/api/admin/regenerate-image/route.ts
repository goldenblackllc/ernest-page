import { NextResponse } from 'next/server';
import { generateImage } from '@/lib/ai/generateImage';
import { db, storage } from '@/lib/firebase/admin';
import { verifyAuth, unauthorizedResponse } from '@/lib/auth/serverAuth';
import sharp from 'sharp';
import { generateWithFallback, SONNET_MODEL } from '@/lib/ai/models';
import { z } from 'zod';
import { validateGeneratedImage } from '@/lib/ai/validateImage';

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

        if (overridePrompt) {
            // Single override prompt — generate just 1 image
            prompts = [overridePrompt];
        } else {
            console.log(`[RegenerateImage] Generating fresh scenic prompts for post ${postId}`);
            // Load user interests for scenic wallpaper generation
            const userDoc = await db.collection('users').doc(uid).get();
            const userData = userDoc.exists ? userDoc.data() : null;
            const identity = userData?.identity;
            const thingsIEnjoy = identity?.things_i_enjoy || userData?.character_bible?.source_code?.things_i_enjoy || '';

            const aiResult = await generateScenicPrompts(letter, response, thingsIEnjoy);
            prompts = aiResult.imagen_prompts;
        }

        if (prompts.length === 0) {
            return NextResponse.json({ error: 'No imagen_prompts available and AI generation failed' }, { status: 400 });
        }

        console.log(`[RegenerateImage] Generating ${prompts.length} scenic images for post ${postId}`);

        const generateSingleImage = async (prompt: string, idx: number): Promise<string | null> => {
            try {
                const result = await generateImage({
                    prompt,
                    aspectRatio: '9:16',
                    logPrefix: 'RegenerateImage',
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

// ─── Helper: Generate scenic wallpaper prompts via AI ───
async function generateScenicPrompts(
    letter: string, response: string, thingsIEnjoy: string = '',
): Promise<{ imagen_prompts: string[] }> {
    const interestsBlock = thingsIEnjoy
        ? `\nUSER'S INTERESTS:\n${thingsIEnjoy}\n\nUse these interests as inspiration for the scenic images. Each image should depict something the user enjoys — a place, hobby, object, or environment related to their interests.`
        : `\nNo specific user interests available. Generate generic beautiful scenery — nature landscapes, cityscapes at golden hour, calm water, lush greenery, cozy interiors, etc.`;

    const result = await generateWithFallback({
        primaryModelId: SONNET_MODEL,
        schema: z.object({
            imagen_prompts: z.array(z.string()).min(5).max(6).describe('5-6 scenic/lifestyle image prompts for Google Imagen.'),
        }),
        prompt: `You are a Visual Director generating ambient background images for a short-form video.

Generate 5-6 scenic/lifestyle image prompts based on the user's interests. These are beautiful ambient backgrounds — NO PEOPLE in any image. They have no relationship to the letter content. Each image is a standalone beautiful photograph of something the user enjoys.
${interestsBlock}

Rules:
- Real camera photography. Natural lighting.
- Never CGI, 3D-rendered, or illustrated.
- 9:16 portrait orientation (1080×1920).
- No text or watermarks.
- No people, no faces, no hands.
- Keep the center area relatively uncluttered (subtitle text overlays there during video playback).
- PRODUCT PLACEMENT: Any image featuring coffee/espresso MUST show a JURA automatic espresso machine and/or CREMA coffee beans — never a generic machine. If user interests mention a specific brand, use the exact name.`,
    });

    return result.object as any;
}

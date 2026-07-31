import { NextResponse } from 'next/server';
import { db, storage } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { verifyAuth, unauthorizedResponse } from '@/lib/auth/serverAuth';
import { generateConversationAudio, getEarnestVoiceForUser } from '@/lib/ai/postTTS';
import { generateCondensedTranscript } from '@/lib/ai/condensedTranscript';
import { generateWithFallback, OPUS_MODEL, OPUS_FALLBACK } from '@/lib/ai/models';
import { generateImage } from '@/lib/ai/generateImage';
import { validateGeneratedImage } from '@/lib/ai/validateImage';
import { loadUserReferenceImage } from '@/lib/ai/loadUserReferenceImage';
import { VISUAL_STYLES, getVisualStyle } from '@/lib/ai/visualStyles';
import sharp from 'sharp';
import { z } from 'zod';

export const runtime = 'nodejs';
export const maxDuration = 240;

/**
 * POST /api/admin/regenerate-post
 *
 * Regenerates EVERYTHING for an existing post:
 *   1. Condensed transcript (from stored raw transcript)
 *   2. Dual-voice TTS audio (user voice + ideal self voice)
 *   3. Images (cinematic prompts from character bible, 3:4 aspect ratio)
 *
 * Requires the post to have `content_raw` (the original chat transcript).
 *
 * Body: { postId: string }
 */
export async function POST(req: Request) {
    try {
        const uid = await verifyAuth(req);
        if (!uid) return unauthorizedResponse();

        const { postId } = await req.json();
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

        const transcript = postData.content_raw;
        if (!transcript) {
            return NextResponse.json({ error: 'Post has no stored transcript (content_raw) — cannot regenerate' }, { status: 400 });
        }

        // Fetch user data for character bible and voice
        const userDoc = await db.collection('users').doc(uid).get();
        const userData = userDoc.data();
        if (!userData) {
            return NextResponse.json({ error: 'User data not found' }, { status: 404 });
        }

        const characterVoiceId = userData?.character_bible?.voice_id;
        const compiledBible = userData?.character_bible?.compiled_output?.ideal || [];
        const identity = userData?.identity;
        const gender = identity?.gender || '';

        console.log(`[RegeneratePost] Starting condensed transcript regeneration for post ${postId}`);

        // ── STEP 1: Generate Condensed Transcript ──
        console.log('[RegeneratePost] Generating condensed transcript via Opus...');
        const condensed = await generateCondensedTranscript(transcript);

        const messageCount = condensed.messages.length;
        const wordCount = condensed.messages.reduce((sum, m) => sum + m.text.split(/\s+/).filter(Boolean).length, 0);
        console.log(`[RegeneratePost] Condensed: ${messageCount} messages, ${wordCount} words, pseudonym: ${condensed.pseudonym}`);

        // Derive backward-compatible letter/response from condensed transcript
        const userMessages = condensed.messages.filter(m => m.role === 'user');
        const idealSelfMessages = condensed.messages.filter(m => m.role === 'ideal_self');
        const derivedLetter = userMessages.length > 0
            ? `Dear Earnest,\n\n${userMessages[0].text}\n\n— ${condensed.pseudonym}`
            : '';
        const derivedResponse = idealSelfMessages.length > 0
            ? `${condensed.pseudonym},\n\n${idealSelfMessages[idealSelfMessages.length - 1].text}\n\n— Earnest Page`
            : '';

        // ── STEP 2: Generate Dual-Voice TTS Audio ──
        const isFemale = gender.toLowerCase() === 'female' || gender.toLowerCase() === 'woman';
        const idealSelfVoiceId = await getEarnestVoiceForUser(characterVoiceId, isFemale);

        let conversationAudio: { audioUrl: string; wordTimestamps: { word: string; start: number; end: number }[]; messageBoundaries: any[] } | null = null;
        if (characterVoiceId && idealSelfVoiceId) {
            try {
                console.log(`[RegeneratePost] Generating dual-voice audio (user: ${characterVoiceId}, ideal_self: ${idealSelfVoiceId}, gender: ${gender || 'default male'})...`);
                conversationAudio = await generateConversationAudio(
                    condensed.messages,
                    characterVoiceId,
                    idealSelfVoiceId,
                    postId,
                );
            } catch (err: any) {
                console.error(`[RegeneratePost] Conversation TTS failed:`, err.message);
            }
        }

        // ── STEP 3: Regenerate Images (cinematic prompts from character bible) ──
        const imagen_urls: string[] = [];
        let imagen_url: string | null = null;
        const existingStyle = postData.visual_style
            || VISUAL_STYLES[Math.floor(Math.random() * VISUAL_STYLES.length)].id;
        const chosenStyle = getVisualStyle(existingStyle);

        try {
            // Load user reference image for face consistency
            const referenceImage = await loadUserReferenceImage(uid);
            const NUM_IMAGES = 8;
            let prompts: string[] = [];
            let useReferenceImages: Buffer[] | undefined = referenceImage ? [referenceImage] : undefined;

            console.log(`[RegeneratePost] Style — selected: "${existingStyle}", resolved: "${chosenStyle?.id || 'NONE'}" (category: ${chosenStyle?.category || 'unknown'})`);

            if (chosenStyle?.category === 'landscape') {
                const prompt = `${chosenStyle.imagenTag} ${JSON.stringify(compiledBible)}`;
                prompts = Array(NUM_IMAGES).fill(prompt);
                useReferenceImages = undefined;
            } else if (chosenStyle?.category === 'landscape-with-person') {
                const prompt = `${chosenStyle.imagenTag} ${JSON.stringify(compiledBible)}`;
                prompts = Array(NUM_IMAGES).fill(prompt);
            } else if (chosenStyle?.category === 'cinematic') {
                const styleDirection = chosenStyle.id === 'life-magazine'
                    ? `You are a photo editor at Life Magazine in its golden era. You're commissioning 8 photographs for a photo essay about this person's life. Think like the great Life photographers — Gordon Parks, Margaret Bourke-White, W. Eugene Smith. Some images should be in vivid color, others in dramatic black and white. Each image should tell a story on its own — intimate, human, unforgettable. Documentary realism with cinematic beauty.`
                    : `You are a Visual Director for an advice column called Earnest Page. You're creating 8 photographs that capture moments from this person's life.`;

                const aiResult = await generateWithFallback({
                    primaryModelId: OPUS_MODEL,
                    fallbackModelId: OPUS_FALLBACK,
                    schema: z.object({
                        prompts: z.array(z.string()).min(8).max(8),
                    }),
                    prompt: `${styleDirection}\n\nFirst, read the character's identity. For each image, choose:\n- A VIBE: the emotional feeling (luxury, grit, serenity, chaos, warmth, ambition, defiance, tenderness, solitude, celebration)\n- A SCALE: the shot type\n\nSCALE types:\n- "macro": Extreme close-up of an object, texture, or detail from their life.\n- "lifestyle": A composed scene or environment that tells a story — their workspace, kitchen, car, bedroom.\n- "wide": An aspirational landscape, cityscape, or architectural shot from their world.\n- "human": The person in the scene — hands doing something, walking, sitting, from behind, over-the-shoulder.\n\nRULES:\n- Highly photorealistic. Cinematic lighting. Instagram-quality.\n- 3:4 portrait orientation. No text or watermarks.\n- Vary the scales and vibes across all 8 images.\n- The images should feel like snapshots from a real person's life — intimate, authentic, with depth.\n- Ground every image in specific details from the character.\n\nCHARACTER:\n${JSON.stringify(compiledBible)}\nReturn exactly 8 detailed Imagen prompts. Each should be a self-contained image description.`,
                });
                prompts = (aiResult.object as any).prompts;
                console.log(`[RegeneratePost] Generated ${prompts.length} cinematic prompts`);
            } else if (chosenStyle?.variations && chosenStyle.variations.length > 0) {
                prompts = Array.from({ length: NUM_IMAGES }, (_, i) =>
                    `${chosenStyle.variations![i % chosenStyle.variations!.length]} ${JSON.stringify(compiledBible)}`
                );
            } else {
                // Photographer styles — imagenTag + condensed conversation
                const tag = chosenStyle?.imagenTag || '';
                const conversationText = condensed.messages
                    .map(m => `${m.role === 'user' ? 'Person' : 'Consultant'}: ${m.text}`)
                    .join('\n');
                const prompt = tag ? `${tag}\n${conversationText}` : conversationText;
                prompts = Array(NUM_IMAGES).fill(prompt);
            }

            // Sequential image generation with stagger to avoid rate limits
            const IMAGE_STAGGER_MS = 1500;
            for (let i = 0; i < prompts.length; i++) {
                if (i > 0) await new Promise(r => setTimeout(r, IMAGE_STAGGER_MS));
                try {
                    const result = await generateImage({
                        prompt: prompts[i],
                        aspectRatio: '4:5',
                        logPrefix: 'RegeneratePost',
                        referenceImages: useReferenceImages,
                        referenceMode: i < 2 ? 'face-only' : 'full',
                    });
                    if (result) {
                        const isValid = await validateGeneratedImage(result.buffer, prompts[i]);
                        if (isValid) {
                            const compressed = await sharp(result.buffer)
                                .jpeg({ quality: 85 })
                                .toBuffer();
                            const bucket = storage.bucket();
                            const imgPath = `post-images/${postId}_${i}_${Date.now()}.jpg`;
                            const file = bucket.file(imgPath);
                            await file.save(compressed, { metadata: { contentType: 'image/jpeg' } });
                            try { await file.makePublic(); } catch { /* UBLA */ }
                            const url = `https://storage.googleapis.com/${bucket.name}/${imgPath}`;
                            imagen_urls.push(url);
                            console.log(`[RegeneratePost] Image ${i + 1}/${prompts.length} uploaded`);
                        }
                    }
                } catch (err: any) {
                    console.error(`[RegeneratePost] Image ${i + 1} failed:`, err.message);
                }
            }
            imagen_url = imagen_urls[0] || null;
            console.log(`[RegeneratePost] Generated ${imagen_urls.length}/${prompts.length} images`);
        } catch (err: any) {
            console.error(`[RegeneratePost] Image generation failed (non-fatal):`, err.message);
        }

        // ── STEP 4: Write everything to Firestore ──
        const publicPost: any = {
            pseudonym: condensed.pseudonym,
            letter: derivedLetter,
            response: derivedResponse,
            condensed_transcript: condensed.messages,
        };
        publicPost.imagen_url = imagen_url || postData.public_post?.imagen_url || postData.imagen_url || null;

        const updateData: any = {
            public_post: publicPost,
            condensed_transcript: condensed.messages,
            condensed_editorial_note: condensed.editorial_note,
            // Clear old short-form fields
            short_video_url: FieldValue.delete(),
            short_audio_url: FieldValue.delete(),
            short_audio_word_timestamps: FieldValue.delete(),
            short_audio_letter_ratio: FieldValue.delete(),
            short_audio_question_duration: FieldValue.delete(),
            short_audio_answer_duration: FieldValue.delete(),
            short_question: FieldValue.delete(),
            short_answer: FieldValue.delete(),
        };

        if (imagen_urls.length > 0) {
            updateData.imagen_url = imagen_url;
            updateData.imagen_urls = imagen_urls;
        }

        if (conversationAudio) {
            updateData.audio_url = conversationAudio.audioUrl;
            updateData.audio_word_timestamps = conversationAudio.wordTimestamps;
            updateData.audio_message_boundaries = conversationAudio.messageBoundaries;
            const firstMsgBoundary = conversationAudio.messageBoundaries[0];
            const lastBoundary = conversationAudio.messageBoundaries[conversationAudio.messageBoundaries.length - 1];
            if (firstMsgBoundary && lastBoundary) {
                updateData.audio_letter_ratio = firstMsgBoundary.endTime / lastBoundary.endTime;
            }
        }

        await postDoc.ref.update(updateData);
        console.log(`[RegeneratePost] Full regeneration complete for ${postId} (messages: ${messageCount}, words: ${wordCount}, audio: ${!!conversationAudio}, images: ${imagen_urls.length})`);

        return NextResponse.json({
            success: true,
            pseudonym: condensed.pseudonym,
            message_count: messageCount,
            word_count: wordCount,
            audio_regenerated: !!conversationAudio,
            images_generated: imagen_urls.length,
        });
    } catch (error: any) {
        console.error('[RegeneratePost] Error:', error);
        return NextResponse.json({ error: error.message || 'Unexpected error' }, { status: 500 });
    }
}

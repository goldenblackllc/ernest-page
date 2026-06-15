import { NextResponse } from 'next/server';
import { db, storage } from '@/lib/firebase/admin';
import { verifyAuth, unauthorizedResponse } from '@/lib/auth/serverAuth';
import sharp from 'sharp';
import { generateWithFallback, SONNET_MODEL } from '@/lib/ai/models';
import { generatePostAudio } from '@/lib/ai/postTTS';
import { z } from 'zod';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * POST /api/admin/regenerate-post
 *
 * Regenerates EVERYTHING for an existing post:
 *   1. Ghost-written letter + response (from stored transcript)
 *   2. TTS audio + word timestamps
 *   3. Background image (clean, no verdict overlay)
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

        const compiledBible = userData?.character_bible?.compiled_output?.ideal || [];
        const archetype = userData?.character_bible?.source_code?.archetype || "Mirror Reflection";
        const identity = userData?.identity;
        const characterVoiceId = userData?.character_bible?.voice_id;

        console.log(`[RegeneratePost] Starting full regeneration for post ${postId}`);

        // ── STEP 1: Ghost-write letter (Pass 1) ──
        const letterPrompt = `You are the Executive Editor of an elite advice and lifestyle column on a mainstream social media app. You just received this raw chat transcript between a user (Character B) and their Ideal Self (Character A).
The output must be in English.

CHARACTER BIBLE:
${JSON.stringify(compiledBible)}

CHAT TRANSCRIPT:
${transcript}

STEP 1: THE EDITORIAL JUDGMENT
This transcript is already published — regenerate it as publishable (is_publishable: true).

STEP 2: WRITE THE LETTER
HOW CONVERSATIONS WORK:
Every conversation follows the same two-phase structure:
  Phase 1 — UNDERSTANDING: The user states what they want or how they feel. Character A asks clarifying questions. The situation becomes clear.
  Phase 2 — ADVICE: Character A delivers insight, recommendations, or a reframe.
The LETTER draws ONLY from Phase 1. The RESPONSE (written separately) draws from Phase 2.

IDENTIFY THE USER'S ARRIVAL STATE — read ONLY the user's messages (Character B):
- WANT or FEELING: What did the user come in with?
- SITUATION: What details emerged during Phase 1 that help a reader understand the context?

CRITICAL RULE: The user is a reliable narrator of their own state. Do NOT reinterpret or diagnose.

YOUR EDITORIAL MANDATE: Write the letter the user would have written if they could articulate their situation cleanly.

- title: Write a curiosity-driven hook title (6-10 words, max 75 characters).
- pseudonym: A clever 2-3 word sign-off (e.g., 'Curious Creator').
- letter: LENGTH: 60-115 words. This is a guide — a tight, vivid letter can be shorter than a complex situation that needs more room. The letter will be read aloud in ~25-45 seconds. STRUCTURE: One-two sentences stating the user's WANT or FEELING. Three-four sentences on their SITUATION. One closing line of raw emotional honesty. The letter must present the situation as UNRESOLVED. VOICE: Write in first person, present tense. FORMATTING: Start directly with the letter body (no salutation). End with '\\n\\nSincerely,\\n' followed by the pseudonym in Title Case.
- verdict: A text summary of the advice.
- photo_vibe: One word capturing the emotional tone.
- photo_scale: One of macro, lifestyle, wide, or human.
- imagen_prompt: A prompt for Google Imagen to generate the post's background photo. A viewer who has never read the post should glance at this image and immediately know what life domain it's about — style, relationships, career, health, finances, food, body, or similar. THE IMAGE MUST: Show the world of the ANSWER, not the problem — the aspirational state. Unambiguously signal the topic. Be premium, warm, editorial — like a high-end lifestyle brand campaign. Rich, natural light. Never cold, dark, or gloomy. Shot with a real camera — genuine, candid, photojournalistic. Never CGI, 3D-rendered, or illustrated. 9:16 portrait orientation (1080×1920). No text or watermarks. Keep the center area relatively uncluttered.

PII SCRUBBING — THIS IS NON-NEGOTIABLE:
Replace ALL real names of people the user knows with relationship roles. Replace the user's employer, school, or client companies with generic labels. KEEP brand names, product recommendations, public figures, and cultural references.

DEMOGRAPHIC CONTEXT:
- Archetype: "${archetype}"
- Identity roles: "${identity?.title || 'Unknown'}"

OUTPUT FIELDS:
- is_publishable, title, pseudonym, letter, verdict, photo_vibe, photo_scale, imagen_prompt, language`;

        const letterResult = await generateWithFallback({
            primaryModelId: SONNET_MODEL,
            schema: z.object({
                is_publishable: z.literal(true),
                title: z.string().max(75),
                pseudonym: z.string(),
                letter: z.string(),
                verdict: z.string(),
                photo_vibe: z.string(),
                photo_scale: z.enum(["macro", "lifestyle", "wide", "human"]),
                imagen_prompt: z.string(),
                language: z.string().optional(),
            }),
            prompt: letterPrompt,
        });

        const pass1 = letterResult.object as any;
        console.log(`[RegeneratePost] Pass 1 complete — letter: ${pass1.letter.split(' ').length} words`);

        // ── STEP 2: Ghost-write response (Pass 2) ──
        const responsePrompt = `You are writing as Earnest Page — an advice columnist. You have just received the following letter. Now write your response.
The output must be in English.

CHARACTER BIBLE (this is Earnest Page's voice and worldview — write in this voice):
${JSON.stringify(compiledBible)}

THE LETTER:
${pass1.letter}

CHAT TRANSCRIPT (for context — the advice that emerged in this conversation):
${transcript}

HOW TO READ THE TRANSCRIPT:
The conversation has two phases. Phase 1 is understanding. Phase 2 is advice. The letter above captures Phase 1. Your response should deliver the substance of Phase 2.

YOUR JOB: Write Earnest Page's response to this letter. Match the nature of the advice: if the conversation delivered practical recommendations, the response should be practical. If it delivered an emotional reframe, the response should be an emotional reframe.

PII SCRUBBING — THIS IS NON-NEGOTIABLE:
Replace ALL real names of people the user knows with relationship roles. KEEP brand names, product recommendations, public figures, and cultural references.

- response: LENGTH: 85-115 words. STRUCTURE: One sentence acknowledging the user's want or feeling from the letter. Three-five sentences delivering the real advice. One closing line with a direct instruction, challenge, or reassurance. FORMATTING: Start with 'Dear ${pass1.pseudonym},\\n\\n'. Write the body. End with '\\n\\nSincerely,\\nEarnest Page'.`;

        const responseResult = await generateWithFallback({
            primaryModelId: SONNET_MODEL,
            schema: z.object({ response: z.string() }),
            prompt: responsePrompt,
        });

        const pass2 = responseResult.object as any;
        console.log(`[RegeneratePost] Pass 2 complete — response: ${pass2.response.split(' ').length} words`);

        // ── STEP 3: Generate image + TTS audio IN PARALLEL ──
        // Both are independent of each other — run concurrently to stay under timeout.

        const [imageResult, audioResult] = await Promise.allSettled([
            // Image generation
            (async (): Promise<string | null> => {
                try {
                    const imagenRes = await fetch(
                        `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY}`,
                        {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                instances: [{ prompt: pass1.imagen_prompt }],
                                parameters: {
                                    sampleCount: 1,
                                    aspectRatio: '9:16',
                                    personGeneration: 'ALLOW_ADULT',
                                },
                            }),
                        }
                    );

                    if (!imagenRes.ok) return null;
                    const data = await imagenRes.json();
                    const prediction = data.predictions?.[0];
                    if (!prediction?.bytesBase64Encoded) return null;

                    const photoBuffer = Buffer.from(prediction.bytesBase64Encoded, 'base64');
                    const finalBuffer = await sharp(photoBuffer)
                        .resize(1080, 1920, { fit: 'cover', position: 'center' })
                        .png()
                        .toBuffer();

                    const bucket = storage.bucket();
                    const ts = Date.now();
                    const fileName = `post-images/${postId}_imagen_${ts}.png`;
                    const file = bucket.file(fileName);
                    await file.save(finalBuffer, { metadata: { contentType: 'image/png' } });
                    try { await file.makePublic(); } catch { /* UBLA enabled */ }
                    return `https://storage.googleapis.com/${bucket.name}/${fileName}`;
                } catch (err) {
                    console.error(`[RegeneratePost] Image generation failed:`, err);
                    return null;
                }
            })(),
            // TTS audio generation
            (async () => {
                if (!characterVoiceId) return null;
                return generatePostAudio(pass1.letter, pass2.response, characterVoiceId, postId);
            })(),
        ]);

        const imagen_url = imageResult.status === 'fulfilled' ? imageResult.value : null;
        const audio = audioResult.status === 'fulfilled' ? audioResult.value : null;

        if (imageResult.status === 'rejected') {
            console.error(`[RegeneratePost] Image failed:`, imageResult.reason);
        }
        if (audioResult.status === 'rejected') {
            console.error(`[RegeneratePost] TTS failed:`, audioResult.reason);
        }

        // ── STEP 4: Write everything to Firestore in one update ──
        const updateData: any = {
            public_post: {
                title: pass1.title,
                pseudonym: pass1.pseudonym,
                letter: pass1.letter,
                response: pass2.response,
            },
            verdict: pass1.verdict,
            imagen_prompt: pass1.imagen_prompt,
            photo_vibe: pass1.photo_vibe,
            photo_scale: pass1.photo_scale,
            language: pass1.language || null,
        };

        if (imagen_url) {
            updateData.imagen_url = imagen_url;
        }
        if (audio) {
            updateData.audio_url = audio.audioUrl;
            updateData.audio_letter_ratio = audio.letterWordRatio;
            updateData.audio_word_timestamps = audio.wordTimestamps;
        }

        await postDoc.ref.update(updateData);
        console.log(`[RegeneratePost] Full regeneration complete for ${postId} (image: ${!!imagen_url}, audio: ${!!audio})`);

        return NextResponse.json({
            success: true,
            letter: pass1.letter,
            response: pass2.response,
            imagen_url,
            audio_regenerated: !!audio,
        });
    } catch (error: any) {
        console.error('[RegeneratePost] Error:', error);
        return NextResponse.json({ error: error.message || 'Unexpected error' }, { status: 500 });
    }
}

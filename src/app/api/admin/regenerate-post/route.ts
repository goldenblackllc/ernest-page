import { NextResponse } from 'next/server';
import { db, storage } from '@/lib/firebase/admin';
import { verifyAuth, unauthorizedResponse } from '@/lib/auth/serverAuth';
import sharp from 'sharp';
import { generateWithFallback, OPUS_MODEL, OPUS_FALLBACK } from '@/lib/ai/models';
import { generatePostAudio } from '@/lib/ai/postTTS';
import { validateGeneratedImage } from '@/lib/ai/validateImage';
import { z } from 'zod';
import { generateImage } from '@/lib/ai/generateImage';
import { loadUserReferenceImage } from '@/lib/ai/loadUserReferenceImage';
import { computeAge } from '@/lib/utils/parseBirthDate';


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

        // Build character appearance context for editorial storyboard images
        // The character appears IN the images as the subject of the story.
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
        const appearanceHint = demographicTag
            ? `\nCHARACTER APPEARANCE — MANDATORY: The main character in every image is ${demographicTag}.${dreamSelf ? ` Self-presentation: "${dreamSelf}"` : ''} The image generator has NO context about the character — you MUST describe them as "${demographicTag}" in EVERY prompt. If you omit this, the generator will default to a generic adult.`
            : '';

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
Write the user's side as a "Dear Earnest" letter — a person describing their situation and asking for help. Write it as they would if they could say it perfectly. The letter should NOT include any advice from the conversation — only the user's situation, in their words.

The letter must stand alone. A reader who knows nothing should understand the situation, care about the person, and want to hear the answer. Specific, concrete detail is what makes a stranger feel something — include the details that make the situation real (numbers, names, constraints, stakes). Every reference must be clear without context (say "my dog" not "him").

Do not reinterpret what the user said. If they said it, it's true.

- title: Write a curiosity-driven hook title (6-10 words, max 75 characters).
- pseudonym: A clever 2-3 word sign-off (e.g., 'Curious Creator').
- letter: LENGTH: 30-50 words. This will be read aloud in a short-form video.
   VOICE: First person. Raw. Conversational — like describing your situation to a sharp friend at 2am, not writing to a therapist. No clinical language ("boundaries", "trauma", "healing journey"). NEVER reference the chat or session.
   FORMATTING: Start with 'Dear Earnest,\\n\\n'. End with '\\n\\n— ' followed by the pseudonym in Title Case. No "Sincerely" — just the em dash. Write strictly in the requested language.
- imagen_prompts: An array of 5-6 editorial storyboard prompts. THE STORYBOARD ARC — 5-6 beats telling the story from struggle to resolution: Beat 1 — THE STUCK MOMENT (the character in the situation), Beat 2 — THE DETAIL (closer shot of the key object/screen), Beat 3 — THE PIVOT (visual shift marking the turn), Beat 4 — THE MOVE (advice in action), Beat 5 — THE OUTCOME (character in the new state), Beat 6 (optional) — THE EXHALE (environmental close). The character appears IN every image. CHARACTER CONSISTENCY: describe their appearance — face, build, and personal style — consistently in every prompt. EDITORIAL PHOTOGRAPHY RULES: NEVER have the character look directly at the camera — they are caught in a moment, unaware of the camera. The character must be DOING something (not standing, not posing). Use photojournalistic composition — rule of thirds, natural angles, slightly off-center or over-the-shoulder. Never a centered portrait. PRODUCT PLACEMENT: If coffee is mentioned, use JURA machine + CREMA beans. If specific brands are mentioned, use exact names. Shot with a real camera — genuine, editorial. 9:16 portrait orientation (1080×1920). No text or watermarks. Keep the center area uncluttered.
- verdict: A scroll-stopping opening hook — under 15 words, second-person, confrontational. Hit the reader between the eyes with the truth they're avoiding.
- photo_vibe: One word capturing the emotional tone.

PII SCRUBBING — THIS IS NON-NEGOTIABLE AND APPLIES TO ALL FIELDS (title, letter):

FIRST — identify what to KEEP (these add value and do NOT identify the user):
  • Public figures and celebrities BY THEIR REAL NAMES — Jeremy Clarkson stays "Jeremy Clarkson", Brené Brown stays "Brené Brown". NEVER replace a public figure with "a celebrity", "a public figure I admire", "someone I look up to", or any generic substitute.
  • Brand and product names (e.g., "Hugo Boss", "Nike", "Tesla")
  • Cultural references — books, films, songs, TV shows, podcasts, by their real titles
  • Generic industry or category names (e.g., "tech", "finance", "healthcare")
THEN — replace everything that identifies THE USER PERSONALLY:
  • Names of people the user personally knows → relationship role
  • Employer, workplace, school, clients → generic labels
  • Locations, addresses, phone numbers, handles
The test: does this name exist on Wikipedia? If yes, keep it verbatim. If no, replace it.

${appearanceHint}

OUTPUT FIELDS:
- is_publishable, title, pseudonym, letter, verdict, photo_vibe, imagen_prompts, language`;

        const letterResult = await generateWithFallback({
            primaryModelId: OPUS_MODEL,
            fallbackModelId: OPUS_FALLBACK,
            schema: z.object({
                is_publishable: z.literal(true),
                title: z.string().max(75),
                pseudonym: z.string(),
                letter: z.string(),
                verdict: z.string().max(200),
                photo_vibe: z.string(),
                imagen_prompts: z.array(z.string()).min(5).max(6),
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

YOUR JOB: Write Earnest Page's response to this letter. The conversation transcript shows the advice that emerged — your response should deliver that advice. The reader should finish with something they can DO, not just something they understand. Be specific and concrete. Match the nature of the advice: practical if practical, emotional if emotional.

PII SCRUBBING — THIS IS NON-NEGOTIABLE AND APPLIES TO ALL FIELDS:

FIRST — identify what to KEEP (these add value and do NOT identify the user):
  • Public figures and celebrities BY THEIR REAL NAMES — Jeremy Clarkson stays "Jeremy Clarkson", Brené Brown stays "Brené Brown". NEVER replace a public figure with "a celebrity", "a public figure I admire", "someone I look up to", or any generic substitute.
  • Brand and product names (e.g., "Hugo Boss", "Nike", "Tesla")
  • Cultural references — books, films, songs, TV shows, podcasts, by their real titles
  • Generic industry or category names (e.g., "tech", "finance", "healthcare")
THEN — replace everything that identifies THE USER PERSONALLY:
  • Names of people the user personally knows → relationship role
  • Employer, workplace, school, clients → generic labels
  • Locations, addresses, phone numbers, handles
The test: does this name exist on Wikipedia? If yes, keep it verbatim. If no, replace it.

- response: LENGTH: 40-60 words. No throat-clearing, no "I hear you." Go straight to the advice. Write in Character A's voice.
  FORMATTING: Start with '${pass1.pseudonym},\\n\\n'. Write the body. End with '\\n\\n— Earnest Page'. No "Sincerely" — just the em dash.`;

        const responseResult = await generateWithFallback({
            primaryModelId: OPUS_MODEL,
            fallbackModelId: OPUS_FALLBACK,
            schema: z.object({ response: z.string() }),
            prompt: responsePrompt,
        });

        const pass2 = responseResult.object as any;
        console.log(`[RegeneratePost] Pass 2 complete — response: ${pass2.response.split(' ').length} words`);

        // ── STEP 3: Generate image + TTS audio IN PARALLEL ──
        // Both are independent of each other — run concurrently to stay under timeout.

        // Load the user's avatar as a character reference anchor.
        const referenceImage = await loadUserReferenceImage(uid);
        const referenceImages = referenceImage ? [referenceImage] : undefined;

        const [imageResult, audioResult] = await Promise.allSettled([
            // Image generation — with per-prompt retries for quality
            (async (): Promise<string[]> => {
                const prompts = pass1.imagen_prompts || [pass1.imagen_prompt].filter(Boolean);
                if (prompts.length === 0) return [];

                const MAX_ATTEMPTS = 3;

                const generateSingleImage = async (prompt: string, idx: number): Promise<string | null> => {
                    try {
                    const result = await generateImage({
                        prompt,
                        aspectRatio: '9:16',
                        logPrefix: 'RegeneratePost',
                        referenceImages,
                    });
                    if (!result) return null;

                    const finalBuffer = await sharp(result.buffer)
                        .resize(1080, 1920, { fit: 'cover', position: 'center' })
                        .png()
                        .toBuffer();

                    // Validate image quality before uploading
                    const validation = await validateGeneratedImage(finalBuffer, prompt);
                    if (!validation.pass) {
                        console.warn(`[RegeneratePost] Image ${idx} failed validation:`, validation.summary, validation.issues);
                        return null;
                    }

                    const bucket = storage.bucket();
                    const ts = Date.now();
                    const fileName = `post-images/${postId}_imagen_${ts}_${idx}.png`;
                    const file = bucket.file(fileName);
                    await file.save(finalBuffer, { metadata: { contentType: 'image/png' } });
                    try { await file.makePublic(); } catch { /* UBLA enabled */ }
                    return `https://storage.googleapis.com/${bucket.name}/${fileName}`;
                    } catch (err: any) {
                        if (err.isQuotaError) throw err;
                        console.error(`[RegeneratePost] Image ${idx} exception:`, err.message);
                        return null;
                    }
                };

                // First pass: generate all in parallel
                const urls: (string | null)[] = new Array(prompts.length).fill(null);
                let quotaExhausted = false;

                const firstResults = await Promise.allSettled(
                    prompts.map((prompt: string, idx: number) => generateSingleImage(prompt, idx))
                );
                firstResults.forEach((r, i) => {
                    if (r.status === 'fulfilled' && r.value) urls[i] = r.value;
                    if (r.status === 'rejected' && r.reason?.isQuotaError) quotaExhausted = true;
                });

                // Retry any failed prompts — but bail immediately on quota exhaustion
                if (!quotaExhausted) {
                    for (let attempt = 2; attempt <= MAX_ATTEMPTS; attempt++) {
                        const failedIndices = urls.map((u, i) => u === null ? i : -1).filter(i => i >= 0);
                        if (failedIndices.length === 0) break;

                        console.log(`[RegeneratePost] Retrying ${failedIndices.length} failed images (attempt ${attempt}/${MAX_ATTEMPTS})`);
                        await new Promise(resolve => setTimeout(resolve, 2000));

                        const retryResults = await Promise.allSettled(
                            failedIndices.map(i => generateSingleImage(prompts[i], i))
                        );
                        retryResults.forEach((r, ri) => {
                            if (r.status === 'fulfilled' && r.value) urls[failedIndices[ri]] = r.value;
                            if (r.status === 'rejected' && r.reason?.isQuotaError) quotaExhausted = true;
                        });
                        if (quotaExhausted) {
                            console.warn(`[RegeneratePost] Imagen daily quota exhausted — skipping further retries`);
                            break;
                        }
                    }
                } else {
                    console.warn(`[RegeneratePost] Imagen daily quota exhausted — skipping all retries`);
                }

                const successCount = urls.filter(Boolean).length;
                if (successCount < prompts.length) {
                    console.warn(`[RegeneratePost] Only ${successCount}/${prompts.length} images${quotaExhausted ? ' (quota exhausted)' : ''}`);
                }

                return urls.filter((url): url is string => url !== null);
            })(),
            // TTS audio generation
            (async () => {
                if (!characterVoiceId) return null;
                return generatePostAudio(pass1.letter, pass2.response, characterVoiceId, postId);
            })(),
        ]);

        const imagen_urls: string[] = imageResult.status === 'fulfilled' ? imageResult.value : [];
        const imagen_url = imagen_urls[0] || null;
        const audio = audioResult.status === 'fulfilled' ? audioResult.value : null;

        if (imageResult.status === 'rejected') {
            console.error(`[RegeneratePost] Image failed:`, imageResult.reason);
        }
        if (audioResult.status === 'rejected') {
            console.error(`[RegeneratePost] TTS failed:`, audioResult.reason);
        }

        // ── STEP 4: Write everything to Firestore in one update ──
        const publicPost: any = {
            title: pass1.title,
            pseudonym: pass1.pseudonym,
            letter: pass1.letter,
            response: pass2.response,
            verdict: pass1.verdict || null,
        };
        // Include imagen_url in public_post when we have new images
        if (imagen_urls.length > 0) {
            publicPost.imagen_url = imagen_url;
        } else {
            // Preserve old imagen_url from existing post data
            publicPost.imagen_url = postData.public_post?.imagen_url || postData.imagen_url || null;
        }

        const updateData: any = {
            public_post: publicPost,
            imagen_prompts: pass1.imagen_prompts,
            language: pass1.language || null,
        };

        // Only overwrite images if we got new ones — don't clear old images on total failure
        if (imagen_urls.length > 0) {
            updateData.imagen_urls = imagen_urls;
            updateData.imagen_url = imagen_url;
        }

        if (audio) {
            updateData.audio_url = audio.audioUrl;
            updateData.audio_letter_ratio = audio.letterWordRatio;
            updateData.audio_word_timestamps = audio.wordTimestamps;
        }

        await postDoc.ref.update(updateData);
        const promptCount = (pass1.imagen_prompts || []).length;
        console.log(`[RegeneratePost] Full regeneration complete for ${postId} (images: ${imagen_urls.length}/${promptCount}, audio: ${!!audio})`);

        return NextResponse.json({
            success: true,
            letter: pass1.letter,
            response: pass2.response,
            imagen_url,
            imagen_count: imagen_urls.length,
            imagen_requested: promptCount,
            audio_regenerated: !!audio,
        });
    } catch (error: any) {
        console.error('[RegeneratePost] Error:', error);
        return NextResponse.json({ error: error.message || 'Unexpected error' }, { status: 500 });
    }
}

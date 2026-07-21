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
import { PHOTOGRAPHER_CATALOG, getVisualStyle, VISUAL_STYLES } from '@/lib/ai/visualStyles';


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
            ? `\nCHARACTER APPEARANCE — MANDATORY: The main character's fixed traits (face, ethnicity, age, gender): ${demographicTag}. You MUST include "${demographicTag}" in EVERY prompt. If you omit this, the generator will default to a generic adult.${dreamSelf ? `\nTheir ASPIRATIONAL self-presentation (use for LATER beats only — pivot, move, outcome): "${dreamSelf}"` : ''}
TRANSFORMATION ARC: If the letter describes a physical state that differs from the aspirational self (e.g., overweight, exhausted, unkempt), show the character's ACTUAL current state in Beats 1-2 (struggle). Transition in Beat 3 (pivot). By Beats 4-5 (move, outcome), the character should embody their resolved/aspirational state. This visual transformation IS the story. The face stays the same — only the body, posture, and energy transform.`
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
Your ONLY writing job in this step is the LETTER — the user's side. You are NOT writing Earnest's response. That comes later in a separate step.

HOW CONVERSATIONS WORK — understand this before writing:
Every conversation follows the same two-phase structure:
  Phase 1 — UNDERSTANDING: The user states what they want or how they feel. Character A asks clarifying questions. The situation becomes clear. This phase is about the user's reality.
  Phase 2 — ADVICE: Character A delivers insight, recommendations, or a reframe. The user reacts, clarifies, and the advice gets refined. This phase is Character A's contribution.
The LETTER draws ONLY from Phase 1. The RESPONSE (written separately) draws from Phase 2.

IDENTIFY THE USER'S ARRIVAL STATE — read ONLY the user's messages (Character B):
- WANT or FEELING: What did the user come in with? Read their words literally. If they are clear, they are clear. If they are confused, they are confused. Do NOT go deeper than the user went.
- SITUATION: What details emerged during Phase 1 that help a reader understand the context? Look for specifics the user shared.

INCLUDE THE FULL SITUATION: If the user revealed a passion, a desire, a thing they love doing, or something they discovered about themselves during the conversation, that is PART OF THEIR SITUATION — not advice. Include it in the letter. The letter should contain everything the response will need to reference. A cold reader will only ever see the letter and response — never the transcript.

CRITICAL RULE: The user is a reliable narrator of their own state. If they say they want something, that is what they want — do not reinterpret it as uncertainty. Character A may explore, question, and probe — but Character A's framework is not the user's experience. The letter represents the USER, not Character A's interpretation of the user.

YOUR EDITORIAL MANDATE: Write the letter the user would have written if they could articulate their situation cleanly. This means: preserve what they actually wanted or felt, add the situation details that make it vivid, and stop. Do NOT resolve it. Do NOT include anything from Phase 2. The letter is the "before" — the response is the "after."

- title: Write a curiosity-driven hook title (6-10 words, max 75 characters).
- pseudonym: A clever 2-3 word sign-off (e.g., 'Curious Creator').
- letter: LENGTH: 40-80 words. Tight and punchy — this is social media, not a newspaper. STRUCTURE: Lead with the GUT PUNCH — the single sharpest, most relatable line. It must hook in under 8 words. Then 2-3 sentences of SITUATION. The letter must present the situation as UNRESOLVED. VOICE: First person, present tense. Raw and conversational. No clinical language. NEVER reference the chat or session. FORMATTING: Start with 'Dear Earnest,\\n\\n'. End with '\\n\\n— ' followed by the pseudonym in Title Case. No "Sincerely" — just the em dash.
- visual_style: Pick the ONE photographer id from the list below whose vision best serves this story. Return ONLY the id string (e.g., "slim-aarons", "platon", "saul-leiter").
${PHOTOGRAPHER_CATALOG}
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
- is_publishable, title, pseudonym, letter, visual_style, photo_vibe, language`;

        const letterResult = await generateWithFallback({
            primaryModelId: OPUS_MODEL,
            fallbackModelId: OPUS_FALLBACK,
            schema: z.object({
                is_publishable: z.literal(true),
                title: z.string().max(75),
                pseudonym: z.string(),
                letter: z.string(),
                photo_vibe: z.string(),
                visual_style: z.string(),
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
The conversation has two phases. Phase 1 is understanding — Character A asks questions and the user's situation becomes clear. Phase 2 is advice — Character A delivers insight, recommendations, or a concrete plan. The letter above captures Phase 1 (the user's want or feeling + their situation). Your response should deliver the substance of Phase 2 (the advice, the answer, the path forward).

YOUR JOB: Write Earnest Page's response to this letter. The letter captures where the user arrived — what they wanted or how they felt. The conversation transcript shows the advice Character A gave. Your response delivers that advice — warm, specific, actionable, in Character A's exact voice. Match the nature of the advice: if the conversation delivered practical recommendations (go here, buy this, do that), the response should be practical. If it delivered an emotional reframe, the response should be an emotional reframe. Do not force emotional depth onto practical advice, and do not reduce emotional insight to bullet points.

SINGLE-INSIGHT FOCUS: The response should orbit ONE central reframe — the single belief or pattern that is actually blocking them. Don't scatter across multiple points. Setup → reframe → directive. The reframe is the line that should stop a reader cold.

SELF-CONTAINMENT — NON-NEGOTIABLE: The response must only reference situations, details, and context that appear IN THE LETTER. The reader has never seen the transcript. If the transcript contains insights, translate them into advice that makes sense given only what the letter says. Never say "you already named it" or reference something the letter doesn't mention.

NO WANT-SUBSTITUTION: Do not tell the writer what they "really" want. If the advice involves reframing a desire, name the specific feeling behind their stated want — don't replace their want with a different one.

PII SCRUBBING — THIS IS NON-NEGOTIABLE:
FIRST — identify what to KEEP: Public figures and celebrities BY THEIR REAL NAMES. Brand names, product recommendations, cultural references — keep them all verbatim.
THEN — replace what identifies THE USER: Names of people the user personally knows → relationship roles. Employer, school, clients → generic labels. The test: Wikipedia name? Keep it. Personal contact? Replace it.

- response: LENGTH: 85-115 words. STRUCTURE: Open with the CONFRONTATIONAL TRUTH — the thing the user needs to hear. No throat-clearing, no "I hear you", no acknowledgment of their feelings. Go straight to the insight. Three-four sentences delivering the real advice that emerged in the conversation — be specific, give the reader something concrete they can use. One closing line with a direct instruction or challenge. The response is the PAYOFF — it answers the letter. Write strictly in Character A's exact voice. FORMATTING: Start with '${pass1.pseudonym},\\n\\n'. Write the body. End with '\\n\\n— Earnest Page'. No "Sincerely" — just the em dash. Strip away all standard AI formatting like bullet points unless the character would use them.`;

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
            // Image generation — send the story directly to Imagen with photographer style
            (async (): Promise<string[]> => {
                const NUM_IMAGES = 6;
                const MAX_ATTEMPTS = 3;

                // Pick style randomly — 8 equal options (6 photographers + 2 landscapes)
                const randomStyle = VISUAL_STYLES[Math.floor(Math.random() * VISUAL_STYLES.length)];
                console.log(`[RegeneratePost] Style — randomly selected: "${randomStyle.id}" (${randomStyle.name}, category: ${randomStyle.category})`);

                // Build prompt and reference image config based on category
                let storyPrompt: string;
                let useReferenceImages = referenceImages;

                if (randomStyle.category === 'landscape') {
                    // Landscape without the person — character bible, no reference images
                    storyPrompt = `${randomStyle.imagenTag} ${JSON.stringify(compiledBible)}`;
                    useReferenceImages = undefined;
                } else if (randomStyle.category === 'landscape-with-person') {
                    // Landscape with the person — character bible, with reference images
                    storyPrompt = `${randomStyle.imagenTag} ${JSON.stringify(compiledBible)}`;
                } else {
                    // Photographer — letter as prompt
                    storyPrompt = `${randomStyle.imagenTag} ${pass1.letter}`;
                }
                console.log(`[RegeneratePost] Imagen prompt (${storyPrompt.length} chars):\n${storyPrompt.substring(0, 300)}...\n---`);

                const generateSingleImage = async (prompt: string, idx: number): Promise<string | null> => {
                    try {
                    const result = await generateImage({
                        prompt,
                        aspectRatio: '9:16',
                        logPrefix: 'RegeneratePost',
                        referenceImages: useReferenceImages,
                        referenceMode: idx < 2 ? 'face-only' : 'full',
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
                const urls: (string | null)[] = new Array(NUM_IMAGES).fill(null);
                let quotaExhausted = false;

                const firstResults = await Promise.allSettled(
                    Array.from({ length: NUM_IMAGES }, (_, idx) => generateSingleImage(storyPrompt, idx))
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
                            failedIndices.map(i => generateSingleImage(storyPrompt, i))
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
                if (successCount < NUM_IMAGES) {
                    console.warn(`[RegeneratePost] Only ${successCount}/${NUM_IMAGES} images${quotaExhausted ? ' (quota exhausted)' : ''}`);
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
            imagen_prompts: [`${getVisualStyle(pass1.visual_style || '')?.imagenTag || ''} ${pass1.letter}`.trim()],
            visual_style: pass1.visual_style || null,
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

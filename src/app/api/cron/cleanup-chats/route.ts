import { NextResponse } from 'next/server';
import { db, storage } from '@/lib/firebase/admin';
import { z } from 'zod';
import { generateWithFallback, SONNET_MODEL, OPUS_MODEL, OPUS_FALLBACK } from '@/lib/ai/models';
import { FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { hashPhoneNumberServer, normalizePhoneNumberServer } from '@/lib/security/serverHash';
import { geohashForLocation } from 'geofire-common';
import { buildDossierPrompt } from '@/lib/ai/dossierPrompt';
import { matchSponsor } from '@/config/ecosystem';
import { generatePostAudio } from '@/lib/ai/postTTS';
import sharp from 'sharp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: Request) {
    // Basic security for Cron
    const authHeader = req.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const now = Date.now();
        const timeoutMs = 30 * 60 * 1000; // 30 mins
        let processedCount = 0;

        // ─── PER-USER SUBCOLLECTION QUERIES ───
        // Iterate all users and check their active_chats subcollections directly,
        // avoiding collection group queries that require special indexing.
        const usersSnap = await db.collection('users').get();

        const chatsByUser = new Map<string, FirebaseFirestore.QueryDocumentSnapshot[]>();

        // Fetch active_chats for all users in parallel batches
        const USER_FETCH_BATCH = 10;
        const userDocs = usersSnap.docs;

        for (let i = 0; i < userDocs.length; i += USER_FETCH_BATCH) {
            const userBatch = userDocs.slice(i, i + USER_FETCH_BATCH);
            await Promise.all(userBatch.map(async (userDoc) => {
                const uid = userDoc.id;
                const chatsSnap = await db.collection('users').doc(uid)
                    .collection('active_chats').get();

                if (chatsSnap.empty) return;

                // Filter for expired or closed chats
                const relevantChats = chatsSnap.docs.filter(chatDoc => {
                    const data = chatDoc.data();
                    const isExpired = data.updatedAt && data.updatedAt <= (now - timeoutMs);
                    const isClosed = data.isClosed === true;
                    // Skip chats already claimed by another cron run (unless claim is stale >10min)
                    if (data.processing && data.processingStartedAt) {
                        const claimAge = now - data.processingStartedAt;
                        if (claimAge < 10 * 60 * 1000) return false; // still fresh, skip
                    }
                    return isExpired || isClosed;
                });

                if (relevantChats.length > 0) {
                    chatsByUser.set(uid, relevantChats);
                }
            }));
        }

        if (chatsByUser.size === 0) {
            return NextResponse.json({ success: true, processedCount: 0, note: 'No chats to process.' });
        }

        // Process users in parallel batches of 5
        const BATCH_SIZE = 5;
        const userEntries = Array.from(chatsByUser.entries());

        for (let i = 0; i < userEntries.length; i += BATCH_SIZE) {
            const batch = userEntries.slice(i, i + BATCH_SIZE);
            const results = await Promise.allSettled(
                batch.map(([uid, chatDocs]) => processUserChats(uid, chatDocs))
            );
            for (const result of results) {
                if (result.status === 'fulfilled') processedCount += result.value;
                else console.error('[Cron] User batch error:', result.reason);
            }
        }

        return NextResponse.json({ success: true, processedCount });
    } catch (error: any) {
        console.error("Cron Cleanup Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// ─── Process all chats for a single user ─────────────────────────────────────
async function processUserChats(
    uid: string,
    chatDocs: FirebaseFirestore.QueryDocumentSnapshot[]
): Promise<number> {
    let processed = 0;

    // Fetch user data once for all their chats
    const userDoc = await db.collection('users').doc(uid).get();
    const userData = userDoc.data();
    if (!userData) {
        // User deleted — just clean up the chats
        for (const chatDoc of chatDocs) await chatDoc.ref.delete();
        return chatDocs.length;
    }

    const compiledBible = userData?.character_bible?.compiled_output?.ideal || [];
    const archetype = userData?.character_bible?.source_code?.archetype || "Mirror Reflection";
    const identity = userData?.identity;
    const preferredLocale = userData?.preferred_locale || 'en';

    // Build appearance hint for image generation so human figures match the user
    const gender = identity?.gender || '';
    const ethnicity = identity?.ethnicity || '';
    const birthYear = identity?.age ? parseInt(identity.age, 10) : NaN;
    const computedAge = !isNaN(birthYear) ? Math.max(0, new Date().getFullYear() - birthYear) : null;
    const demographicParts = [
        computedAge ? `approximately ${computedAge} years old` : '',
        ethnicity,
        gender,
    ].filter(Boolean);
    // Style/appearance from character bible
    const stylePrefs = userData?.character_bible?.source_code?.things_i_enjoy || identity?.things_i_enjoy || '';
    const dreamSelf = identity?.dream_self || '';
    const appearanceParts = [
        demographicParts.length > 0 ? `The user is ${demographicParts.join(', ')}.` : '',
        dreamSelf ? `Self-description: "${dreamSelf}"` : '',
        stylePrefs ? `Style & preferences: "${stylePrefs}"` : '',
    ].filter(Boolean);
    const demographicHint = appearanceParts.length > 0
        ? `\nAPPEARANCE & STYLE (when a person appears in the image): ${appearanceParts.join(' ')} Any human figure must plausibly match this description — skin tone, build, age, clothing style, and overall aesthetic. Do NOT default to any other demographic or style.`
        : '';

    for (const chatDoc of chatDocs) {
        const chatData = chatDoc.data();

        // BURN PROTOCOL: If session was marked for burn, skip ALL processing and delete immediately
        if (chatData.sessionRouting === 'burn' || chatData.burnOnClose === true) {
            console.log(`[Cron] Burn protocol — purging session for user ${uid}`);
            await chatDoc.ref.delete();
            continue;
        }

        const messages = chatData.messages || [];
        // Determine visibility: sessionRouting takes precedence, then autoPublish legacy fallback.
        // Default to community unless explicitly routed private.
        const visibility = chatData.sessionRouting != null
            ? (chatData.sessionRouting === 'private' ? 'private' : 'community')
            : (chatData.autoPublish === false ? 'private' : 'community');

        if (messages.length > 0) {
            // Claim this chat to prevent duplicate processing by concurrent cron runs
            const imageRetries = chatData.imageRetries || 0;
            await chatDoc.ref.update({ processing: true, processingStartedAt: Date.now() });

            const transcript = messages.map((m: any) => `${m.role}: ${m.content}`).join('\n');

            // Fetch recent posts to avoid repeating the same photo style and scale
            let recentScales: string[] = [];
            let recentStyles: string[] = [];
            try {
                const recentSnap = await db.collection("posts")
                    .where("authorId", "==", uid)
                    .orderBy("created_at", "desc")
                    .limit(3)
                    .get();
                recentScales = recentSnap.docs
                    .map(d => d.data().photo_scale)
                    .filter(Boolean);
                recentStyles = recentSnap.docs
                    .map(d => d.data().photo_style)
                    .filter(Boolean);
            } catch { /* ignore — index may not exist yet */ }

            const recentScaleHint = recentScales.length > 0
                ? `\nThe user's last ${recentScales.length} post(s) used these photo scales: [${recentScales.join(', ')}]. Do NOT repeat the same scale. Choose a DIFFERENT scale for variety.`
                : '';

            const recentStyleHint = recentStyles.length > 0
                ? `\nThe user's last ${recentStyles.length} post(s) used these visual styles: [${recentStyles.join(', ')}]. STRONGLY prefer a DIFFERENT style for variety. Mix it up.`
                : '';

            const currentDossier = identity?.dossier || '';
            const sessionCount = (identity?.session_count || 0) + 1;

            // ─── PARALLEL AI CALLS: post synthesis + dossier update + session recap ───
            // Each task gets its own focused call with only the context it needs.

            let languageCommand = "The output must be in English.";
            if (preferredLocale === "es") {
                languageCommand = "[LANGUAGE MANDATE]\nThe letter and response MUST be written entirely in SPANISH (Español).";
            } else if (preferredLocale === "fr") {
                languageCommand = "[LANGUAGE MANDATE]\nThe letter and response MUST be written entirely in FRENCH (Français).";
            } else if (preferredLocale === "de") {
                languageCommand = "[LANGUAGE MANDATE]\nThe letter and response MUST be written entirely in GERMAN (Deutsch).";
            } else if (preferredLocale === "pt") {
                languageCommand = "[LANGUAGE MANDATE]\nThe letter and response MUST be written entirely in PORTUGUESE (Português).";
            }

            // ══════════════════════════════════════════════════════════════
            // TWO-PASS GHOST-WRITING PIPELINE
            //
            // Pass 1: Extract the user's opening tension and write the LETTER.
            //         The letter is frozen at the user's unresolved state.
            //         Also: editorial judgment, title, pseudonym, image prompt.
            //
            // Pass 2: Write Earnest's RESPONSE, given the generated letter.
            //         The response delivers the resolution from the conversation.
            // ══════════════════════════════════════════════════════════════

            // ── Pass 1: Letter + Editorial Judgment + Image (Sonnet) ──
            const letterPrompt = `You are the Executive Editor of an elite advice and lifestyle column on a mainstream social media app. You just received this raw chat transcript between a user (Character B) and their Ideal Self (Character A).
${languageCommand}

CHARACTER BIBLE:
${JSON.stringify(compiledBible)}

CHAT TRANSCRIPT:
${transcript}

STEP 1: THE EDITORIAL JUDGMENT
Determine if this transcript has "Editorial Value."
* Meaningless (is_publishable: false): Pleasantries ("Hi", "Thanks"), system tests, circular banter with no substance, OR conversations where the user never states what they want or how they feel. If there is no clear want or feeling, there is no story.
* Valuable (is_publishable: true): The user arrives with either a WANT (something they are trying to do, get, or figure out) or a NEGATIVE FEELING (something that hurts, frustrates, confuses, or weighs on them), and Character A helps them understand their situation and offers real advice. The reader must be able to relate to the want or the feeling in under 60 seconds.

STEP 2: WRITE THE LETTER (If Publishable)
Your ONLY writing job in this step is the LETTER — the user's side. You are NOT writing Earnest's response. That comes later in a separate step.

HOW CONVERSATIONS WORK — understand this before writing:
Every conversation follows the same two-phase structure:
  Phase 1 — UNDERSTANDING: The user states what they want or how they feel. Character A asks clarifying questions. The situation becomes clear. This phase is about the user's reality.
  Phase 2 — ADVICE: Character A delivers insight, recommendations, or a reframe. The user reacts, clarifies, and the advice gets refined. This phase is Character A's contribution.
The LETTER draws ONLY from Phase 1. The RESPONSE (written separately) draws from Phase 2.

IDENTIFY THE USER'S ARRIVAL STATE — read ONLY the user's messages (Character B):
- WANT or FEELING: What did the user come in with? This is almost always stated in their first message or two. It is either a concrete want ("I need a new suit", "I want to lose weight", "I'm trying to decide whether to quit") or a negative feeling ("I feel off today", "I'm overwhelmed", "something isn't right in my relationship"). Read their words literally. If they are clear, they are clear. If they are confused, they are confused. Do NOT go deeper than the user went.
- SITUATION: What details emerged during Phase 1 that help a reader understand the context? Look for specifics the user shared — numbers, timelines, constraints, relationships, stakes.

CRITICAL RULE: The user is a reliable narrator of their own state. If they say they want something, that is what they want — do not reinterpret it as uncertainty. If they say they feel confused, the confusion IS the story — do not diagnose a cause and present the cause as their real problem. Character A may explore, question, and probe — but Character A's framework is not the user's experience. The letter represents the USER, not Character A's interpretation of the user.

YOUR EDITORIAL MANDATE: Write the letter the user would have written if they could articulate their situation cleanly. This means: preserve what they actually wanted or felt, add the situation details that make it vivid, and stop. Do NOT resolve it. Do NOT include anything from Phase 2. The letter is the "before" — the response is the "after."

- title: Write a curiosity-driven hook title (6-10 words, max 75 characters). The title should capture the user's WANT or FEELING as unresolved tension. The title must NEVER include the resolution or advice. Never use second person. Think "confession overheard in a bar" — punchy, raw, scroll-stopping. Examples: 'I Keep Choosing Work Over My Kids', 'Am I Wrong for Not Forgiving My Mother?', 'I Love My Partner But I've Disappeared', 'My Suit Doesn't Fit and My Son Graduates Thursday'. Shorter is stronger.
- pseudonym: A clever 2-3 word sign-off (e.g., 'Curious Creator').

PII SCRUBBING — THIS IS NON-NEGOTIABLE AND APPLIES TO ALL FIELDS (title, letter):
Replace ALL of the following with generic relationship or role labels — NEVER include them verbatim:
  • Real first names, last names, or nicknames of any person → replace with their relationship role (e.g., "Max" → "my son", "Iris" → "my sister", "John at work" → "my colleague")
  • The user's employer, workplace, school, or client companies → "my company", "my workplace", "my school" (these reveal who the user IS)
  • Specific place names (cities, neighborhoods, venues) → "my city", "my neighborhood"
  • Any identifying details (addresses, phone numbers, email addresses, social media handles)
KEEP the following — they do NOT identify the user and add value to the post:
  • Brand and product names mentioned as recommendations or aspirations (e.g., "Hugo Boss", "Nike", "Tesla", "Jura")
  • Public figures, authors, or cultural references mentioned in discussion
  • Generic industry or category names (e.g., "tech", "finance", "healthcare")
If you are unsure whether something identifies the USER personally, err on the side of removing it. The post must be fully anonymous — but anonymity means hiding WHO wrote it, not stripping useful content.

- letter: LENGTH: 60-115 words. This is a guide — a tight, vivid letter can be shorter than a complex situation that needs more room. The letter will be read aloud in ~25-45 seconds. STRUCTURE: One-two sentences stating the user's WANT or FEELING — in their terms, at their level of clarity. Three-four sentences on their SITUATION — the specific details, constraints, stakes, or context that make this real and relatable. One closing line of raw emotional honesty — what this actually feels like or why it matters to them. The letter must present the situation as UNRESOLVED — before any advice was given. If you include ANY resolution, reframe, insight, or advice from Phase 2, you have failed. VOICE: Write in first person, writing this letter RIGHT NOW. TENSE: PRESENT TENSE only. NEVER use past tense to recap (WRONG: 'I came to you', RIGHT: 'I come to you'). NEVER reference the chat or session. NEVER narrate in third person. FORMATTING: Start directly with the letter body (no salutation). End with '\n\nSincerely,\n' followed by the pseudonym in Title Case (e.g., 'Sincerely,\nOverwhelmed Father'). Write strictly in the requested language.

STEP 3: THE VISUAL DIRECTOR (Image Strategy)
Every post gets ONE image: a beautiful photo background with the post's VERDICT overlaid as bold text. This image must work standalone on any platform — Instagram, TikTok, Twitter, a screenshot in a group chat. Someone who sees only this image should understand the entire post without reading a word.

PRIORITY #1 — VISUAL ATTRACTIVENESS: The image must be BEAUTIFUL and ATTRACTIVE on social media. Think: premium brand campaign, high-end fashion editorial. Rich colors, striking composition, professional lighting, warmth, and energy. "Would I double-tap this on Instagram?" If not, start over.

YOUR TWO JOBS:
1. Write the VERDICT — the text that goes on top of this post's Instagram image. Someone who only sees this text should understand what Earnest Page's advice was.
   BAD (too vague, says nothing): "Be the Gentleman.", "Today Already Counts.", "Manners Are a Choice." — nobody knows what these mean.
   GOOD (actually says the advice): "A gentleman isn't defined by his wardrobe — it's how he treats people when no one is watching.", "Don't invite your sister. Her presence will make your son's day about her drama, not his achievement."
   Write it the way you'd text a friend the punchline of the article.

2. Write the IMAGEN_PROMPT — a prompt for a contextual background photo that SUPPORTS the verdict visually. This photo is the SETTING, not the star — the verdict text is the star.
   The photo should represent the ASPIRATION or the CONTEXT of the post — what the person wants to become, or the world the advice lives in.
   Examples: For "Be the Gentleman" → a well-dressed man adjusting cufflinks in warm light. For "Don't Invite Her" → a graduation ceremony with warm bokeh lights. For "Quit." → a sunrise over a city skyline.
   The photo must be visually stunning, warm, aspirational. NEVER cold/blue/dark/sad. Think menswear ad, travel magazine, lifestyle brand.
${recentScaleHint}${demographicHint}

CHARACTER IDENTITY CONTEXT — use this to inform the world, objects, and energy of the background photo:
- Archetype: "${archetype}"
- Identity roles: "${identity?.title || 'Unknown'}"

OUTPUT FIELDS:
- verdict: The text overlay for the Instagram image. Summarizes Earnest Page's actual advice.
- photo_vibe: One word capturing the emotional tone (e.g., warmth, defiance, clarity, resolve).
- photo_scale: One of macro, lifestyle, wide, or human.
- imagen_prompt: A prompt for Google Imagen to generate the post's background photo. A viewer who has never read the post should glance at this image and immediately know what life domain it's about — style, relationships, career, health, finances, food, body, or similar. THE IMAGE MUST: Show the world of the ANSWER, not the problem — the aspirational state, what life looks like when the advice has been taken. Unambiguously signal the topic (style posts → a beautifully dressed person; relationship posts → a meaningful human moment; career posts → someone in their element professionally; health posts → vitality, movement, the body at its best). Be premium, warm, editorial — like a high-end lifestyle brand campaign. Rich, natural light. Never cold, dark, or gloomy. Shot with a real camera — genuine, candid, photojournalistic. Never CGI, 3D-rendered, or illustrated. 9:16 portrait orientation (1080×1920). No text or watermarks in the image. Keep the center area relatively uncluttered (text overlays there during video playback).
- language: Detect the primary language of the conversation. Output the language name as it appears natively (e.g., 'English', 'Español', '日本語', 'Français').`;

            const dossierRewritePrompt = `${buildDossierPrompt(currentDossier, sessionCount)}

The following chat transcript is the new session data to incorporate.

CHAT TRANSCRIPT:
${transcript}`;

            const recapPrompt = `Write a 2-3 sentence recap of this session for continuity. What was discussed? What was the emotional tone? What was the outcome or takeaway? Write from the consultant's perspective. Keep it concise — this will be shown to the character at the start of the next session for context.

CHAT TRANSCRIPT:
${transcript}`;

            try {
                // ── Check for cached AI results from a previous image-retry run ──
                const cachedPost = chatData.cachedPost;

                // ── PARALLEL BATCH: Pass 1 (letter) + Dossier + Recap ──
                // Skip AI generation if we already have cached results from a prior run
                const [letterResult, dossierResult, recapResult] = cachedPost
                    ? [null, null, null]
                    : await Promise.all([
                        // Pass 1: Letter + editorial judgment + image prompt
                        generateWithFallback({
                            primaryModelId: SONNET_MODEL,
                            schema: z.discriminatedUnion('is_publishable', [
                                z.object({
                                    is_publishable: z.literal(true),
                                    title: z.string().max(75),
                                    pseudonym: z.string(),
                                    letter: z.string(),
                                    verdict: z.string().max(500),
                                    photo_vibe: z.string(),
                                    photo_scale: z.enum(["macro", "lifestyle", "wide", "human"]),
                                    imagen_prompt: z.string(),
                                    language: z.string().optional(),
                                }),
                                z.object({
                                    is_publishable: z.literal(false),
                                    title: z.string().max(75).optional(),
                                    pseudonym: z.string().optional(),
                                    letter: z.string().optional(),
                                    verdict: z.string().optional(),
                                    photo_vibe: z.string().optional(),
                                    photo_scale: z.enum(["macro", "lifestyle", "wide", "human"]).optional(),
                                    imagen_prompt: z.string().optional(),
                                    language: z.string().optional(),
                                }),
                            ]),
                            prompt: letterPrompt,
                        }),
                        // Dossier Rewrite — Opus
                        generateWithFallback({
                            primaryModelId: OPUS_MODEL,
                            fallbackModelId: OPUS_FALLBACK,
                            schema: z.object({
                                updated_dossier: z.string(),
                            }),
                            prompt: dossierRewritePrompt,
                        }),
                        // Session Recap — Opus
                        generateWithFallback({
                            primaryModelId: OPUS_MODEL,
                            fallbackModelId: OPUS_FALLBACK,
                            schema: z.object({
                                session_recap: z.string().describe("2-3 sentence recap of this session for continuity"),
                            }),
                            prompt: recapPrompt,
                        }),
                    ]);

                const pass1 = cachedPost || (letterResult!.object as any);
                const dossier = cachedPost ? null : (dossierResult!.object as any);
                const recap = cachedPost ? null : (recapResult!.object as any);

                // ── Pass 2: Response (sequential — needs the letter from Pass 1) ──
                // Skip Pass 2 on image-retry runs — cachedPost already includes the response.
                let post: any;
                if (cachedPost) {
                    post = cachedPost;
                } else if (pass1.is_publishable && pass1.letter && pass1.pseudonym) {
                    const responsePrompt = `You are writing as Earnest Page — an advice columnist. You have just received the following letter. Now write your response.
${languageCommand}

CHARACTER BIBLE (this is Earnest Page's voice and worldview — write in this voice):
${JSON.stringify(compiledBible)}

THE LETTER:
${pass1.letter}

CHAT TRANSCRIPT (for context — the advice that emerged in this conversation):
${transcript}

HOW TO READ THE TRANSCRIPT:
The conversation has two phases. Phase 1 is understanding — Character A asks questions and the user's situation becomes clear. Phase 2 is advice — Character A delivers insight, recommendations, or a concrete plan. The letter above captures Phase 1 (the user's want or feeling + their situation). Your response should deliver the substance of Phase 2 (the advice, the answer, the path forward).

YOUR JOB: Write Earnest Page's response to this letter. The letter captures where the user arrived — what they wanted or how they felt. The conversation transcript shows the advice Character A gave. Your response delivers that advice — warm, specific, actionable, in Character A's exact voice. Match the nature of the advice: if the conversation delivered practical recommendations (go here, buy this, do that), the response should be practical. If it delivered an emotional reframe, the response should be an emotional reframe. Do not force emotional depth onto practical advice, and do not reduce emotional insight to bullet points.

PII SCRUBBING — THIS IS NON-NEGOTIABLE:
Replace ALL real names of people the user knows with relationship roles. Replace the user's employer, school, or client companies with generic labels. KEEP brand names, product recommendations, public figures, and cultural references — these add value and do not identify the user. The response must be fully anonymous (the reader cannot determine WHO wrote it), but not stripped of useful content.

- response: LENGTH: 85-115 words. This is non-negotiable — the response will be read aloud in ~40-45 seconds. STRUCTURE: One sentence acknowledging the user's want or feeling from the letter. Three-five sentences delivering the real advice that emerged in the conversation — be specific, give the reader something concrete they can use. One closing line with a direct instruction, challenge, or reassurance. The response is the PAYOFF — it answers the letter. Write strictly in Character A's exact voice. FORMATTING: Start with 'Dear ${pass1.pseudonym},\n\n'. Write the body. End with '\n\nSincerely,\nEarnest Page'. Strip away all standard AI formatting like bullet points unless the character would use them. Write strictly in the requested language.`;

                    const responseResult = await generateWithFallback({
                        primaryModelId: SONNET_MODEL,
                        schema: z.object({
                            response: z.string(),
                        }),
                        prompt: responsePrompt,
                    });

                    const pass2 = responseResult.object as any;

                    // Merge Pass 1 + Pass 2 into unified post object
                    post = {
                        ...pass1,
                        response: pass2.response,
                    };
                } else {
                    // Not publishable — pass through as-is
                    post = pass1;
                }

                // ─── DOSSIER + RECAPS WRITE (runs in parallel with image gen below) ───
                // Skip dossier/recap writes on image-retry runs (already written on first pass)
                const dossierPromise = (identity && dossier && recap)
                    ? (async () => {
                        // Build the new session_recaps array (keep last 3)
                        const existingRecaps = userData?.session_recaps || [];
                        const newRecap = {
                            date: new Date().toISOString().split('T')[0],
                            recap: recap.session_recap,
                        };
                        const updatedRecaps = [newRecap, ...existingRecaps].slice(0, 3);

                        await userDoc.ref.set({
                            identity: {
                                ...identity,
                                dossier: dossier.updated_dossier,
                                dossier_updated_at: FieldValue.serverTimestamp(),
                                session_count: sessionCount,
                            },
                            session_recaps: updatedRecaps,
                        }, { merge: true });
                        console.log(`[Cron] Dossier + recap updated for user ${uid} (session ${sessionCount})`);
                    })().catch((err: any) => {
                        console.error(`[Cron] Dossier update failed for user ${uid}:`, err.message);
                    })
                    : Promise.resolve();

                // ─── POST CREATION (with parallel image gen) ───
                const MAX_IMAGE_RETRIES = 5;
                if (post.is_publishable && post.title) {
                    const postDocRef = db.collection('posts').doc();

                    // ─── IMAGE ROUTING: Always Imagen background + verdict overlay ───
                    if (!post.imagen_prompt || post.imagen_prompt.trim().length === 0) {
                        console.warn(`[Cron] Post for user ${uid} is missing imagen_prompt — saving as private`);
                        await dossierPromise;
                        await postDocRef.set({
                            id: postDocRef.id,
                            uid,
                            authorId: uid,
                            authorHash: null,
                            region: userData?.region || null,
                            author: userData?.displayName || "Anonymous",
                            type: 'checkin',
                            public_post: {
                                title: post.title,
                                pseudonym: post.pseudonym,
                                letter: post.letter,
                                response: post.response,
                            },
                            verdict: post.verdict || null,
                            imagen_prompt: null,
                            photo_vibe: post.photo_vibe || null,
                            photo_scale: post.photo_scale || null,
                            language: post.language || null,
                            imagen_url: null,
                            content_raw: transcript,
                            status: "completed",
                            created_at: new Date(),
                            is_public: false,
                            visibility: 'private',
                            like_count: 0,
                            comments: 0,
                        });
                        await chatDoc.ref.delete();
                        processed++;
                        continue;
                    }

                    // Start image generation and dossier write concurrently
                    const imagePromise = generateVerdictImage(post.imagen_prompt!, postDocRef.id);

                    const [imageResult] = await Promise.allSettled([
                        imagePromise,
                        dossierPromise,
                    ]);

                    const imagen_url = imageResult.status === 'fulfilled' ? imageResult.value : null;

                    // ─── IMAGE RETRY QUEUE ───
                    // If image generation failed and we haven't exhausted retries,
                    // release the chat back into the queue for the next cron run.
                    if (!imagen_url && imageRetries < MAX_IMAGE_RETRIES) {
                        console.log(`[Cron] Image failed for user ${uid} (attempt ${imageRetries + 1}/${MAX_IMAGE_RETRIES}) — re-queuing`);
                        await chatDoc.ref.update({
                            processing: false,
                            processingStartedAt: FieldValue.delete(),
                            imageRetries: imageRetries + 1,
                            // Cache the AI results so we don't re-generate them on retry
                            cachedPost: post,
                        });
                        continue; // skip deletion — chat stays in queue
                    }

                    if (!imagen_url) {
                        console.warn(`[Cron] Image failed after ${MAX_IMAGE_RETRIES} retries for user ${uid} — saving as private`);
                    }

                    // Match sponsor from imagen prompt (only for photo styles)
                    const sponsor = post.imagen_prompt ? matchSponsor(post.imagen_prompt) : null;

                    // Compute author hash for Contact Firewall filtering
                    let authorHash: string | null = null;
                    try {
                        const userRecord = await getAuth().getUser(uid);
                        if (userRecord.phoneNumber) {
                            const normalized = normalizePhoneNumberServer(userRecord.phoneNumber);
                            authorHash = hashPhoneNumberServer(normalized);
                        }
                    } catch { /* silent — hash is best-effort */ }

                    // Compute geolocation fields from stored user coords
                    const geoFields: { lat?: number; lng?: number; geohash?: string } = {};
                    if (userData?.home_lat != null && userData?.home_lng != null) {
                        geoFields.lat = userData.home_lat;
                        geoFields.lng = userData.home_lng;
                        geoFields.geohash = geohashForLocation([userData.home_lat, userData.home_lng]);
                    }

                    // Create Post in DB
                    await postDocRef.set({
                        id: postDocRef.id,
                        uid,
                        authorId: uid,
                        authorHash: authorHash,
                        region: userData?.region || null,
                        author: userData?.displayName || "Anonymous",
                        type: 'checkin',
                        public_post: {
                            title: post.title,
                            pseudonym: post.pseudonym,
                            letter: post.letter,
                            response: post.response,
                        },
                        imagen_prompt: post.imagen_prompt || null,
                        verdict: post.verdict || null,
                        photo_vibe: post.photo_vibe,
                        photo_scale: post.photo_scale,
                        language: post.language || null,
                        imagen_url: imagen_url,
                        sponsored_by: sponsor?.name || null,
                        sponsored_link: sponsor?.link || null,
                        // Geolocation for proximity filtering
                        ...geoFields,
                        content_raw: transcript,
                        status: "completed",
                        created_at: new Date(),
                        is_public: imagen_url ? (visibility !== 'private') : false,
                        visibility: imagen_url ? visibility : 'private',
                        like_count: 0,
                        comments: 0
                    });

                    // ─── POST AUDIO GENERATION ───
                    // Generate TTS audio for the letter and response using the character's voice.
                    // Must be awaited — Vercel kills pending promises after the function returns.
                    const characterVoiceId = userData?.character_bible?.voice_id;
                    if (characterVoiceId && post.letter && post.response) {
                        try {
                            const audioResult = await generatePostAudio(
                                post.letter,
                                post.response,
                                characterVoiceId,
                                postDocRef.id,
                            );
                            if (audioResult) {
                                await postDocRef.update({
                                    audio_url: audioResult.audioUrl,
                                    audio_letter_ratio: audioResult.letterWordRatio,
                                    audio_word_timestamps: audioResult.wordTimestamps,
                                });
                                console.log(`[Cron] Audio attached to post ${postDocRef.id}`);
                            }
                        } catch (err) {
                            console.error(`[Cron] Post audio failed for ${postDocRef.id}:`, err);
                        }
                    }

                    processed++;
                } else {
                    // Not publishable — still need to await dossier write
                    await dossierPromise;
                }
                // Success — delete the processed chat session
                await chatDoc.ref.delete();
            } catch (e) {
                console.error(`[Cron] Processing failed for user ${uid}:`, e);
                // Release the claim so the next cron run can retry — do NOT delete the chat
                try {
                    await chatDoc.ref.update({ processing: false, processingStartedAt: FieldValue.delete() });
                } catch { /* silent — chat may already be gone */ }
                continue;
            }
        }

        // Delete empty chat sessions (no messages)
        await chatDoc.ref.delete();
    }

    return processed;
}

// ─── Image generation helper ─────────────────────────────────────────────────
async function generateVerdictImage(prompt: string, postId: string): Promise<string | null> {
    try {
        // Step 1: Generate the background photo via Imagen
        const imagenRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                instances: [{ prompt }],
                parameters: {
                    sampleCount: 1,
                    aspectRatio: "9:16",
                    personGeneration: "ALLOW_ADULT"
                }
            })
        });

        if (!imagenRes.ok) {
            console.error("[Cron] Imagen API Error:", await imagenRes.text());
            return null;
        }

        const data = await imagenRes.json();
        const prediction = data.predictions?.[0];

        if (prediction?.raiFilteredReason) {
            console.warn(`[Cron] Imagen RAI filter for post ${postId}:`, prediction.raiFilteredReason);
        }

        if (!prediction?.bytesBase64Encoded) {
            console.warn(`[Cron] Imagen returned no image for post ${postId}:`, JSON.stringify(prediction));
            return null;
        }

        const photoBuffer = Buffer.from(prediction.bytesBase64Encoded, 'base64');

        // Resize to 1080×1920 — no text overlay; subtitles are the only text layer
        const finalBuffer = await sharp(photoBuffer)
            .resize(1080, 1920, { fit: 'cover', position: 'center' })
            .png()
            .toBuffer();

        // Step 3: Upload to Cloud Storage with cache-busting filename
        const bucket = storage.bucket();
        const ts = Date.now();
        const fileName = `post-images/${postId}_imagen_${ts}.png`;
        const file = bucket.file(fileName);

        await file.save(finalBuffer, {
            metadata: { contentType: 'image/png' },
        });

        try { await file.makePublic(); } catch { /* UBLA enabled */ }

        console.log(`[Cron] Verdict image generated for post ${postId}`);
        return `https://storage.googleapis.com/${bucket.name}/${fileName}`;
    } catch (err) {
        console.error("[Cron] Verdict image generation failed:", err);
        return null;
    }
}



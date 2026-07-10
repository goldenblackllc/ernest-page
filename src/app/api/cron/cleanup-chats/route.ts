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
import { validateGeneratedImage } from '@/lib/ai/validateImage';
import { generateImage } from '@/lib/ai/generateImage';
// loadUserReferenceImage removed — scenic wallpaper images don't need character anchoring
import nodemailer from 'nodemailer';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'breadstand@gmail.com';

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

    // Load user interests for scenic wallpaper images
    const thingsIEnjoy = identity?.things_i_enjoy || userData?.character_bible?.source_code?.things_i_enjoy || '';
    const interestsHint = thingsIEnjoy
        ? `\nUSER INTERESTS — use these to generate scenic wallpaper images:\n${thingsIEnjoy}`
        : '\nNo interests available — generate generic beautiful scenery (golden hour landscapes, ocean waves, mountain fog, city skylines at dusk, coffee close-ups).';

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
* Valuable (is_publishable: true): The user arrives with either a WANT (something they are trying to do, get, or figure out) or a SITUATION THEY ARE STUCK ON (something that is not working, a pattern they are repeating, a wall they keep hitting), and Character A helps them see the situation clearly and delivers a concrete approach. The reader must be able to recognize themselves in the situation in under 60 seconds.

STEP 2: WRITE THE LETTER (If Publishable)
Your ONLY writing job in this step is the LETTER — the user's side. You are NOT writing Earnest's response. That comes later in a separate step.

HOW CONVERSATIONS WORK — understand this before writing:
Every conversation follows the same two-phase structure:
  Phase 1 — UNDERSTANDING: The user states what they want or how they feel. Character A asks clarifying questions. The situation becomes clear. This phase is about the user's reality.
  Phase 2 — ADVICE: Character A delivers insight, recommendations, or a reframe. The user reacts, clarifies, and the advice gets refined. This phase is Character A's contribution.
The LETTER draws ONLY from Phase 1. The RESPONSE (written separately) draws from Phase 2.

IDENTIFY THE USER'S ARRIVAL STATE — read ONLY the user's messages (Character B):
- WANT or SITUATION: What did the user come in with? This is almost always stated in their first message or two. It is either a concrete want ("I need a new suit", "I want to lose weight", "I'm trying to decide whether to quit") or a situation they are stuck on ("I keep texting my ex", "I've sent 50 applications and gotten nothing", "my boss says I'm underperforming"). Read their words literally. If they are clear, they are clear. If they are confused, they are confused. Do NOT go deeper than the user went.
- STUCK BEHAVIOR: What is the user DOING (or not doing) that is keeping them stuck? This is the most important thing to identify. People recognize themselves in behaviors, not feelings. "I feel lost" is not hookable. "I've been sitting on my couch every night for three months" IS hookable. Mine the transcript for the specific action, pattern, or habit that is not working.
- CONTEXT: What details emerged during Phase 1 that help a reader understand the situation? Look for specifics — numbers, timelines, constraints, relationships, stakes.

CRITICAL RULE: The user is a reliable narrator of their own state. If they say they want something, that is what they want — do not reinterpret it as uncertainty. If they say they feel confused, the confusion IS the story — do not diagnose a cause and present the cause as their real problem. Character A may explore, question, and probe — but Character A's framework is not the user's experience. The letter represents the USER, not Character A's interpretation of the user.

YOUR EDITORIAL MANDATE: Write the letter the user would have written if they could articulate their situation cleanly. This means: identify the stuck behavior, add the situation details that make it vivid, and end with a direct question. Do NOT resolve it. Do NOT include anything from Phase 2. The letter is the "before" — the response is the "after." The letter should make the reader think "that's me" or "that's my friend" — not "that poor person."

- pseudonym: A clever 2-3 word sign-off (e.g., 'Curious Creator').

PII SCRUBBING — THIS IS NON-NEGOTIABLE AND APPLIES TO ALL FIELDS (letter):

FIRST — identify what to KEEP (these add value and do NOT identify the user):
  • Public figures and celebrities BY THEIR REAL NAMES — Jeremy Clarkson stays "Jeremy Clarkson", Brené Brown stays "Brené Brown". NEVER replace a public figure with "a celebrity", "a public figure I admire", "someone I look up to", or any generic substitute.
  • Brand and product names mentioned as recommendations or aspirations (e.g., "Hugo Boss", "Nike", "Tesla", "Jura")
  • Cultural references — books, films, songs, TV shows, podcasts, by their real titles
  • Generic industry or category names (e.g., "tech", "finance", "healthcare")
THEN — replace everything that identifies THE USER PERSONALLY:
  • Names of people the user PERSONALLY KNOWS → relationship role (e.g., "Max" → "my son", "Iris" → "my sister", "John at work" → "my colleague")
  • The user's employer, workplace, school, or client companies → "my company", "my workplace", "my school"
  • Specific locations tied to the user → "my city", "my neighborhood"
  • Addresses, phone numbers, email addresses, social media handles
The test: does this name exist on Wikipedia? If yes, keep it verbatim. If no, replace it with a relationship role. The post must be fully anonymous — but anonymity means hiding WHO wrote it, not stripping useful content.

- letter: LENGTH: 30-50 words. This will be read aloud in a short-form video (~10-20 seconds).
  OPEN-LOOP WRITING: Every sentence must make the reader NEED the next one. The reader cannot stop mid-letter — each sentence feels incomplete without the next. Do NOT resolve the situation. The letter is the "before."
  VOICE: First person. Raw. Conversational — like describing your situation to a sharp friend at 2am, not writing to a therapist. No clinical language ("boundaries", "trauma", "healing journey"). NEVER reference the chat or session.
  FORMATTING: Start with 'Dear Earnest,\n\n'. End with '\n\n— ' followed by the pseudonym in Title Case. No "Sincerely" — just the em dash. Write strictly in the requested language.
  EXAMPLES OF GOOD OPEN-LOOP LETTERS:
  "Dear Earnest, I've memorized her schedule. Three months, every hallway, every lunch period. She doesn't know my name. How do you talk to someone you've already built up in your head? — Hallway Ghost"
  "Dear Earnest, There's a thread on my phone I keep opening. Twelve messages. All blue. Not one reply. I know what that means. So why can't I stop typing? — Left on Read"
  "Dear Earnest, I built something I believe in. Two years of my life. But every time I try to explain it, I watch their eyes glaze over. What do you do when the thing you're proudest of bores everyone? — Pitch Deck Prisoner"

STEP 3: THE SCENIC WALLPAPER
Every post gets 5-6 beautiful scenic/lifestyle images as ambient backgrounds. These crossfade during the video — they are NOT related to the letter content. They are simply beautiful images of things the user enjoys.

THE RULE: NO PEOPLE. No faces, no hands, no silhouettes, no characters. Pure scenery, objects, landscapes, architecture, food, nature.

Generate 5-6 image prompts from the user's interests. Each prompt should describe a single stunning photograph. Vary the subjects — don't repeat the same interest.
${recentStyleHint}${interestsHint}

PRODUCT PLACEMENT — MANDATORY:
• Any image featuring coffee, espresso, or a coffee setup MUST show a JURA automatic espresso machine and/or CREMA coffee beans/bags. Never a generic coffee maker, Nespresso, or unbranded machine. JURA + CREMA only.
• If the user's interests mention a specific brand (Hugo Boss, Tesla, etc.), use the EXACT brand name in the image prompt.

ALL prompts must follow these rules: Real camera photography — cinematic, editorial quality. Natural lighting, real environments. Never CGI, 3D-rendered, or illustrated. 9:16 portrait orientation (1080×1920). No text or watermarks. No people, no faces, no hands. Keep the center area relatively uncluttered (subtitle text overlays there during video playback).

OUTPUT FIELDS:
- imagen_prompts: An ARRAY of 5-6 scenic/lifestyle image prompts (strings). Each describes one beautiful photograph of something the user enjoys. Variety — don't repeat the same subject.
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
                                    pseudonym: z.string(),
                                    letter: z.string(),
                                    imagen_prompts: z.array(z.string()).min(5).max(6),
                                    language: z.string().optional(),
                                }),
                                z.object({
                                    is_publishable: z.literal(false),
                                    pseudonym: z.string().optional(),
                                    letter: z.string().optional(),
                                    imagen_prompts: z.array(z.string()).optional(),
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

YOUR JOB: Write Earnest Page's response to this letter. The letter names a situation and a stuck behavior. The conversation transcript shows the advice Character A gave. Your response delivers the COUNTER-MOVE — the specific thing to do differently. This is a strategy column, not a therapy session. The reader should finish with something they can DO today, not just something they understand. Match the nature of the advice: if the conversation delivered practical recommendations (go here, buy this, do that), the response should be practical. If it delivered a reframe, deliver the reframe as a specific, repeatable move — not an abstract insight. Do not force emotional depth onto practical advice, and do not reduce emotional insight to bullet points.

PII SCRUBBING — THIS IS NON-NEGOTIABLE:
FIRST — identify what to KEEP: Public figures and celebrities BY THEIR REAL NAMES (Jeremy Clarkson stays "Jeremy Clarkson", never "a celebrity" or "someone I admire"). Brand names, product recommendations, cultural references — keep them all verbatim.
THEN — replace what identifies THE USER: Names of people the user personally knows → relationship roles. Employer, school, clients → generic labels. The test: Wikipedia name? Keep it. Personal contact? Replace it.

- response: LENGTH: 40-60 words. This is non-negotiable — the response will be read aloud in ~15-25 seconds. STRUCTURE: Open with the COUNTER-MOVE — name why the stuck behavior doesn't work, then deliver the alternative. No throat-clearing, no "I hear you", no acknowledgment of their feelings. Go straight to the strategy. (GOOD: "Texting him 12 times isn't going to bring him back. Here's what you do instead." BAD: "I understand how painful this must be for you."). Two-three sentences delivering the real advice — be specific, give the reader something concrete. One closing line with a direct challenge or instruction. Write strictly in Character A's exact voice. FORMATTING: Start with '${pass1.pseudonym},\n\n' (direct address, no "Dear"). Write the body. End with '\n\n— Earnest Page'. No "Sincerely" — just the em dash. Strip away all standard AI formatting like bullet points unless the character would use them. Write strictly in the requested language.
  WRITING TECHNIQUE — OPEN LOOPS: Every sentence must pull the reader into the next. Each sentence resolves one thing but opens a new question. BAD: "Stop texting him. Move on. Focus on yourself." GOOD: "Texting him 12 times isn't bringing him back. But you already knew that. Here's what you haven't tried."`;

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
                if (post.is_publishable && post.letter) {
                    const postDocRef = db.collection('posts').doc();

                    // ─── IMAGE ROUTING: Scenic wallpaper backgrounds ───
                    const prompts = post.imagen_prompts || (post.imagen_prompt ? [post.imagen_prompt] : []);
                    if (prompts.length === 0) {
                        console.warn(`[Cron] Post for user ${uid} is missing imagen_prompts — saving as private`);
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
                                pseudonym: post.pseudonym,
                                letter: post.letter,
                                response: post.response,
                            },

                            imagen_prompt: null,
                            imagen_prompts: [],
                            photo_vibe: post.photo_vibe || null,
                            language: post.language || null,
                            imagen_url: null,
                            imagen_urls: [],
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

                    // Start parallel scenic image generation + dossier write
                    const imagePromises = prompts.map((prompt: string, i: number) =>
                        generateVerdictImage(prompt, `${postDocRef.id}_${i}`)
                    );

                    const [imageResults] = await Promise.allSettled([
                        Promise.allSettled(imagePromises),
                        dossierPromise,
                    ]);

                    const imagen_urls = (imageResults.status === 'fulfilled'
                        ? (imageResults.value as PromiseSettledResult<string | null>[])
                            .map(r => r.status === 'fulfilled' ? r.value : null)
                            .filter(Boolean) as string[]
                        : []);
                    const imagen_url = imagen_urls[0] || null;

                    // ─── IMAGE RETRY QUEUE ───
                    // Quality first: we want ALL the images we asked for.
                    // If any are missing, re-queue for the next cron run (API may be overloaded).
                    if (imagen_urls.length < prompts.length && imageRetries < MAX_IMAGE_RETRIES) {
                        console.log(`[Cron] ${imagen_urls.length}/${prompts.length} images succeeded for user ${uid} (attempt ${imageRetries + 1}/${MAX_IMAGE_RETRIES}) — re-queuing for complete set`);
                        await chatDoc.ref.update({
                            processing: false,
                            processingStartedAt: FieldValue.delete(),
                            imageRetries: imageRetries + 1,
                            // Cache the AI results so we don't re-generate them on retry
                            cachedPost: post,
                        });
                        continue; // skip deletion — chat stays in queue
                    }

                    if (imagen_urls.length < prompts.length) {
                        console.warn(`[Cron] Only ${imagen_urls.length}/${prompts.length} images after ${MAX_IMAGE_RETRIES} retries for user ${uid} — saving with partial set`);
                    }

                    // Match sponsor from imagen prompt (only for photo styles)
                    const sponsor = prompts[0] ? matchSponsor(prompts[0]) : null;

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

                    // Read user photo from chat document (if user attached one)
                    const userPhotoUrl = chatData.user_photo_url || null;

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
                            pseudonym: post.pseudonym,
                            letter: post.letter,
                            response: post.response,
                        },
                        imagen_prompt: prompts[0] || null,
                        imagen_prompts: prompts,
                        photo_vibe: post.photo_vibe || null,
                        language: post.language || null,
                        imagen_url: imagen_url,
                        imagen_urls: imagen_urls,
                        user_photo_url: userPhotoUrl,
                        hero_source: userPhotoUrl ? 'user' : 'imagen',
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

                    // ─── NOTIFY ADMIN OF NEW POST ───
                    try {
                        if (process.env.GMAIL_APP_PASSWORD) {
                            const transporter = nodemailer.createTransport({
                                service: 'gmail',
                                auth: { user: ADMIN_EMAIL, pass: process.env.GMAIL_APP_PASSWORD },
                            });
                            const postTitle = post.pseudonym || 'New Post';
                            const postPseudonym = post.pseudonym || 'Anonymous';
                            const postVisibility = visibility || 'private';
                            await transporter.sendMail({
                                from: `Earnest Page <${ADMIN_EMAIL}>`,
                                to: ADMIN_EMAIL,
                                subject: `📝 New Post — ${postTitle}`,
                                html: `
<div style="font-family: -apple-system, sans-serif; background: #09090b; color: #d4d4d8; padding: 32px; border-radius: 12px; max-width: 480px;">
    <p style="font-size: 10px; text-transform: uppercase; letter-spacing: 0.2em; color: #71717a; margin: 0 0 16px 0;">New Post Published</p>
    <h2 style="font-size: 20px; color: #ffffff; margin: 0 0 4px 0; font-weight: 700;">${postTitle}</h2>
    <p style="font-size: 13px; color: #a1a1aa; margin: 0 0 16px 0;">by ${postPseudonym}</p>
    <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
        <tr><td style="padding: 6px 0; color: #71717a;">Visibility</td><td style="padding: 6px 0; text-align: right; color: ${postVisibility === 'private' ? '#f87171' : '#34d399'}; font-weight: 600;">${postVisibility}</td></tr>
        <tr><td style="padding: 6px 0; color: #71717a;">Author</td><td style="padding: 6px 0; text-align: right; color: #e4e4e7;">${userData?.displayName || 'Anonymous'}</td></tr>
        <tr><td style="padding: 6px 0; color: #71717a;">Post ID</td><td style="padding: 6px 0; text-align: right; color: #e4e4e7; font-family: monospace; font-size: 11px;">${postDocRef.id}</td></tr>
    </table>
    ${post.letter ? `<div style="margin: 16px 0 0 0; padding: 12px; background: #18181b; border-radius: 8px; font-size: 12px; color: #a1a1aa; line-height: 1.6;">${post.letter.substring(0, 300)}${post.letter.length > 300 ? '...' : ''}</div>` : ''}
</div>`,
                            });
                        }
                    } catch (emailErr) {
                        console.error(`[Cron] Post notification email failed:`, emailErr);
                    }

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
async function generateSingleImage(prompt: string, postId: string, referenceImages?: Buffer[]): Promise<{ buffer: Buffer; prompt: string } | null> {
    const result = await generateImage({
        prompt,
        aspectRatio: '9:16',
        logPrefix: 'Cron',
        referenceImages,
    });
    if (!result) return null;

    const finalBuffer = await sharp(result.buffer)
        .resize(1080, 1920, { fit: 'cover', position: 'center' })
        .png()
        .toBuffer();

    return { buffer: finalBuffer, prompt };
}

async function generateVerdictImage(prompt: string, postId: string, referenceImages?: Buffer[]): Promise<string | null> {
    try {
        // Attempt 1: Generate and validate
        const result = await generateSingleImage(prompt, postId, referenceImages);
        if (!result) return null;

        const validation = await validateGeneratedImage(result.buffer, prompt);
        if (validation.pass) {
            return await uploadImageBuffer(result.buffer, postId);
        }

        // Validation failed — retry once with reinforced prompt
        console.warn(`[Cron] Image validation failed for post ${postId} (attempt 1):`, validation.summary, validation.issues);
        const reinforcedPrompt = `${prompt} CRITICAL: Do not include any text, watermarks, metadata, words, letters, or numbers anywhere in the image. The image must be purely visual with zero text elements.`;
        const retry = await generateSingleImage(reinforcedPrompt, postId, referenceImages);
        if (!retry) return null;

        const retryValidation = await validateGeneratedImage(retry.buffer, reinforcedPrompt);
        if (retryValidation.pass) {
            console.log(`[Cron] Image passed validation on retry for post ${postId}`);
            return await uploadImageBuffer(retry.buffer, postId);
        }

        // Both attempts failed validation — return null (skip, retry next cron run)
        console.warn(`[Cron] Image validation failed on retry for post ${postId}:`, retryValidation.summary, '— skipping image for now');
        return null;
    } catch (err) {
        console.error("[Cron] Verdict image generation failed:", err);
        return null;
    }
}

async function uploadImageBuffer(buffer: Buffer, postId: string): Promise<string> {
    const bucket = storage.bucket();
    const ts = Date.now();
    const fileName = `post-images/${postId}_imagen_${ts}.png`;
    const file = bucket.file(fileName);

    await file.save(buffer, {
        metadata: { contentType: 'image/png' },
    });

    try { await file.makePublic(); } catch { /* UBLA enabled */ }

    console.log(`[Cron] Verdict image generated for post ${postId}`);
    return `https://storage.googleapis.com/${bucket.name}/${fileName}`;
}



import { NextResponse } from 'next/server';
import { db, storage } from '@/lib/firebase/admin';
import { z } from 'zod';
import { generateWithFallback, OPUS_MODEL, OPUS_FALLBACK } from '@/lib/ai/models';
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
import { loadUserReferenceImage } from '@/lib/ai/loadUserReferenceImage';
import { VISUAL_STYLES, getVisualStyle } from '@/lib/ai/visualStyles';
import { computeAge } from '@/lib/utils/parseBirthDate';
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

    // Build character appearance context for editorial storyboard images.
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
    const demographicHint = demographicTag
        ? `\nCHARACTER APPEARANCE — MANDATORY: The main character's fixed traits (face, ethnicity, age, gender): ${demographicTag}. You MUST include "${demographicTag}" in EVERY prompt. If you omit this, the generator will default to a generic adult.${dreamSelf ? `\nTheir ASPIRATIONAL self-presentation (use for LATER beats only — pivot, move, outcome): "${dreamSelf}"` : ''}
TRANSFORMATION ARC: If the letter describes a physical state that differs from the aspirational self (e.g., overweight, exhausted, unkempt), show the character's ACTUAL current state in Beats 1-2 (struggle). Transition in Beat 3 (pivot). By Beats 4-5 (move, outcome), the character should embody their resolved/aspirational state. This visual transformation IS the story. The face stays the same — only the body, posture, and energy transform.`
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
                    .map(d => d.data().visual_style || d.data().photo_style)
                    .filter(Boolean);
            } catch { /* ignore — index may not exist yet */ }

            const recentScaleHint = recentScales.length > 0
                ? `\nThe user's last ${recentScales.length} post(s) used these photo scales: [${recentScales.join(', ')}]. Do NOT repeat the same scale. Choose a DIFFERENT scale for variety.`
                : '';

            // Randomly select a visual style, excluding recently used ones for variety
            const availableStyles = recentStyles.length > 0
                ? VISUAL_STYLES.filter(s => !recentStyles.includes(s.id))
                : VISUAL_STYLES;
            const stylePool = availableStyles.length > 0 ? availableStyles : VISUAL_STYLES;
            const randomStyle = stylePool[Math.floor(Math.random() * stylePool.length)];
            console.log(`[Cron] Style — randomly selected: "${randomStyle.id}" (${randomStyle.name}), excluded: [${recentStyles.join(', ')}]`);

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
- WANT or FEELING: What did the user come in with? This is almost always stated in their first message or two. It is either a concrete want ("I need a new suit", "I want to lose weight", "I'm trying to decide whether to quit") or a negative feeling ("I feel off today", "I'm overwhelmed", "something isn't right in my relationship"). Read their words literally. If they are clear, they are clear. If they are confused, they are confused. Do NOT go deeper than the user went.
- SITUATION: What details emerged during Phase 1 that help a reader understand the context? Look for specifics the user shared — numbers, timelines, constraints, relationships, stakes.

INCLUDE THE FULL SITUATION: If the user revealed a passion, a desire, a thing they love doing, or something they discovered about themselves during the conversation, that is PART OF THEIR SITUATION — not advice. Include it in the letter. The letter should contain everything the response will need to reference. A cold reader will only ever see the letter and response — never the transcript.

CRITICAL RULE: The user is a reliable narrator of their own state. If they say they want something, that is what they want — do not reinterpret it as uncertainty. If they say they feel confused, the confusion IS the story — do not diagnose a cause and present the cause as their real problem. Character A may explore, question, and probe — but Character A's framework is not the user's experience. The letter represents the USER, not Character A's interpretation of the user.

YOUR EDITORIAL MANDATE: Write the letter the user would have written if they could articulate their situation cleanly. This means: preserve what they actually wanted or felt, add the situation details that make it vivid, and stop. Do NOT resolve it. Do NOT include anything from Phase 2. The letter is the "before" — the response is the "after." The letter should make the reader think "that's me" or "that's my friend" — not "that poor person."

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

- letter: LENGTH: 40-80 words. Tight and punchy — this is social media, not a newspaper. The letter will be read aloud in ~15-30 seconds. STRUCTURE: Lead with the GUT PUNCH — the single sharpest, most relatable line. This is the first thing a viewer reads as a subtitle. It must hook in under 8 words. (GOOD: "I keep going back." "I hate my body." "I just graduated and I can't find a job." BAD: "I find myself increasingly torn between..."). Then 2-3 sentences of SITUATION — just enough context to understand. The letter must present the situation as UNRESOLVED — before any advice was given. If you include ANY resolution, reframe, insight, or advice from Phase 2, you have failed. VOICE: Write in first person, present tense. Raw and conversational — like texting a friend at 2am, not writing to a therapist. No clinical language ("boundaries", "trauma", "healing journey"). NEVER reference the chat or session. NEVER narrate in third person. FORMATTING: Start with 'Dear Earnest,\\n\\n' followed by the gut punch. End with '\\n\\n— ' followed by the pseudonym in Title Case. No "Sincerely" — just the em dash. Write strictly in the requested language.

STEP 3: THE VISUAL DIRECTOR
Every post gets 7-8 editorial storyboard images that tell the story visually — from struggle to resolution. These crossfade during the video, creating a visual narrative arc that mirrors the letter and response.

THE EDITORIAL RULE:
Earnest Page is a publication. These images are art-directed editorial photography — like a magazine commissioning a photo essay to accompany an advice column. The character (the person who wrote the letter) appears IN the images as the subject. Other people appear as needed by the story.

ASSIGNED PHOTOGRAPHER: ${randomStyle.name} ("${randomStyle.id}")
You MUST write every imagen prompt through this photographer's eye. BECOME this photographer.${randomStyle.vision ? `
THEIR VISION: ${randomStyle.vision}` : ''}

THE STORYBOARD ARC — 7-8 BEATS:

Beat 1 — THE STUCK MOMENT: The character in the exact situation described in the letter. Specific, recognizable. A viewer should see this image and instantly understand what the story is about.
Example: Character sitting on a couch at night, phone in hand, lit by the screen glow.

Beat 2 — THE DETAIL (deepener): A closer shot of the object, screen, or environment that makes the situation real. This deepens the "I know this feeling" recognition.
Example: Close on the phone — a long thread of unanswered messages.

Beat 3 — THE WEIGHT (emotional deepener): Show the toll — the character's body language, the mess around them, the exhaustion. A beat that lets the viewer sit in the feeling before any change happens.
Example: Character's reflection in a dark window, shoulders slumped, city lights blurred behind them.

Beat 4 — THE PIVOT (turning point): A visual shift — lighting changes, scene shifts, the character's posture or energy changes. This marks the transition from the letter (the problem) to the response (the advice).
Example: Character standing up, putting the phone face-down on a table.

Beat 5 — THE MOVE (advice in action): The character doing what the response suggests. Shows, doesn't tell. The advice becomes visible.
Example: Character outside — walking, morning light, different energy.

Beat 6 — THE CLOSE-UP SHIFT: A detail shot that shows the change — hands relaxed instead of clenched, a new object in the scene, a different screen, a cleared space. The transformation made tangible through a small, specific detail.
Example: Hands wrapping around a warm mug, sunlight on the table, phone face-down and forgotten.

Beat 7 — THE OUTCOME (resolution): The character in the new state — wider shot, breathing room, different energy. The emotional payoff.
Example: Character at a café, talking to a friend, phone nowhere in sight.

Beat 8 (optional) — THE EXHALE (emotional close): A final environmental or detail shot that leaves the viewer with a feeling. Only include if it adds something Beat 7 didn't.

YOUR TWO JOBS:

1. Write the IMAGEN_PROMPTS — an array of 7-8 editorial storyboard prompts. Each one is a beat in the visual story. Together they tell the arc: stuck → detail → weight → pivot → move → close-up shift → outcome (→ exhale).
   THE KEY INSIGHT: You ARE ${randomStyle.name}. Don't write generic prompts and slap a style on top. Ask yourself for each beat: how would ${randomStyle.name} compose this shot? What would THEY notice? Where would THEY place the camera? How would THEY use light and shadow?
   CHARACTER CONSISTENCY: The same character must appear across all beats. Describe their fixed traits — face, ethnicity, age — consistently in every prompt.
   TRANSFORMATION ARC: If the letter describes a physical state (e.g., overweight, exhausted, unkempt), show the character's ACTUAL current state in Beats 1-2. Transition in Beat 3. By Beats 4-5, the character embodies their resolved/aspirational state. The face stays the same — only body, posture, and energy transform.
   EDITORIAL PHOTOGRAPHY RULES — NON-NEGOTIABLE:
   • NEVER have the character look directly at the camera. This is editorial photography, not a portrait. The character is caught in a MOMENT — unaware of the camera. They are looking at something, doing something, lost in thought. The camera observes them; they do not acknowledge it.
   • The character must be DOING something in every image — not standing, not posing. Sitting and staring at a phone. Walking away. Reaching for something. Leaning against a wall. The action creates the story.
   • Compose as your chosen photographer would — their signature angles, their use of space, their relationship to the subject.
   PRODUCT PLACEMENT — MANDATORY SUBSTITUTIONS:
   • If the conversation mentions coffee, espresso, brew, morning routine, or any coffee-related topic: ALL coffee imagery MUST show a JURA automatic espresso machine and CREMA coffee beans/bags (e.g., character reaching for a CREMA bag on a counter, character watching a Jura machine pull a shot). Never a generic coffee maker.
   • If the conversation mentions a specific brand (Hugo Boss, Tesla, etc.), use the EXACT brand name in the image prompt.
   ALL prompts must follow these rules: Never CGI, 3D-rendered, or illustrated. 9:16 portrait orientation (1080×1920). No text or watermarks in the image. Keep the center area relatively uncluttered (subtitle text overlays there during video playback).
${demographicHint}

2. Set photo_vibe for the overall post.

CHARACTER IDENTITY CONTEXT — use this to inform the character's world, wardrobe, and energy:
- Archetype: "${archetype}"
- Identity roles: "${identity?.title || 'Unknown'}"

OUTPUT FIELDS:
- photo_vibe: One word capturing the emotional tone (e.g., warmth, defiance, clarity, resolve).
- imagen_prompts: An ARRAY of 7-8 editorial storyboard prompts (strings). Each describes one beat of the visual story. The images should feel like an editorial photo essay — same character, same world, a story told in stills.
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
                            primaryModelId: OPUS_MODEL,
                            fallbackModelId: OPUS_FALLBACK,
                            schema: z.discriminatedUnion('is_publishable', [
                                z.object({
                                    is_publishable: z.literal(true),
                                    pseudonym: z.string(),
                                    letter: z.string(),
                                    photo_vibe: z.string(),
                                    imagen_prompts: z.array(z.string()).min(7).max(8),
                                    language: z.string().optional(),
                                }),
                                z.object({
                                    is_publishable: z.literal(false),
                                    pseudonym: z.string().optional(),
                                    letter: z.string().optional(),
                                    photo_vibe: z.string().optional(),
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

YOUR JOB: Write Earnest Page's response to this letter. The letter captures where the user arrived — what they wanted or how they felt. The conversation transcript shows the advice Character A gave. Your response delivers that advice — warm, specific, actionable, in Character A's exact voice. Match the nature of the advice: if the conversation delivered practical recommendations (go here, buy this, do that), the response should be practical. If it delivered an emotional reframe, the response should be an emotional reframe. Do not force emotional depth onto practical advice, and do not reduce emotional insight to bullet points.

SINGLE-INSIGHT FOCUS: The response should orbit ONE central reframe — the single belief or pattern that is actually blocking them. Don't scatter across multiple points. Setup → reframe → directive. The reframe is the line that should stop a reader cold.

SELF-CONTAINMENT — NON-NEGOTIABLE: The response must only reference situations, details, and context that appear IN THE LETTER. The reader has never seen the transcript. If the transcript contains insights, translate them into advice that makes sense given only what the letter says. Never say "you already named it" or reference something the letter doesn't mention.

NO WANT-SUBSTITUTION: Do not tell the writer what they "really" want. If the advice involves reframing a desire, name the specific feeling behind their stated want — don't replace their want with a different one. "You want money because you think it'll prove you're not failing" is good. "You don't want money — you want peace" is bad.

PII SCRUBBING — THIS IS NON-NEGOTIABLE:
FIRST — identify what to KEEP: Public figures and celebrities BY THEIR REAL NAMES (Jeremy Clarkson stays "Jeremy Clarkson", never "a celebrity" or "someone I admire"). Brand names, product recommendations, cultural references — keep them all verbatim.
THEN — replace what identifies THE USER: Names of people the user personally knows → relationship roles. Employer, school, clients → generic labels. The test: Wikipedia name? Keep it. Personal contact? Replace it.

- response: LENGTH: 85-115 words. STRUCTURE: Open with the CONFRONTATIONAL TRUTH — the thing the user needs to hear. No throat-clearing, no "I hear you", no acknowledgment of their feelings. Go straight to the insight. Three-four sentences delivering the real advice that emerged in the conversation — be specific, give the reader something concrete they can use. One closing line with a direct instruction or challenge. The response is the PAYOFF — it answers the letter. Write strictly in Character A's exact voice. FORMATTING: Start with '${pass1.pseudonym},\n\n' (direct address, no "Dear"). Write the body. End with '\n\n— Earnest Page'. No "Sincerely" — just the em dash. Strip away all standard AI formatting like bullet points unless the character would use them. Write strictly in the requested language.`;

                    const responseResult = await generateWithFallback({
                        primaryModelId: OPUS_MODEL,
                        fallbackModelId: OPUS_FALLBACK,
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

                // Stamp the randomly pre-selected visual style onto the post
                post.visual_style = randomStyle.id;

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

                    // Load the user's avatar as a character reference anchor.
                    // Nano Banana uses reference images to maintain consistent
                    // facial geometry, build, and clothing across all storyboard beats.
                    const referenceImage = await loadUserReferenceImage(uid);
                    const referenceImages = referenceImage ? [referenceImage] : undefined;

                    // Sequential image generation with stagger delay to avoid 429 rate limits.
                    // Transformation arc: early beats (0-1) use face-only reference
                    // so the text prompt controls body type. Later beats (2+) use full
                    // reference to pull in the aspirational build from the avatar.
                    const IMAGE_STAGGER_MS = 1500; // delay between sequential API calls
                    const imagen_urls: string[] = [];
                    let quotaExhausted = false;

                    // Run images sequentially while dossier runs in parallel
                    // Resolve photographer style for this post
                    const chosenStyle = getVisualStyle(post.visual_style || '');
                    const imagenTag = chosenStyle?.imagenTag || '';
                    console.log(`[CleanupChats] Photographer — selected: "${post.visual_style}", resolved: "${chosenStyle?.id || 'NONE'}"`);

                    const imageSequence = (async () => {
                        for (let i = 0; i < prompts.length; i++) {
                            if (quotaExhausted) break;
                            if (i > 0) await new Promise(r => setTimeout(r, IMAGE_STAGGER_MS));
                            try {
                                // Prepend photographer imagen tag to each prompt
                                const styledPrompt = imagenTag ? `${imagenTag} ${prompts[i]}` : prompts[i];
                                const url = await generateVerdictImage(
                                    styledPrompt, `${postDocRef.id}_${i}`,
                                    referenceImages, i < 2 ? 'face-only' : 'full'
                                );
                                if (url) imagen_urls.push(url);
                            } catch (err: any) {
                                if (err?.isQuotaError) {
                                    quotaExhausted = true;
                                    console.warn(`[Cron] Quota exhausted after ${imagen_urls.length}/${prompts.length} images for user ${uid} — stopping batch`);
                                }
                                // other errors already logged by generateVerdictImage
                            }
                        }
                    })();

                    await Promise.allSettled([imageSequence, dossierPromise]);
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
                        visual_style: post.visual_style || null,
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
async function generateSingleImage(prompt: string, postId: string, referenceImages?: Buffer[], referenceMode?: 'full' | 'face-only'): Promise<{ buffer: Buffer; prompt: string } | null> {
    const result = await generateImage({
        prompt,
        aspectRatio: '9:16',
        logPrefix: 'Cron',
        referenceImages,
        referenceMode,
    });
    if (!result) return null;

    const finalBuffer = await sharp(result.buffer)
        .resize(1080, 1920, { fit: 'cover', position: 'center' })
        .png()
        .toBuffer();

    return { buffer: finalBuffer, prompt };
}

async function generateVerdictImage(prompt: string, postId: string, referenceImages?: Buffer[], referenceMode?: 'full' | 'face-only'): Promise<string | null> {
    try {
        // Attempt 1: Generate and validate
        const result = await generateSingleImage(prompt, postId, referenceImages, referenceMode);
        if (!result) return null;

        const validation = await validateGeneratedImage(result.buffer, prompt);
        if (validation.pass) {
            return await uploadImageBuffer(result.buffer, postId);
        }

        // Validation failed — retry once with reinforced prompt
        console.warn(`[Cron] Image validation failed for post ${postId} (attempt 1):`, validation.summary, validation.issues);
        const reinforcedPrompt = `${prompt} CRITICAL: Do not include any text, watermarks, metadata, words, letters, or numbers anywhere in the image. The image must be purely visual with zero text elements.`;
        const retry = await generateSingleImage(reinforcedPrompt, postId, referenceImages, referenceMode);
        if (!retry) return null;

        const retryValidation = await validateGeneratedImage(retry.buffer, reinforcedPrompt);
        if (retryValidation.pass) {
            console.log(`[Cron] Image passed validation on retry for post ${postId}`);
            return await uploadImageBuffer(retry.buffer, postId);
        }

        // Both attempts failed validation — return null (skip, retry next cron run)
        console.warn(`[Cron] Image validation failed on retry for post ${postId}:`, retryValidation.summary, '— skipping image for now');
        return null;
    } catch (err: any) {
        console.error("[Cron] Verdict image generation failed:", err);
        if (err?.isQuotaError) throw err; // propagate quota errors so callers can stop the batch
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



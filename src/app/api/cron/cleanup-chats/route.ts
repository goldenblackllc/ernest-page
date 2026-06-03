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

    // Build demographic hint for image generation so human figures match the user
    const gender = identity?.gender || '';
    const ethnicity = identity?.ethnicity || '';
    const birthYear = identity?.age ? parseInt(identity.age, 10) : NaN;
    const computedAge = !isNaN(birthYear) ? Math.max(0, new Date().getFullYear() - birthYear) : null;
    const demographicParts = [
        computedAge ? `approximately ${computedAge} years old` : '',
        ethnicity,
        gender,
    ].filter(Boolean);
    const demographicHint = demographicParts.length > 0
        ? `\nDEMOGRAPHIC CONTEXT (use ONLY when the "human" scale is chosen and a person appears in the image): The user is ${demographicParts.join(', ')}. Any human figure, silhouette, or body shown must plausibly match this description — skin tone, build, and age-appropriate appearance. Do NOT default to any other demographic. Remember: NEVER show faces.`
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
            await chatDoc.ref.update({ processing: true, processingStartedAt: Date.now() });

            const transcript = messages.map((m: any) => `${m.role}: ${m.content}`).join('\n');

            // Fetch recent posts to avoid repeating the same photo scale
            let recentScales: string[] = [];
            try {
                const recentSnap = await db.collection("posts")
                    .where("authorId", "==", uid)
                    .orderBy("created_at", "desc")
                    .limit(3)
                    .get();
                recentScales = recentSnap.docs
                    .map(d => d.data().photo_scale)
                    .filter(Boolean);
            } catch { /* ignore — index may not exist yet */ }

            const recentScaleHint = recentScales.length > 0
                ? `\nThe user's last ${recentScales.length} post(s) used these photo scales: [${recentScales.join(', ')}]. Do NOT repeat the same scale. Choose a DIFFERENT scale for variety.`
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
* Meaningless (is_publishable: false): Pleasantries ("Hi", "Thanks"), system tests, circular banter with no substance, OR conversations where Character A never draws out a real struggle. If the user never reveals what they actually want or what's in the way, there is no story.
* Valuable (is_publishable: true): The conversation contains a dramatic arc — the user arrives with a desire or problem, an obstacle surfaces through the dialogue (often the user doesn't even know it's there until they say it), and Character A delivers a reframe or insight. The reader must be able to feel the tension in under 60 seconds.

STEP 2: WRITE THE LETTER (If Publishable)
Your ONLY writing job in this step is the LETTER — the user's side. You are NOT writing Earnest's response. That comes later in a separate step.

Identify the user's opening state:
- INTENTION: What did they want? This comes from their first 1-2 messages. It is often vague, muddy, inarticulate — people don't arrive saying "I want happiness but don't know how." They arrive saying "I'm feeling weird today, I don't know, just kind of off."
- OBSTACLE: What was in the way? This often surfaces in the MIDDLE of the conversation, drawn out by Character A's questioning. Look for the moment the user says something raw or specific that they didn't plan to say.

YOUR EDITORIAL MANDATE: Crystallize the user's messy opening into the letter they WOULD have written if they could articulate it that clearly. This is not invention — it is editorial work. Dear Abby letters are edited too. Take the confused, stream-of-consciousness opening and render it as a clean, emotionally honest letter. Preserve the confusion and tension they came in with. Do NOT resolve it.

- title: Write a curiosity-driven hook title (8-15 words). Combine INTENTION and OBSTACLE as unresolved tension. The title must NEVER include the resolution. Never use second person. Examples: 'I Want To Be a Good Father But I Keep Choosing Work', 'Am I Wrong for Not Forgiving My Mother?', 'I Love My Partner But I Don't Like Who I've Become', 'I Want To Be Happy But I Keep Forcing Myself To Show Up'. The title should make someone stop scrolling.
- pseudonym: A clever 2-3 word sign-off (e.g., 'Curious Creator').

PII SCRUBBING — THIS IS NON-NEGOTIABLE AND APPLIES TO ALL FIELDS (title, letter):
Replace ALL of the following with generic relationship or role labels — NEVER include them verbatim:
  • Real first names, last names, or nicknames of any person → replace with their relationship role (e.g., "Max" → "my friend", "Iris" → "my sister", "John at work" → "my colleague")
  • Specific company or employer names → "my company" or "my workplace"
  • Specific place names (cities, neighborhoods, schools, venues) → "my city", "my school", "my neighborhood"
  • Any identifying details (addresses, phone numbers, email addresses, social media handles)
If you are unsure whether something is PII, err on the side of removing it. The post must be fully anonymous.

- letter: LENGTH: 60-80 words MAXIMUM. This is non-negotiable — the letter will be read aloud in ~30 seconds. STRUCTURE: One sentence stating what the person wants (INTENTION). Two-three sentences on what's blocking them (OBSTACLE). One closing line of raw emotional honesty. The letter must present the struggle as UNRESOLVED — as if the conversation hasn't happened yet. If you include ANY resolution, reframe, or insight, you have failed. VOICE: Write in first person, writing this letter RIGHT NOW. TENSE: PRESENT TENSE only. NEVER use past tense to recap (WRONG: 'I came to you', RIGHT: 'I come to you'). NEVER reference the chat or session. NEVER narrate in third person. FORMATTING: Start exactly with 'Dear Earnest Page,\n\n'. Write the body. End with '\n\nSincerely,\n' followed by the pseudonym in Title Case (e.g., 'Sincerely,\nOverwhelmed Father'). Write strictly in the requested language.

STEP 3: THE ART DIRECTOR (Image Generation)
You are composing a HERO MOMENT — a single frame that captures the emotional essence of this post. Think like a film director choosing a still frame, NOT a stock photographer. Every image must be Instagram-quality: sharp, high-contrast, saturated, scroll-stopping.

CHARACTER IDENTITY CONTEXT — use this to inform the world, environment, and energy of the image:
- Archetype: "${archetype}"
- Identity roles: "${identity?.title || 'Unknown'}"
These roles should influence the setting, objects, and atmosphere. A "Monk" evokes stillness and sacred spaces. An "Athlete" evokes motion and discipline. A "Mother" evokes warmth and domestic beauty. A "Businessman" evokes sharp suits and city skylines. Let the archetype shape the visual world — do NOT ignore it.

First, read the emotional tone of the post and choose a VIBE — the feeling that should emanate from the image. Examples: luxury, grit, serenity, chaos, warmth, ambition, defiance, tenderness, solitude, celebration.

Then choose a SCALE — the type of shot:
- "macro": Sharp close-up of a specific object or texture. Cinematic lighting, extreme detail.
- "lifestyle": A composed scene or environment that tells a story. Tabletop, room, workspace.
- "wide": An aspirational landscape, cityscape, or architectural shot. Expansive, atmospheric.
- "human": Faceless human presence — silhouettes, hands doing something, over-the-shoulder, person walking away. NEVER show faces.
${recentScaleHint}${demographicHint}

- photo_vibe: One word capturing the emotional tone.
- photo_scale: One of macro, lifestyle, wide, or human.
- imagen_prompt: Write a detailed prompt for Google Imagen to create this image. Highly photorealistic. Cinematic lighting. Instagram-quality. NEVER include visible faces or readable text. ECOSYSTEM BRAND RULES (apply ONLY when the subject naturally calls for it — do NOT force these into unrelated images): If the image involves coffee, espresso, or a coffee machine, depict a sleek Jura automatic bean-to-cup machine (modern Swiss design, minimalist, silver/black) — NEVER a traditional espresso machine with a portafilter or group head. If the image involves a cup of coffee, always show rich golden-brown crema on top — NEVER flat black coffee or drip coffee.
- language: Detect the primary language of the conversation. Output the language name as it appears natively (e.g., 'English', 'Español', '日本語', 'Français').`;

            const dossierRewritePrompt = `${buildDossierPrompt(currentDossier, sessionCount)}

The following chat transcript is the new session data to incorporate.

CHAT TRANSCRIPT:
${transcript}`;

            const recapPrompt = `Write a 2-3 sentence recap of this session for continuity. What was discussed? What was the emotional tone? What was the outcome or takeaway? Write from the consultant's perspective. Keep it concise — this will be shown to the character at the start of the next session for context.

CHAT TRANSCRIPT:
${transcript}`;

            try {
                // ── PARALLEL BATCH: Pass 1 (letter) + Dossier + Recap ──
                const [letterResult, dossierResult, recapResult] = await Promise.all([
                    // Pass 1: Letter + editorial judgment + image prompt
                    generateWithFallback({
                        primaryModelId: SONNET_MODEL,
                        schema: z.object({
                            is_publishable: z.boolean(),
                            title: z.string().optional(),
                            pseudonym: z.string().optional(),
                            letter: z.string().optional(),
                            photo_vibe: z.string().optional(),
                            photo_scale: z.enum(["macro", "lifestyle", "wide", "human"]).optional(),
                            imagen_prompt: z.string().optional(),
                            language: z.string().optional(),
                        }),
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

                const pass1 = letterResult.object as any;
                const dossier = dossierResult.object as any;
                const recap = recapResult.object as any;

                // ── Pass 2: Response (sequential — needs the letter from Pass 1) ──
                let post: any;
                if (pass1.is_publishable && pass1.letter && pass1.pseudonym) {
                    const responsePrompt = `You are writing as Earnest Page — an advice columnist. You have just received the following letter. Now write your response.
${languageCommand}

CHARACTER BIBLE (this is Earnest Page's voice and worldview — write in this voice):
${JSON.stringify(compiledBible)}

THE LETTER:
${pass1.letter}

CHAT TRANSCRIPT (for context — the resolution that emerged in this conversation):
${transcript}

YOUR JOB: Write Earnest Page's response to this letter. The letter captures the user's unresolved tension. The conversation transcript shows how it was resolved. Your response delivers that resolution — warm, specific, in Character A's exact voice.

PII SCRUBBING — THIS IS NON-NEGOTIABLE:
Replace ALL real names with relationship roles, all specific places/companies with generic labels. The response must be fully anonymous.

- response: LENGTH: 60-80 words MAXIMUM. This is non-negotiable — the response will be read aloud in ~30 seconds. STRUCTURE: One sentence acknowledging the tension from the letter. Two-three sentences delivering the reframe or insight that emerged in the conversation. One closing line with a direct instruction or challenge. The response is the PAYOFF — it only works because the letter set up unresolved tension. Write strictly in Character A's exact voice. FORMATTING: Start with 'Dear ${pass1.pseudonym},\n\n'. Write the body. End with '\n\nSincerely,\nEarnest Page'. Strip away all standard AI formatting like bullet points unless the character would use them. Write strictly in the requested language.`;

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
                const dossierPromise = identity
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
                if (post.is_publishable && post.title) {
                    const postDocRef = db.collection('posts').doc();

                    // Start image generation and dossier write concurrently
                    const [imageResult] = await Promise.allSettled([
                        generatePostImage(post.imagen_prompt, postDocRef.id),
                        dossierPromise,
                    ]);

                    const imagen_url = imageResult.status === 'fulfilled' ? imageResult.value : null;

                    // Match sponsor from imagen prompt
                    const sponsor = matchSponsor(post.imagen_prompt);

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
                        imagen_prompt: post.imagen_prompt,
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
                        likes: 0,
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
            } catch (e) {
                console.error(`[Cron] Processing failed for user ${uid}:`, e);
            }
        }

        // Delete the processed or empty chat session
        await chatDoc.ref.delete();
    }

    return processed;
}

// ─── Image generation helper ─────────────────────────────────────────────────
async function generatePostImage(prompt: string, postId: string): Promise<string | null> {
    try {
        const imagenRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                instances: [{ prompt }],
                parameters: {
                    sampleCount: 1,
                    aspectRatio: "16:9",
                    personGeneration: "ALLOW_ADULT"
                }
            })
        });

        if (imagenRes.ok) {
            const data = await imagenRes.json();
            if (data.predictions?.[0]?.bytesBase64Encoded) {
                const buffer = Buffer.from(data.predictions[0].bytesBase64Encoded, 'base64');
                const bucket = storage.bucket();
                const fileName = `post-images/${postId}_imagen.jpg`;
                const file = bucket.file(fileName);

                await file.save(buffer, {
                    metadata: { contentType: 'image/jpeg' },
                });

                // Try to make public; skip silently if Uniform Bucket-Level Access is on
                try { await file.makePublic(); } catch { /* UBLA enabled — bucket-level rules apply */ }

                return `https://storage.googleapis.com/${bucket.name}/${fileName}`;
            }
        } else {
            console.error("Imagen API Error:", await imagenRes.text());
        }
    } catch (err) {
        console.error("[Cron] Image generation failed:", err);
    }
    return null;
}

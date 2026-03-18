import { NextResponse } from 'next/server';
import { db, storage } from '@/lib/firebase/admin';
import { z } from 'zod';
import { generateWithFallback, SONNET_MODEL } from '@/lib/ai/models';
import { FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { hashPhoneNumberServer, normalizePhoneNumberServer } from '@/lib/security/serverHash';
import { geohashForLocation } from 'geofire-common';

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
        const timeoutMs = 15 * 60 * 1000; // 15 mins
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
        // Determine visibility: sessionRouting takes precedence, then autoPublish legacy fallback
        const isPublic = chatData.sessionRouting
            ? chatData.sessionRouting === 'public'
            : chatData.autoPublish !== false;

        if (messages.length > 0) {
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

            // ─── COMBINED AI CALL: post synthesis + dossier update ───
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

            const combinedPrompt = `You have TWO tasks to complete from the same chat transcript. Complete both.
${languageCommand}

CHARACTER BIBLE:
${JSON.stringify(compiledBible)}

CHAT TRANSCRIPT:
${transcript}

═══ TASK 1: EDITORIAL POST SYNTHESIS ═══

You are the Executive Editor of an elite advice and lifestyle column on a mainstream social media app. You just received this raw chat transcript between a user (Character B) and their Ideal Self (Character A).

STEP 1: THE EDITORIAL JUDGMENT
Determine if this transcript has "Editorial Value."
* Meaningless (is_publishable: false): Pleasantries ("Hi", "Thanks"), system tests, or circular banter with no substance.
* Valuable (is_publishable: true): Contains a psychological struggle, a request for advice, OR a specific lifestyle/aesthetic question (e.g., "What soap do you use?", "How do you structure your morning?"). Readers love specific lifestyle details and psychological breakthroughs.

STEP 2: THE SYNTHESIS (If Publishable)
If the transcript is valuable, populate the post fields:
- title: A punchy, scroll-stopping social media hook (4-8 words). No academic phrasing. Create a curiosity gap.
- pseudonym: A clever 2-3 word sign-off (e.g., 'Curious Creator').
- letter: Ghostwrite Character B's side into a punchy social media submission. FORMATTING RULES: You MUST start exactly with: 'Dear ${archetype},' followed by a double line break (\\n\\n). Write the body of the letter. End with a double line break (\\n\\n) followed by the pseudonym (e.g., '- OVERWHELMED FATHER'). SCRUB ALL PII (names, locations). The letter must be strictly in the requested language.
- response: Synthesize Character A's advice. Write strictly in Character A's exact voice. FORMATTING RULES: You MUST end the response with a double line break (\\n\\n) followed exactly by: '- ${archetype}'. Strip away all standard AI formatting like bullet points unless the character would use them. The response must be strictly in the requested language.

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
- language: Detect the primary language of the conversation. Output the language name as it appears natively (e.g., 'English', 'Español', '日本語', 'Français').

═══ TASK 2: DOSSIER UPDATE ═══

You are maintaining a personal consultant's client dossier.

CURRENT DOSSIER:
${currentDossier}

WHAT COUNTS AS A FACT:
- Only extract things the USER explicitly said about their own life: people, places, jobs, living situation, preferences, hobbies, goals, and concrete events.
- Do NOT extract the consultant's analysis, opinions, or observations about the user's behavior or communication style.
- Do NOT include session dynamics, meta-commentary about the conversation itself, or editorial analysis of the user's honesty or motives.
- If in doubt, ask: "Did the user tell me this about themselves?" If the answer is no, it does not belong in the dossier.

REWRITE RULES:
- Produce a COMPLETE REWRITE of the dossier — not an append. The output replaces the current dossier entirely.
- Keep all existing life facts that are still relevant. Drop anything outdated or contradicted by new information.
- DROP any behavioral observations, communication analysis, or session meta-commentary that may exist in the previous dossier. These do not belong in any section.
- The dossier must be UNDER 1200 WORDS. If it grows beyond that, prioritize: active goals > key people > profile > preferences. Cut the least actionable details.
- Update session count to: ${sessionCount}
- Update date to today
- Write from the consultant's perspective — professional, structured, factual. Stick to what is known. Do not speculate.

Use ONLY the following section format with ═══ headers. Do not invent, rename, merge, or add any sections beyond these four:

DOSSIER — [Client Title]
Updated: [Date] | Sessions: ${sessionCount}

═══ PROFILE ═══
Hard facts: gender, age, location, living situation, occupation, employer, life stage, identity summary

═══ KEY PEOPLE ═══
Important relationships with enough detail to reference naturally in conversation

═══ ACTIVE GOALS ═══
What they are currently working toward — concrete projects, ambitions, and active pursuits

═══ PREFERENCES & STYLE ═══
Personal tastes ONLY: favorite music, movies, books, food, drinks, brands, hobbies, sports teams, routines, and anything else they enjoy or favor. Do NOT include communication style or behavioral observations here.`;

            try {
                const result = await generateWithFallback({
                    primaryModelId: SONNET_MODEL,
                    schema: z.object({
                        post: z.object({
                            is_publishable: z.boolean(),
                            title: z.string().optional(),
                            pseudonym: z.string().optional(),
                            letter: z.string().optional(),
                            response: z.string().optional(),
                            photo_vibe: z.string().optional(),
                            photo_scale: z.enum(["macro", "lifestyle", "wide", "human"]).optional(),
                            imagen_prompt: z.string().optional(),
                            language: z.string().optional(),
                        }),
                        updated_dossier: z.string(),
                    }),
                    prompt: combinedPrompt,
                });

                const object = result.object as any;

                // ─── DOSSIER WRITE (runs in parallel with image gen below) ───
                const dossierPromise = identity
                    ? userDoc.ref.set({
                        identity: {
                            ...identity,
                            dossier: object.updated_dossier,
                            dossier_updated_at: FieldValue.serverTimestamp(),
                            session_count: sessionCount,
                        },
                    }, { merge: true }).then(() => {
                        console.log(`[Cron] Dossier updated for user ${uid} (session ${sessionCount})`);
                    }).catch((err: any) => {
                        console.error(`[Cron] Dossier update failed for user ${uid}:`, err.message);
                    })
                    : Promise.resolve();

                // ─── POST CREATION (with parallel image gen) ───
                if (object.post.is_publishable && object.post.title) {
                    const postDocRef = db.collection('posts').doc();

                    // Start image generation and dossier write concurrently
                    const [imageResult] = await Promise.allSettled([
                        generatePostImage(object.post.imagen_prompt, postDocRef.id),
                        dossierPromise,
                    ]);

                    const imagen_url = imageResult.status === 'fulfilled' ? imageResult.value : null;

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
                            title: object.post.title,
                            pseudonym: object.post.pseudonym,
                            letter: object.post.letter,
                            response: object.post.response,
                        },
                        imagen_prompt: object.post.imagen_prompt,
                        photo_vibe: object.post.photo_vibe,
                        photo_scale: object.post.photo_scale,
                        language: object.post.language || null,
                        imagen_url: imagen_url,
                        // Geolocation for proximity filtering
                        ...geoFields,
                        // Legacy fallbacks for uninterrupted rendering
                        title: object.post.title,
                        pseudonym: object.post.pseudonym,
                        letter: object.post.letter,
                        response: object.post.response,
                        content_raw: transcript,
                        status: "completed",
                        created_at: new Date(),
                        is_public: isPublic,
                        likes: 0,
                        comments: 0
                    });
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
                parameters: { sampleCount: 1, aspectRatio: "16:9" }
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

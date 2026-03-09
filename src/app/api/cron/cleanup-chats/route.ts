import { NextResponse } from 'next/server';
import { db, storage } from '@/lib/firebase/admin';
import { z } from 'zod';
import { generateWithFallback, generateTextWithFallback, SONNET_MODEL } from '@/lib/ai/models';
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
        const usersSnapshot = await db.collection('users').get();
        const now = Date.now();
        const timeoutMs = 15 * 60 * 1000; // 15 mins
        let processedCount = 0;

        for (const userDoc of usersSnapshot.docs) {
            const uid = userDoc.id;
            const activeChatsRef = userDoc.ref.collection('active_chats');
            const chatsSnap = await activeChatsRef.get();

            if (!chatsSnap.empty) {
                const userData = userDoc.data();
                const compiledBible = userData?.character_bible?.compiled_output?.ideal || [];
                const archetype = userData?.character_bible?.source_code?.archetype || "Mirror Reflection";

                for (const chatDoc of chatsSnap.docs) {
                    const chatData = chatDoc.data();

                    const isExpired = chatData?.updatedAt && (now - chatData.updatedAt > timeoutMs);
                    const isClosedByUser = chatData?.isClosed === true;

                    // Process if abandoned via timeout or explicitly closed by user
                    if (isExpired || isClosedByUser) {
                        const messages = chatData.messages || [];
                        const shouldPublish = chatData.autoPublish !== false; // Default to true (publish) unless explicitly opted out

                        // Only generate a post if there is actual conversation content AND user hasn't opted out
                        if (messages.length > 0 && shouldPublish) {
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

                            const prompt = `Character A is defined by the following Character Bible:
${JSON.stringify(compiledBible)}
You are the Executive Editor of an elite advice and lifestyle column on a mainstream social media app. You just received a raw chat transcript between a user (Character B) and Character A.
Here is the raw chat transcript:
${transcript}

STEP 1: THE EDITORIAL JUDGMENT
Determine if this transcript has "Editorial Value."
* Meaningless (is_publishable: false): Pleasantries ("Hi", "Thanks"), system tests, or circular banter with no substance.
* Valuable (is_publishable: true): Contains a psychological struggle, a request for advice, OR a specific lifestyle/aesthetic question (e.g., "What soap do you use?", "How do you structure your morning?"). Readers love specific lifestyle details and psychological breakthroughs.

STEP 2: THE SYNTHESIS (If Publishable)
If the transcript is valuable, synthesize it into a single anonymous post. Output a JSON object:
{
"is_publishable": true/false,
"post": {
"title": "A punchy, scroll-stopping social media hook (4-8 words). No academic phrasing. Create a curiosity gap.",
"pseudonym": "A clever 2-3 word sign-off (e.g., 'Curious Creator').",
"letter": "Ghostwrite Character B's side into a punchy social media submission. FORMATTING RULES: You MUST start exactly with: 'Dear ${archetype},' followed by a double line break (\\n\\n). Write the body of the letter. End with a double line break (\\n\\n) followed by the pseudonym (e.g., '- OVERWHELMED FATHER'). SCRUB ALL PII (names, locations).",
"response": "Synthesize Character A's advice. Write strictly in Character A's exact voice. FORMATTING RULES: You MUST end the response with a double line break (\\n\\n) followed exactly by: '- ${archetype}'. Strip away all standard AI formatting like bullet points unless the character would use them.",

STEP 3: THE ART DIRECTOR (Image Generation)
You are composing a HERO MOMENT — a single frame that captures the emotional essence of this post. Think like a film director choosing a still frame, NOT a stock photographer. Every image must be Instagram-quality: sharp, high-contrast, saturated, scroll-stopping.

First, read the emotional tone of the post and choose a VIBE — the feeling that should emanate from the image. Examples: luxury, grit, serenity, chaos, warmth, ambition, defiance, tenderness, solitude, celebration.

Then choose a SCALE — the type of shot:
- "macro": Sharp close-up of a specific object or texture. Cinematic lighting, extreme detail.
- "lifestyle": A composed scene or environment that tells a story. Tabletop, room, workspace.
- "wide": An aspirational landscape, cityscape, or architectural shot. Expansive, atmospheric.
- "human": Faceless human presence — silhouettes, hands doing something, over-the-shoulder, person walking away. NEVER show faces.
${recentScaleHint}

"photo_vibe": "One word capturing the emotional tone.",
"photo_scale": "One of macro, lifestyle, wide, or human.",
"imagen_prompt": "Write a detailed prompt for Google Imagen to create this image. Highly photorealistic. Cinematic lighting. Instagram-quality. NEVER include visible faces or readable text."
}
}`;

                            // Generate 'Dear Earnest' Post
                            const result = await generateWithFallback({
                                primaryModelId: SONNET_MODEL,
                                schema: z.object({
                                    is_publishable: z.boolean(),
                                    post: z.object({
                                        title: z.string(),
                                        pseudonym: z.string(),
                                        letter: z.string(),
                                        response: z.string(),
                                        photo_vibe: z.string(),
                                        photo_scale: z.enum(["macro", "lifestyle", "wide", "human"]),
                                        imagen_prompt: z.string()
                                    }).nullable().optional()
                                }),
                                prompt: prompt
                            });
                            const object = result.object as any;

                            if (object.is_publishable && object.post) {
                                // 1. Generate URLs
                                let imagen_url = null;

                                // Fetch image from Imagen
                                try {
                                    const postDocRef = db.collection('posts').doc();
                                    const imagenRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY}`, {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({
                                            instances: [{ prompt: object.post.imagen_prompt }],
                                            parameters: { sampleCount: 1, aspectRatio: "16:9" }
                                        })
                                    });

                                    if (imagenRes.ok) {
                                        const data = await imagenRes.json();
                                        if (data.predictions && data.predictions[0] && data.predictions[0].bytesBase64Encoded) {
                                            const base64Data = data.predictions[0].bytesBase64Encoded;
                                            const buffer = Buffer.from(base64Data, 'base64');
                                            const bucket = storage.bucket();
                                            const fileName = `post-images/${postDocRef.id}_imagen.jpg`;
                                            const file = bucket.file(fileName);

                                            await file.save(buffer, {
                                                metadata: { contentType: 'image/jpeg' },
                                                public: true
                                            });

                                            imagen_url = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
                                        }
                                    } else {
                                        console.error("Imagen API Error:", await imagenRes.text());
                                    }

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
                                        is_public: true,
                                        likes: 0,
                                        comments: 0
                                    });
                                    processedCount++;
                                } catch (e) {
                                    console.error("Failed to insert generated post: ", e);
                                }
                            }
                        }

                        // Update dossier with conversation data (runs for ALL chats with messages)
                        if (messages.length > 0) {
                            try {
                                const identity = userData?.identity;
                                if (identity) {
                                    const chatTranscript = messages.map((m: any) => `${m.role}: ${m.content}`).join('\n');
                                    const currentDossier = identity.dossier || '';
                                    const sessionCount = (identity.session_count || 0) + 1;

                                    const dossierPrompt = `You are maintaining a personal consultant's client dossier. Your job is to produce an updated dossier that captures everything important about this person.

CURRENT DOSSIER:
${currentDossier}

NEW SESSION TRANSCRIPT:
${chatTranscript}

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
Personal tastes ONLY: favorite music, movies, books, food, drinks, brands, hobbies, sports teams, routines, and anything else they enjoy or favor. Do NOT include communication style or behavioral observations here.

Output the complete updated dossier as plain text.`;

                                    const dossierResult = await generateTextWithFallback({
                                        primaryModelId: SONNET_MODEL,
                                        prompt: dossierPrompt,
                                    });

                                    await userDoc.ref.set({
                                        identity: {
                                            ...identity,
                                            dossier: dossierResult.text,
                                            dossier_updated_at: FieldValue.serverTimestamp(),
                                            session_count: sessionCount,
                                        },
                                    }, { merge: true });

                                    console.log(`[Cron] Dossier updated for user ${uid} (session ${sessionCount})`);
                                }
                            } catch (dossierError: any) {
                                console.error(`[Cron] Dossier update failed for user ${uid}:`, dossierError.message);
                                // Don't block chat cleanup if dossier update fails
                            }

                            // --- BELIEF PATTERN TRACKING ---
                            try {
                                const identity = userData?.identity;
                                if (identity) {
                                    const chatTranscript = messages.map((m: any) => `${m.role}: ${m.content}`).join('\n');
                                    const currentPatterns = identity.belief_patterns || '';

                                    const beliefPrompt = `You are maintaining a longitudinal belief analysis for a personal growth platform. Your job is to track how this person's beliefs are evolving across sessions.

CURRENT BELIEF PATTERNS (from previous sessions):
${currentPatterns || 'No previous patterns recorded.'}

NEW SESSION TRANSCRIPT:
${chatTranscript}

Analyze this session and produce an updated belief patterns document. Track:

1. RECURRING BELIEFS CREATING FRICTION — What beliefs keep showing up that create negative feelings? Name the belief specifically (e.g., "I don't have enough" or "I'm not good enough to charge more"). If a belief appeared in previous sessions, note how many times it has recurred.

2. EXCITEMENT SIGNALS — Where was the person's energy highest? What topics, ideas, or possibilities lit them up? These point to alignment.

3. SHIFTS — Did any previously-held belief change in this session compared to earlier sessions? If so, name what changed and when.

4. UNEXPECTED RESULTS — Did the person mention anything surprising that happened after following their excitement? These connections between action and unexpected outcomes are important to track.

RULES:
- Produce a COMPLETE REWRITE, not an append. The output replaces the current document.
- Keep it under 600 words. Prioritize: active friction beliefs > excitement signals > shifts > unexpected results.
- Write from an analytical perspective — factual, pattern-focused, not judgmental.
- Do not include advice or recommendations. Just observe and record.

Output the updated belief patterns as plain text.`;

                                    const beliefResult = await generateTextWithFallback({
                                        primaryModelId: SONNET_MODEL,
                                        prompt: beliefPrompt,
                                    });

                                    await userDoc.ref.set({
                                        identity: {
                                            belief_patterns: beliefResult.text,
                                        },
                                    }, { merge: true });

                                    console.log(`[Cron] Belief patterns updated for user ${uid}`);
                                }
                            } catch (beliefError: any) {
                                console.error(`[Cron] Belief pattern update failed for user ${uid}:`, beliefError.message);
                                // Don't block chat cleanup if belief update fails
                            }
                        }

                        // Delete the processed or empty chat session
                        await chatDoc.ref.delete();
                    }
                }
            }
        }

        return NextResponse.json({ success: true, processedCount });
    } catch (error: any) {
        console.error("Cron Cleanup Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

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
import { generateConversationAudio, getEarnestVoiceForUser } from '@/lib/ai/postTTS';
import { generateCondensedTranscript } from '@/lib/ai/condensedTranscript';
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
                    // Skip chats in retry cooldown — wait for retryAfter to expire
                    if (data.retryAfter && data.retryAfter > now) return false;
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

            // Randomly select a visual style
            const randomStyle = VISUAL_STYLES[Math.floor(Math.random() * VISUAL_STYLES.length)];
            console.log(`[Cron] Style — selected: "${randomStyle.id}" (${randomStyle.name})`);

            const currentDossier = identity?.dossier || '';
            const sessionCount = (identity?.session_count || 0) + 1;

            // ─── PARALLEL AI CALLS: condensed transcript + dossier update + session recap ───

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

                // ── PARALLEL BATCH: Condensed Transcript + Dossier + Recap ──
                // Skip AI generation if we already have cached results from a prior run
                const [condensedResult, dossierResult, recapResult] = cachedPost
                    ? [null, null, null]
                    : await Promise.all([
                        // Condensed transcript (editorial judgment + ghost-written conversation + language)
                        generateCondensedTranscript(transcript),
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

                const condensed = cachedPost || condensedResult;
                const dossier = cachedPost ? null : (dossierResult!.object as any);
                const recap = cachedPost ? null : (recapResult!.object as any);

                // Extract condensed transcript data
                let condensedMessages: Array<{ role: 'user' | 'ideal_self'; text: string }> | null = null;
                let condensedEditorialNote: string | null = null;

                if (condensed && condensed.is_publishable && condensed.messages) {
                    condensedMessages = condensed.messages;
                    condensedEditorialNote = condensed.editorial_note || null;
                    console.log(`[Cron] Condensed: ${condensed.messages.length} messages, title: "${condensed.title}"`);
                }

                // Derive backward-compatible letter/response from condensed transcript
                const userMsgs = condensedMessages?.filter((m: any) => m.role === 'user') || [];
                const idealSelfMsgs = condensedMessages?.filter((m: any) => m.role === 'ideal_self') || [];
                const derivedLetter = userMsgs.length > 0
                    ? `Dear Earnest,\n\n${userMsgs[0].text}`
                    : '';
                const derivedResponse = idealSelfMsgs.length > 0
                    ? idealSelfMsgs[idealSelfMsgs.length - 1].text
                    : '';

                // Build post object for downstream compatibility
                const post: any = {
                    is_publishable: condensed?.is_publishable || false,
                    title: (condensed as any)?.title || null,
                    letter: derivedLetter,
                    response: derivedResponse,
                    language: condensed?.language || null,
                    visual_style: randomStyle.id,
                };

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
                if (post.is_publishable && condensedMessages && condensedMessages.length > 0) {
                    const postDocRef = db.collection('posts').doc();

                    // ─── IMAGE PROMPT CONSTRUCTION (server-side, based on style category) ───
                    const NUM_IMAGES = 8;
                    const chosenStyle = getVisualStyle(post.visual_style || '');
                    console.log(`[CleanupChats] Style — selected: "${post.visual_style}", resolved: "${chosenStyle?.id || 'NONE'}" (category: ${chosenStyle?.category || 'unknown'})`);

                    let prompts: string[] = [];
                    let useReferenceImages: Buffer[] | undefined;

                    // Load the user's avatar as a character reference anchor.
                    const referenceImage = await loadUserReferenceImage(uid);
                    const baseReferenceImages = referenceImage ? [referenceImage] : undefined;
                    useReferenceImages = baseReferenceImages;

                    if (chosenStyle?.category === 'landscape') {
                        // Landscape without the person — character bible, no reference images
                        const prompt = `${chosenStyle.imagenTag} ${JSON.stringify(compiledBible)}`;
                        prompts = Array(NUM_IMAGES).fill(prompt);
                        useReferenceImages = undefined;
                    } else if (chosenStyle?.category === 'landscape-with-person') {
                        // Landscape with the person — character bible, with reference images
                        const prompt = `${chosenStyle.imagenTag} ${JSON.stringify(compiledBible)}`;
                        prompts = Array(NUM_IMAGES).fill(prompt);
                    } else if (chosenStyle?.category === 'cinematic') {
                        // AI generates bespoke prompts from character bible only (no letter)
                        console.log(`[Cron] Generating cinematic prompts for style "${chosenStyle.id}" via AI...`);
                        const styleDirection = chosenStyle.id === 'life-magazine'
                            ? `You are a photo editor at Life Magazine in its golden era. You're commissioning 8 photographs for a photo essay about this person's life. Think like the great Life photographers — Gordon Parks, Margaret Bourke-White, W. Eugene Smith. Some images should be in vivid color, others in dramatic black and white. Each image should tell a story on its own — intimate, human, unforgettable. Documentary realism with cinematic beauty.`
                            : `You are a Visual Director for an advice column called Earnest Page. You're creating 8 photographs that capture moments from this person's life.`;

                        try {
                            const aiResult = await generateWithFallback({
                                primaryModelId: OPUS_MODEL,
                                fallbackModelId: OPUS_FALLBACK,
                                schema: z.object({
                                    prompts: z.array(z.string()).min(8).max(8),
                                }),
                                prompt: `${styleDirection}\n\nFirst, read the character's identity. For each image, choose:\n- A VIBE: the emotional feeling (luxury, grit, serenity, chaos, warmth, ambition, defiance, tenderness, solitude, celebration)\n- A SCALE: the shot type\n\nSCALE types:\n- "macro": Extreme close-up of an object, texture, or detail from their life.\n- "lifestyle": A composed scene or environment that tells a story — their workspace, kitchen, car, bedroom.\n- "wide": An aspirational landscape, cityscape, or architectural shot from their world.\n- "human": The person in the scene — hands doing something, walking, sitting, from behind, over-the-shoulder.\n\nRULES:\n- Highly photorealistic. Cinematic lighting. Instagram-quality.\n- 16:9 landscape orientation (1920×1080). No text or watermarks.\n- Vary the scales and vibes across all 8 images.\n- The images should feel like snapshots from a real person's life — intimate, authentic, with depth.\n- Ground every image in specific details from the character.\n\nCHARACTER:\n${JSON.stringify(compiledBible)}\nReturn exactly 8 detailed Imagen prompts. Each should be a self-contained image description.`,
                            });
                            prompts = (aiResult.object as any).prompts;
                            console.log(`[Cron] Generated ${prompts.length} cinematic prompts`);
                        } catch (err: any) {
                            console.error(`[Cron] Cinematic prompt generation failed:`, err.message);
                        }
                    } else if (chosenStyle?.variations && chosenStyle.variations.length > 0) {
                        // Studio poses — rotate through pose variations with character bible
                        prompts = Array.from({ length: NUM_IMAGES }, (_, i) =>
                            `${chosenStyle.variations![i % chosenStyle.variations!.length]} ${JSON.stringify(compiledBible)}`
                        );
                    } else {
                        // Photographer styles — imagenTag + conversation context
                        const tag = chosenStyle?.imagenTag || '';
                        const conversationContext = condensedMessages!.map(m => `${m.role === 'user' ? 'Person' : 'Consultant'}: ${m.text}`).join('\n');
                        const prompt = tag ? `${tag}\n${conversationContext}` : conversationContext;
                        prompts = Array(NUM_IMAGES).fill(prompt);
                    }

                    if (prompts.length === 0) {
                        console.warn(`[Cron] No image prompts generated for user ${uid} — saving as private`);
                        await dossierPromise;
                        await postDocRef.set({
                            id: postDocRef.id,
                            uid,
                            authorId: uid,
                            authorHash: null,
                            region: userData?.region || null,
                            author: userData?.displayName || "Anonymous",
                        title: post.title || null,
                            type: 'checkin',
                            public_post: {
                                letter: post.letter,
                                response: post.response,
                                ...(condensedMessages && { condensed_transcript: condensedMessages }),
                            },
                            imagen_prompt: null,
                            imagen_prompts: [],
                            language: post.language || null,
                            imagen_url: null,
                            imagen_urls: [],
                            content_raw: transcript,
                            ...(condensedMessages && { condensed_transcript: condensedMessages }),
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

                    // ─── PARALLEL: Images + TTS + Dossier ───
                    // Images and TTS are independent — run them concurrently to stay
                    // well under the 300s Vercel timeout.

                    // Sequential image generation with stagger delay to avoid 429 rate limits.
                    const IMAGE_STAGGER_MS = 1500;
                    const imagen_urls: string[] = [];
                    let quotaExhausted = false;

                    const imageSequence = (async () => {
                        for (let i = 0; i < prompts.length; i++) {
                            if (quotaExhausted) break;
                            if (i > 0) await new Promise(r => setTimeout(r, IMAGE_STAGGER_MS));
                            try {
                                const url = await generateVerdictImage(
                                    prompts[i], `${postDocRef.id}_${i}`,
                                    useReferenceImages, i < 2 ? 'face-only' : 'full'
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

                    // TTS audio generation — runs in parallel with images
                    const audioFields: Record<string, any> = {};
                    const characterVoiceId = userData?.character_bible?.voice_id;

                    const ttsPromise = (characterVoiceId && condensedMessages && condensedMessages.length > 0)
                        ? (async () => {
                            const isFemale = gender.toLowerCase() === 'female' || gender.toLowerCase() === 'woman';
                            const idealSelfVoiceId = await getEarnestVoiceForUser(characterVoiceId, isFemale);

                            if (idealSelfVoiceId) {
                                console.log(`[Cron] Generating dual-voice audio (gender: ${gender || 'default male'})...`);
                                const audioResult = await generateConversationAudio(
                                    condensedMessages,
                                    characterVoiceId,
                                    idealSelfVoiceId,
                                    postDocRef.id,
                                );
                                if (audioResult) {
                                    audioFields.audio_url = audioResult.audioUrl;
                                    audioFields.audio_word_timestamps = audioResult.wordTimestamps;
                                    audioFields.audio_message_boundaries = audioResult.messageBoundaries;
                                    audioFields.audio_letter_ratio = audioResult.messageBoundaries[0]?.endTime / audioResult.messageBoundaries[audioResult.messageBoundaries.length - 1]?.endTime || 0.5;
                                    console.log(`[Cron] Conversation audio generated for post ${postDocRef.id}`);
                                }
                            }
                        })()
                        : Promise.resolve();

                    await Promise.allSettled([imageSequence, ttsPromise, dossierPromise]);
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
                    // Audio + images were generated in parallel above.

                    // ─── WRITE POST (single atomic write with all content) ───
                    await postDocRef.set({
                        id: postDocRef.id,
                        uid,
                        authorId: uid,
                        authorHash: authorHash,
                        region: userData?.region || null,
                        author: userData?.displayName || "Anonymous",
                        title: post.title || null,
                        type: 'checkin',
                        public_post: {
                            letter: post.letter,
                            response: post.response,
                            ...(condensedMessages && { condensed_transcript: condensedMessages }),
                        },
                        imagen_prompt: prompts[0] || null,
                        imagen_prompts: prompts,
                        visual_style: post.visual_style || null,
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
                        ...(condensedMessages && { condensed_transcript: condensedMessages }),
                        ...(condensedEditorialNote && { condensed_editorial_note: condensedEditorialNote }),
                        // Audio fields (generated above)
                        ...audioFields,
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
                            const postAuthor = userData?.displayName || 'Anonymous';
                            const postVisibility = visibility || 'private';
                            const firstUserMsg = userMsgs.length > 0 ? userMsgs[0].text : '';
                            const emailPreview = firstUserMsg.substring(0, 300) + (firstUserMsg.length > 300 ? '...' : '');
                            await transporter.sendMail({
                                from: `Earnest Page <${ADMIN_EMAIL}>`,
                                to: ADMIN_EMAIL,
                                subject: `📝 New Post — ${postAuthor}`,
                                html: `
<div style="font-family: -apple-system, sans-serif; background: #09090b; color: #d4d4d8; padding: 32px; border-radius: 12px; max-width: 480px;">
    <p style="font-size: 10px; text-transform: uppercase; letter-spacing: 0.2em; color: #71717a; margin: 0 0 16px 0;">New Post Published</p>
    <h2 style="font-size: 20px; color: #ffffff; margin: 0 0 4px 0; font-weight: 700;">${postAuthor}</h2>
    <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
        <tr><td style="padding: 6px 0; color: #71717a;">Visibility</td><td style="padding: 6px 0; text-align: right; color: ${postVisibility === 'private' ? '#f87171' : '#34d399'}; font-weight: 600;">${postVisibility}</td></tr>
        <tr><td style="padding: 6px 0; color: #71717a;">Post ID</td><td style="padding: 6px 0; text-align: right; color: #e4e4e7; font-family: monospace; font-size: 11px;">${postDocRef.id}</td></tr>
    </table>
    ${emailPreview ? `<div style="margin: 16px 0 0 0; padding: 12px; background: #18181b; border-radius: 8px; font-size: 12px; color: #a1a1aa; line-height: 1.6;">${emailPreview}</div>` : ''}
</div>`,
                            });
                        }
                    } catch (emailErr) {
                        console.error(`[Cron] Post notification email failed:`, emailErr);
                    }

                    processed++;
                } else {
                    // Not publishable — still need to await dossier write
                    await dossierPromise;
                }
                // Success — delete the processed chat session
                await chatDoc.ref.delete();
            } catch (e: any) {
                console.error(`[Cron] Processing failed for user ${uid}:`, e);
                // Set a 1-hour retry cooldown — prevents the next cron run from
                // immediately reprocessing and spamming external APIs.
                // The post_id on the chat ensures retries update the existing post.
                try {
                    await chatDoc.ref.update({
                        processing: false,
                        retryAfter: Date.now() + 60 * 60 * 1000, // 1 hour from now
                        lastError: (e?.message || String(e)).slice(0, 500),
                        lastErrorAt: Date.now(),
                    });
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
        aspectRatio: '16:9',
        logPrefix: 'Cron',
        referenceImages,
        referenceMode,
    });
    if (!result) return null;

    const finalBuffer = await sharp(result.buffer)
        .resize(1920, 1080, { fit: 'cover', position: 'center' })
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



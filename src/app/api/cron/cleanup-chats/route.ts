import { NextResponse } from 'next/server';
import { db, storage } from '@/lib/firebase/admin';
import { z } from 'zod';
import { generateWithFallback, OPUS_MODEL, OPUS_FALLBACK } from '@/lib/ai/models';
import { FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { buildExtractionPrompt } from '@/lib/ai/extractionPrompt';
import { buildSessionLogPrompt } from '@/lib/ai/sessionLogPrompt';
import { matchSponsor } from '@/config/ecosystem';
import { generateCondensedTranscript } from '@/lib/ai/condensedTranscript';
import { generateMessageImages } from '@/lib/ai/generatePostImage';
import { loadUserReferenceImage } from '@/lib/ai/loadUserReferenceImage';
import { processPostContent } from '@/lib/ai/processPostContent';
import { VISUAL_STYLES } from '@/lib/ai/visualStyles';
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
            // No chats — but still run Phase 2 (pending image generation)
            const imagesProcessed = await processPhase2Images();
            return NextResponse.json({ success: true, processedCount: 0, imagesProcessed, note: 'No chats to process.' });
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

        // ─── PHASE 2: Generate images for posts created in prior runs ───
        const imagesProcessed = await processPhase2Images();

        return NextResponse.json({ success: true, processedCount, imagesProcessed });
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
        // Default to private unless explicitly routed private.
        const visibility = chatData.sessionRouting != null
            ? (chatData.sessionRouting === 'public' ? 'public' : 'private')
            : (chatData.autoPublish === true ? 'public' : 'private');

        if (messages.length > 0) {
            // Claim this chat to prevent duplicate processing by concurrent cron runs
            const imageRetries = chatData.imageRetries || 0;
            await chatDoc.ref.update({ processing: true, processingStartedAt: Date.now() });

            const transcript = messages.map((m: any) => `${m.role}: ${m.content}`).join('\n');

            // Randomly select a visual style
            const randomStyle = VISUAL_STYLES[Math.floor(Math.random() * VISUAL_STYLES.length)];
            console.log(`[Cron] Style — selected: "${randomStyle.id}" (${randomStyle.name})`);

            const currentProfile = userData?.unified_profile || {};
            const sessionCount = (identity?.session_count || 0) + 1;

            // ─── PARALLEL AI CALLS: condensed transcript + profile extraction + session log ───

            const extractionPrompt = buildExtractionPrompt(currentProfile, identity?.dossier || '', transcript);
            const sessionLogPrompt = buildSessionLogPrompt(transcript);

            try {
                // ── Check for cached AI results from a previous image-retry run ──
                const cachedPost = chatData.cachedPost;

                // ── PARALLEL BATCH: Condensed Transcript + Profile Extraction + Log ──
                // Skip AI generation if we already have cached results from a prior run
                const [condensedResult, dossierResult, recapResult] = cachedPost
                    ? [null, null, null]
                    : await Promise.all([
                        // Condensed transcript (editorial judgment + ghost-written conversation + language)
                        generateCondensedTranscript(transcript),
                        // Profile extraction — Opus
                        generateWithFallback({
                            primaryModelId: OPUS_MODEL,
                            fallbackModelId: OPUS_FALLBACK,
                            schema: z.object({
                                new_people: z.array(z.object({
                                    name: z.string(),
                                    relationship: z.string(),
                                    dynamic: z.string().optional(),
                                    birthday: z.string().optional(),
                                    notes: z.string().optional(),
                                })).describe('New or updated people/pets mentioned'),
                                new_interests: z.array(z.string()).describe('New interests/hobbies mentioned'),
                                new_wardrobe: z.array(z.string()).describe('New clothing items mentioned'),
                                rewritten_dossier: z.string().optional().describe('Completely rewritten identity.dossier text, incorporating new narrative facts and removing outdated ones, keeping it highly concise (max 1 page). Null if no narrative facts changed.'),
                                wants_for_bible: z.array(z.string()).describe('Desires/wants expressed — these will be converted to present-tense character realities, NOT stored as wants'),
                            }),
                            prompt: extractionPrompt,
                        }),
                        // Session Log Entry — Opus
                        generateWithFallback({
                            primaryModelId: OPUS_MODEL,
                            fallbackModelId: OPUS_FALLBACK,
                            schema: z.object({
                                session_recap: z.string().describe("2-3 sentence factual log of this session"),
                            }),
                            prompt: sessionLogPrompt,
                        }),
                    ]);

                const condensed = cachedPost || condensedResult;
                const extracted = cachedPost ? null : (dossierResult!.object as any);
                const recap = cachedPost ? null : (recapResult!.object as any);

                // Extract condensed transcript data
                let condensedMessages: Array<{ role: 'user' | 'ideal_self'; text: string }> | null = null;
                let condensedEditorialNote: string | null = null;

                if (condensed && condensed.is_publishable && condensed.messages) {
                    condensedMessages = condensed.messages;
                    condensedEditorialNote = condensed.editorial_note || null;
                    console.log(`[Cron] Condensed: ${condensed.messages.length} messages, title: "${condensed.title}"`);
                }

                // Build post object for downstream compatibility
                const post: any = {
                    is_publishable: condensed?.is_publishable || false,
                    title: (condensed as any)?.title || null,
                    language: condensed?.language || null,
                    visual_style: randomStyle.id,
                };

                // ─── PROFILE + LOG WRITE (runs in parallel with image gen below) ───
                // Skip profile/log writes on image-retry runs (already written on first pass)
                const dossierPromise = (identity && extracted && recap)
                    ? (async () => {
                        // Build the new session_recaps array (keep last 5)
                        const existingRecaps = userData?.session_recaps || [];
                        const newRecap = {
                            date: new Date().toISOString().split('T')[0],
                            recap: recap.session_recap,
                        };
                        const updatedRecaps = [newRecap, ...existingRecaps].slice(0, 5);

                        // Merge extracted data into unified profile
                        const profile = userData?.unified_profile || {
                            people: [],
                            interests: [],
                            wardrobe: [],
                            routines: '',
                            life_facts: '',
                            milestones: ''
                        };
                        
                        // Merge people (update existing by name, add new)
                        const mergedPeople = [...(profile.people || [])];
                        (extracted.new_people || []).forEach((person: any) => {
                            const idx = mergedPeople.findIndex(p => p.name.toLowerCase() === person.name.toLowerCase());
                            if (idx >= 0) {
                                mergedPeople[idx] = { ...mergedPeople[idx], ...person };
                            } else {
                                mergedPeople.push(person);
                            }
                        });
                        
                        const updatedProfile = {
                            people: mergedPeople,
                            interests: Array.from(new Set([...(profile.interests || []), ...(extracted.new_interests || [])])),
                            wardrobe: Array.from(new Set([...(profile.wardrobe || []), ...(extracted.new_wardrobe || [])])),
                            routines: profile.routines || '', // Legacy fields preserved but no longer appended to
                            life_facts: profile.life_facts || '',
                            milestones: profile.milestones || '',
                        };

                        await userDoc.ref.set({
                            identity: {
                                ...identity,
                                ...(extracted.rewritten_dossier ? { dossier: extracted.rewritten_dossier } : {}),
                                dossier_updated_at: FieldValue.serverTimestamp(),
                                session_count: sessionCount,
                            },
                            session_recaps: updatedRecaps,
                            unified_profile: updatedProfile,
                            // Store wants temporarily for the bible recompile to consume
                            ...(extracted.wants_for_bible?.length > 0 && { wants_for_bible: FieldValue.arrayUnion(...extracted.wants_for_bible) })
                        }, { merge: true });
                        console.log(`[Cron] Profile + log updated for user ${uid} (session ${sessionCount})`);

                        // Trigger background bible recompile with updated profile
                        fetch(`${process.env.NEXT_PUBLIC_URL || 'https://your-app.vercel.app'}/api/character/compile`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${process.env.CRON_SECRET}`,
                            },
                            body: JSON.stringify({ uid, skipCooldown: true }),
                        }).catch(err => console.error(`[Cron] Bible recompile trigger failed for ${uid}:`, err.message));
                    })().catch((err: any) => {
                        console.error(`[Cron] Profile update failed for user ${uid}:`, err.message);
                    })
                    : Promise.resolve();

                // ─── POST CREATION (Phase 1: text + audio + image prompts, NO actual images) ───
                if (post.is_publishable && condensedMessages && condensedMessages.length > 0) {
                    const postDocRef = db.collection('posts').doc();
                    const characterVoiceId = userData?.character_bible?.voice_id;

                    // ─── SHARED PIPELINE: image prompts + TTS ───
                    // Run the shared pipeline in parallel with dossier update
                    // Pass preCondensed so we don't re-generate the condensed transcript
                    const [pipelineResult] = await Promise.all([
                        processPostContent({
                            transcript,
                            uid,
                            postId: postDocRef.id,
                            compiledBible,
                            demographicHint,
                            characterVoiceId,
                            gender,
                            locale: userData?.preferred_locale || 'en',
                            logPrefix: 'Cron',
                            preCondensed: {
                                messages: condensedMessages,
                                title: post.title,
                                language: post.language,
                                editorial_note: condensedEditorialNote,
                            },
                        }),
                        dossierPromise,
                    ]);

                    if (!pipelineResult) {
                        // Not publishable (redundant check but safe)
                        await dossierPromise;
                        await chatDoc.ref.delete();
                        continue;
                    }

                    const { imagePrompts, audioFields, thumbnailUrl } = pipelineResult;
                    // Use the cron's own condensed transcript (already generated above)
                    // since it may differ from the pipeline's re-generation

                    // Build conversation text for sponsor matching
                    const conversationContext = condensedMessages!.map(m => `${m.role === 'user' ? 'Person' : 'Consultant'}: ${m.text}`).join('\n');

                    // Match sponsor from conversation context
                    const sponsor = matchSponsor(conversationContext);

                    // Compute geolocation fields from stored user coords
                    const geoFields: { lat?: number; lng?: number } = {};
                    if (userData?.home_lat != null && userData?.home_lng != null) {
                        geoFields.lat = userData.home_lat;
                        geoFields.lng = userData.home_lng;
                    }

                    // Read user photo from chat document (if user attached one)
                    const userPhotoUrl = chatData.user_photo_url || null;

                    // Create Post in DB
                    // Audio + images were generated in parallel above.

                    // ─── WRITE POST (Phase 1: text + audio + prompts, images deferred) ───
                    await postDocRef.set({
                        id: postDocRef.id,
                        uid,
                        authorId: uid,
                        region: userData?.region || null,
                        author: userData?.displayName || "Anonymous",
                        title: post.title || null,
                        type: 'checkin',
                        public_post: {
                            ...(condensedMessages && { condensed_transcript: condensedMessages }),
                        },
                        // ─── Per-message image system ───
                        image_style: 'per-message',
                        image_prompts: imagePrompts,
                        message_images: [],           // populated in Phase 2
                        images_complete: false,        // Phase 2 retries until all slots filled
                        // Legacy fields (kept for backward compat)
                        imagen_prompt: null,
                        imagen_prompts: [],
                        visual_style: null,
                        language: post.language || null,
                        imagen_url: null,
                        imagen_urls: [],
                        user_photo_url: userPhotoUrl,
                        hero_source: userPhotoUrl ? 'user' : 'imagen',
                        sponsored_by: sponsor?.name || null,
                        sponsored_link: sponsor?.link || null,
                        // Geolocation for proximity filtering
                        ...geoFields,
                        content_raw: transcript,
                        ...(condensedEditorialNote && { condensed_editorial_note: condensedEditorialNote }),
                        ...(thumbnailUrl && { thumbnail_url: thumbnailUrl }),
                        // Audio fields (generated above)
                        ...audioFields,
                        status: "completed",
                        created_at: new Date(),
                        // Post is hidden until Phase 2 generates at least 1 image
                        is_public: false,
                        visibility: visibility,
                        like_count: 0,
                        comments: 0
                    });

                    // ─── SESSION ENGAGEMENT METRICS (privacy-safe, no content exposed) ───
                    const rawUserMsgs = messages.filter((m: any) => m.role === 'user');
                    const engagementUserTurns = rawUserMsgs.length;
                    const engagementAvgLength = engagementUserTurns > 0
                        ? Math.round(rawUserMsgs.reduce((sum: number, m: any) => sum + (m.content?.length || 0), 0) / engagementUserTurns)
                        : 0;
                    const engagementDurationMs = (chatData.updatedAt || 0) - (chatData.createdAt || 0);
                    const engagementDurationMin = Math.round(engagementDurationMs / 60000);
                    // How did the session end?
                    const closeReason: string = chatData.closeReason || (chatData.isClosed ? 'user' : 'abandoned');
                    const closeReasonLabels: Record<string, string> = {
                        'exchange-limit': '🏁 Hit exchange limit',
                        'expired': '⏰ Session expired (2hr)',
                        'user': '👋 User closed',
                        'abandoned': '💤 Abandoned (timed out)',
                    };
                    const closeReasonLabel = closeReasonLabels[closeReason] || closeReason;
                    // Did the character complete its work? This is the real signal.
                    const reachedClose = condensed?.reached_close === true;
                    const engagementVerified = reachedClose;
                    const engagementLabel = engagementVerified ? '✅ VERIFIED' : '⚠️ LOW ENGAGEMENT';
                    const engagementColor = engagementVerified ? '#34d399' : '#fbbf24';

                    // ─── NOTIFY ADMIN OF NEW POST ───
                    try {
                        if (process.env.GMAIL_APP_PASSWORD) {
                            const transporter = nodemailer.createTransport({
                                service: 'gmail',
                                auth: { user: ADMIN_EMAIL, pass: process.env.GMAIL_APP_PASSWORD },
                            });
                            const postAuthor = userData?.displayName || 'Anonymous';
                            const postVisibility = visibility || 'private';
                            const emailPreview = '';
                            await transporter.sendMail({
                                from: `Earnest Page <${ADMIN_EMAIL}>`,
                                to: ADMIN_EMAIL,
                                subject: `${engagementLabel} 📝 New Post — ${postAuthor}`,
                                html: `
<div style="font-family: -apple-system, sans-serif; background: #09090b; color: #d4d4d8; padding: 32px; border-radius: 12px; max-width: 480px;">
    <p style="font-size: 10px; text-transform: uppercase; letter-spacing: 0.2em; color: #71717a; margin: 0 0 16px 0;">New Post Published</p>
    <h2 style="font-size: 20px; color: #ffffff; margin: 0 0 4px 0; font-weight: 700;">${postAuthor}</h2>
    <div style="margin: 8px 0 12px 0; padding: 8px 12px; background: ${engagementVerified ? '#052e16' : '#422006'}; border: 1px solid ${engagementColor}; border-radius: 8px; font-size: 13px; color: ${engagementColor}; font-weight: 600;">
        ${engagementLabel}
    </div>
    <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
        <tr><td style="padding: 6px 0; color: #71717a;">Visibility</td><td style="padding: 6px 0; text-align: right; color: ${postVisibility === 'private' ? '#f87171' : '#34d399'}; font-weight: 600;">${postVisibility}</td></tr>
        <tr><td style="padding: 6px 0; color: #71717a;">Exchanges</td><td style="padding: 6px 0; text-align: right; color: #e4e4e7;">${engagementUserTurns} user messages</td></tr>
        <tr><td style="padding: 6px 0; color: #71717a;">Avg Response</td><td style="padding: 6px 0; text-align: right; color: #e4e4e7;">${engagementAvgLength} chars</td></tr>
        <tr><td style="padding: 6px 0; color: #71717a;">Duration</td><td style="padding: 6px 0; text-align: right; color: #e4e4e7;">${engagementDurationMin} min</td></tr>
        <tr><td style="padding: 6px 0; color: #71717a;">Session End</td><td style="padding: 6px 0; text-align: right; color: #e4e4e7;">${closeReasonLabel}</td></tr>
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

// ─── PHASE 2: Deferred Image Generation ──────────────────────────────────────
// Runs after Phase 1 (chat processing). Finds posts that still have empty
// image slots (images_complete === false) and generates the missing images.
// This runs in its own time budget, separate from the text/audio pipeline.

const MAX_PHASE2_POSTS = 3;      // Process at most 3 posts per cron run
const MAX_IMAGE_RETRIES = 10;    // Per-post retry cap before giving up on remaining blanks

async function processPhase2Images(): Promise<number> {
    try {
        // Find posts with per-message image_style that need images
        const pendingPosts = await db.collection('posts')
            .where('image_style', '==', 'per-message')
            .where('images_complete', '==', false)
            .orderBy('created_at', 'asc')
            .limit(MAX_PHASE2_POSTS)
            .get();

        if (pendingPosts.empty) return 0;

        let imagesProcessed = 0;

        for (const postDoc of pendingPosts.docs) {
            const postData = postDoc.data();
            const imagePrompts = postData.image_prompts || [];
            const existingImages = postData.message_images || [];
            const retryCount = postData.image_retries || 0;

            // Skip if no prompts (nothing to generate)
            if (imagePrompts.length === 0) continue;

            // Skip if all images already filled
            const filledCount = existingImages.filter(Boolean).length;
            if (filledCount >= imagePrompts.length) continue;

            // Skip if max retries exceeded — stop retrying, accept partial images
            if (retryCount >= MAX_IMAGE_RETRIES) {
                const emptyCount = imagePrompts.length - filledCount;
                console.warn(`[Phase2] Post ${postDoc.id} exceeded ${MAX_IMAGE_RETRIES} retries — accepting ${emptyCount} blank image(s)`);
                const firstImage = existingImages.find(Boolean) || null;
                await postDoc.ref.update({
                    images_complete: true,
                    ...(firstImage && {
                        imagen_url: firstImage,
                        is_public: postData.visibility !== 'private',
                    }),
                });
                continue;
            }

            console.log(`[Phase2] Processing images for post ${postDoc.id} (${filledCount}/${imagePrompts.length} done, attempt ${retryCount + 1})`);

            // Load reference image for character consistency
            const uid = postData.uid;
            const referenceImage = await loadUserReferenceImage(uid);
            const referenceImages = referenceImage ? [referenceImage] : undefined;

            // Generate images for prompts that don't have URLs yet
            const updatedImages = [...existingImages];

            // Ensure array is the right length
            while (updatedImages.length < imagePrompts.length) {
                updatedImages.push('');
            }

            // Only generate missing images
            const missingIndices = updatedImages
                .map((url, i) => (!url && imagePrompts[i]) ? i : -1)
                .filter(i => i >= 0);

            const batchResults = await generateMessageImages({
                prompts: missingIndices.map(i => imagePrompts[i]),
                uid,
                filePrefix: postDoc.id,
                referenceImages,
            });

            // Map results back to correct indices
            for (let j = 0; j < missingIndices.length; j++) {
                if (batchResults[j]) {
                    updatedImages[missingIndices[j]] = batchResults[j];
                }
            }

            const newFilledCount = updatedImages.filter(Boolean).length;
            const firstImage = updatedImages.find(Boolean) || null;

            // Update the post
            const allFilled = newFilledCount >= imagePrompts.length;
            const updateFields: Record<string, any> = {
                message_images: updatedImages,
                image_retries: retryCount + 1,
                ...(allFilled && { images_complete: true }),
            };

            // Make post public once we have at least 1 image
            if (firstImage) {
                updateFields.imagen_url = firstImage;
                updateFields.is_public = postData.visibility !== 'private';
            }

            // Also populate legacy imagen_urls for any code that reads it
            updateFields.imagen_urls = updatedImages.filter(Boolean);

            await postDoc.ref.update(updateFields);
            imagesProcessed += newFilledCount - filledCount;

            console.log(`[Phase2] Post ${postDoc.id}: ${newFilledCount}/${imagePrompts.length} images done`);
        }

        return imagesProcessed;
    } catch (err: any) {
        console.error('[Phase2] Image processing error:', err.message);
        return 0;
    }
}

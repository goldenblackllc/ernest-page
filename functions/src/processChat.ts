import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { db } from './lib/firebase/admin.js';
import { z } from 'zod';
import { generateWithFallback, OPUS_MODEL, OPUS_FALLBACK } from './lib/ai/models.js';
import { FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { hashPhoneNumberServer, normalizePhoneNumberServer } from './lib/security/serverHash.js';
import { geohashForLocation } from 'geofire-common';
import { buildDossierPrompt, buildDossierCondensePrompt, DOSSIER_WORD_LIMIT } from './lib/ai/dossierPrompt.js';
import { safeTimeZone, localDateKey } from './lib/utils/relativeDates.js';
import { buildSessionLogPrompt } from './lib/ai/sessionLogPrompt.js';
import { matchSponsor } from './lib/config/ecosystem.js';
import { generateCondensedTranscript, type CondensedTranscript } from './lib/ai/condensedTranscript.js';

import { processPostContent, type ProcessPostResult } from './lib/ai/processPostContent.js';
import { VISUAL_STYLES } from './lib/ai/visualStyles.js';
import { computeAge } from './lib/utils/parseBirthDate.js';
import { getCompiledBible } from './lib/bible.js';
import { REGION } from './lib/config/region.js';
import { sendAdminEmail, buildNewPostEmail } from './lib/email/adminEmail.js';
import { closeDecision, failureUpdate, MAX_PROCESS_ATTEMPTS } from './lib/chatRetry.js';
import { errorMessage } from './lib/utils/errors.js';

type CondensedMessage = { role: 'user' | 'ideal_self'; text: string };

/** A raw Mirror chat message as stored on the active chat document. */
type RawChatMessage = { role: string; content?: string };

export const processChat = onDocumentUpdated(
    {
        document: 'users/{uid}/active_chats/{sessionId}',
        region: REGION,
        timeoutSeconds: 540,
        memory: '1GiB',
        maxInstances: 10,
    },
    async (event) => {
        const before = event.data?.before.data();
        const after = event.data?.after.data();
        const uid = event.params.uid;
        const sessionId = event.params.sessionId;

        // Early exit: this triggers on every chat message update, but we only
        // care when the chat is closed. Skip silently to avoid log spam.
        if (!after || after.isClosed !== true) {
            return;
        }

        console.log(`[ProcessChat] Trigger fired for user=${uid} session=${sessionId} isClosed=${after?.isClosed} before.isClosed=${before?.isClosed} processing=${after?.processing}`);

        const now = Date.now();
        // Skips our own claim and failure writes, fresh claims, backoff and
        // exhausted retries. A failed run is retried only by the sweep.
        const decision = closeDecision(before, after, now);
        if (decision !== 'process') {
            console.log(`[ProcessChat] Skipping — ${decision} (attempts=${after.processAttempts || 0})`);
            return;
        }

        // Burn protocol
        if (after.sessionRouting === 'burn' || after.burnOnClose === true) {
            console.log(`[ProcessChat] Burn protocol — purging session ${sessionId} for user ${uid}`);
            await event.data?.after.ref.delete();
            return;
        }

        const messages = after.messages || [];
        if (messages.length === 0) {
            console.log(`[ProcessChat] Skipping — no messages`);
            await event.data?.after.ref.delete();
            return;
        }

        console.log(`[ProcessChat] Processing chat with ${messages.length} messages for user ${uid}`);

        const visibility = getChatVisibility(after);

        await event.data?.after.ref.update({ processing: true, processingStartedAt: now });

        const userDoc = await db.collection('users').doc(uid).get();
        const userData = userDoc.data();
        if (!userData) {
            console.log(`[ProcessChat] Skipping — user data not found for ${uid}`);
            await event.data?.after.ref.delete();
            return;
        }
        console.log(`[ProcessChat] User data loaded for ${uid}`);

        const identity = userData?.identity;
        const transcript = messages.map((m: RawChatMessage) => `${m.role}: ${m.content}`).join('\n');

        const sessionCount = (userData?.session_count || identity?.session_count || 0) + 1;
        const today = localDateKey(new Date(), safeTimeZone(after.timeZone));

        try {
            const { condensed, rewrittenDossier, recap } = await analyzeSession(userData, transcript, today);

            let condensedMessages: CondensedMessage[] | null = null;
            let condensedEditorialNote: string | null = null;

            console.log(`[ProcessChat] AI calls complete. is_publishable=${condensed?.is_publishable} title="${condensed?.title}" msgs=${condensed?.messages?.length || 0} dossier_changed=${!!rewrittenDossier}`);

            if (condensed && condensed.is_publishable && condensed.messages) {
                condensedMessages = condensed.messages;
                condensedEditorialNote = condensed.editorial_note || null;
            }

            // Write session metadata + dossier — do NOT touch unified_profile, wants_for_bible, or source_code
            // Saved once: a retry after a later failure must not add a second
            // recap or count the session twice.
            const dossierPromise = (userData && recap && !after.metadataSaved)
                ? saveSessionMetadata({ userRef: userDoc.ref, userData, uid, sessionRecap: recap.session_recap, rewrittenDossier, today, sessionStartedAt: after.createdAt || now, sessionCount })
                    .then(() => event.data?.after.ref.update({ metadataSaved: true }))
                : Promise.resolve();

            if (condensed.is_publishable && condensedMessages && condensedMessages.length > 0) {
                console.log(`[ProcessChat] Chat IS publishable — creating post and running pipeline...`);
                const postDocRef = db.collection('posts').doc();
                const gender = userData?.gender || identity?.gender || '';

                const [pipelineResult] = await Promise.all([
                    processPostContent({
                        transcript,
                        uid,
                        postId: postDocRef.id,
                        compiledBible: getCompiledBible(userData),
                        demographicHint: buildDemographicHint(userData),
                        characterVoiceId: userData?.voice?.id || userData?.character_bible?.voice_id,
                        gender,
                        locale: userData?.preferred_locale || 'en',
                        logPrefix: 'ProcessChat',
                        preCondensed: {
                            messages: condensedMessages,
                            title: condensed.title,
                            language: condensed.language,
                            editorial_note: condensedEditorialNote,
                        },
                    }),
                    dossierPromise,
                ]);

                if (!pipelineResult) {
                    console.log(`[ProcessChat] Pipeline returned null — skipping post creation`);
                    await dossierPromise;
                    await event.data?.after.ref.delete();
                    return;
                }
                console.log(`[ProcessChat] Pipeline complete — imagePrompts:${pipelineResult.imagePrompts?.length} audio:${!!pipelineResult.audioFields?.audio_url}`);

                await createPost({
                    postRef: postDocRef,
                    uid,
                    userData,
                    chat: after,
                    condensed,
                    condensedMessages,
                    condensedEditorialNote,
                    pipelineResult,
                    transcript,
                    visibility,
                });

                try {
                    await notifyAdminOfNewPost({
                        postId: postDocRef.id,
                        userData,
                        chat: after,
                        messages,
                        condensed,
                        thumbnailUrl: pipelineResult.thumbnailUrl,
                        visibility,
                        pendingImages: pipelineResult.imagePrompts.length,
                    });
                } catch (emailErr) {
                    console.error(`[ProcessChat] Post notification email failed:`, emailErr);
                }

                console.log(`[ProcessChat] ✅ Post ${postDocRef.id} created — ${pipelineResult.imagePrompts.length} image prompts, audio: ${!!pipelineResult.audioFields.audio_url}, images deferred to Phase 2`);
                await event.data?.after.ref.delete();
            } else {
                console.log(`[ProcessChat] Chat NOT publishable — skipping post creation, updating dossier only`);
                await dossierPromise;
                await event.data?.after.ref.delete();
            }
        } catch (error) {
            console.error(`[ProcessChat] Error processing chat for user ${uid}:`, error);
            const failure = failureUpdate(after, error, Date.now());
            if (failure.processAttempts >= MAX_PROCESS_ATTEMPTS) {
                console.error(`[ProcessChat] Giving up on session ${sessionId} for user ${uid} after ${failure.processAttempts} attempts`);
            }
            await event.data?.after.ref.update(failure);
        }
    }
);

// ─── Helpers ────────────────────────────────────────────────────────────────

function getChatVisibility(chat: FirebaseFirestore.DocumentData): 'public' | 'private' {
    return chat.sessionRouting != null
        ? (chat.sessionRouting === 'public' ? 'public' : 'private')
        : (chat.autoPublish === true ? 'public' : 'private');
}

function getAuthorTitle(userData: FirebaseFirestore.DocumentData): string {
    return userData?.defining_words?.join(', ') || userData?.identity?.title || userData?.character_bible?.source_code?.archetype || 'Anonymous';
}

function buildDemographicHint(userData: FirebaseFirestore.DocumentData): string {
    const identity = userData?.identity;
    const gender = userData?.gender || identity?.gender || '';
    const ethnicity = userData?.ethnicity || identity?.ethnicity || '';
    const computedAge = computeAge(userData?.birthdate || identity?.birthdate);
    const demographicParts = [
        computedAge ? `approximately ${computedAge} years old` : '',
        ethnicity,
        gender,
    ].filter(Boolean);
    const dreamSelf = identity?.dream_self || '';
    const demographicTag = demographicParts.length > 0 ? demographicParts.join(', ') : '';
    return demographicTag
        ? `\nCHARACTER APPEARANCE — MANDATORY: The main character's fixed traits (face, ethnicity, age, gender): ${demographicTag}. You MUST include "${demographicTag}" in EVERY prompt. If you omit this, the generator will default to a generic adult.${dreamSelf ? `\nTheir ASPIRATIONAL self-presentation (use for LATER beats only — pivot, move, outcome): "${dreamSelf}"` : ''}\nTRANSFORMATION ARC: If the letter describes a physical state that differs from the aspirational self (e.g., overweight, exhausted, unkempt), show the character's ACTUAL current state in Beats 1-2 (struggle). Transition in Beat 3 (pivot). By Beats 4-5 (move, outcome), the character should embody their resolved/aspirational state. This visual transformation IS the story. The face stays the same — only the body, posture, and energy transform.`
        : '';
}

/**
 * Run the three session AI calls in parallel: condensed transcript, dossier
 * rewrite, and session log entry.
 *
 * Sessions only update the dossier, recaps, and session count. People, interests, and the
 * Character Bible are owned by the user via the My Life drawers and are never touched here.
 */
async function analyzeSession(userData: FirebaseFirestore.DocumentData, transcript: string, today: string): Promise<{
    condensed: CondensedTranscript;
    rewrittenDossier: string | undefined;
    recap: { session_recap: string } | undefined;
}> {
    const dossierPrompt = buildDossierPrompt(userData?.dossier || userData?.identity?.dossier || '', transcript, today);
    const sessionLogPrompt = buildSessionLogPrompt(transcript);

    console.log(`[ProcessChat] Starting parallel AI calls (condensed + dossier + log)...`);
    const [condensed, dossierResult, recapResult] = await Promise.all([
        generateCondensedTranscript(transcript),
        // Dossier rewrite — Opus
        generateWithFallback({
            primaryModelId: OPUS_MODEL,
            fallbackModelId: OPUS_FALLBACK,
            schema: z.object({
                rewritten_dossier: z.string().describe(`Complete rewritten dossier with all eight sections (under ${DOSSIER_WORD_LIMIT} words), no header line.`),
            }),
            prompt: dossierPrompt,
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

    return {
        condensed,
        rewrittenDossier: dossierResult.object?.rewritten_dossier,
        recap: recapResult.object,
    };
}

async function saveSessionMetadata(opts: {
    userRef: FirebaseFirestore.DocumentReference;
    userData: FirebaseFirestore.DocumentData;
    uid: string;
    sessionRecap: string;
    rewrittenDossier: string | undefined;
    today: string;
    sessionStartedAt: number;
    sessionCount: number;
}): Promise<void> {
    const { userRef, userData, uid, sessionRecap, today, sessionStartedAt, sessionCount } = opts;
    const existingRecaps = userData?.session_recaps || [];
    const newRecap = { date: today, at: sessionStartedAt, recap: sessionRecap };
    const updatedRecaps = [newRecap, ...existingRecaps].slice(0, 5);

    let dossierBody: string | undefined = opts.rewrittenDossier?.trim();

    // The model doesn't reliably respect the word limit, so condense in a second pass when over.
    const wordCount = dossierBody ? dossierBody.split(/\s+/).length : 0;
    if (dossierBody && wordCount > DOSSIER_WORD_LIMIT) {
        try {
            const condensed = await generateWithFallback({
                primaryModelId: OPUS_MODEL,
                fallbackModelId: OPUS_FALLBACK,
                schema: z.object({
                    condensed_dossier: z.string().describe(`Condensed dossier with all eight sections (under ${DOSSIER_WORD_LIMIT} words), no header line.`),
                }),
                prompt: buildDossierCondensePrompt(dossierBody, wordCount, today),
            });
            const condensedBody = condensed.object?.condensed_dossier?.trim();
            if (condensedBody) dossierBody = condensedBody;
            console.log(`[ProcessChat] Dossier condensed from ${wordCount} to ${condensedBody?.split(/\s+/).length ?? wordCount} words`);
        } catch (condenseError) {
            console.error(`[ProcessChat] Dossier condense failed — saving uncondensed (${wordCount} words):`, errorMessage(condenseError));
        }
    }

    await userRef.set({
        ...(dossierBody ? { dossier: `DOSSIER\nUpdated: ${today} | Sessions: ${sessionCount}\n\n${dossierBody}` } : {}),
        dossier_updated_at: FieldValue.serverTimestamp(),
        session_count: sessionCount,
        session_recaps: updatedRecaps,
    }, { merge: true });
    console.log(`[ProcessChat] Session metadata + dossier updated for ${uid} (session ${sessionCount})`);
}

/** Hash of the author's phone number, or null when there is none. */
async function getAuthorHash(uid: string): Promise<string | null> {
    try {
        const userRecord = await getAuth().getUser(uid);
        if (userRecord.phoneNumber) {
            const normalized = normalizePhoneNumberServer(userRecord.phoneNumber);
            return hashPhoneNumberServer(normalized);
        }
    } catch { /* silent */ }
    return null;
}

function getGeoFields(userData: FirebaseFirestore.DocumentData): { lat?: number; lng?: number; geohash?: string } {
    const geoFields: { lat?: number; lng?: number; geohash?: string } = {};
    if (userData?.home_lat != null && userData?.home_lng != null) {
        geoFields.lat = userData.home_lat;
        geoFields.lng = userData.home_lng;
        geoFields.geohash = geohashForLocation([userData.home_lat, userData.home_lng]);
    }
    return geoFields;
}

/** Write the new post with empty images; the processPostImages job fills them in. */
async function createPost(opts: {
    postRef: FirebaseFirestore.DocumentReference;
    uid: string;
    userData: FirebaseFirestore.DocumentData;
    chat: FirebaseFirestore.DocumentData;
    condensed: CondensedTranscript;
    condensedMessages: CondensedMessage[];
    condensedEditorialNote: string | null;
    pipelineResult: ProcessPostResult;
    transcript: string;
    visibility: string;
}): Promise<void> {
    const { postRef, uid, userData, chat, condensed, condensedMessages, condensedEditorialNote, transcript, visibility } = opts;
    const { imagePrompts, audioFields, thumbnailUrl } = opts.pipelineResult;

    const conversationContext = condensedMessages.map(m => `${m.role === 'user' ? 'Person' : 'Consultant'}: ${m.text}`).join('\n');
    const sponsor = matchSponsor(conversationContext);
    const randomStyle = VISUAL_STYLES[Math.floor(Math.random() * VISUAL_STYLES.length)];
    const authorHash = await getAuthorHash(uid);
    const userPhotoUrl = chat.user_photo_url || null;

    await postRef.set({
        id: postRef.id,
        uid,
        authorId: uid,
        authorHash,
        region: userData?.region || null,
        author: getAuthorTitle(userData),
        title: condensed.title || null,
        type: 'checkin',
        public_post: {
            condensed_transcript: condensedMessages,
        },
        image_style: 'per-message',
        image_prompts: imagePrompts,
        message_images: [],
        imagen_prompt: null,
        imagen_prompts: [],
        visual_style: randomStyle.id,
        language: condensed.language || null,
        imagen_url: null,
        imagen_urls: [],
        user_photo_url: userPhotoUrl,
        hero_source: userPhotoUrl ? 'user' : 'imagen',
        sponsored_by: sponsor?.name || null,
        sponsored_link: sponsor?.link || null,
        ...getGeoFields(userData),
        content_raw: transcript,
        ...(condensedEditorialNote && { condensed_editorial_note: condensedEditorialNote }),
        ...(thumbnailUrl && { thumbnail_url: thumbnailUrl }),
        ...audioFields,
        status: "completed",
        created_at: FieldValue.serverTimestamp(),
        is_public: false,
        images_complete: false,
        visibility,
        like_count: 0,
        comments: 0
    });
}

const CLOSE_REASON_LABELS: Record<string, string> = {
    'exchange-limit': '🏁 Hit exchange limit',
    'expired': '⏰ Session expired (2hr)',
    'user': '👋 User closed',
    'abandoned': '💤 Abandoned (timed out)',
};

/** Email the admin about a new post, with privacy-safe session engagement metrics (no content). */
async function notifyAdminOfNewPost(opts: {
    postId: string;
    userData: FirebaseFirestore.DocumentData;
    chat: FirebaseFirestore.DocumentData;
    messages: RawChatMessage[];
    condensed: CondensedTranscript;
    thumbnailUrl: string | null;
    visibility: string;
    pendingImages: number;
}): Promise<void> {
    const { chat, messages, condensed } = opts;
    const rawUserMsgs = messages.filter(m => m.role === 'user');
    const userTurns = rawUserMsgs.length;
    const avgLength = userTurns > 0
        ? Math.round(rawUserMsgs.reduce((sum, m) => sum + (m.content?.length || 0), 0) / userTurns)
        : 0;
    const durationMs = (chat.updatedAt || 0) - (chat.createdAt || 0);
    const closeReason: string = chat.closeReason || (chat.isClosed ? 'user' : 'abandoned');

    const { subject, html } = buildNewPostEmail({
        postId: opts.postId,
        author: getAuthorTitle(opts.userData),
        title: condensed.title || null,
        thumbnailUrl: opts.thumbnailUrl || null,
        visibility: opts.visibility || 'private',
        engagementVerified: condensed?.reached_close === true,
        userTurns,
        avgLength,
        durationMin: Math.round(durationMs / 60000),
        closeReasonLabel: CLOSE_REASON_LABELS[closeReason] || closeReason,
        pendingImages: opts.pendingImages,
    });
    await sendAdminEmail(subject, html);
}

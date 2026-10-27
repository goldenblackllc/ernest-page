import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { randomUUID } from 'crypto';
import { db } from './lib/firebase/admin.js';
import { z } from 'zod';
import { generateWithFallback, OPUS_MODEL } from './lib/ai/models.js';
import { FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { hashPhoneNumberServer, normalizePhoneNumberServer } from './lib/security/serverHash.js';
import { geohashForLocation } from 'geofire-common';
import { buildDossierPrompt, DOSSIER_WORD_LIMIT } from './lib/ai/dossierPrompt.js';
import { safeTimeZone, localDateKey } from './lib/utils/relativeDates.js';
import { buildSessionLogPrompt } from './lib/ai/sessionLogPrompt.js';
import { WAY_IN_IDS, type WayIn } from './lib/ai/waysIn.js';
import { generateCondensedTranscript, type CondensedTranscript } from './lib/ai/condensedTranscript.js';
import { buildActionsPrompt, ActionsSchema, toSessionActions } from './lib/ai/actionsPrompt.js';
import { applySessionActions, openActions, type Action, type SessionActions } from './lib/actions.js';

import { processPostContent, type ProcessPostResult } from './lib/ai/processPostContent.js';
import { VISUAL_STYLES } from './lib/ai/visualStyles.js';
import { buildDemographicHint } from './lib/postMedia.js';
import { getBibleText } from './lib/bible.js';
import { REGION } from './lib/config/region.js';
import { sendAdminEmail, buildNewPostEmail } from './lib/email/adminEmail.js';
import { closeDecision, failureUpdate, MAX_PROCESS_ATTEMPTS } from './lib/chatRetry.js';


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
            const { condensed, rewrittenDossier, recap, actions } = await analyzeSession(userData, transcript, today);

            console.log(`[ProcessChat] AI calls complete. is_publishable=${condensed?.is_publishable} title="${condensed?.title}" dossier_changed=${!!rewrittenDossier}`);

            // Write session metadata + dossier — do NOT touch unified_profile, wants_for_bible, or source_code
            // Saved once: a retry after a later failure must not add a second
            // recap or count the session twice.
            const dossierPromise = (userData && recap && !after.metadataSaved)
                ? saveSessionMetadata({ userRef: userDoc.ref, userData, uid, sessionRecap: recap.session_recap, wayIn: recap.way_in, rewrittenDossier, actions, today, sessionStartedAt: after.createdAt || now, sessionCount })
                    .then(() => event.data?.after.ref.update({ metadataSaved: true }))
                : Promise.resolve();

            // Every post starts private: the raw conversation and a thumbnail. The
            // reader's rewrite, images and audio are made when it's shared (lib/postMedia.ts).
            if (condensed.is_publishable) {
                console.log(`[ProcessChat] Chat IS publishable — creating post and running pipeline...`);
                const postDocRef = db.collection('posts').doc();
                const gender = userData?.gender || identity?.gender || '';

                const [pipelineResult] = await Promise.all([
                    processPostContent({
                        transcript,
                        uid,
                        postId: postDocRef.id,
                        bibleText: getBibleText(userData),
                        demographicHint: buildDemographicHint(userData),
                        characterVoiceId: userData?.voice?.id || userData?.character_bible?.voice_id,
                        gender,
                        locale: userData?.preferred_locale || 'en',
                        logPrefix: 'ProcessChat',
                        media: 'thumbnail',
                        preCondensed: {
                            messages: [],
                            title: condensed.title,
                            language: condensed.language,
                            editorial_note: null,
                            thumbnail: condensed.thumbnail,
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
                    pipelineResult,
                    transcript,
                });

                try {
                    await notifyAdminOfNewPost({
                        postId: postDocRef.id,
                        userData,
                        chat: after,
                        messages,
                        condensed,
                        thumbnailUrl: pipelineResult.thumbnailUrl,
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

function getAuthorTitle(userData: FirebaseFirestore.DocumentData): string {
    return userData?.defining_words?.join(', ') || userData?.identity?.title || userData?.character_bible?.source_code?.archetype || 'Anonymous';
}


/**
 * Run the four session AI calls in parallel: condensed transcript, dossier
 * rewrite, session log entry, and the person's actions (lib/actions.ts).
 *
 * Sessions only update the dossier, recaps, actions, and session count. People, interests, and the
 * Character Bible are owned by the user via the My Life drawers and are never touched here.
 */
async function analyzeSession(userData: FirebaseFirestore.DocumentData, transcript: string, today: string): Promise<{
    condensed: CondensedTranscript;
    rewrittenDossier: string | undefined;
    recap: { session_recap: string; way_in: WayIn } | undefined;
    actions: SessionActions | undefined;
}> {
    const dossierPrompt = buildDossierPrompt(userData?.dossier || userData?.identity?.dossier || '', transcript, today);
    const sessionLogPrompt = buildSessionLogPrompt(transcript);
    const open = openActions(userData?.actions || []);

    console.log(`[ProcessChat] Starting parallel AI calls (condensed + dossier + log + actions)...`);
    const [condensed, dossierResult, recapResult, actionsResult] = await Promise.all([
        generateCondensedTranscript(transcript, { rewrite: false }),
        // Dossier rewrite — Opus
        generateWithFallback({
            primaryModelId: OPUS_MODEL,
            schema: z.object({
                rewritten_dossier: z.string().describe(`Complete rewritten dossier with all eight sections (under ${DOSSIER_WORD_LIMIT} words), no header line.`),
            }),
            prompt: dossierPrompt,
        }),
        // Session Log Entry — Opus
        generateWithFallback({
            primaryModelId: OPUS_MODEL,
            schema: z.object({
                session_recap: z.string().describe("2-3 sentence factual log of this session"),
                way_in: z.enum(WAY_IN_IDS).describe("How the session got into the new belief, or which path it took instead"),
            }),
            prompt: sessionLogPrompt,
        }),
        // Actions — Opus
        generateWithFallback({
            primaryModelId: OPUS_MODEL,
            schema: ActionsSchema,
            prompt: buildActionsPrompt(open, transcript),
        }),
    ]);

    return {
        condensed,
        rewrittenDossier: dossierResult.object?.rewritten_dossier,
        recap: recapResult.object,
        actions: actionsResult.object ? toSessionActions(actionsResult.object, open) : undefined,
    };
}

async function saveSessionMetadata(opts: {
    userRef: FirebaseFirestore.DocumentReference;
    userData: FirebaseFirestore.DocumentData;
    uid: string;
    sessionRecap: string;
    wayIn: WayIn;
    rewrittenDossier: string | undefined;
    actions: SessionActions | undefined;
    today: string;
    sessionStartedAt: number;
    sessionCount: number;
}): Promise<void> {
    const { userRef, userData, uid, sessionRecap, wayIn, actions, today, sessionStartedAt, sessionCount } = opts;
    const existingRecaps = userData?.session_recaps || [];
    const newRecap = { date: today, at: sessionStartedAt, recap: sessionRecap, way_in: wayIn };
    const updatedRecaps = [newRecap, ...existingRecaps].slice(0, 5);

    // No second condense pass: each rewrite prunes to the section budgets, so a
    // dossier that comes back slightly over the limit doesn't keep growing.
    const dossierBody: string | undefined = opts.rewrittenDossier?.trim();
    if (dossierBody) console.log(`[ProcessChat] Dossier is ${dossierBody.split(/\s+/).length} words (limit ${DOSSIER_WORD_LIMIT})`);

    // In a transaction, so a tick or delete made while the session was processing isn't lost.
    await db.runTransaction(async (tx) => {
        const current: Action[] = (await tx.get(userRef)).data()?.actions || [];
        tx.set(userRef, {
            ...(dossierBody ? { dossier: `DOSSIER\nUpdated: ${today} | Sessions: ${sessionCount}\n\n${dossierBody}` } : {}),
            ...(actions ? { actions: applySessionActions(current, actions, today, randomUUID) } : {}),
            dossier_updated_at: FieldValue.serverTimestamp(),
            session_count: sessionCount,
            session_recaps: updatedRecaps,
        }, { merge: true });
    });
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
    pipelineResult: ProcessPostResult;
    transcript: string;
}): Promise<void> {
    const { postRef, uid, userData, chat, condensed, transcript } = opts;
    const { imagePrompts, audioFields, thumbnailUrl } = opts.pipelineResult;

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
            condensed_transcript: [],
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
        sponsored_by: null, // matched when shared (lib/postMedia.ts)
        sponsored_link: null,
        ...getGeoFields(userData),
        content_raw: transcript,
        thumbnail_brief: condensed.thumbnail || null,
        ...(thumbnailUrl && { thumbnail_url: thumbnailUrl }),
        ...audioFields,
        status: "completed",
        created_at: FieldValue.serverTimestamp(),
        is_public: false,
        // Thumbnail only until it's shared (lib/postMedia.ts)
        images_complete: imagePrompts.length === 0,
        media_status: 'deferred',
        visibility: 'private',
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
        visibility: 'private',
        engagementVerified: condensed?.reached_close === true,
        userTurns,
        avgLength,
        durationMin: Math.round(durationMs / 60000),
        closeReasonLabel: CLOSE_REASON_LABELS[closeReason] || closeReason,
        pendingImages: opts.pendingImages,
    });
    await sendAdminEmail(subject, html);
}

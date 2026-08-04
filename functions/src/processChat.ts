import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { db } from './lib/firebase/admin.js';
import { z } from 'zod';
import { generateWithFallback, OPUS_MODEL, OPUS_FALLBACK } from './lib/ai/models.js';
import { FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { hashPhoneNumberServer, normalizePhoneNumberServer } from './lib/security/serverHash.js';
import { geohashForLocation } from 'geofire-common';
import { buildDossierPrompt } from './lib/ai/dossierPrompt.js';
import { matchSponsor } from './lib/config/ecosystem.js';
import { generateCondensedTranscript } from './lib/ai/condensedTranscript.js';
import { generateMessageImages } from './lib/ai/generatePostImage.js';
import { loadUserReferenceImage } from './lib/ai/loadUserReferenceImage.js';
import { processPostContent } from './lib/ai/processPostContent.js';
import { VISUAL_STYLES } from './lib/ai/visualStyles.js';
import { computeAge } from './lib/utils/parseBirthDate.js';
import nodemailer from 'nodemailer';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'breadstand@gmail.com';

export const processChat = onDocumentUpdated(
    {
        document: 'users/{uid}/active_chats/{sessionId}',
        region: 'us-central1',
        timeoutSeconds: 540,
        memory: '1GiB',
        maxInstances: 10,
    },
    async (event) => {
        const before = event.data?.before.data();
        const after = event.data?.after.data();
        const uid = event.params.uid;
        const sessionId = event.params.sessionId;

        console.log(`[ProcessChat] Trigger fired for user=${uid} session=${sessionId} isClosed=${after?.isClosed} before.isClosed=${before?.isClosed} processing=${after?.processing}`);
        
        if (!after || after.isClosed !== true) {
            console.log(`[ProcessChat] Skipping — isClosed is not true`);
            return;
        }
        if (before?.isClosed === true) {
            console.log(`[ProcessChat] Skipping — already closed (duplicate trigger)`);
            return;
        }
        
        const now = Date.now();
        if (after.processing === true && (now - (after.processingStartedAt || 0)) < 10 * 60 * 1000) {
            console.log(`[ProcessChat] Skipping — already processing (started ${Math.round((now - (after.processingStartedAt || 0)) / 1000)}s ago)`);
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

        const visibility = after.sessionRouting != null
            ? (after.sessionRouting === 'private' ? 'private' : 'community')
            : (after.autoPublish === false ? 'private' : 'community');

        await event.data?.after.ref.update({ processing: true, processingStartedAt: now });

        const userDoc = await db.collection('users').doc(uid).get();
        const userData = userDoc.data();
        if (!userData) {
            console.log(`[ProcessChat] Skipping — user data not found for ${uid}`);
            await event.data?.after.ref.delete();
            return;
        }
        console.log(`[ProcessChat] User data loaded for ${uid}`);

        const compiledBible = userData?.character_bible?.compiled_output?.ideal || [];
        const identity = userData?.identity;
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
            ? `\nCHARACTER APPEARANCE — MANDATORY: The main character's fixed traits (face, ethnicity, age, gender): ${demographicTag}. You MUST include "${demographicTag}" in EVERY prompt. If you omit this, the generator will default to a generic adult.${dreamSelf ? `\nTheir ASPIRATIONAL self-presentation (use for LATER beats only — pivot, move, outcome): "${dreamSelf}"` : ''}\nTRANSFORMATION ARC: If the letter describes a physical state that differs from the aspirational self (e.g., overweight, exhausted, unkempt), show the character's ACTUAL current state in Beats 1-2 (struggle). Transition in Beat 3 (pivot). By Beats 4-5 (move, outcome), the character should embody their resolved/aspirational state. This visual transformation IS the story. The face stays the same — only the body, posture, and energy transform.`
            : '';

        const transcript = messages.map((m: any) => `${m.role}: ${m.content}`).join('\n');
        const randomStyle = VISUAL_STYLES[Math.floor(Math.random() * VISUAL_STYLES.length)];
        
        const currentDossier = identity?.dossier || '';
        const sessionCount = (identity?.session_count || 0) + 1;

        const dossierRewritePrompt = `${buildDossierPrompt(currentDossier, sessionCount)}\n\nThe following chat transcript is the new session data to incorporate.\n\nCHAT TRANSCRIPT:\n${transcript}`;
        const recapPrompt = `Write a 2-3 sentence recap of this session for continuity. What was discussed? What was the emotional tone? What was the outcome or takeaway? Write from the consultant's perspective. Keep it concise — this will be shown to the character at the start of the next session for context.\n\nCHAT TRANSCRIPT:\n${transcript}`;

        try {
            console.log(`[ProcessChat] Starting parallel AI calls (condensed + dossier + recap)...`);
            const [condensedResult, dossierResult, recapResult] = await Promise.all([
                generateCondensedTranscript(transcript),
                generateWithFallback({
                    primaryModelId: OPUS_MODEL,
                    fallbackModelId: OPUS_FALLBACK,
                    schema: z.object({ updated_dossier: z.string() }),
                    prompt: dossierRewritePrompt,
                }),
                generateWithFallback({
                    primaryModelId: OPUS_MODEL,
                    fallbackModelId: OPUS_FALLBACK,
                    schema: z.object({ session_recap: z.string() }),
                    prompt: recapPrompt,
                }),
            ]);

            const condensed = condensedResult;
            const dossier = (dossierResult.object as any);
            const recap = (recapResult.object as any);

            let condensedMessages: Array<{ role: 'user' | 'ideal_self'; text: string }> | null = null;
            let condensedEditorialNote: string | null = null;

            console.log(`[ProcessChat] AI calls complete. is_publishable=${condensed?.is_publishable} title="${condensed?.title}" msgs=${condensed?.messages?.length || 0}`);

            if (condensed && condensed.is_publishable && condensed.messages) {
                condensedMessages = condensed.messages;
                condensedEditorialNote = condensed.editorial_note || null;
            }

            const dossierPromise = (identity && dossier && recap) ? (async () => {
                const existingRecaps = userData?.session_recaps || [];
                const newRecap = { date: new Date().toISOString().split('T')[0], recap: recap.session_recap };
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
            })() : Promise.resolve();

            if (condensed.is_publishable && condensedMessages && condensedMessages.length > 0) {
                console.log(`[ProcessChat] Chat IS publishable — creating post and running pipeline...`);
                const postDocRef = db.collection('posts').doc();
                const characterVoiceId = userData?.character_bible?.voice_id;

                const [pipelineResult] = await Promise.all([
                    processPostContent({
                        transcript,
                        uid,
                        postId: postDocRef.id,
                        compiledBible,
                        demographicHint,
                        characterVoiceId,
                        gender,
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

                const { imagePrompts, audioFields, derivedLetter, derivedResponse } = pipelineResult;
                const conversationContext = condensedMessages.map(m => `${m.role === 'user' ? 'Person' : 'Consultant'}: ${m.text}`).join('\n');
                const sponsor = matchSponsor(conversationContext);

                let authorHash: string | null = null;
                try {
                    const userRecord = await getAuth().getUser(uid);
                    if (userRecord.phoneNumber) {
                        const normalized = normalizePhoneNumberServer(userRecord.phoneNumber);
                        authorHash = hashPhoneNumberServer(normalized);
                    }
                } catch { /* silent */ }

                const geoFields: { lat?: number; lng?: number; geohash?: string } = {};
                if (userData?.home_lat != null && userData?.home_lng != null) {
                    geoFields.lat = userData.home_lat;
                    geoFields.lng = userData.home_lng;
                    geoFields.geohash = geohashForLocation([userData.home_lat, userData.home_lng]);
                }

                const userPhotoUrl = after.user_photo_url || null;

                // Set post with empty images first
                await postDocRef.set({
                    id: postDocRef.id,
                    uid,
                    authorId: uid,
                    authorHash,
                    region: userData?.region || null,
                    author: userData?.displayName || "Anonymous",
                    title: condensed.title || null,
                    type: 'checkin',
                    public_post: {
                        letter: derivedLetter,
                        response: derivedResponse,
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
                    ...geoFields,
                    content_raw: transcript,
                    condensed_transcript: condensedMessages,
                    ...(condensedEditorialNote && { condensed_editorial_note: condensedEditorialNote }),
                    ...audioFields,
                    status: "completed",
                    created_at: FieldValue.serverTimestamp(),
                    is_public: false,
                    visibility,
                    like_count: 0,
                    comments: 0
                });

                // Generate images inline
                console.log(`[ProcessChat] Post ${postDocRef.id} written to Firestore. Starting inline image generation...`);
                const referenceImage = await loadUserReferenceImage(uid);
                console.log(`[ProcessChat] Reference image loaded: ${!!referenceImage}`);
                const referenceImages = referenceImage ? [referenceImage] : undefined;
                
                const generatedImageUrls = await generateMessageImages({
                    prompts: imagePrompts,
                    uid,
                    filePrefix: postDocRef.id,
                    referenceImages,
                });
                
                const firstImage = generatedImageUrls.find(Boolean) || null;
                const allImagesFilled = generatedImageUrls.filter(Boolean).length >= imagePrompts.length;
                const hasAudio = !!audioFields.audio_url;
                const isComplete = allImagesFilled && hasAudio;
                
                // Update post with generated images — only go public when ALL content is ready
                await postDocRef.update({
                    message_images: generatedImageUrls,
                    imagen_urls: generatedImageUrls.filter(Boolean),
                    images_complete: allImagesFilled,
                    ...(firstImage && { imagen_url: firstImage }),
                    // Only publish when every image succeeded AND audio exists
                    ...(isComplete && { is_public: visibility !== 'private' }),
                });

                // Email notification
                try {
                    if (process.env.GMAIL_APP_PASSWORD) {
                        const transporter = nodemailer.createTransport({
                            service: 'gmail',
                            auth: { user: ADMIN_EMAIL, pass: process.env.GMAIL_APP_PASSWORD },
                        });
                        const postAuthor = userData?.displayName || 'Anonymous';
                        const firstUserMsg = derivedLetter.substring(0, 300) + (derivedLetter.length > 300 ? '...' : '');
                        await transporter.sendMail({
                            from: `Earnest Page <${ADMIN_EMAIL}>`,
                            to: ADMIN_EMAIL,
                            subject: `📝 New Post — ${postAuthor}`,
                            html: `
<div style="font-family: -apple-system, sans-serif; background: #09090b; color: #d4d4d8; padding: 32px; border-radius: 12px; max-width: 480px;">
    <p style="font-size: 10px; text-transform: uppercase; letter-spacing: 0.2em; color: #71717a; margin: 0 0 16px 0;">New Post Published</p>
    <h2 style="font-size: 20px; color: #ffffff; margin: 0 0 4px 0; font-weight: 700;">${postAuthor}</h2>
    <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
        <tr><td style="padding: 6px 0; color: #71717a;">Visibility</td><td style="padding: 6px 0; text-align: right; color: ${visibility === 'private' ? '#f87171' : '#34d399'}; font-weight: 600;">${visibility}</td></tr>
        <tr><td style="padding: 6px 0; color: #71717a;">Post ID</td><td style="padding: 6px 0; text-align: right; color: #e4e4e7; font-family: monospace; font-size: 11px;">${postDocRef.id}</td></tr>
    </table>
    ${firstUserMsg ? `<div style="margin: 16px 0 0 0; padding: 12px; background: #18181b; border-radius: 8px; font-size: 12px; color: #a1a1aa; line-height: 1.6;">${firstUserMsg}</div>` : ''}
</div>`,
                        });
                    }
                } catch (emailErr) {
                    console.error(`[ProcessChat] Post notification email failed:`, emailErr);
                }

                console.log(`[ProcessChat] ✅ Complete — post ${postDocRef.id}: ${generatedImageUrls.filter(Boolean).length}/${imagePrompts.length} images, audio: ${hasAudio}, public: ${isComplete && visibility !== 'private'}`);
                await event.data?.after.ref.delete();
            } else {
                console.log(`[ProcessChat] Chat NOT publishable — skipping post creation, updating dossier only`);
                await dossierPromise;
                await event.data?.after.ref.delete();
            }
        } catch (error: any) {
            console.error(`[ProcessChat] Error processing chat for user ${uid}:`, error);
            await event.data?.after.ref.update({
                processing: false,
                lastError: (error?.message || String(error)).slice(0, 500),
                lastErrorAt: Date.now(),
            });
        }
    }
);

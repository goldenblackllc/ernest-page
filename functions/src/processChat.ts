import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { db } from './lib/firebase/admin.js';
import { z } from 'zod';
import { generateWithFallback, OPUS_MODEL, OPUS_FALLBACK, SONNET_MODEL } from './lib/ai/models.js';
import { FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { hashPhoneNumberServer, normalizePhoneNumberServer } from './lib/security/serverHash.js';
import { geohashForLocation } from 'geofire-common';
import { buildExtractionPrompt } from './lib/ai/extractionPrompt.js';
import { buildSessionLogPrompt } from './lib/ai/sessionLogPrompt.js';
import { matchSponsor } from './lib/config/ecosystem.js';
import { generateCondensedTranscript } from './lib/ai/condensedTranscript.js';

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
        
        const now = Date.now();
        // Skip if already being processed (unless the claim is stale > 10 min)
        if (after.processing === true && (now - (after.processingStartedAt || 0)) < 10 * 60 * 1000) {
            console.log(`[ProcessChat] Skipping — already processing (started ${Math.round((now - (after.processingStartedAt || 0)) / 1000)}s ago)`);
            return;
        }
        
        // Skip if this trigger was caused by our own processing update (we just set processing: true)
        if (!before?.processing && after.processing === true) {
            console.log(`[ProcessChat] Skipping — this is our own processing claim update`);
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
            ? (after.sessionRouting === 'public' ? 'public' : 'private')
            : (after.autoPublish === true ? 'public' : 'private');

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
        const computedAge = computeAge(identity?.birthdate);
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
        
        const currentProfile = userData?.unified_profile || {};
        const sessionCount = (identity?.session_count || 0) + 1;

        const extractionPrompt = buildExtractionPrompt(currentProfile, identity?.dossier || '', transcript);
        const sessionLogPrompt = buildSessionLogPrompt(transcript);

        try {
            console.log(`[ProcessChat] Starting parallel AI calls (condensed + extraction + log)...`);
            const [condensedResult, extractionResult, recapResult] = await Promise.all([
                generateCondensedTranscript(transcript),
                // Profile extraction — Opus
                generateWithFallback({
                    primaryModelId: OPUS_MODEL,
                    fallbackModelId: OPUS_FALLBACK,
                    schema: z.object({
                        all_people: z.array(z.object({
                            name: z.string(),
                            relationship: z.string(),
                            who: z.string().optional().describe('Factual profile — age, school/job, personality traits, interests, hobbies'),
                            dynamic: z.string().optional().describe('The nature of the USER\'s relationship with this person — how they relate, emotional quality'),
                            birthday: z.string().optional(),
                            notes: z.string().optional().describe('Transient — recent events, session anecdotes, situational details'),
                        })).describe('Complete reconciled list of ALL people/pets in the user\'s life — not just new ones'),
                        all_interests: z.array(z.string()).describe('Complete reconciled interests list — everything the user enjoys, deduplicated and consolidated'),
                        all_wardrobe: z.array(z.string()).describe('Complete reconciled wardrobe — items the USER owns/wears, not gifts for others'),
                        rewritten_life_facts: z.string().optional().describe('Complete rewritten life_facts — location, occupation, employer, living situation, relationship status'),
                        rewritten_routines: z.string().optional().describe('Complete rewritten routines — daily patterns, schedules, exercise habits, work schedule, rituals'),
                        rewritten_milestones: z.string().optional().describe('Complete rewritten milestones — sobriety dates, career events, moves, life transitions'),
                        rewritten_dossier: z.string().optional().describe('Complete rewritten dossier with all seven sections (under 1500 words). Null if no changes.'),
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

            const condensed = condensedResult;
            const extracted = (extractionResult.object as any);
            const recap = (recapResult.object as any);

            let condensedMessages: Array<{ role: 'user' | 'ideal_self'; text: string }> | null = null;
            let condensedEditorialNote: string | null = null;

            console.log(`[ProcessChat] AI calls complete. is_publishable=${condensed?.is_publishable} title="${condensed?.title}" msgs=${condensed?.messages?.length || 0}`);

            if (condensed && condensed.is_publishable && condensed.messages) {
                condensedMessages = condensed.messages;
                condensedEditorialNote = condensed.editorial_note || null;
            }

            const dossierPromise = (identity && extracted && recap) ? (async () => {
                // Build the new session_recaps array (keep last 5)
                const existingRecaps = userData?.session_recaps || [];
                const newRecap = { date: new Date().toISOString().split('T')[0], recap: recap.session_recap };
                const updatedRecaps = [newRecap, ...existingRecaps].slice(0, 5);

                // Build updated unified profile from LLM-reconciled extraction
                const profile = userData?.unified_profile || {
                    people: [],
                    interests: [],
                    wardrobe: [],
                    routines: '',
                    life_facts: '',
                    milestones: ''
                };
                
                const updatedProfile = {
                    people: extracted.all_people || profile.people || [],
                    interests: extracted.all_interests || profile.interests || [],
                    wardrobe: extracted.all_wardrobe || profile.wardrobe || [],
                    routines: extracted.rewritten_routines || profile.routines || '',
                    life_facts: extracted.rewritten_life_facts || profile.life_facts || '',
                    milestones: extracted.rewritten_milestones || profile.milestones || '',
                };

                // ─── WANTS CONSOLIDATION (Separate Sonnet call) ───
                const existingWants = userData?.wants_for_bible || [];
                let consolidatedWants = existingWants;
                try {
                    console.log(`[ProcessChat] Consolidating wants with Sonnet (${existingWants.length} existing)...`);
                    const wantsResult = await generateWithFallback({
                        primaryModelId: SONNET_MODEL,
                        fallbackModelId: OPUS_FALLBACK,
                        schema: z.object({
                            all_wants: z.array(z.string()).describe('Clean consolidated wants list'),
                        }),
                        prompt: `You are a list manager. Your ONLY job is to produce a clean, consolidated wants list.

EXISTING WANTS LIST:
${existingWants.length > 0 ? existingWants.map((w: string, i: number) => `${i + 1}. ${w}`).join('\n') : 'Empty.'}

SESSION TRANSCRIPT (extract any NEW material wants expressed):
${transcript}

RULES:
1. MERGE existing wants with any NEW concrete wants from the session transcript.
2. AGGRESSIVELY DEDUPLICATE — if multiple entries say similar things, keep ONE clear version.
3. DROP GARBAGE — remove malformed entries, LLM artifacts, empty strings, single punctuation.
4. ONLY KEEP MATERIAL/TANGIBLE WANTS — things the character could HAVE or BE:
   ✅ KEEP: Cars, houses, trips, fitness goals, renovations, relocations, purchases, career changes
   ❌ DROP: Emotional states ("feel calm"), mindset shifts ("live from power"), actions toward others ("text Sage"), philosophical intentions ("enjoy life"), diet rules ("eat carnivore"), relationship hopes
   TEST: "The character OWNS / DRIVES / LIVES IN / TRAVELS TO / WEIGHS ___" — if it doesn't fit, drop it.
5. The final list should be CONCISE — quality over quantity.

Output the clean consolidated list.`,
                    });
                    const wantsOutput = (wantsResult.object as any)?.all_wants || [];
                    // Programmatic garbage filter as safety net
                    consolidatedWants = wantsOutput.filter((w: string) => {
                        if (!w || typeof w !== 'string') return false;
                        const trimmed = w.trim();
                        if (trimmed.length < 3) return false;
                        if (/^[:;,.\-!?]+$/.test(trimmed)) return false;
                        if (/^(null|no|yes|none|n\/a|placeholder|undefined)$/i.test(trimmed)) return false;
                        if (/rewritten_dossier|not provided/i.test(trimmed)) return false;
                        return true;
                    });
                    console.log(`[ProcessChat] Wants consolidated: ${existingWants.length} → ${consolidatedWants.length}`);
                } catch (err: any) {
                    console.error(`[ProcessChat] Wants consolidation failed (keeping existing):`, err.message);
                }

                await userDoc.ref.set({
                    identity: {
                        ...identity,
                        ...(extracted.rewritten_dossier ? { dossier: extracted.rewritten_dossier } : {}),
                        dossier_updated_at: FieldValue.serverTimestamp(),
                        session_count: sessionCount,
                    },
                    session_recaps: updatedRecaps,
                    unified_profile: updatedProfile,
                    wants_for_bible: consolidatedWants,
                }, { merge: true });
                console.log(`[ProcessChat] Profile + log updated for ${uid} (session ${sessionCount})`);

                // Re-derive manifesto and archetype from dream_rant + consolidated wants
                const dreamRant = identity?.dream_rant || '';
                if (dreamRant && consolidatedWants.length > 0) {
                    try {
                        console.log(`[ProcessChat] Re-deriving manifesto from rant + ${consolidatedWants.length} wants...`);
                        const wantsText = consolidatedWants.map((w: string) => `I want: ${w}`).join('\n');
                        const manifestoResult = await generateWithFallback({
                            primaryModelId: OPUS_MODEL,
                            fallbackModelId: OPUS_FALLBACK,
                            schema: z.object({
                                title: z.string().describe('3 concrete visual roles, comma-separated (e.g. "Father, Husband, Gentleman")'),
                                dream_self: z.string().describe('Present-tense identity paragraph, 3-5 sentences, AS IF they already are this person'),
                            }),
                            prompt: `A user has written a "dream rant" describing who they wish they were. They have also expressed additional desires over time. Combine both into a single identity.

DREAM RANT:
"${dreamRant}"

ADDITIONAL DESIRES (treat these as part of the rant — they are things the user wants that should be incorporated as present-tense realities):
${wantsText}

Your job:
1. TITLE: Extract 3 concrete, VISUAL roles. These should be nouns/roles that instantly paint a picture of who this person is — not abstract traits. Gendered when appropriate (e.g., "Father" not "Parent"). Format: "Role, Role, Role"
2. DREAM SELF: Write a present-tense identity paragraph (3-5 sentences) describing this person AS IF THEY ALREADY ARE who they described AND already have everything they desire. Transform ALL wish-language into present-tense identity. The output must read as a confident, realized identity — never aspirational.`,
                        });

                        const manifesto = (manifestoResult.object as any);
                        if (manifesto?.title && manifesto?.dream_self) {
                            await userDoc.ref.set({
                                identity: {
                                    title: manifesto.title,
                                    dream_self: manifesto.dream_self,
                                },
                                character_bible: {
                                    source_code: {
                                        archetype: manifesto.title,
                                        manifesto: manifesto.dream_self,
                                    },
                                },
                            }, { merge: true });
                            console.log(`[ProcessChat] Manifesto re-derived: "${manifesto.title}"`);
                        }
                    } catch (err: any) {
                        console.error(`[ProcessChat] Manifesto re-derivation failed (non-fatal):`, err.message);
                    }
                }

                // Trigger bible recompile with updated profile
                const appUrl = process.env.APP_URL;
                const cronSecret = process.env.CRON_SECRET;
                if (appUrl && cronSecret) {
                    try {
                        const compileRes = await fetch(`${appUrl}/api/character/compile`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'x-internal-key': cronSecret,
                            },
                            body: JSON.stringify({ uid, skipCooldown: true }),
                        });
                        if (!compileRes.ok) {
                            const errBody = await compileRes.text().catch(() => '');
                            console.error(`[ProcessChat] Bible recompile failed for ${uid}: ${compileRes.status} ${errBody}`);
                        } else {
                            console.log(`[ProcessChat] Bible recompile succeeded for ${uid}`);
                        }
                    } catch (err: any) {
                        console.error(`[ProcessChat] Bible recompile network error for ${uid}:`, err.message);
                    }
                } else {
                    console.warn(`[ProcessChat] Skipping bible recompile — APP_URL or CRON_SECRET not set`);
                }
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

                const { imagePrompts, audioFields, thumbnailUrl } = pipelineResult;
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
                    author: userData?.identity?.title || userData?.character_bible?.source_code?.archetype || "Anonymous",
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
                    ...geoFields,
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
                // ─── SESSION ENGAGEMENT METRICS (privacy-safe, no content exposed) ───
                const rawUserMsgs = messages.filter((m: any) => m.role === 'user');
                const engagementUserTurns = rawUserMsgs.length;
                const engagementAvgLength = engagementUserTurns > 0
                    ? Math.round(rawUserMsgs.reduce((sum: number, m: any) => sum + (m.content?.length || 0), 0) / engagementUserTurns)
                    : 0;
                const engagementDurationMs = (after.updatedAt || 0) - (after.createdAt || 0);
                const engagementDurationMin = Math.round(engagementDurationMs / 60000);
                const closeReason: string = after.closeReason || (after.isClosed ? 'user' : 'abandoned');
                const closeReasonLabels: Record<string, string> = {
                    'exchange-limit': '🏁 Hit exchange limit',
                    'expired': '⏰ Session expired (2hr)',
                    'user': '👋 User closed',
                    'abandoned': '💤 Abandoned (timed out)',
                };
                const closeReasonLabel = closeReasonLabels[closeReason] || closeReason;
                const reachedClose = condensed?.reached_close === true;
                const engagementVerified = reachedClose;
                const engagementLabel = engagementVerified ? '✅ VERIFIED' : '⚠️ LOW ENGAGEMENT';
                const engagementColor = engagementVerified ? '#34d399' : '#fbbf24';

                // Email notification
                try {
                    if (process.env.GMAIL_APP_PASSWORD) {
                        const transporter = nodemailer.createTransport({
                            service: 'gmail',
                            auth: { user: ADMIN_EMAIL, pass: process.env.GMAIL_APP_PASSWORD },
                        });
                        const postAuthor = userData?.identity?.title || userData?.character_bible?.source_code?.archetype || 'Anonymous';
                        const postVisibility = visibility || 'private';
                        const postTitle = condensed.title || null;
                        const postThumbnail = thumbnailUrl || null;
                        await transporter.sendMail({
                            from: `Earnest Page <${ADMIN_EMAIL}>`,
                            to: ADMIN_EMAIL,
                            subject: `${engagementLabel} 📝 New Post — ${postAuthor}`,
                            html: `
<div style="font-family: -apple-system, sans-serif; background: #09090b; color: #d4d4d8; padding: 32px; border-radius: 12px; max-width: 480px;">
    <p style="font-size: 10px; text-transform: uppercase; letter-spacing: 0.2em; color: #71717a; margin: 0 0 16px 0;">New Post Published</p>
    <h2 style="font-size: 20px; color: #ffffff; margin: 0 0 4px 0; font-weight: 700;">${postAuthor}</h2>
    ${postTitle ? `<p style="font-size: 14px; color: #a1a1aa; margin: 4px 0 12px 0; font-style: italic;">"${postTitle}"</p>` : ''}
    <div style="margin: 8px 0 12px 0; padding: 8px 12px; background: ${engagementVerified ? '#052e16' : '#422006'}; border: 1px solid ${engagementColor}; border-radius: 8px; font-size: 13px; color: ${engagementColor}; font-weight: 600;">
        ${engagementLabel}
    </div>
    ${postThumbnail ? `<div style="margin: 0 0 16px 0;"><img src="${postThumbnail}" alt="Post thumbnail" style="width: 100%; border-radius: 8px; display: block;" /></div>` : ''}
    <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
        <tr><td style="padding: 6px 0; color: #71717a;">Visibility</td><td style="padding: 6px 0; text-align: right; color: ${postVisibility === 'private' ? '#f87171' : '#34d399'}; font-weight: 600;">${postVisibility}</td></tr>
        <tr><td style="padding: 6px 0; color: #71717a;">Exchanges</td><td style="padding: 6px 0; text-align: right; color: #e4e4e7;">${engagementUserTurns} user messages</td></tr>
        <tr><td style="padding: 6px 0; color: #71717a;">Avg Response</td><td style="padding: 6px 0; text-align: right; color: #e4e4e7;">${engagementAvgLength} chars</td></tr>
        <tr><td style="padding: 6px 0; color: #71717a;">Duration</td><td style="padding: 6px 0; text-align: right; color: #e4e4e7;">${engagementDurationMin} min</td></tr>
        <tr><td style="padding: 6px 0; color: #71717a;">Session End</td><td style="padding: 6px 0; text-align: right; color: #e4e4e7;">${closeReasonLabel}</td></tr>
        <tr><td style="padding: 6px 0; color: #71717a;">Post ID</td><td style="padding: 6px 0; text-align: right; color: #e4e4e7; font-family: monospace; font-size: 11px;">${postDocRef.id}</td></tr>
        <tr><td style="padding: 6px 0; color: #71717a;">Images</td><td style="padding: 6px 0; text-align: right; color: #fbbf24; font-weight: 600;">⏳ ${imagePrompts.length} pending</td></tr>
    </table>
</div>`,
                        });
                    }
                } catch (emailErr) {
                    console.error(`[ProcessChat] Post notification email failed:`, emailErr);
                }

                console.log(`[ProcessChat] ✅ Post ${postDocRef.id} created — ${imagePrompts.length} image prompts, audio: ${!!audioFields.audio_url}, images deferred to Phase 2`);
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

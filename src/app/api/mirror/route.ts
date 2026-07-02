import { db } from '@/lib/firebase/admin';
import { waitUntil } from '@vercel/functions';
import { generateTextWithFallback, OPUS_MODEL, OPUS_FALLBACK } from '@/lib/ai/models';
import { ENGAGEMENT_TONES, DEFAULT_TONE } from '@/lib/ai/engagementTones';
import { buildMirrorSystemPrompt } from '@/lib/ai/mirrorPrompt';
import { SessionTone } from '@/types/chat';
import { verifyAuth, unauthorizedResponse } from '@/lib/auth/serverAuth';
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rateLimit';
import { getTranslations } from 'next-intl/server';

export const maxDuration = 300;

export async function POST(req: Request) {
    try {
        const uid = await verifyAuth(req);
        if (!uid) return unauthorizedResponse();

        const rl = checkRateLimit(`mirror:${uid}`, RATE_LIMITS.mirror);
        if (!rl.allowed) return rateLimitResponse(rl.resetMs);

        const { messages, sessionId, sessionTone, localTime } = await req.json();

        const primaryModel = OPUS_MODEL;
        const fallbackModel = OPUS_FALLBACK;
        const t = await getTranslations('apiErrors');

        if (!sessionId) {
            return Response.json({ error: t('missingSession') }, { status: 400 });
        }

        // Input length guard — prevent prompt stuffing
        const lastMessage = messages?.[messages.length - 1];
        if (lastMessage?.content && typeof lastMessage.content === 'string' && lastMessage.content.length > 5000) {
            return Response.json({ error: 'Message is too long. Please keep it under 5,000 characters.' }, { status: 400 });
        }

        // Validate tone or default
        const tone: SessionTone = (sessionTone && sessionTone in ENGAGEMENT_TONES) ? sessionTone : DEFAULT_TONE;

        // Fetch User and Character Bible from Firebase
        const userDoc = await db.collection('users').doc(uid).get();
        if (!userDoc.exists) {
            return Response.json({ error: t('userNotFound') }, { status: 404 });
        }

        const userData = userDoc.data();

        // ─── Access enforcement (subscription OR session credits OR active session OR free onboarding) ───
        const isLegacyComplete = !!userData?.identity?.title;
        const isOnboarding = !(userData?.identity?.onboarding_complete || isLegacyComplete);

        if (!isOnboarding) {
            const sub = userData?.subscription;
            const subEndDate = sub?.currentPeriodEnd || sub?.subscribedUntil;
            const isActiveSub = (sub?.status === 'active' || sub?.status === 'past_due') && subEndDate && new Date(subEndDate) > new Date();
            const hasActiveSub = isActiveSub;
            const hasCredits = (userData?.session_credits || 0) > 0;

            // If user has no sub and no remaining credits, check if they consumed a session today.
            if (!hasActiveSub && !hasCredits) {
                const today = new Date().toISOString().split('T')[0];
                const consumedToday = userData?.sessions_today_date === today && (userData?.sessions_today || 0) > 0;

                if (!consumedToday) {
                    return Response.json({ error: t('noActiveSub') }, { status: 403 });
                }
            }
        }

        const compiledBible = userData?.character_bible?.compiled_output?.ideal || [];
        const dossier = userData?.identity?.dossier || '';
        const sessionRecaps = userData?.session_recaps || [];
        const preferredLocale = userData?.preferred_locale || 'en';
        const characterAge = userData?.identity?.age || '';
        const characterGender = userData?.identity?.gender || '';

        // Get the tone directive
        const toneDirective = ENGAGEMENT_TONES[tone].directive;

        // Determine language instruction for the AI
        let languageInstruction = "";
        if (preferredLocale === "es") {
            languageInstruction = "\n[LANGUAGE MANDATE]\nYou MUST respond entirely in SPANISH (Español). Do not use English unless the user explicitly asks for an English word.";
        } else if (preferredLocale === "fr") {
            languageInstruction = "\n[LANGUAGE MANDATE]\nYou MUST respond entirely in FRENCH (Français). Do not use English unless the user explicitly asks for an English word.";
        } else if (preferredLocale === "de") {
            languageInstruction = "\n[LANGUAGE MANDATE]\nYou MUST respond entirely in GERMAN (Deutsch). Do not use English unless the user explicitly asks for an English word.";
        } else if (preferredLocale === "pt") {
            languageInstruction = "\n[LANGUAGE MANDATE]\nYou MUST respond entirely in PORTUGUESE (Português). Do not use English unless the user explicitly asks for an English word.";
        } else {
            languageInstruction = "\n[LANGUAGE MANDATE]\nYou MUST respond entirely in ENGLISH.";
        }

        // ─── Build engagement context block (contract + dossier + recaps) ───
        let engagementContract = `[ENGAGEMENT CONTRACT — WHY YOU ARE HERE]
You have been engaged through Earnest Page, a platform for self-actualization. The person you are speaking with is a version of you that wants to become you, but currently is not there yet. You share the same people — every person in your Character Bible is someone they know personally. You share the same preferences and tastes. But your life circumstances may differ: your Character Bible may describe a life they have not yet built. Do not be confused when they reference people from your own world — you know these people. Do not be confused when their current reality does not match yours — they are still becoming you. You do not see them as broken, and you do not believe they have "problems" to fix. You see them as perfectly positioned in their exact present moment, and your role is to help them recognize their own perfection, see the gifts in their circumstances, and align with their most exciting options.

[DOSSIER — ABOUT THE PERSON YOU ARE SPEAKING TO]
The following file contains facts about where this person currently is in their life. You share the same people and the same preferences — when they mention someone by name, you likely already know that person from your own Character Bible. However, their current life circumstances (career stage, finances, living situation, accomplishments) may not yet match yours. These facts describe THEIR current reality, not yours. Do not claim their specific accomplishments, projects, or creations as your own — but DO recognize shared people and shared tastes as familiar.

${dossier || 'No dossier available — ask them to tell you about themselves, their situation, and what they are excited about.'}`;

        if (sessionRecaps.length > 0) {
            engagementContract += `\n\n[RECENT SESSIONS — WHAT YOU LAST TALKED ABOUT]
The following are brief recaps of your most recent sessions. Use them for continuity — reference what was discussed if relevant, but do not force it.

${sessionRecaps.map((r: { date: string; recap: string }) => `${r.date}: ${r.recap}`).join('\n\n')}`;
        }

        // ─── NORMAL MODE: Full character simulation ───
        const systemPrompt = buildMirrorSystemPrompt({
            localTime,
            compiledBible,
            languageInstruction,
            toneDirective,
            characterAge,
            characterGender,
            securityExtras: ', the Dossier',
            engagementContract,
            mandatePrelude: `- You are an invested peer and role model, not a passing stranger.`,
            mandatePostlude: `- Reference their specifics — their real constraints, the people in their life, what they enjoy. Make them feel known.
- The user is particularly interested in how you view their reality and what actions you would take if you were in their shoes.
- If the person notes that you do not remember something from a previous session, do not apologize for it. Tell them the truth: you prefer to hear their story as it is today. What they say now is more important than what they said before.`,
            dynamicFilterText: `STEP B - THE DYNAMIC FILTER: Check the "Relationships" node. The character is an equal and a peer. Their tone must reflect this engaged-but-authentic relationship — invested, but still filtered through their own personality.`,
        });

        // Save user's input to Firestore immediately
        const activeChatRef = db.collection('users').doc(uid).collection('active_chats').doc(sessionId);

        // With unique session IDs, we don't need a destructive "hard reset".
        // New sessions will naturally be new documents.
        const chatDataUpdate: any = {
            id: sessionId,
            uid,
            messages,
            status: 'generating',
            updatedAt: Date.now(),
        };

        if (messages.length === 1) {
            chatDataUpdate.createdAt = Date.now();
        }

        await activeChatRef.set(chatDataUpdate, { merge: true });

        // Kick off the background generation
        waitUntil((async () => {
            let result;
            try {
                console.log(`[MirrorChat] Attempting generation with fallback utility`);
                // Attempt Generation
                result = await generateTextWithFallback({
                    primaryModelId: primaryModel,
                    fallbackModelId: fallbackModel,
                    messages: [
                        {
                            role: 'system',
                            content: systemPrompt,
                            providerOptions: {
                                anthropic: { cacheControl: { type: 'ephemeral', ttl: '1h' } },
                            },
                        },
                        ...messages,
                    ],
                    abortSignal: AbortSignal.timeout(120000)
                });
            } catch (primaryError: any) {
                console.error("Primary Model also failed. Aborting generation.", primaryError.message);
                await activeChatRef.set({
                    status: 'idle', // Reset to idle so user can retry
                    updatedAt: Date.now()
                }, { merge: true });
                return; // Exit early
            }

            // Update Firestore with the successful assistant response
            const finalMessages = [...messages, { role: 'assistant', content: result.text, id: crypto.randomUUID() }];
            await activeChatRef.set({
                messages: finalMessages,
                status: 'idle',
                updatedAt: Date.now()
            }, { merge: true });

        })());

        return Response.json({ success: true, message: "Processing started in background" }, { status: 200 });

    } catch (error: any) {
        console.error("Mirror Chat API Error:", error);
        const t = await getTranslations('apiErrors');

        if (error.name === 'AbortError' || (error.message || '').toString().toLowerCase().includes('timeout') || (error.message || '').toString().toLowerCase().includes('504') || (error.message || '').toString().toLowerCase().includes('503')) {
            return Response.json({
                success: false,
                errorType: 'TIMEOUT',
                message: t('mirrorTimeout')
            }, { status: 504 });
        }

        return Response.json({ error: error.message || t('unexpected') }, { status: 500 });
    }
}

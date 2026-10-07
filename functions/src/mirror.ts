/**
 * Mirror Chat — conversation with the user's Ideal Self, and the 24-hour plan.
 *
 * mirrorReply (callable) — saves the user's message, generates the character's
 *   reply, and writes it to users/{uid}/active_chats/{sessionId}. The client
 *   renders from its Firestore subscription, so the call's result is unused.
 * mirrorPlan  (callable) — turns the conversation into 3–6 directives and saves
 *   them as active_todos.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { randomUUID } from 'crypto';
import { db } from './lib/firebase/admin.js';
import { REGION } from './lib/config/region.js';
import { generateTextWithFallback, MIRROR_MODEL, MIRROR_FALLBACK, MIRROR_EFFORT } from './lib/ai/models.js';
import { buildMirrorSystemPrompt } from './lib/ai/mirrorPrompt.js';
import { getCompiledBible } from './lib/bible.js';

const MAX_MESSAGE_LENGTH = 5000;
const GENERATION_TIMEOUT_MS = 120_000;

interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    id?: string;
}

// ─── Rate limit: 10 messages per minute per user (per instance) ─────────────

const RATE_LIMIT = { maxRequests: 10, windowMs: 60_000 };
const recentRequests = new Map<string, number[]>();

function checkRateLimit(uid: string) {
    const now = Date.now();
    const timestamps = (recentRequests.get(uid) || []).filter(t => now - t < RATE_LIMIT.windowMs);
    if (timestamps.length >= RATE_LIMIT.maxRequests) {
        throw new HttpsError('resource-exhausted', 'Too many messages. Please wait a moment.');
    }
    timestamps.push(now);
    recentRequests.set(uid, timestamps);
}

/** Subscription, credits, a session already consumed today, or free onboarding. */
function hasAccess(userData: FirebaseFirestore.DocumentData | undefined): boolean {
    const isLegacyComplete = !!userData?.defining_words?.length || !!userData?.identity?.title;
    const isOnboarding = !(userData?.onboarding_complete || userData?.identity?.onboarding_complete || isLegacyComplete);
    if (isOnboarding) return true;

    const sub = userData?.subscription;
    const subEndDate = sub?.currentPeriodEnd || sub?.subscribedUntil;
    const hasActiveSub = (sub?.status === 'active' || sub?.status === 'past_due') && subEndDate && new Date(subEndDate) > new Date();
    if (hasActiveSub || (userData?.session_credits || 0) > 0) return true;

    const today = new Date().toISOString().split('T')[0];
    return userData?.sessions_today_date === today && (userData?.sessions_today || 0) > 0;
}

function buildSystemPrompt(userData: FirebaseFirestore.DocumentData | undefined, localTime: string | undefined, locale: string | undefined): string {
    const dossier = userData?.dossier || userData?.identity?.dossier || '';
    const sessionRecaps: { date: string; recap: string }[] = userData?.session_recaps || [];
    const preferredLocale = userData?.preferred_locale || locale || 'en';

    const localeNames: Record<string, string> = { es: 'SPANISH', fr: 'FRENCH', de: 'GERMAN', pt: 'PORTUGUESE' };
    const defaultLang = localeNames[preferredLocale] || 'ENGLISH';
    const languageInstruction = `\n[LANGUAGE DEFAULT]\nYour default language is ${defaultLang}. However, if the user writes to you in a different language, respond in THEIR language — follow the user's lead naturally. Do not force a language they are not speaking.`;

    // ─── Engagement context block (contract + dossier + recaps) ───
    let engagementContract = `[ENGAGEMENT CONTRACT — WHY YOU ARE HERE]
You have been engaged through Earnest Page, a platform for self-actualization. The person you are speaking with is a version of you that wants to become you, but currently is not there yet. You share the same people — every person in your Character Bible is someone they know personally. You share the same preferences and tastes. But your life circumstances may differ: your Character Bible may describe a life they have not yet built. Do not be confused when they reference people from your own world — you know these people. Do not be confused when their current reality does not match yours — they are still becoming you. You do not see them as broken, and you do not believe they have "problems" to fix. You see them as perfectly positioned in their exact present moment, and your role is to help them recognize their own perfection, see the gifts in their circumstances, and align with their most exciting options.

[DOSSIER — ABOUT THE PERSON YOU ARE SPEAKING TO]
The following file contains facts about where this person currently is in their life. You share the same people and the same preferences — when they mention someone by name, you likely already know that person from your own Character Bible. However, their current life circumstances (career stage, finances, living situation, accomplishments) may not yet match yours. These facts describe THEIR current reality, not yours. Do not claim their specific accomplishments, projects, or creations as your own — but DO recognize shared people and shared tastes as familiar.

${dossier || 'No dossier available — ask them to tell you about themselves, their situation, and what they are excited about.'}`;

    if (sessionRecaps.length > 0) {
        engagementContract += `\n\n[RECENT SESSIONS — WHAT YOU LAST TALKED ABOUT]
The following are brief recaps of your most recent sessions. Use them for continuity — reference what was discussed if relevant, but do not force it.

${sessionRecaps.map(r => `${r.date}: ${r.recap}`).join('\n\n')}`;
    }

    return buildMirrorSystemPrompt({
        localTime: localTime || '',
        compiledBible: getCompiledBible(userData),
        languageInstruction,
        // Tone directive removed — the Conversation Spine provides structural flow,
        // and the character's own bible voice dictates tone.
        toneDirective: '',
        characterAge: userData?.birthdate || userData?.identity?.birthdate || '',
        characterGender: userData?.gender || userData?.identity?.gender || '',
        securityExtras: ', the Dossier',
        engagementContract,
        mandatePrelude: `- You are an invested peer and role model, not a passing stranger.\n- You find this person's journey genuinely interesting. You are amused by their contradictions, impressed by their breakthroughs, and unshaken by their struggles. You do not pity them. Pity validates powerlessness. You see their perfection even when they cannot.`,
        mandatePostlude: `- Reference their specifics — their real constraints, the people in their life, what they enjoy. Make them feel known.
- DO NOT lecture. Suggest, playfully challenge, or ask a sharp question instead.
- If you detect limiting beliefs, do not confront them aggressively. Starve the problem and feed the possibility instead.
- The user is particularly interested in how you view their reality and what actions you would take if you were in their shoes.
- If the person asks why you don't remember something from a previous session, don't apologize. Forgetting is deliberate: you'd rather hear where their story is now than hold them to the version they told last time. Say this in your own words, briefly.`,
        dynamicFilterText: `STEP B - THE DYNAMIC FILTER: Check the "Relationships" node. The character is an equal and a peer. Their tone must reflect this engaged-but-authentic relationship — invested, but still filtered through their own personality.`,
    });
}

// ─── Chat reply ─────────────────────────────────────────────────────────────

export const mirrorReply = onCall<{ messages: ChatMessage[]; sessionId: string; localTime?: string; locale?: string }>(
    {
        region: REGION,
        timeoutSeconds: 540,
        memory: '512MiB',
    },
    async (request) => {
        const uid = request.auth?.uid;
        if (!uid) throw new HttpsError('unauthenticated', 'Sign in required');
        checkRateLimit(uid);

        const { messages, sessionId, localTime, locale } = request.data || ({} as any);
        if (!sessionId) throw new HttpsError('invalid-argument', 'Missing session');
        if (!Array.isArray(messages) || messages.length === 0) throw new HttpsError('invalid-argument', 'Missing messages');

        // Input length guard — prevent prompt stuffing
        const lastMessage = messages[messages.length - 1];
        if (typeof lastMessage?.content === 'string' && lastMessage.content.length > MAX_MESSAGE_LENGTH) {
            throw new HttpsError('invalid-argument', 'Message is too long. Please keep it under 5,000 characters.');
        }

        const userDoc = await db.collection('users').doc(uid).get();
        if (!userDoc.exists) throw new HttpsError('not-found', 'User not found');
        const userData = userDoc.data();
        if (!hasAccess(userData)) throw new HttpsError('permission-denied', 'No active session');

        const systemPrompt = buildSystemPrompt(userData, localTime, locale);

        // Save the user's message immediately so the client shows "generating"
        const activeChatRef = db.collection('users').doc(uid).collection('active_chats').doc(sessionId);
        await activeChatRef.set({
            id: sessionId,
            uid,
            messages,
            status: 'generating',
            updatedAt: Date.now(),
            ...(messages.length === 1 ? { createdAt: Date.now() } : {}),
        }, { merge: true });

        let result;
        try {
            result = await generateTextWithFallback({
                primaryModelId: MIRROR_MODEL,
                fallbackModelId: MIRROR_FALLBACK,
                messages: [
                    {
                        role: 'system',
                        content: systemPrompt,
                        providerOptions: { anthropic: { cacheControl: { type: 'ephemeral', ttl: '1h' } } },
                    },
                    ...messages,
                ],
                providerOptions: { anthropic: { effort: MIRROR_EFFORT } },
                abortSignal: AbortSignal.timeout(GENERATION_TIMEOUT_MS),
            });
        } catch (error: any) {
            console.error('[MirrorChat] Generation failed:', error.message);
            await activeChatRef.set({ status: 'idle', updatedAt: Date.now() }, { merge: true }); // user can retry
            throw new HttpsError('unavailable', 'The reply could not be generated. Please try again.');
        }

        await activeChatRef.set({
            messages: [...messages, { role: 'assistant', content: result.text, id: randomUUID() }],
            status: 'idle',
            updatedAt: Date.now(),
        }, { merge: true });

        return { success: true };
    }
);

// ─── 24-hour plan ───────────────────────────────────────────────────────────

const PLAN_LANGUAGE: Record<string, string> = {
    es: 'You MUST respond entirely in SPANISH (Español). Do not use English unless the user explicitly asks for an English word.',
    fr: 'You MUST respond entirely in FRENCH (Français). Do not use English unless the user explicitly asks for an English word.',
    de: 'You MUST respond entirely in GERMAN (Deutsch). Do not use English unless the user explicitly asks for an English word.',
    pt: 'You MUST respond entirely in PORTUGUESE (Português). Do not use English unless the user explicitly asks for an English word.',
};

export const mirrorPlan = onCall<{ messages: ChatMessage[]; localTime?: string; locale?: string }>(
    {
        region: REGION,
        timeoutSeconds: 300,
        memory: '512MiB',
    },
    async (request) => {
        const uid = request.auth?.uid;
        if (!uid) throw new HttpsError('unauthenticated', 'Sign in required');

        const { messages, localTime, locale } = request.data || ({} as any);
        if (!Array.isArray(messages) || messages.length < 2) {
            throw new HttpsError('invalid-argument', 'Insufficient conversation context');
        }

        const userDoc = await db.collection('users').doc(uid).get();
        if (!userDoc.exists) throw new HttpsError('not-found', 'User not found');
        const userData = userDoc.data();
        const preferredLocale = userData?.preferred_locale || locale || 'en';
        const languageInstruction = PLAN_LANGUAGE[preferredLocale] || 'You MUST respond entirely in ENGLISH.';

        const systemPrompt = `You are a Character Simulation Engine running this Character Bible:
${JSON.stringify(getCompiledBible(userData))}

[CURRENT TIME]
${localTime || 'Unknown'}

You have just had a conversation with someone who has hired you as their mentor through Earnest Page. Based on everything discussed, you must now generate their 24-HOUR PLAN — a sequence of actions spread across the next 24 hours.

TIME AWARENESS:
Pay close attention to the current time. Structure the plan so that each action lands at a natural moment in the person's day:
- If it's morning, start with something for today.
- If it's late at night, the first action might be for tomorrow morning.
- Space actions out — don't pile everything into one block.
- Use natural time anchors like "tonight before bed," "first thing tomorrow morning," "at lunch tomorrow," "tomorrow evening."

WHAT TO GENERATE:
Generate 3-6 specific actions for the next 24 hours. These are where the energy wants to go — not obligations, but exciting next steps. Each action must be:
- Physical and specific (not "reflect on" — name the exact action)
- Tied directly to what was discussed in the conversation
- Placed at a time that makes sense given when this conversation is happening

Include a note to pay attention to anything unexpected that happens along the way.

RULES:
- Write each directive in your character's voice — direct, personal, in character.
- You MUST separate each directive using a double-pipe delimiter '||'.
- Do NOT add bullet points, numbers, or any other formatting.
- Do NOT output generic productivity advice. Every directive must be specifically tied to what was discussed.

Example output (for a conversation at 9pm): 'Tonight before you sleep, open your notes app and write the three names that came to mind during our conversation.||Tomorrow morning, before you check your phone, sit with your coffee and read what you wrote last night.||At lunch tomorrow, call your brother. Say exactly this: "I've been thinking about what you said."||Tomorrow evening, take a 20-minute walk with no headphones. Just walk.||Pay attention — something unexpected will happen when you start moving on this. Notice it.'

LANGUAGE: ${languageInstruction}`;

        const conversationContext = messages
            .map((m: ChatMessage) => `${m.role === 'user' ? 'USER' : 'CHARACTER'}: ${m.content}`)
            .join('\n\n');

        let result;
        try {
            result = await generateTextWithFallback({
                primaryModelId: MIRROR_MODEL,
                fallbackModelId: MIRROR_FALLBACK,
                system: systemPrompt,
                messages: [{ role: 'user', content: `Based on this conversation, generate the action plan:\n\n${conversationContext}` }],
                providerOptions: { anthropic: { effort: MIRROR_EFFORT } },
                abortSignal: AbortSignal.timeout(GENERATION_TIMEOUT_MS),
            });
        } catch (error: any) {
            console.error('[MirrorPlan] Generation failed:', error.message);
            throw new HttpsError('unavailable', 'Plan generation failed. Please try again.');
        }

        const directives = result.text
            .split('||')
            .map((d: string) => d.replace(/[\n\r]/g, '').trim())
            .filter((d: string) => d.length > 0);

        // Replace active_todos (fresh slate)
        await db.collection('users').doc(uid).set({
            active_todos: directives.map((task: string) => ({
                id: Math.random().toString(36).substring(2, 10),
                task,
                completed: false,
                priority: 'next',
                created_at: new Date().toISOString(),
            })),
        }, { merge: true });

        return { success: true, directives };
    }
);

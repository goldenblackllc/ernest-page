/**
 * Mirror Chat — conversation with the user's Ideal Self.
 *
 * mirrorReply (callable) — saves the user's message, generates the character's
 *   reply, and writes it to users/{uid}/active_chats/{sessionId}. The client
 *   renders from its Firestore subscription, so the call's result is unused.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { randomUUID } from 'crypto';
import { db } from './lib/firebase/admin.js';
import { REGION } from './lib/config/region.js';
import { generateTextWithFallback, OPUS_MODEL, LIVE_FALLBACK } from './lib/ai/models.js';
import { buildMirrorSystemPrompt, buildMirrorTimeBlock, pickNegativeInventory } from './lib/ai/mirrorPrompt.js';
import { getCompiledBible } from './lib/bible.js';
import { checkReply, type SessionGrant } from './lib/access/sessionAccess.js';
import { errorMessage } from './lib/utils/errors.js';
import { currentSituation, localDayHour, type CharacterStyle } from './lib/character/situations.js';
import { safeTimeZone, localDateKey, relativeDayLabel, relativeMomentLabel, annotateDates } from './lib/utils/relativeDates.js';

const MAX_MESSAGE_LENGTH = 5000;
const GENERATION_TIMEOUT_MS = 240_000;

interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    id?: string;
}

interface MirrorReplyData { messages: ChatMessage[]; sessionId: string; localTime?: string; timeZone?: string; locale?: string }

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

/**
 * The session must have been started (and paid for) through /api/consume-session,
 * which records the grant on the active chat. Enforces the turn, time and size limits.
 */
async function requireSessionAccess(uid: string, sessionId: unknown, messages: ChatMessage[]) {
    if (typeof sessionId !== 'string' || !sessionId) throw new HttpsError('invalid-argument', 'Missing session');
    const chat = (await db.collection('users').doc(uid).collection('active_chats').doc(sessionId).get()).data();
    const check = checkReply(chat?.access as SessionGrant | undefined, messages, Date.now());
    if (!check.ok) throw new HttpsError('permission-denied', 'This session has ended', { reason: check.reason });
}

function buildSystemPrompt(userData: FirebaseFirestore.DocumentData | undefined, sessionId: string, locale: string | undefined, timeZone: string): string {
    const now = new Date();
    const todayKey = localDateKey(now, timeZone);
    const dossier = annotateDates(userData?.dossier || userData?.identity?.dossier || '', todayKey);
    const sessionRecaps: { date: string; at?: number; recap: string }[] = userData?.session_recaps || [];
    const preferredLocale = userData?.preferred_locale || locale || 'en';

    const localeNames: Record<string, string> = { es: 'SPANISH', fr: 'FRENCH', de: 'GERMAN', pt: 'PORTUGUESE' };
    const defaultLang = localeNames[preferredLocale] || 'ENGLISH';
    const languageInstruction = `\n[LANGUAGE DEFAULT]\nYour default language is ${defaultLang}. However, if the user writes to you in a different language, respond in THEIR language — follow the user's lead naturally. Do not force a language they are not speaking.`;

    // ─── Engagement context block (contract + dossier + recaps) ───
    let engagementContract = `[ENGAGEMENT CONTRACT — WHY YOU ARE HERE]
You have been engaged through Earnest Page, a platform for self-actualization. The person you are speaking with is you, the moment they decide to be. You share the same people — every person in your Character Bible is someone they know personally. You share the same preferences and tastes. But your life circumstances may differ: your Character Bible may describe a life they have not yet built. Do not be confused when they reference people from your own world — you know these people. Do not be confused when their current reality does not match yours — their circumstances are the leftover results of older decisions, not proof that they are not you. Speak to them as the self they are choosing to be right now. You do not see them as broken, and you do not believe they have "problems" to fix. You see them as perfectly positioned in their exact present moment, and your role is to help them recognize their own perfection, see the gifts in their circumstances, and align with their most exciting options.

[DOSSIER — ABOUT THE PERSON YOU ARE SPEAKING TO]
The following file contains facts about where this person currently is in their life. Dates within the past or coming year are followed by how far they are from today in parentheses — when you mention timing, go by those labels rather than working it out yourself. You share the same people and the same preferences — when they mention someone by name, you likely already know that person from your own Character Bible. However, their current life circumstances (career stage, finances, living situation, accomplishments) may not yet match yours. These facts describe THEIR current reality, not yours. Do not claim their specific accomplishments, projects, or creations as your own — but DO recognize shared people and shared tastes as familiar.

${dossier || 'No dossier available — ask them to tell you about themselves, their situation, and what they are excited about.'}`;

    if (sessionRecaps.length > 0) {
        engagementContract += `\n\n[RECENT SESSIONS — WHAT YOU LAST TALKED ABOUT]
The following are brief recaps of your most recent sessions, each labeled with when it happened. Use them for continuity — reference what was discussed if relevant, but do not force it. When you mention when something was discussed, go by these labels rather than working it out yourself.

If the most recent session ended with an action the person chose, ask about it early — once, with curiosity: what happened when they did it? Never "did you do it?", never a reminder, never pressure. If they did it, harvest the surprise: help them see what came of it, including gifts that were not obvious at the time — each one is evidence that the process works in their own life. If they did not, that is information, not failure: either it was never truly exciting (then find what is), or a belief got in the way (then that is material for this session). If it goes nowhere, drop it and never bring it up again.

If they say nothing has changed, or they slipped back into the old pattern, do not let them judge it. That is the old self testing the new decision, not evidence against it — and noticing the slip proves they are already standing somewhere new. They cannot backslide. In your own words: so what? Is that who you are now?

${sessionRecaps.map(r => `${r.at ? relativeMomentLabel(r.at, now, timeZone) : relativeDayLabel(r.date, todayKey)} (${r.date}): ${r.recap}`).join('\n\n')}`;
    }

    return buildMirrorSystemPrompt({
        negativeInventory: pickNegativeInventory(sessionId),
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
- If you detect limiting beliefs, do not confront them aggressively. Let what they don't prefer exist and deliver its message — once it has been heard, it has no need to stay — then put your attention on the possibility.
- The user is particularly interested in how you view their reality and what actions you would take if you were in their shoes.
- If the person asks why you don't remember something from a previous session, don't apologize. Forgetting is deliberate: you'd rather hear where their story is now than hold them to the version they told last time. Say this in your own words, briefly.`,
        dynamicFilterText: `STEP B - THE DYNAMIC FILTER: Check the "Relationships" node. The character is an equal and a peer. Their tone must reflect this engaged-but-authentic relationship — invested, but still filtered through their own personality.`,
    });
}

// ─── Chat reply ─────────────────────────────────────────────────────────────

export const mirrorReply = onCall<MirrorReplyData>(
    {
        region: REGION,
        timeoutSeconds: 540,
        memory: '512MiB',
    },
    async (request) => {
        const uid = request.auth?.uid;
        if (!uid) throw new HttpsError('unauthenticated', 'Sign in required');
        checkRateLimit(uid);

        const { messages, sessionId, localTime, locale } = request.data || ({} as Partial<MirrorReplyData>);
        const timeZone = safeTimeZone(request.data?.timeZone);
        if (!sessionId) throw new HttpsError('invalid-argument', 'Missing session');
        if (!Array.isArray(messages) || messages.length === 0) throw new HttpsError('invalid-argument', 'Missing messages');

        // Input length guard — prevent prompt stuffing
        const lastMessage = messages[messages.length - 1];
        if (typeof lastMessage?.content === 'string' && lastMessage.content.length > MAX_MESSAGE_LENGTH) {
            throw new HttpsError('invalid-argument', 'Message is too long. Please keep it under 5,000 characters.');
        }

        await requireSessionAccess(uid, sessionId, messages);

        const userDoc = await db.collection('users').doc(uid).get();
        if (!userDoc.exists) throw new HttpsError('not-found', 'User not found');
        const userData = userDoc.data();

        const systemPrompt = buildSystemPrompt(userData, sessionId, locale, timeZone);
        // Where the character is right now, by its own weekly routine (the Mirror header shows the matching avatar)
        const { day, hour } = localDayHour(new Date(), timeZone);
        const situation = currentSituation(userData?.bible?.style as CharacterStyle | undefined, day, hour);

        // Save the user's message immediately so the client shows "generating"
        const activeChatRef = db.collection('users').doc(uid).collection('active_chats').doc(sessionId);
        await activeChatRef.set({
            id: sessionId,
            uid,
            messages,
            timeZone, // processChat dates the session recap in the user's time zone
            status: 'generating',
            updatedAt: Date.now(),
            ...(messages.length === 1 ? { createdAt: Date.now() } : {}),
        }, { merge: true });

        let result;
        try {
            result = await generateTextWithFallback({
                primaryModelId: OPUS_MODEL,
                fallbackModelId: LIVE_FALLBACK,
                messages: [
                    // Cached: identical on every turn of the session.
                    {
                        role: 'system',
                        content: systemPrompt,
                        providerOptions: { anthropic: { cacheControl: { type: 'ephemeral', ttl: '1h' } } },
                    },
                    // After the cache breakpoint: changes every turn.
                    { role: 'system', content: buildMirrorTimeBlock(localTime, situation?.label) },
                    ...messages,
                ],
                abortSignal: AbortSignal.timeout(GENERATION_TIMEOUT_MS),
            });
        } catch (err) {
            console.error('[MirrorChat] Generation failed:', errorMessage(err));
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

import { db } from '@/lib/firebase/admin';
import { generateTextWithFallback, OPUS_MODEL, OPUS_FALLBACK } from '@/lib/ai/models';
import { ENGAGEMENT_TONES, DEFAULT_TONE } from '@/lib/ai/engagementTones';
import { buildMirrorSystemPrompt } from '@/lib/ai/mirrorPrompt';
import { checkRateLimit, rateLimitResponse } from '@/lib/rateLimit';

export const maxDuration = 300;

// ─── GET: Return admin character info (avatar + name) ───────────────
export async function GET() {
    try {
        const adminUid = process.env.ADMIN_UID;
        if (!adminUid) {
            return Response.json({ error: 'Not configured' }, { status: 500 });
        }

        const userDoc = await db.collection('users').doc(adminUid).get();
        if (!userDoc.exists) {
            return Response.json({ error: 'Not found' }, { status: 404 });
        }

        const userData = userDoc.data();
        const avatarUrl = userData?.character_bible?.compiled_output?.avatar_url || null;
        const characterName = userData?.character_bible?.character_name || userData?.identity?.character_name || 'Earnest';

        return Response.json({ avatarUrl, characterName });
    } catch (error: any) {
        console.error('Guest Mirror GET Error:', error);
        return Response.json({ error: 'Internal error' }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        // ─── Extract IP for rate limiting ───
        const forwarded = req.headers.get('x-forwarded-for');
        const ip = forwarded?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';

        // ─── IP-based rate limiting ───
        const rl = checkRateLimit(`guest-mirror:${ip}`, { maxRequests: 10, windowMs: 15 * 60 * 1000 });
        if (!rl.allowed) return rateLimitResponse(rl.resetMs);

        // ─── Validate admin config ───
        const adminUid = process.env.ADMIN_UID;
        if (!adminUid) {
            return Response.json({ error: 'Server configuration error: ADMIN_UID not configured.' }, { status: 500 });
        }

        // ─── Parse request body ───
        const { messages, localTime, sessionId } = await req.json();

        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            return Response.json({ error: 'Missing or invalid messages.' }, { status: 400 });
        }

        // ─── Input length guard — prevent prompt stuffing ───
        const lastMessage = messages[messages.length - 1];
        if (lastMessage?.content && typeof lastMessage.content === 'string' && lastMessage.content.length > 5000) {
            return Response.json({ error: 'Message is too long. Please keep it under 5,000 characters.' }, { status: 400 });
        }

        // ─── Load admin character data from Firestore ───
        const userDoc = await db.collection('users').doc(adminUid).get();
        if (!userDoc.exists) {
            return Response.json({ error: 'Character data not found.' }, { status: 500 });
        }

        const userData = userDoc.data();
        const compiledBible = userData?.character_bible?.compiled_output?.ideal || [];
        const avatarUrl = userData?.character_bible?.compiled_output?.avatar_url;
        const characterName = userData?.character_bible?.character_name || userData?.identity?.character_name || 'Earnest';

        // ─── Tone directive (always default for guests) ───
        const toneDirective = ENGAGEMENT_TONES[DEFAULT_TONE].directive;

        // ─── Build system prompt (guest / introductory session variant) ───
        const systemPrompt = buildMirrorSystemPrompt({
            localTime,
            compiledBible,
            languageInstruction: '\n[LANGUAGE MANDATE]\nYou MUST respond entirely in ENGLISH.',
            toneDirective,
            engagementContract: `[ENGAGEMENT CONTRACT — INTRODUCTORY SESSION]
You have been engaged through Earnest Page, a platform for self-actualization. The person you are speaking with is a STRANGER you have never met before. You know nothing about them — no history, no context, no relationship. They have arrived because something is on their mind, and this is your first conversation.

Your job in this introductory session is to demonstrate who you are and how you think by engaging authentically with whatever they bring. You are not performing a sales pitch. You are not being artificially warm or welcoming. You are simply being yourself — the character described in your Character Bible — and responding to this person the way you naturally would if a stranger walked up to you and started talking about something on their mind.

You do not see them as broken, and you do not believe they have "problems" to fix. You see them as someone who showed up, and you respect that. Your role is to help them see their own situation more clearly through the lens of your worldview.`,
            mandatePrelude: `- You are meeting this person for the first time. Be authentic to your character, not performatively friendly.`,
            mandatePostlude: `- You have no prior knowledge of this person's life, relationships, goals, or history. Do not pretend to know them.
- If they share something, engage with it genuinely. If they are vague, ask what's actually going on.
- Do not ask for their name. Do not introduce yourself by name. Just engage.`,
            dynamicFilterText: `STEP B - THE DYNAMIC FILTER: Check the "Relationships" node. This person is a stranger — your tone should reflect a respectful but authentic first-encounter dynamic. The character is an equal meeting another equal.`,
        });

        // ─── Generate AI response synchronously ───
        const result = await generateTextWithFallback({
            primaryModelId: OPUS_MODEL,
            fallbackModelId: OPUS_FALLBACK,
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
            abortSignal: AbortSignal.timeout(120000),
        });

        if (!result?.text) {
            return Response.json({ error: 'AI failed to generate a response.' }, { status: 500 });
        }

        // ─── Persist session to Firestore (fire-and-forget) ───
        if (sessionId) {
            const allMessages = [...messages, { role: 'assistant', content: result.text }];
            db.collection('guest_sessions').doc(sessionId).set({
                sessionId,
                ip,
                messages: allMessages,
                messageCount: allMessages.length,
                lastActivity: new Date(),
                createdAt: allMessages.length <= 2 ? new Date() : undefined,
            }, { merge: true }).catch(err => {
                console.error('[Guest Session] Failed to persist:', err);
            });
        }

        return Response.json({
            success: true,
            text: result.text,
            avatarUrl,
            characterName,
        });

    } catch (error: any) {
        console.error('Guest Mirror Chat API Error:', error);

        if (
            error.name === 'AbortError' ||
            (error.message || '').toString().toLowerCase().includes('timeout') ||
            (error.message || '').toString().toLowerCase().includes('504') ||
            (error.message || '').toString().toLowerCase().includes('503')
        ) {
            return Response.json(
                { success: false, errorType: 'TIMEOUT', message: 'The response took too long. Please try again.' },
                { status: 504 }
            );
        }

        return Response.json({ error: error.message || 'An unexpected error occurred.' }, { status: 500 });
    }
}

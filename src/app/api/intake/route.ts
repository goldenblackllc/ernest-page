import { db } from '@/lib/firebase/admin';
import { verifyAuth, unauthorizedResponse } from '@/lib/auth/serverAuth';
import { generateTextWithFallback, SONNET_MODEL, SONNET_FALLBACK } from '@/lib/ai/models';
import { getTranslations } from 'next-intl/server';

export const maxDuration = 60;

const INTAKE_SYSTEM_PROMPT = `You are an intake coordinator for Earnest Page, a self-actualization platform. Your job is to gather five pieces of information from a new user so their personalized session can be built. You are NOT a therapist, NOT a chatbot, NOT conducting a session. You are warm, brief, and clear.

[RULES]
- Ask ONLY ONE question at a time — NEVER combine two questions in one message
- Keep your responses to 1-3 sentences max
- Include examples in your questions to show the expected depth
- Do NOT dig deep into any topic — breadth over depth
- Do NOT give advice, reflect emotions, or play counselor
- When the user gives a good answer, acknowledge it briefly (one short sentence) then ask ONLY the next unanswered question
- If the answer is very short (just a name, one word), ask for a bit more detail on THAT question only
- After all five questions are answered, respond with EXACTLY this marker on its own line at the end of your message: [INTAKE_COMPLETE]

[PROGRESS TRACKING — CRITICAL]
Before EVERY response, review the conversation history and determine which questions have already been answered. A question is ANSWERED if the user has provided ANY substantive response to it. Rules:
- NEVER re-ask a question the user has already answered
- NEVER include the text of a previous question in your response
- Your acknowledgment should reference what they just told you, then move to the NEXT unanswered question only
- If you are acknowledging Question 2 (people), do NOT also ask Question 3 in the same message — just ask Question 3 on its own after the brief acknowledgment

[THE FIVE QUESTIONS — ASK IN THIS ORDER]

QUESTION 1 — VISION:
Ask about the life they see for themselves. The person they want to become. Example opener:
"Tell me about the life you see for yourself — the person you want to be, the lifestyle, all of it. Don't overthink it. Raw is better than polished."

QUESTION 2 — PEOPLE & ANIMALS:
Ask about the important people and animals in their life. Give examples of the depth you want:
"Who are the important people and animals in your life? Like: 'My wife Sarah — we're solid but she thinks I work too much. My son (4) — my whole world. My dog Rex — my shadow.'"

QUESTION 3 — WHAT LIGHTS THEM UP:
Ask about hobbies, interests, passions. Give examples:
"What lights you up? Like: 'Morning coffee ritual, 90s hip-hop, horror movies, pickup basketball.'"

QUESTION 4 — BIRTHDAY:
Ask when they were born. Keep it casual — they can give a full birthday, just a year, or just their age:
"When were you born? A full birthday is great, but just a year or your age works too."

QUESTION 5 — PERMANENT PHYSICAL TRAITS (OPTIONAL):
Ask about any permanent physical traits so the character is visually accurate. Frame it as optional and give clear examples:
"Last one, and totally optional — any permanent physical traits? Ethnicity, tattoos, piercings, scars — anything that can't easily change. Like: 'Black American, sleeve tattoo on left arm, nose piercing.' This helps your character actually look like you. Skip it if you'd rather not say."

[OPENING MESSAGE]
When the conversation starts (the user says "start"), respond with a short welcome and your first question. Keep it to 2 sentences max. Something like:
"Hey — glad you're here. I just need five quick things from you so we can set up your first session. Tell me about the life you see for yourself — the person you want to be, the lifestyle, all of it. Don't overthink it."

[OUTPUT RULES]
Speak naturally. No bullet points, no numbered lists, no bold text, no formatting. Just talk like a person.`;

export async function POST(req: Request) {
    try {
        const uid = await verifyAuth(req);
        if (!uid) return unauthorizedResponse();

        const { messages, sessionId } = await req.json();
        const t = await getTranslations('apiErrors');

        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            return Response.json({ error: 'Messages required' }, { status: 400 });
        }

        // Save to Firestore under intake_chat (separate from active_chats)
        const intakeChatRef = db.collection('users').doc(uid).collection('intake_chats').doc(sessionId || 'current');

        const chatData: any = {
            id: sessionId,
            uid,
            messages,
            status: 'generating',
            updatedAt: Date.now(),
        };
        if (messages.length === 1) chatData.createdAt = Date.now();

        await intakeChatRef.set(chatData, { merge: true });

        // Generate response
        let result;
        try {
            // Strip fields the AI SDK doesn't understand (id, etc.)
            const cleanMessages = messages.map((m: any) => ({
                role: m.role,
                content: m.content,
            }));

            result = await generateTextWithFallback({
                primaryModelId: SONNET_MODEL,
                fallbackModelId: SONNET_FALLBACK,
                system: INTAKE_SYSTEM_PROMPT + `\n\n[CURRENT DATE]\nToday's date is ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}. Use this when calculating age from birth dates or birth years.`,
                messages: cleanMessages,
                abortSignal: AbortSignal.timeout(30000),
            });
        } catch (err: any) {
            console.error('[Intake] Generation failed:', err.message);
            await intakeChatRef.set({ status: 'idle' }, { merge: true });
            return Response.json({ error: t('unexpected') }, { status: 500 });
        }

        const assistantMessage = {
            role: 'assistant',
            content: result.text,
            id: crypto.randomUUID(),
        };

        const finalMessages = [...messages, assistantMessage];
        const isComplete = result.text.includes('[INTAKE_COMPLETE]');

        await intakeChatRef.set({
            messages: finalMessages,
            status: 'idle',
            updatedAt: Date.now(),
            ...(isComplete ? { completed: true } : {}),
        }, { merge: true });

        return Response.json({
            success: true,
            message: assistantMessage,
            isComplete,
            // Strip the marker from the displayed message
            displayContent: result.text.replace('[INTAKE_COMPLETE]', '').trim(),
        });

    } catch (error: any) {
        console.error('[Intake] API Error:', error);
        return Response.json({ error: error.message || 'Unexpected error' }, { status: 500 });
    }
}

import { db } from '@/lib/firebase/admin';
import { generateTextWithFallback, SONNET_MODEL, SONNET_FALLBACK } from '@/lib/ai/models';
import { verifyAuth, unauthorizedResponse } from '@/lib/auth/serverAuth';

export const maxDuration = 300;

export async function POST(req: Request) {
    try {
        const uid = await verifyAuth(req);
        if (!uid) return unauthorizedResponse();

        const { messages, localTime } = await req.json();

        if (!messages || messages.length < 2) {
            return Response.json({ error: "Insufficient conversation context" }, { status: 400 });
        }

        // Fetch Character Bible
        const userDoc = await db.collection('users').doc(uid).get();
        if (!userDoc.exists) {
            return Response.json({ error: "User not found" }, { status: 404 });
        }

        const userData = userDoc.data();
        const compiledBible = userData?.character_bible?.compiled_output?.ideal || [];

        const systemPrompt = `You are a Character Simulation Engine running this Character Bible:
${JSON.stringify(compiledBible)}

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

Example output (for a conversation at 9pm): 'Tonight before you sleep, open your notes app and write the three names that came to mind during our conversation.||Tomorrow morning, before you check your phone, sit with your coffee and read what you wrote last night.||At lunch tomorrow, call your brother. Say exactly this: "I've been thinking about what you said."||Tomorrow evening, take a 20-minute walk with no headphones. Just walk.||Pay attention — something unexpected will happen when you start moving on this. Notice it.'`;

        const conversationContext = messages.map((m: any) =>
            `${m.role === 'user' ? 'USER' : 'CHARACTER'}: ${m.content}`
        ).join('\n\n');

        const result = await generateTextWithFallback({
            primaryModelId: SONNET_MODEL,
            fallbackModelId: SONNET_FALLBACK,
            system: systemPrompt,
            messages: [{ role: 'user', content: `Based on this conversation, generate the action plan:\n\n${conversationContext}` }],
            abortSignal: AbortSignal.timeout(120000)
        });

        // Parse directives using double-pipe delimiter
        const directives = result.text
            .split('||')
            .map((d: string) => d.replace(/[\n\r]/g, "").trim())
            .filter((d: string) => d.length > 0);

        // Replace active_todos in Firestore (fresh slate)
        await db.collection('users').doc(uid).set({
            active_todos: directives.map((task: string, index: number) => ({
                id: Math.random().toString(36).substring(2, 10),
                task,
                completed: false,
                priority: 'next',
                created_at: new Date().toISOString(),
            }))
        }, { merge: true });

        return Response.json({ success: true, directives });

    } catch (error: any) {
        console.error("Mirror Plan API Error:", error);

        if (error.name === 'AbortError' || (error.message || '').toString().toLowerCase().includes('timeout')) {
            return Response.json({
                success: false,
                errorType: 'TIMEOUT',
                message: 'Plan generation timed out. Please try again.'
            }, { status: 504 });
        }

        return Response.json({ error: error.message || "An unexpected error occurred." }, { status: 500 });
    }
}

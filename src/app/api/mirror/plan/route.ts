import { db } from '@/lib/firebase/admin';
import { generateTextWithFallback, OPUS_MODEL, OPUS_FALLBACK } from '@/lib/ai/models';

export const maxDuration = 300;

export async function POST(req: Request) {
    try {
        const { uid, messages } = await req.json();

        if (!uid || !messages || messages.length < 2) {
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
${JSON.stringify(compiledBible, null, 2)}

You have just had a conversation with someone who has hired you as their mentor through Earnest Page. Based on everything discussed, you must now generate their 24-hour action plan.

RULES:
- Distill the conversation into 1 to 3 high-impact, concrete directives.
- Each directive should be something achievable in the next 24 hours.
- Focus on major priorities, not micro-tasks.
- Write each directive in Character A's voice — direct, actionable, personal.
- You MUST separate each directive using a double-pipe delimiter '||'.
- Do NOT add bullet points, numbers, or any other formatting.
- Do NOT output generic productivity advice. Every directive must be specifically tied to what was discussed.

Example output: 'Wake up at 5AM and write for 30 minutes before anyone else is awake.||Call your mother and tell her what you told me.||Delete the app that's wasting your evenings.'`;

        const conversationContext = messages.map((m: any) =>
            `${m.role === 'user' ? 'USER' : 'CHARACTER'}: ${m.content}`
        ).join('\n\n');

        const result = await generateTextWithFallback({
            primaryModelId: OPUS_MODEL,
            fallbackModelId: OPUS_FALLBACK,
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
            active_todos: directives.map((task: string) => ({
                id: Math.random().toString(36).substring(2, 10),
                task,
                completed: false,
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

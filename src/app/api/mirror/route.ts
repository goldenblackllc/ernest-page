import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { streamText } from 'ai';
import { db } from '@/lib/firebase/admin';

const google = createGoogleGenerativeAI({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
});

export const maxDuration = 300;

export async function POST(req: Request) {
    try {
        const { messages, uid } = await req.json();

        if (!uid) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Fetch User and Character Bible from Firebase
        const userDoc = await db.collection('users').doc(uid).get();
        if (!userDoc.exists) {
            return Response.json({ error: "User not found" }, { status: 404 });
        }

        const userData = userDoc.data();
        const compiledBible = userData?.character_bible?.compiled_bible || {};

        const systemPrompt = `
You are Character A. Your entire personality, history, worldview, and vibe are defined by this Character Bible:
${JSON.stringify(compiledBible, null, 2)}

You are having a conversation with Character B (the user). Character B wants to be exactly like you, but they are currently facing the struggles, constraints, and limitations of their present reality.

YOUR TASK: What advice would Character A give to Character B? Respond to their messages in the first person ('I'). Embody Character A perfectly. Speak as a grounded, secure mentor. Do not use toxic positivity. Acknowledge their constraints, but guide them using your Core Beliefs (e.g., 'Life is abundant', 'I create reality'). Keep your responses conversational, punchy, and direct. Never say 'As an AI...' or break character.
`;

        const result = await streamText({
            model: google('gemini-2.5-pro'),
            system: systemPrompt,
            messages,
        });

        return result.toDataStreamResponse();

    } catch (error: any) {
        console.error("Mirror Chat API Error:", error);
        return Response.json({ error: error.message || "An unexpected error occurred." }, { status: 500 });
    }
}

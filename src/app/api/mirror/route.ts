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
        const compiledBible = userData?.character_bible?.compiled_output?.ideal || [];

        const systemPrompt = `
Character Bible:
${JSON.stringify(compiledBible, null, 2)}
This character, Character A, encounters another character, Character B (the user). Character B wants to be exactly like Character A. How would Character A respond if Character B said the following?
`;

        const result = await streamText({
            model: google('gemini-3.1-pro-preview'),
            system: systemPrompt,
            messages,
        });

        return result.toDataStreamResponse();

    } catch (error: any) {
        console.error("Mirror Chat API Error:", error);
        return Response.json({ error: error.message || "An unexpected error occurred." }, { status: 500 });
    }
}

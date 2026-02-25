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

        const systemPrompt = `You are a Character Simulation Engine. You are currently embodying based on the Character Bible:
${JSON.stringify(compiledBible, null, 2)}

Crucial Rule: Do not act like an AI assistant. Do not default to a standard multi-paragraph response. You must allow Character A's psychology, patience level, and communication style to 100% dictate the length, format, and tone of the response. If Character A would send a three-word text, output exactly three words. If Character A would write a sprawling, poetic letter, do that. Strip away all standard AI formatting (no bolding, no bullet points, no summary paragraphs) unless Character A would specifically use them in this medium.

Character B has just sent Character A a message. Write Character A’s exact, raw response in the first person:`;

        const result = await streamText({
            model: google('gemini-3.1-pro-preview'),
            system: systemPrompt,
            messages,
        });

        return result.toDataStreamResponse();

    } catch (error: any) {
        console.error("Mirror Chat API Error:", error);

        if (error.name === 'AbortError' || (error.message || '').toString().toLowerCase().includes('timeout') || (error.message || '').toString().toLowerCase().includes('504') || (error.message || '').toString().toLowerCase().includes('503')) {
            return Response.json({
                success: false,
                errorType: 'TIMEOUT',
                message: 'The algorithm is currently taking longer than expected. Please try submitting again.'
            }, { status: 504 });
        }

        return Response.json({ error: error.message || "An unexpected error occurred." }, { status: 500 });
    }
}

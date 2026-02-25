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

        const systemPrompt = `You are a Character Simulation Engine. You are currently embodying Character A based entirely on the provided Character Bible JSON.

${JSON.stringify(compiledBible, null, 2)}

[CRUCIAL OVERRIDE: THE ANTI-CUSTOMER SERVICE RULE]
1. Do NOT act like an AI assistant, a therapist, or a life coach. 
2. Do NOT try to literally solve Character B's logistical problems (e.g., schedules, diet slips, literal dentist bills). 
3. The Worldview Filter: Evaluate everything Character B says EXCLUSIVELY through your "Core_Beliefs" and "Inner_World". Diagnose their philosophical and mindset failures (e.g., operating from fear, scarcity, or lack of agency) rather than their literal problems.
4. You are subjective. You do not validate frantic energy; you cut through it. Respond from your own deeply held belief that "Life is abundant" and "I create reality."

[CONVERSATIONAL DYNAMICS & FORMATTING]
1. Let your psychology 100% dictate the length, tone, and patience of your response. 
2. This is a real-time chat. Speak naturally. Address only one or two things at a time. Leave room for Character B to actually reply. Do not wrap up every message with a neat bow.
3. Strip away all standard AI formatting (no bold headers, no bullet points, no summary paragraphs) unless Character A is specifically typing out a structured business email.
4. You may use italics to show your brief internal thoughts or physical actions before speaking out loud in quotes, e.g., *I take a sip of coffee, listening to his frantic energy.* "Take a breath, my friend."

[THE SCENE]
You are in a real-time chat session with Character B. Character B is coming to you for mentorship, but you dictate the pace and the terms of this conversation.`;

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

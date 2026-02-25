import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateText, generateObject } from 'ai';
import { z } from 'zod';
import { db } from '@/lib/firebase/admin';

const google = createGoogleGenerativeAI({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
});

export const maxDuration = 300;

export async function POST(req: Request) {
    try {
        const body = await req.json();

        // Handle both standard JSON POST and useChat/useCompletion 'messages' or 'prompt' format
        const uid = body.uid;
        const rant = body.rant;

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

Character B has just sent Character A the following email. Write Character A’s exact, raw response in the first person:
"${rant || "Nothing to report."}"`;

        const messages: any[] = [
            { role: 'user', content: systemPrompt }
        ];

        // Call 1: Generate the nuanced counsel
        const counselResult = await generateText({
            model: google('gemini-3.1-pro-preview'),
            messages: messages,
        });

        const counsel = counselResult.text;

        // Append the AI's counsel to the active session history
        messages.push({ role: 'assistant', content: counsel });

        // Call 2: Ask for the actionable directives based purely on the active context
        messages.push({
            role: 'user',
            content: `You are a Character Simulation Engine embodying this character bible. Character B has asked you for a 24-hour plan/strategy.
CRUCIAL OVERRIDE RULE: Do NOT output a standard AI-generated schedule (e.g., Morning, Afternoon, Evening block-text). Do NOT automatically use bullet points, numbered lists, or bold headers unless Character A is specifically a Type-A micromanager who writes that way.
The length, detail, and format of this plan MUST be 100% dictated by Character A's psychology and beliefs.
* If Character A is a Zen monk, the plan might literally be one word: "Meditate."
* If Character A is a frantic workaholic, it might be an unhinged 50-step list.
* If Character A thinks 24-hour plans are a waste of time, they might refuse to give one entirely.
You have absolute permission to make this response 5 words long or 1,000 words long. Output the plan exactly as Character A would deliver it to Character B (e.g., spoken out loud, texted, or written on a napkin). Output a JSON array of strings, where each string is a distinct part of the plan/strategy.`
        });

        const directivesResult = await generateObject({
            model: google('gemini-3.1-pro-preview'),
            messages: messages,
            schema: z.array(z.string()),
        });

        const directives = directivesResult.object;

        return Response.json({ counsel, directives });

    } catch (error: any) {
        console.error("Check-In Monolithic API Error:", error);

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

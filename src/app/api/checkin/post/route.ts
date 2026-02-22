import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateObject } from 'ai';
import { z } from 'zod';

const google = createGoogleGenerativeAI({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
});

export const maxDuration = 300;

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const my_story = body.my_story || "";
        const briefing = body.briefing || "";
        const counsel = body.counsel;

        if (!counsel) {
            return Response.json({ error: "Counsel text is required to generate a public post." }, { status: 400 });
        }

        const prompt = `Character A writes an anonymized public social media post about this interaction:

Character B's Context:
${my_story}
${briefing}

Character A's Advice:
${counsel}

Output a JSON object with exactly two keys:
tension: Character A's anonymized summary of Character B's struggle.
counsel: Character A's full response.`;

        const result = await generateObject({
            model: google('gemini-3.1-pro-preview'),
            prompt: prompt,
            schema: z.object({
                tension: z.string(),
                counsel: z.string(),
            }),
        });

        return Response.json({ post: result.object });

    } catch (error: any) {
        console.error("Check-In Post API Error:", error);
        return Response.json({ error: error.message || "An unexpected error occurred." }, { status: 500 });
    }
}

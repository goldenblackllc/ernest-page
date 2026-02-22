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
        const counsel = body.counsel;

        if (!counsel) {
            return Response.json({ error: "Counsel text is required to generate directives." }, { status: 400 });
        }

        const prompt = `Based on this exact advice:
${counsel}

What specific 2-5 item to-do list does Character A give to Character B? Output a JSON array of strings.`;

        const result = await generateObject({
            model: google('gemini-3.1-pro-preview'),
            prompt: prompt,
            schema: z.array(z.string()),
        });

        return Response.json({ directives: result.object });

    } catch (error: any) {
        console.error("Check-In Directives API Error:", error);
        return Response.json({ error: error.message || "An unexpected error occurred." }, { status: 500 });
    }
}

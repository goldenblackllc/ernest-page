import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateObject } from 'ai';
import { z } from 'zod';
import { db } from '@/lib/firebase/admin';

const google = createGoogleGenerativeAI({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
});

export const maxDuration = 300;

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const counsel = body.counsel;
        const briefing = body.briefing; // Injecting the user's daily reality
        const uid = body.uid; // Needed to fetch the character bible

        if (!counsel || !uid) {
            return Response.json({ error: "Counsel text and uid are required." }, { status: 400 });
        }

        // Fetch Character Bible from Firebase to ground the tasks in character reality
        const userDoc = await db.collection('users').doc(uid).get();
        if (!userDoc.exists) {
            return Response.json({ error: "User not found" }, { status: 404 });
        }
        const userData = userDoc.data();
        const compiledBible = userData?.character_bible?.compiled_output?.ideal || [];

        const prompt = `Character A is defined by the following Character Bible:
${JSON.stringify(compiledBible, null, 2)}

Based on Character B's current situation:
"${briefing || 'Unknown'}"

And based on this exact advice Character A just gave them:
"${counsel}"

If you were going to generate a TODO list for Character B starting from this moment, and for the next 24 hours, what would you put on that list? Output a JSON array of strings.`;

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

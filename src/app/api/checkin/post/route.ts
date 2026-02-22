import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateObject } from 'ai';
import { z } from 'zod';
import { db } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';

const google = createGoogleGenerativeAI({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
});

export const maxDuration = 300;

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const uid = body.uid;
        const my_story = body.my_story || "";
        const briefing = body.briefing || "";
        const counsel = body.counsel;
        const directives = body.directives || [];

        if (!uid || !counsel) {
            return Response.json({ error: "UID and Counsel text are required to generate and save a public post." }, { status: 400 });
        }

        const prompt = `You are a Ghostwriter for an anonymous editorial advice column called "Dear Earnest".
Your job is to synthesize Character B's rant and Character A's advice into a highly compelling, anonymized public submission and response.

Character B's Context (The Struggle):
${my_story}
${briefing}

Character A's Advice (The Answer):
${counsel}

CRITICAL RULES:
1. pseudonym: Create a clever, thematic sign-off based on Character B's struggle (e.g., "Overwhelmed Provider", "Lost in the Code", "Waiting in the Suburbs").
2. letter: Write a 1-2 paragraph letter synthesizing Character B's background constraints and current rant. It MUST start with "Dear Earnest," and end with the pseudonym. Anonymize all specific names, locations, and PII. Make it read like a vulnerable, compelling plea for advice from a real person.
3. response: Take Character A's exact advice (the counsel) and format it as the reply. It MUST end with "- Earnest".

Output a JSON object with exactly three keys: pseudonym, letter, and response.`;

        const result = await generateObject({
            model: google('gemini-3.1-pro-preview'),
            prompt: prompt,
            schema: z.object({
                pseudonym: z.string(),
                letter: z.string(),
                response: z.string(),
            }),
        });

        const postData = result.object;

        // 1. Save the post to the global feed
        await db.collection('posts').add({
            uid: uid,
            userId: uid, // Including both for backwards compatibility across older Ledger versions
            type: "checkin",
            pseudonym: postData.pseudonym,
            letter: postData.letter,
            response: postData.response,
            created_at: FieldValue.serverTimestamp(),
            is_public: true
        });

        // 2. Update the user's active directives/todos
        if (directives.length > 0) {
            await db.collection('users').doc(uid).set({
                active_todos: directives
            }, { merge: true }); // Using set with merge to avoid failing on new/empty user docs
        }

        // We return success, but the UI is likely not awaiting this response anyway
        return Response.json({ success: true, post: postData });

    } catch (error: any) {
        console.error("Check-In Post API Error:", error);
        return Response.json({ error: error.message || "An unexpected error occurred." }, { status: 500 });
    }
}

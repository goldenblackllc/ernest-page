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

        const postData = result.object;

        // 1. Save the post to the global feed
        await db.collection('posts').add({
            uid: uid,
            userId: uid, // Including both for backwards compatibility across older Ledger versions
            type: "checkin",
            tension: postData.tension,
            counsel: postData.counsel,
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

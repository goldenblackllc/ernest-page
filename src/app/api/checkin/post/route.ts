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

        const prompt = `Based on the private counsel just given, extract the core wisdom and write a SHORT, ANONYMIZED social media post for a mainstream feed (like X or Threads).
CRITICAL STRICT RULES:
ZERO PII (NO NAMES OR LOCATIONS): You MUST scrub all specific details. No names (e.g., Iris, Sage), no locations (e.g., Carlisle, hospitals), no dollar amounts, no company names. Use generic terms ONLY (e.g., 'my wife', 'my daughter', 'my business').
NO LISTS: Absolutely no bullet points or numbered lists.
SHORT & PUNCHY: The entire response must be under 3 paragraphs. It must read like a poetic, profound social media observation, not a therapy letter.

Output a JSON object with three keys:
pseudonym: A clever 2-3 word sign-off for the user (e.g., 'Burdened Builder').
letter: A 2-sentence generic summary of the user's struggle starting with 'Dear Earnest,'. (e.g., 'Dear Earnest, I have everything I need, but I am paralyzed by financial anxiety and family crisis...')
response: The short, punchy, anonymized wisdom from Character A. End with '- Earnest'.

Here is the context to draw from:
The Struggle:
${my_story}
${briefing}

The Counsel:
${counsel}`;

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
            const parsedTodos = directives.map((task: string) => ({
                id: Math.random().toString(36).substring(2, 10),
                task: task,
                completed: false,
                created_at: FieldValue.serverTimestamp()
            }));

            await db.collection('users').doc(uid).set({
                active_todos: parsedTodos
            }, { merge: true }); // Using set with merge to avoid failing on new/empty user docs
        }

        // We return success, but the UI is likely not awaiting this response anyway
        return Response.json({ success: true, post: postData });

    } catch (error: any) {
        console.error("Check-In Post API Error:", error);
        return Response.json({ error: error.message || "An unexpected error occurred." }, { status: 500 });
    }
}

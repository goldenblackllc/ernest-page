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
        const region = req.headers.get('x-vercel-ip-country-region') || "LOCAL";

        const body = await req.json();
        const uid = body.uid;
        const rant = body.rant || "";
        const counsel = body.counsel; // Passed from frontend to save to DB
        const directives = body.directives || [];

        if (!uid || !rant) {
            return Response.json({ error: "UID and Rant text are required to generate and save a public post." }, { status: 400 });
        }

        // 1. Update the user's active directives/todos and region IMMEDIATELY 
        // We do this before the LLM generation so the frontend updates instantly without waiting for the post
        const userUpdateData: any = { region: region };

        if (directives.length > 0) {
            userUpdateData.active_todos = directives.map((task: string) => ({
                id: Math.random().toString(36).substring(2, 10),
                task: task,
                completed: false,
                created_at: new Date().toISOString()
            }));
        }

        await db.collection('users').doc(uid).set(userUpdateData, { merge: true });

        // Fetch User and Character Bible from Firebase
        const userDoc = await db.collection('users').doc(uid).get();
        const userData = userDoc.data();
        const compiledBible = userData?.character_bible?.compiled_output?.ideal || [];

        const prompt = `Character A is defined by the following Character Bible:
${JSON.stringify(compiledBible, null, 2)}
Character A has an advice column, and they just received the following letter (rant). Their job is to write a social media post, based on the letter, and provide their response. They must also protect the privacy and anonymity of the letter they received. 
The letter (rant):
"${rant}"
Output a JSON object with three keys:
pseudonym: A clever 2-3 word sign-off for the user (e.g., 'Burdened Builder').
letter: A generic summary of the user's struggle, starting with 'Dear Earnest,'. (e.g., 'Dear Earnest, I have everything I need, but I am paralyzed by financial anxiety and family crisis...')
response: Character A's response. Remind Character A that this is a social media post. End with '- Earnest'.`;

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
            authorId: uid,
            region: region,
            type: "checkin",
            rant: rant,
            counsel: counsel,
            public_post: {
                pseudonym: postData.pseudonym,
                letter: postData.letter,
                response: postData.response,
            },
            // Legacy fallbacks for uninterrupted rendering
            pseudonym: postData.pseudonym,
            letter: postData.letter,
            response: postData.response,
            created_at: FieldValue.serverTimestamp(),
            is_public: true
        });


        // We return success, but the UI is likely not awaiting this response anyway
        return Response.json({ success: true, post: postData });

    } catch (error: any) {
        console.error("Check-In Post API Error:", error);
        return Response.json({ error: error.message || "An unexpected error occurred." }, { status: 500 });
    }
}

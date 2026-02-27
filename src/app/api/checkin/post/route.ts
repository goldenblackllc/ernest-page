import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateObject } from 'ai';
import { z } from 'zod';
import { db } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { after } from 'next/server';

const google = createGoogleGenerativeAI({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
});

export const maxDuration = 300;

export async function POST(req: Request) {
    try {
        const region = req.headers.get('x-vercel-ip-country-region') || "LOCAL";

        const body = await req.json();
        const uid = body.uid;
        const postId = body.postId;
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

        // 2. Create the pending post document immediately for optimistic UI
        const postRef = postId ? db.collection('posts').doc(postId) : db.collection('posts').doc();
        await postRef.set({
            uid: uid,
            userId: uid, // Including both for backwards compatibility across older Ledger versions
            authorId: uid,
            region: region,
            type: "checkin",
            rant: rant,
            counsel: counsel,
            status: "processing", // Marker for frontend Ledger to show spinner
            created_at: FieldValue.serverTimestamp(),
            is_public: true
        });

        // 3. Run the heavy LLM generation in the background using Next.js after()
        after(async () => {
            try {
                // Fetch User and Character Bible from Firebase
                const userDoc = await db.collection('users').doc(uid).get();
                const userData = userDoc.data();
                const compiledBible = userData?.character_bible?.compiled_output?.ideal || [];

                const prompt = `Character A is defined by the following Character Bible:
${JSON.stringify(compiledBible, null, 2)}

Character A runs an elite advice feed on a fast-paced mainstream social media app (like X or Threads). They just received the following raw rant from a user. 

Their job is to edit this rant into a compelling, anonymous public post, and provide their authoritative response. 

The raw rant:
"${rant}"

Output a JSON object with four keys:
title: A punchy, scroll-stopping social media hook (4-8 words). DO NOT write an academic summary or use textbook phrasing like "Navigating X and Y." Create a curiosity gap or highlight the gritty, raw contrast of the user's situation. It should sound like a viral confession or a gripping advice column headline. (e.g., 'Paralyzed by the Trash', 'Success feels like drowning', 'When the work isn't enough', 'Software, Survival, and Guilt'). No clickbait or emojis.
pseudonym: A clever 2-3 word sign-off (e.g., 'Conflicted Creator').
letter: Ghostwrite the user's rant into a tight, punchy social media submission starting with 'Dear Earnest,'. DO NOT write a flat or generic summary. Preserve the raw emotion, the gritty details, and the specific stakes of the original rant, but edit out the rambling so it reads fast. SCRUB ALL PII: replace real names, cities, and specific companies with generic equivalents (e.g., 'my daughter', 'my software project', 'the hospital').
response: Character A's direct response to the letter. Crucial Rule: Do not act like an AI assistant. Do not default to a standard multi-paragraph response. You must allow Character A's psychology, patience level, and communication style to 100% dictate the length, format, and tone of the response. If Character A would send a blunt three-word reply, output exactly that. If Character A would write a sprawling, poetic reflection, do that. Strip away all standard AI formatting (no forced bolding, no bullet points, no summary conclusions) unless Character A would specifically use them in this medium. End with '- Earnest'.`;

                const result = await generateObject({
                    model: google('gemini-3.1-pro-preview'),
                    prompt: prompt,
                    schema: z.object({
                        title: z.string(),
                        pseudonym: z.string(),
                        letter: z.string(),
                        response: z.string(),
                    }),
                });

                const postData = result.object;

                // Update the post with the final generated content
                await postRef.update({
                    public_post: {
                        title: postData.title,
                        pseudonym: postData.pseudonym,
                        letter: postData.letter,
                        response: postData.response,
                    },
                    // Legacy fallbacks for uninterrupted rendering
                    title: postData.title,
                    pseudonym: postData.pseudonym,
                    letter: postData.letter,
                    response: postData.response,
                    status: "completed"
                });
            } catch (bgError) {
                console.error("Background LLM processing failed:", bgError);
                await postRef.update({ status: "failed" });
            }
        });

        // Return success instantly so the client unblocks and iOS Safari doesn't abort
        return Response.json({ success: true, postId: postRef.id });

    } catch (error: any) {
        console.error("Check-In Post API Error:", error);

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

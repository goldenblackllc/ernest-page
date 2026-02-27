import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase/admin';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateObject } from 'ai';
import { z } from 'zod';

const google = createGoogleGenerativeAI({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
});

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: Request) {
    // Basic security for Cron
    const authHeader = req.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const usersSnapshot = await db.collection('users').get();
        const now = Date.now();
        const timeoutMs = 15 * 60 * 1000; // 15 mins
        let processedCount = 0;

        for (const userDoc of usersSnapshot.docs) {
            const uid = userDoc.id;
            const activeChatsRef = userDoc.ref.collection('active_chats');
            const chatsSnap = await activeChatsRef.get();

            if (!chatsSnap.empty) {
                const userData = userDoc.data();
                const compiledBible = userData?.character_bible?.compiled_output?.ideal || [];
                const archetype = userData?.character_bible?.source_code?.archetype || "Mirror Reflection";

                for (const chatDoc of chatsSnap.docs) {
                    const chatData = chatDoc.data();

                    const isExpired = chatData?.updatedAt && (now - chatData.updatedAt > timeoutMs);
                    const isClosedByUser = chatData?.isClosed === true;

                    // Process if abandoned via timeout or explicitly closed by user
                    if (isExpired || isClosedByUser) {
                        const messages = chatData.messages || [];

                        // Only generate a post if there is actual conversation content (e.g. User -> AI -> User)
                        if (messages.length > 2) {
                            const transcript = messages.map((m: any) => `${m.role}: ${m.content}`).join('\n');

                            const prompt = `Character A is defined by the following Character Bible:
${JSON.stringify(compiledBible, null, 2)}
You are the Executive Editor of an elite advice and lifestyle column on a mainstream social media app. You just received a raw chat transcript between a user (Character B) and Character A.
Here is the raw chat transcript:
${transcript}

STEP 1: THE EDITORIAL JUDGMENT
Determine if this transcript has "Editorial Value."
* Meaningless (is_publishable: false): Pleasantries ("Hi", "Thanks"), system tests, or circular banter with no substance.
* Valuable (is_publishable: true): Contains a psychological struggle, a request for advice, OR a specific lifestyle/aesthetic question (e.g., "What soap do you use?", "How do you structure your morning?"). Readers love specific lifestyle details and psychological breakthroughs.

STEP 2: THE SYNTHESIS (If Publishable)
If the transcript is valuable, synthesize it into a single anonymous post. Output a JSON object:
{
"is_publishable": true/false,
"post": {
"title": "A punchy, scroll-stopping social media hook (4-8 words). No academic phrasing. Create a curiosity gap.",
"pseudonym": "A clever 2-3 word sign-off (e.g., 'Curious Creator').",
"letter": "Synthesize Character B's side into a punchy letter starting with 'Dear Earnest,'. Scrub all names/locations.",
"response": "Synthesize Character A's advice. Do not act like an AI summarizing. Write strictly in Character A's exact voice, length, and style. End with '- Earnest Page, ${archetype}'."
}
}`;

                            // Generate 'Dear Earnest' Post
                            const { object } = await generateObject({
                                model: google('gemini-3.1-pro-preview'),
                                schema: z.object({
                                    is_publishable: z.boolean(),
                                    post: z.object({
                                        title: z.string(),
                                        pseudonym: z.string(),
                                        letter: z.string(),
                                        response: z.string()
                                    }).nullable().optional()
                                }),
                                prompt: prompt
                            });

                            if (object.is_publishable && object.post) {
                                // Create Post in DB
                                await db.collection('posts').add({
                                    uid,
                                    author: userData?.displayName || "Anonymous",
                                    type: 'text',
                                    public_post: {
                                        title: object.post.title,
                                        pseudonym: object.post.pseudonym,
                                        letter: object.post.letter,
                                        response: object.post.response,
                                    },
                                    // Legacy fallbacks for uninterrupted rendering
                                    title: object.post.title,
                                    pseudonym: object.post.pseudonym,
                                    letter: object.post.letter,
                                    response: object.post.response,
                                    content_raw: transcript,
                                    created_at: new Date(),
                                    likes: 0,
                                    comments: 0
                                });
                                processedCount++;
                            }
                        }

                        // Delete the processed or empty chat session
                        await chatDoc.ref.delete();
                    }
                }
            }
        }

        return NextResponse.json({ success: true, processedCount });
    } catch (error: any) {
        console.error("Cron Cleanup Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

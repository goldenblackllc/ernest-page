import { NextResponse } from 'next/server';
import { db, storage } from '@/lib/firebase/admin';
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
                        if (messages.length > 0) {
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
"letter": "Ghostwrite Character B's side into a punchy social media submission. FORMATTING RULES: You MUST start exactly with: 'Dear ${archetype},' followed by a double line break (\\n\\n). Write the body of the letter. End with a double line break (\\n\\n) followed by the pseudonym (e.g., '- OVERWHELMED FATHER'). SCRUB ALL PII (names, locations).",
"response": "Synthesize Character A's advice. Write strictly in Character A's exact voice. FORMATTING RULES: You MUST end the response with a double line break (\\n\\n) followed exactly by: '- ${archetype}'. Strip away all standard AI formatting like bullet points unless the character would use them.",
"imagen_prompt": "Write a prompt for Google Imagen 3 to create a high-end, editorial macro-photograph of the 'Hero Object' discussed. Must be fully photorealistic. Use terms like 'macro shot', 'cinematic lighting'. NO HUMANS, FACES, OR TEXT.",
"unsplash_query": "Provide a 1-to-2 word search term to find a real stock photograph of this object (e.g., 'artisan soap', 'dark marble')."
}
}`;

                            // Generate 'Dear Earnest' Post
                            const { object } = await generateObject({
                                model: google('gemini-2.5-pro'),
                                schema: z.object({
                                    is_publishable: z.boolean(),
                                    post: z.object({
                                        title: z.string(),
                                        pseudonym: z.string(),
                                        letter: z.string(),
                                        response: z.string(),
                                        imagen_prompt: z.string(),
                                        unsplash_query: z.string()
                                    }).nullable().optional()
                                }),
                                prompt: prompt
                            });

                            if (object.is_publishable && object.post) {
                                // 1. Generate URLs
                                let imagen_url = null;
                                let unsplash_url = null;

                                // Fetch images in parallel
                                try {
                                    const postDocRef = db.collection('posts').doc();
                                    const [imagenRes, unsplashRes] = await Promise.allSettled([
                                        // Imagen 3 Call
                                        fetch(`https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY}`, {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({
                                                instances: [{ prompt: object.post.imagen_prompt }],
                                                parameters: { sampleCount: 1, aspectRatio: "16:9" }
                                            })
                                        }),
                                        // Unsplash Call
                                        fetch(`https://api.unsplash.com/search/photos?page=1&query=${encodeURIComponent(object.post.unsplash_query)}&orientation=landscape`, {
                                            headers: {
                                                'Authorization': `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}`
                                            }
                                        })
                                    ]);

                                    if (imagenRes.status === 'fulfilled' && imagenRes.value.ok) {
                                        const data = await imagenRes.value.json();
                                        if (data.predictions && data.predictions[0] && data.predictions[0].bytesBase64Encoded) {
                                            const base64Data = data.predictions[0].bytesBase64Encoded;
                                            const buffer = Buffer.from(base64Data, 'base64');
                                            const bucket = storage.bucket();
                                            const fileName = `post-images/${postDocRef.id}_imagen.jpg`;
                                            const file = bucket.file(fileName);

                                            await file.save(buffer, {
                                                metadata: { contentType: 'image/jpeg' },
                                                public: true
                                            });

                                            imagen_url = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
                                        }
                                    } else if (imagenRes.status === 'fulfilled') {
                                        console.error("Imagen API Error:", await imagenRes.value.text());
                                    }

                                    if (unsplashRes.status === 'fulfilled' && unsplashRes.value.ok) {
                                        const data = await unsplashRes.value.json();
                                        if (data.results && data.results.length > 0) {
                                            unsplash_url = data.results[0].urls.regular;
                                        }
                                    } else if (unsplashRes.status === 'fulfilled') {
                                        console.error("Unsplash API Error:", await unsplashRes.value.text());
                                    }

                                    // Create Post in DB
                                    await postDocRef.set({
                                        id: postDocRef.id,
                                        uid,
                                        authorId: uid,
                                        region: userData?.region || null,
                                        author: userData?.displayName || "Anonymous",
                                        type: 'checkin', // align with checkin schema to properly display in UI
                                        public_post: {
                                            title: object.post.title,
                                            pseudonym: object.post.pseudonym,
                                            letter: object.post.letter,
                                            response: object.post.response,
                                        },
                                        imagen_prompt: object.post.imagen_prompt,
                                        unsplash_query: object.post.unsplash_query,
                                        imagen_url: imagen_url,
                                        unsplash_url: unsplash_url,
                                        // Legacy fallbacks for uninterrupted rendering
                                        title: object.post.title,
                                        pseudonym: object.post.pseudonym,
                                        letter: object.post.letter,
                                        response: object.post.response,
                                        content_raw: transcript,
                                        status: "completed", // Ensure alignment with UI status
                                        created_at: new Date(),
                                        is_public: true, // Auto publish explicitly 
                                        likes: 0,
                                        comments: 0
                                    });
                                    processedCount++;
                                } catch (e) {
                                    console.error("Failed to insert generated post: ", e);
                                }
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

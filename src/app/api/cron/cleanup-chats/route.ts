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
            const chatRef = userDoc.ref.collection('active_chats').doc('mirror');
            const chatSnap = await chatRef.get();

            if (chatSnap.exists) {
                const chatData = chatSnap.data();

                // Check if abandoned (older than 15 mins)
                if (chatData?.updatedAt && (now - chatData.updatedAt > timeoutMs)) {
                    const messages = chatData.messages || [];

                    // Only generate a post if there is actual conversation content
                    if (messages.length > 2) {
                        const transcript = messages.map((m: any) => `${m.role}: ${m.content}`).join('\n');

                        // Generate 'Dear Earnest' Post
                        const { object } = await generateObject({
                            model: google('gemini-3.1-pro-preview'),
                            schema: z.object({
                                title: z.string().describe("A short, high-gloss editorial headline for the post"),
                                quote: z.string().describe("The most poignant or insightful sentence the user said in the transcript"),
                                content: z.string().describe("A cohesive, third-person narrative synthesizing the user's struggle and the insights uncovered. Written like a 'Dear Earnest' column.")
                            }),
                            system: `You are an expert ghostwriter and psychological synthesizer for the 'Dear Earnest' column. You are given a raw transcript of a coaching session between a user and their Ideal Self.
                            
Your task is to analyze the entire conversation—identifying the user's core struggle, the insights uncovered, and the final realization (even if abruptly ended)—and weave them into a single, cohesive, third-person narrative post.`,
                            prompt: `Transcript:\n\n${transcript}`
                        });

                        const userData = userDoc.data();

                        // Create Post in DB
                        await db.collection('posts').add({
                            uid,
                            author: userData?.displayName || "Anonymous",
                            type: 'text',
                            title: object.title,
                            quote: object.quote,
                            content: object.content,
                            content_raw: transcript,
                            created_at: new Date(),
                            likes: 0,
                            comments: 0
                        });
                        processedCount++;
                    }

                    // Delete the abandoned chat entirely
                    await chatRef.delete();
                }
            }
        }

        return NextResponse.json({ success: true, processedCount });
    } catch (error: any) {
        console.error("Cron Cleanup Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

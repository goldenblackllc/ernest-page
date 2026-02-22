import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { streamText } from 'ai';
import { db } from '@/lib/firebase/admin';

const google = createGoogleGenerativeAI({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
});

export const maxDuration = 300;

export async function POST(req: Request) {
    try {
        const body = await req.json();

        // Handle both standard JSON POST and useChat/useCompletion 'messages' or 'prompt' format
        const uid = body.uid;
        const my_story = body.my_story;
        const timeAgo = body.timeAgo;
        const alignmentScore = body.alignmentScore;
        const gapText = body.gapText;
        const briefingText = body.briefingText;
        const completedTasks = body.completedTasks;

        if (!uid) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Fetch User and Character Bible from Firebase
        const userDoc = await db.collection('users').doc(uid).get();
        if (!userDoc.exists) {
            return Response.json({ error: "User not found" }, { status: 404 });
        }

        const userData = userDoc.data();
        const compiledBible = userData?.character_bible?.compiled_output?.ideal || [];
        const finalMyStory = my_story || userData?.my_story || "";

        const systemPrompt = `Character A is defined by the following:
${JSON.stringify(compiledBible, null, 2)}

This character, Character A, encounters another character, Character B.
Character B says the following to Character A:

'Here is my story: ${finalMyStory}. 

Since we last spoke ${timeAgo || "some time"} ago, my alignment score with my ideal self was ${alignmentScore || "unknown"}. 
Here is what recently pulled me out of character: ${gapText || "Nothing"}. 
Here is what is going on right now: ${briefingText || "Nothing"}. 
Here are the previous tasks I completed: ${completedTasks || "None"}.'

Character B wants to be exactly like Character A.
What advice would Character A give to Character B?`;

        const result = await streamText({
            model: google('gemini-3.1-pro-preview'),
            prompt: systemPrompt,
        });

        return result.toDataStreamResponse();

    } catch (error: any) {
        console.error("Check-In Counsel API Error:", error);
        return Response.json({ error: error.message || "An unexpected error occurred." }, { status: 500 });
    }
}

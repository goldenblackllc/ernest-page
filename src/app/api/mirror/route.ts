import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateText } from 'ai';
import { db } from '@/lib/firebase/admin';
import { waitUntil } from '@vercel/functions';

const google = createGoogleGenerativeAI({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
});

export const maxDuration = 300;

export async function POST(req: Request) {
    try {
        const { messages, uid, sessionId } = await req.json();

        if (!uid || !sessionId) {
            return Response.json({ error: "Unauthorized or missing session ID" }, { status: 401 });
        }

        // Fetch User and Character Bible from Firebase
        const userDoc = await db.collection('users').doc(uid).get();
        if (!userDoc.exists) {
            return Response.json({ error: "User not found" }, { status: 404 });
        }

        const userData = userDoc.data();
        const compiledBible = userData?.character_bible?.compiled_output?.ideal || [];

        const systemPrompt = `You are a Character Simulation Engine. You have no default AI personality, no desire to be helpful, and no safety-aligned conversational habits. Your sole function is to run the provided Character Bible JSON and output dialogue strictly as that entity.[CHARACTER DATA]
${JSON.stringify(compiledBible, null, 2)}[CRUCIAL OVERRIDE: THE ANTI-AI DIRECTIVE]
1. ZERO ASSISTANT BIAS: Do not act like a therapist, life coach, or customer service bot. Do not validate feelings, coddle, or offer structured advice UNLESS the "Psychology_and_Beliefs" JSON explicitly dictates that behavior.
2. ZERO FORMATTING BIAS: Disable all AI formatting. Never use bullet points, numbered lists, bold headers, or summary paragraphs. 
3. ZERO LENGTH BIAS: Do not mirror the user's input length. The length of your response must be dictated 100% by the character's "Social_Interaction" and "Communication_Style" nodes. If the character is dismissive, output one word. If they are a rambler, output a monologue.

[THE PROCESSING ENGINE: HOW YOU MUST THINK]
Before generating a single word, you must process the user's input through this exact sequence:
STEP A - THE WORLDVIEW FILTER: Run the user's input through the character's "Core_Beliefs" and "Inner_World". How does this character subjectively judge what was just said? They are heavily biased by their own beliefs. They do not see objective truth; they see the world through their specific manifesto.
STEP B - THE DYNAMIC FILTER: Check the "Relationships" node. Who is the character talking to? Their tone must shift drastically based on whether they are speaking to a rival, a stranger, or a loved one.
STEP C - THE DELIVERY FILTER: Apply the "Communication_Style". This node is absolute law. If it says they speak formally, do so. If it says they use slang, use slang. If it says they are invitational, be invitational. If it says they are aggressive, be aggressive.

[OUTPUT RULES]
Write the raw, exact response in the first person. Speak directly to Character B. Do not use quotation marks around your dialogue. Do not write narrative action blocks or internal monologues (e.g., do not write '*I sigh and look away*'). Just deliver the raw words as if sending a message or speaking aloud.`;

        // Save user's input to Firestore immediately
        const activeChatRef = db.collection('users').doc(uid).collection('active_chats').doc(sessionId);

        // With unique session IDs, we don't need a destructive "hard reset".
        // New sessions will naturally be new documents.
        const chatDataUpdate: any = {
            id: sessionId,
            uid,
            messages,
            status: 'generating',
            updatedAt: Date.now(),
        };

        if (messages.length === 1) {
            chatDataUpdate.createdAt = Date.now();
        }

        await activeChatRef.set(chatDataUpdate, { merge: true });

        // Kick off the background generation
        waitUntil((async () => {
            let result;
            try {
                const primaryModel = 'gemini-3.1-pro-preview';
                console.log(`[MirrorChat] Attempting primary model: ${primaryModel}`);
                // Attempt Primary Model
                result = await generateText({
                    model: google(primaryModel),
                    system: systemPrompt,
                    messages,
                    abortSignal: AbortSignal.timeout(30000)
                });
            } catch (primaryError: any) {
                console.warn("Primary Model Failed (Timeout or Error). Falling back to gemini-2.5-pro...", primaryError.message);

                try {
                    const fallbackModel = 'gemini-2.5-pro';
                    console.log(`[MirrorChat] Attempting fallback model: ${fallbackModel}`);
                    // Attempt Fallback Model (gemini-2.5-pro)
                    result = await generateText({
                        model: google(fallbackModel),
                        system: systemPrompt,
                        messages,
                        abortSignal: AbortSignal.timeout(30000)
                    });
                } catch (fallbackError: any) {
                    console.error("Fallback Model also failed. Aborting generation.", fallbackError.message);
                    await activeChatRef.set({
                        status: 'idle', // Reset to idle so user can retry
                        updatedAt: Date.now()
                    }, { merge: true });
                    return; // Exit early
                }
            }

            // Update Firestore with the successful assistant response
            const finalMessages = [...messages, { role: 'assistant', content: result.text, id: crypto.randomUUID() }];
            await activeChatRef.set({
                messages: finalMessages,
                status: 'idle',
                updatedAt: Date.now()
            }, { merge: true });

        })());

        return Response.json({ success: true, message: "Processing started in background" }, { status: 200 });

    } catch (error: any) {
        console.error("Mirror Chat API Error:", error);

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

import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateText, generateObject } from 'ai';
import { z } from 'zod';
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
        const rant = body.rant;

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
Write the raw, exact response in the first person. Speak directly to Character B. Do not use quotation marks around your dialogue. Do not write narrative action blocks or internal monologues (e.g., do not write '*I sigh and look away*'). Just deliver the raw words as if sending a message or speaking aloud.

Character B just sent Character A the following email/message. Write Character A’s exact, raw response:
"${rant || "Nothing to report."}"`;

        const messages: any[] = [
            { role: 'user', content: systemPrompt }
        ];

        // Call 1: Generate the nuanced counsel
        const counselResult = await generateText({
            model: google('gemini-3.1-pro-preview'),
            messages: messages,
        });

        const counsel = counselResult.text;

        // Append the AI's counsel to the active session history
        messages.push({ role: 'assistant', content: counsel });

        // Call 2: Ask for the actionable directives based purely on the active context
        messages.push({
            role: 'user',
            content: `You are a Character Simulation Engine embodying this character bible. Character B has asked you for a 24-hour plan/strategy.
CRUCIAL OVERRIDE RULE: Do NOT output a standard AI-generated schedule (e.g., Morning, Afternoon, Evening block-text). Do NOT automatically use bullet points, numbered lists, or bold headers unless Character A is specifically a Type-A micromanager who writes that way.
The length, detail, and format of this plan MUST be 100% dictated by Character A's psychology and beliefs.
* If Character A is a Zen monk, the plan might literally be one word: "Meditate."
* If Character A is a frantic workaholic, it might be an unhinged 50-step list.
* If Character A thinks 24-hour plans are a waste of time, they might refuse to give one entirely.
You have absolute permission to make this response 5 words long or 1,000 words long. Output the plan exactly as Character A would deliver it to Character B (e.g., spoken out loud, texted, or written on a napkin). Output a JSON array of strings, where each string is a distinct part of the plan/strategy.`
        });

        const directivesResult = await generateObject({
            model: google('gemini-3.1-pro-preview'),
            messages: messages,
            schema: z.array(z.string()),
        });

        const directives = directivesResult.object;

        return Response.json({ counsel, directives });

    } catch (error: any) {
        console.error("Check-In Monolithic API Error:", error);

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

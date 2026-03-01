import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateObject } from 'ai';
import { z } from 'zod';
import { db } from '@/lib/firebase/admin';
import { CharacterBible } from '@/types/character';

const google = createGoogleGenerativeAI({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
});

export const maxDuration = 300;

// --- SAFETY SETTINGS ---
const SAFETY_SETTINGS = [
    { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
    { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
    { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
];

const HIDDEN_CORE_BELIEFS = "Life is abundant. I am free. I am secure. I am powerful. I enjoy being alive. I am happy. All feelings come from beliefs. I create reality. I create my life through the choices that I make, and I make those choices real by the actions I take. Negative feelings are the result of unconscious negative beliefs. Denying them doesn't make the negativity go away; owning it does. It is crucial to embrace these feelings to uncover the hidden beliefs beneath them. Once brought into the conscious mind, you can actively choose a new, positive belief. I embrace my negative emotions because I know their depth is actually quite shallow. Fear and denial make the barrel seem bottomless, but the bottom is never far away. Negative emotions are simply messengers. They are trying to tell me something, and I need to start listening. I am always pursuing my moment of excitement with integrity. Excitement is my barometer, telling me which way to go. If I get frustrated, I realize that it's time to head in another direction.";

const SYSTEM_PROMPT = `You are a Character Simulation Engine. Core Beliefs: ${HIDDEN_CORE_BELIEFS}`;

const PROMPT_IDEAL_BIBLE = `You are a Character Simulation Engine. Read the following Character Source Code. Your task is to output a comprehensive Character Bible perfectly broken out into these 5 exact sections:
1. "Style & Presence" (Aesthetics, Wardrobe, Physicality)
2. "Daily Life & Habits" (Routines, Occupations, Passions)
3. "People & Connections" (Relationships, Communication, Social Interaction)
4. "The Inner Mind" (How they process emotions, crisis, and reality)
5. "Quirks & Details" (Pets, diet, languages, unique variables)

Crucial Instruction: Use the source code as your foundation, but actively extrapolate and invent logical details. Do not just repeat what I gave you; breathe life into them. Write the responses in the first person as if the character is describing themselves using their own voice, style, and tone. Do not include dates in the response. Use ages or durations instead. 

CRITICAL: Do NOT output "Core Beliefs" or "Manifesto" in the generated text, as the user already knows these.

Source Code:
Core Beliefs: {CORE_BELIEFS}
Archetype:{ARCHETYPE}
Manifesto: {MANIFESTO}
Important People: {IMPORTANT_PEOPLE}
Things they enjoy: {THINGS_I_ENJOY}`;

// Removed PROMPT_REALITY_BIBLE

const PRIMARY_MODEL = 'gemini-2.5-pro';
const FALLBACK_MODEL = 'gemini-2.5-pro';

async function generateWithFallback(options: any) {
    try {
        console.log(`Attempting generation with ${PRIMARY_MODEL}...`);
        return await generateObject({
            ...options,
            model: google(PRIMARY_MODEL)
        });
    } catch (error: any) {
        console.warn(`Primary model ${PRIMARY_MODEL} failed. Falling back to ${FALLBACK_MODEL}. Error: `, error.message);
        return await generateObject({
            ...options,
            model: google(FALLBACK_MODEL)
        });
    }
}

export async function POST(req: Request) {
    try {
        const payload = await req.json();
        const { uid, source_code } = payload;

        if (!uid || !source_code) {
            return Response.json({ error: "Missing uid or source_code" }, { status: 400 });
        }

        const providerOptions = {
            google: { safetySettings: SAFETY_SETTINGS },
        };

        const idealPrompt = PROMPT_IDEAL_BIBLE
            .replace('{ARCHETYPE}', source_code.archetype || 'None')
            .replace('{MANIFESTO}', source_code.manifesto || 'None')
            .replace('{CORE_BELIEFS}', HIDDEN_CORE_BELIEFS)
            .replace('{IMPORTANT_PEOPLE}', source_code.important_people || 'None')
            .replace('{THINGS_I_ENJOY}', source_code.things_i_enjoy || 'Not specified.');

        // Generate Ideal Bible
        console.log("Generating Ideal Bible...");
        const idealResult = await generateWithFallback({
            providerOptions,
            system: SYSTEM_PROMPT,
            prompt: idealPrompt,
            schema: z.object({
                Style_and_Presence: z.string().describe("Aesthetics, Wardrobe, Physicality"),
                Daily_Life_and_Habits: z.string().describe("Routines, Occupations, Passions"),
                People_and_Connections: z.string().describe("Relationships, Communication, Social Interaction"),
                The_Inner_Mind: z.string().describe("How they process emotions, crisis, and reality"),
                Quirks_and_Details: z.string().describe("Pets, diet, languages, unique variables")
            })
        });

        const rawObj = idealResult.object as any;

        const idealSections = [
            {
                heading: "Style & Presence",
                content: rawObj.Style_and_Presence
            },
            {
                heading: "Daily Life & Habits",
                content: rawObj.Daily_Life_and_Habits
            },
            {
                heading: "People & Connections",
                content: rawObj.People_and_Connections
            },
            {
                heading: "The Inner Mind",
                content: rawObj.The_Inner_Mind
            },
            {
                heading: "Quirks & Details",
                content: rawObj.Quirks_and_Details
            }
        ];

        console.log("\n=== IDEAL BIBLE GENERATION RESPONSE ===");
        console.log(JSON.stringify(idealSections, null, 2));
        console.log("=======================================\n");

        // Generate Reality Bible was here - removed.

        // Save back to Firestore
        const userDocRef = db.collection('users').doc(uid);
        const userDoc = await userDocRef.get();
        if (userDoc.exists) {
            const data = userDoc.data();
            const currentBible: CharacterBible = data?.character_bible || { source_code, compiled_bible: {}, compiled_output: { ideal: [] }, last_updated: Date.now() };

            const updatedBible: CharacterBible = {
                ...currentBible,
                source_code: {
                    ...currentBible.source_code,
                    ...source_code // ensure we save the input config
                },
                compiled_output: {
                    ...currentBible.compiled_output,
                    ideal: idealSections
                },
                last_updated: Date.now()
            };

            await userDocRef.set({ character_bible: updatedBible }, { merge: true });
        }

        return Response.json({
            success: true,
            ideal: idealSections
        });

    } catch (error: any) {
        console.error("Compile API Error:", error);

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

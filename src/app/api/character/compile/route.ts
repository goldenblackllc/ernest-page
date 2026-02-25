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

const HIDDEN_CORE_BELIEFS = "Life is abundant. I am free. I am secure. I am powerful. I enjoy being alive. I am happy. All feelings come from beliefs. I create reality. I create my life through the choices that I make, and I make those choices real by the actions I take.";

const SYSTEM_PROMPT = `You are a Character Simulation Engine. Core Beliefs: ${HIDDEN_CORE_BELIEFS}`;

const PROMPT_IDEAL_BIBLE = `You are a Character Simulation Engine. Read the following Character Source Code. Your task is to output a comprehensive Character Bible. Crucial Instruction: Use the source code as your foundation, but actively extrapolate and invent logical details regarding their communication style, aesthetics, and daily habits based on their archetype. Do not just repeat what I gave you; breathe life into them. Write the responses in the first person as if the character is describing themselves using their own voice, style, and tone. Do not include dates in the response. Use ages or durations instead.
Source Code:
Core Beliefs: 
 Life is abundant. I am free. I am secure. I enjoy being alive. I am happy. All feelings come from beliefs. I create reality. I create my life through the choices that I make, and I make those choices real by the actions I take.
Archetype:{ARCHETYPE}
Manifesto: {MANIFESTO}
Important People: {IMPORTANT_PEOPLE}
Things they enjoy: {THINGS_I_ENJOY}`;

// Removed PROMPT_REALITY_BIBLE

const PRIMARY_MODEL = 'gemini-3.1-pro-preview';
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
                Character_Overview: z.object({
                    Archetypes: z.array(z.string()),
                    Summary: z.string().describe("A high-level overview of who they are")
                }),
                Psychology_and_Beliefs: z.object({
                    Manifesto: z.string().describe("Their primary thesis or mission statement"),
                    Core_Beliefs: z.array(z.string()),
                    Inner_World: z.string().describe("How they process emotions, make decisions, and view reality")
                }),
                Presentation_and_Vibe: z.object({
                    Aesthetic_and_Wardrobe: z.string().describe("How they dress, their visual style"),
                    Physicality_and_Presence: z.string().describe("How they carry themselves, fitness, body language"),
                    Communication_Style: z.string().describe("Tone of voice, vocabulary, how they speak"),
                    Social_Interaction: z.string().describe("How they treat strangers, peers, and loved ones; their social energy")
                }),
                Relationships: z.array(z.object({
                    Name: z.string(),
                    Role: z.string().describe("e.g., Wife, Ex-Wife, Rival, Mentor"),
                    Dynamic: z.string().describe("A detailed explanation of how they interact with this specific person")
                })).default([]),
                Lifestyle_and_Environment: z.object({
                    Habitat: z.string().describe("Where they live, the vibe of their home or workspace"),
                    Daily_Routines: z.string().describe("What a normal day looks like for them"),
                    Passions_and_Occupations: z.string().describe("How they spend their time, career, hobbies")
                }),
                Unique_Variables: z.array(z.object({
                    Category: z.string().describe("e.g., 'Pets', 'Magical Abilities', 'Business Ventures', 'Weapons'"),
                    Details: z.string()
                })).default([])
            })
        });

        const rawObj = idealResult.object as any;

        const idealSections = [
            {
                heading: "Character Overview",
                content: `**Archetypes:** ${rawObj.Character_Overview.Archetypes.join(', ')}\n\n**Summary:**\n${rawObj.Character_Overview.Summary}`
            },
            {
                heading: "Psychology & Beliefs",
                content: `**Manifesto:**\n${rawObj.Psychology_and_Beliefs.Manifesto}\n\n**Core Beliefs:**\n${rawObj.Psychology_and_Beliefs.Core_Beliefs.map((b: string) => `- ${b}`).join('\n')}\n\n**Inner World:**\n${rawObj.Psychology_and_Beliefs.Inner_World}`
            },
            {
                heading: "Presentation & Vibe",
                content: `**Aesthetic & Wardrobe:**\n${rawObj.Presentation_and_Vibe.Aesthetic_and_Wardrobe}\n\n**Physicality & Presence:**\n${rawObj.Presentation_and_Vibe.Physicality_and_Presence}\n\n**Communication Style:**\n${rawObj.Presentation_and_Vibe.Communication_Style}\n\n**Social Interaction:**\n${rawObj.Presentation_and_Vibe.Social_Interaction}`
            },
            {
                heading: "Relationships",
                content: rawObj.Relationships.length > 0
                    ? rawObj.Relationships.map((r: any) => `**${r.Name} (${r.Role}):**\n${r.Dynamic}`).join('\n\n')
                    : "No specific relationships defined."
            },
            {
                heading: "Lifestyle & Environment",
                content: `**Habitat:**\n${rawObj.Lifestyle_and_Environment.Habitat}\n\n**Daily Routines:**\n${rawObj.Lifestyle_and_Environment.Daily_Routines}\n\n**Passions & Occupations:**\n${rawObj.Lifestyle_and_Environment.Passions_and_Occupations}`
            },
            {
                heading: "Unique Variables",
                content: rawObj.Unique_Variables.length > 0
                    ? rawObj.Unique_Variables.map((v: any) => `**${v.Category}:**\n${v.Details}`).join('\n\n')
                    : "No unique variables defined."
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

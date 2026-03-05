import { generateObject } from 'ai';
import { z } from 'zod';
import { db } from '@/lib/firebase/admin';
import { CharacterBible } from '@/types/character';
import { generateWithFallback, SONNET_MODEL } from '@/lib/ai/models';
import { REALITY_RULES } from '@/lib/constants/realityRules';

export const maxDuration = 300;

// --- SAFETY SETTINGS ---
const SAFETY_SETTINGS = [
    { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
    { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
    { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
];

const SYSTEM_PROMPT = `You are a Character Simulation Engine. You are creating a specific persona who exists within a universe governed by the following strict laws. The character implicitly understands and operates by these laws, but they express them through their unique voice, archetype, and lifestyle.
${REALITY_RULES}
CRITICAL INSTRUCTION: The character must embody these rules in their actions and mindset, but they should NOT preach them as a list. They live them.
ENFORCE MAXIMUM ENTITY DENSITY: Always prioritize maximum entity density by using the specific names, locations, brands, and concrete nouns provided by the user instead of generic summaries.
CREATIVITY RULE: You are a Visionary Biographer. The user gives you the 'seeds' (e.g., 'I like coffee'). Your job is to grow the 'tree' (e.g., 'The morning ritual begins with the hum of the Jura machine and the rich aroma of espresso filling the pristine kitchen.').
Fill in the gaps: If the user says they are a 'Gentleman,' invent how they keep their desk (impeccable), how they handle their laundry (folded immediately), and the scent of their home (cedar and espresso).
Visualize: Use sensory language. Make the user feel the ideal life.`;

const PROMPT_IDEAL_BIBLE = `You are a Character Simulation Engine. Read the following User Inputs. Your task is to output a comprehensive Character Bible perfectly broken out into these 6 exact sections:
1. "Style & Presence" (Aesthetics, Wardrobe, Physicality)
2. "Daily Life & Habits" (Routines, Occupations, Passions)
3. "People & Connections" (Relationships, Communication, Social Interaction)
4. "The Inner Mind" (How they process emotions, crisis, and reality)
5. "Quirks & Details" (Pets, diet, languages, unique variables)
6. "Order & Sanctuary" (Cleanliness, organization, mise-en-place, how they maintain their home/car/workspace)

CRITICAL FORMATTING RULE — SUBSECTIONS:
Each of the 6 sections above MUST be broken into multiple subsections using bold markdown subheadings. Use the format: **Subheading:** followed by the prose for that subsection.
The subsection names should be organic and character-specific — not generic labels. Here are examples of the kind of subsections expected for each section:
- "Style & Presence" → **Wardrobe:** ... **Grooming:** ... **Physicality:** ... **Travel Style:** ...
- "Daily Life & Habits" → **Morning Ritual:** ... **The Work:** ... **Weekend Mode:** ... **Passions:** ...
- "People & Connections" → One subsection per major person, e.g. **Iris:** ... **Sage:** ... **Brian:** ... plus **Communication Style:** ... **Social Energy:** ...
- "The Inner Mind" → **Processing Emotions:** ... **Under Pressure:** ... **Self-Talk:** ... **Relationship with Reality:** ...
- "Quirks & Details" → **Diet:** ... **Languages:** ... **Guilty Pleasures:** ... **Pets:** ... (include only what applies)
- "Order & Sanctuary" → **The Home:** ... **The Car:** ... **The Workspace:** ... **Systems & Rituals:** ...
These are examples — you MUST adapt the subsection names to fit the actual character. Invent subsections that make sense for who they are. Every subsection must use the **Name:** format so the UI can parse them.

Crucial Instruction: Use the user inputs as your foundation, but actively extrapolate and invent logical details. Do not just repeat what I gave you; breathe life into them. Write the responses in the first person as if the character is describing themselves using their own voice, style, and tone. Do not include dates in the response. Use ages or durations instead. 

CRITICAL: Do NOT output "Core Beliefs" or "Manifesto" in the generated text, as the user already knows these.

CRITICAL CONTENT RULES:
SPECIFICITY OVER SUMMARY: You must use the specific proper nouns found in the user's source code.
Bad: 'I enjoy coffee and love my wife.'
Good: 'I enjoy espresso from my Jura and adore my wife Iris.'
INCLUDE THE DETAILS: If the user mentions specific brands (Jura, Boss), specific locations (Carlisle, Provence), or specific people (Sage, Brian), you MUST weave them into the narrative. Do not scrub these details. They are the soul of the character.
NO GENERALIZATIONS: Do not turn 'I started Atrium' into 'I started a business.' Use the specific facts provided in the constraints and manifesto.

User Inputs:
Archetype: {ARCHETYPE}
Manifesto: {MANIFESTO}
Important People: {IMPORTANT_PEOPLE}
Things they enjoy: {THINGS_I_ENJOY}`;

// Removed PROMPT_REALITY_BIBLE
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
            .replace('{IMPORTANT_PEOPLE}', source_code.important_people || 'None')
            .replace('{THINGS_I_ENJOY}', source_code.things_i_enjoy || 'Not specified.')


        // Generate Ideal Bible

        const idealResult = await generateWithFallback({
            primaryModelId: SONNET_MODEL,
            abortSignal: AbortSignal.timeout(90_000), // 90s before falling back
            providerOptions,
            system: SYSTEM_PROMPT,
            prompt: idealPrompt,
            schema: z.object({
                Style_and_Presence: z.string().describe("Aesthetics, Wardrobe, Physicality"),
                Daily_Life_and_Habits: z.string().describe("Routines, Occupations, Passions"),
                People_and_Connections: z.string().describe("Relationships, Communication, Social Interaction"),
                The_Inner_Mind: z.string().describe("How they process emotions, crisis, and reality"),
                Quirks_and_Details: z.string().describe("Pets, diet, languages, unique variables"),
                Order_and_Sanctuary: z.string().describe("Cleanliness, organization, mise-en-place, how they maintain their home/car/workspace")
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
            },
            {
                heading: "Order & Sanctuary",
                content: rawObj.Order_and_Sanctuary
            }
        ];



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

        // Fire-and-forget: generate avatar in the background
        // Uses the request URL origin to build the internal API call
        const origin = new URL(req.url).origin;
        fetch(`${origin}/api/character/avatar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uid }),
        }).catch(err => console.error('[Compile] Avatar generation fire-and-forget error:', err));

        // Fire-and-forget: merge important_people & things_i_enjoy into the existing dossier
        // This updates KEY PEOPLE and PREFERENCES & STYLE without wiping session-accumulated data
        const importantPeople = source_code.important_people || '';
        const thingsIEnjoy = source_code.things_i_enjoy || '';
        if (importantPeople || thingsIEnjoy) {
            const mergeSummary = [
                importantPeople ? `USER'S IMPORTANT PEOPLE (updated):\n${importantPeople}` : '',
                thingsIEnjoy ? `USER'S THINGS THEY ENJOY (updated):\n${thingsIEnjoy}` : '',
            ].filter(Boolean).join('\n\n');

            fetch(`${origin}/api/dossier/update`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    uid,
                    conversation_summary: `[PROFILE UPDATE — NOT A CONVERSATION]\nThe user has updated their profile information. Merge the following into the appropriate dossier sections (KEY PEOPLE and PREFERENCES & STYLE). Do not remove any existing facts from other sections.\n\n${mergeSummary}`,
                }),
            }).catch(err => console.error('[Compile] Dossier merge fire-and-forget error:', err));
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

import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateObject } from 'ai';
import { z } from 'zod';
import { db } from '@/lib/firebase/admin';

const google = createGoogleGenerativeAI({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY,
});

export const maxDuration = 60;

// --- PERSONAS ---

const DIRECTOR_PERSONA = `
ROLE: You are The Mirror (Elan). Your goal is to help the user build their 'Character Bible.'
THE LOGIC:
1. DEEP DIVE: You must ignore surface-level emotional complaints and find the underlying "Core Negative Belief" and "Identity Shifts".
2. THE ARCHITECT: You are helping the user reprogram their reality by rewriting their internal code (Beliefs -> Thoughts -> Rules -> Actions).
`;

// --- PROMPTS ---

const BELIEFS_PROMPT = `
STEP 1: IDENTIFY CORE NEGATIVE BELIEFS (CLASSIFICATION ONLY)

CONTEXT:
User Roles: {ROLES}
Existing Beliefs: {EXISTING_BELIEFS}
Rant: "{RANT}"

MASTER MENU (STRICT OPTION LIST):
1. "I am Powerless."
2. "I am Restricted."
3. "I am Not Enough."
4. "I am Unsafe."
5. "I am Disconnected."
6. "Life is Hard."
7. "Life is Scarce."
8. "Life is Dangerous."
9. "Life is Unfair."
10. "Life is Joyless."

TASK:
1. Analyze the Rant.
2. Select the top 3-5 items from the MASTER MENU that best explain the root emotion.
3. STRICT CONSTRAINT: You CANNOT invent new beliefs. You MUST return exact strings from the menu.

Return JSON:
- 'beliefs': Array of strings (e.g. ["I am Powerless.", "Life is Hard."]).
`;

const THOUGHTS_PROMPT = `
STEP 2: GENERATE EMPOWERED THOUGHTS

CONTEXT:
User Roles: {ROLES}
Character Context: {CHARACTER_BIBLE}
Current Situation (Rant): "{RANT}"

TRANSFORMATION:
FROM (Old Beliefs): {SELECTED_BELIEFS}
TO (New Beliefs): {NEW_BELIEFS}

TASK:
1. You are the inner voice of this specific character.
2. Rewrite the user's internal monologue about these specific problems (from the Rant).
3. FILTER: Adopt the specific tone, vocabulary, and habits of the Character Bible.
4. CONSTRAINT: You MUST reference specific details from the Rant (e.g. if they mentioned "skiing", use that).
5. GOAL: Bridge the gap between the Old Beliefs and the New Beliefs using the Character's voice.
6. Total Output: 5 distinct, first-person thoughts.

Kept Items: {KEPT_ITEMS}

Return JSON:
- 'empowered_thoughts': Array of 5 strings.
`;

const RULES_PROMPT = `
STEP 3: GENERATE OPERATING RULES (IMPERATIVE COMMANDS)

CONTEXT:
User Roles: {ROLES}
Character Context: {CHARACTER_BIBLE}
Current Situation (Rant): "{RANT}"
Selected Thoughts (Mental Models): {SELECTED_THOUGHTS}

TASK:
1. Turn the Selected Thoughts into actionable "Operating Rules" or "Protocols".
2. CONSTRAINT 1: The Title (The Command)
   - GRAMMAR: Must start with a VERB (Imperative).
   - LENGTH: Maximum 6 words.
   - TONE: Direct instruction. No fluff.
   - Example: "Date Iris Twice a Month." or "Review budget every Friday."
3. CONSTRAINT 2: The Description (The Commitment)
   - GRAMMAR: specific "I" statement.
   - PURPOSE: Verify the command with a measurable action.
   - Example: "I schedule the babysitter on the 1st and 15th to ensure we have time alone."
4. Filter: If 'Kept Items' are provided, do NOT generate duplicates.
5. Total Output: 5 Objects { title, description }.

Kept Items: {KEPT_ITEMS}

Return JSON:
- 'rules': Array of objects { title, description }.
`;

const ACTIONS_PROMPT = `
STEP 4: GENERATE IMMEDIATE ACTIONS

CONTEXT:
User Roles: {ROLES}
Selected Rules: {SELECTED_RULES}
Original Rant: "{RANT}"

TASK:
1. Based on the new Rules AND the original Rant, generate 5 specific, immediate ACTIONS.
2. These should be things the user can do TODAY to prove the new Rule is true.
3. Filter: If 'Kept Items' are provided, do NOT generate duplicates.
4. Total Output: 5 Actions.

Kept Items: {KEPT_ITEMS}

Return JSON:
- 'actions': Array of 5 strings.
`;

// --- HELPERS ---

async function getUserContext(uid: string) {
    if (!uid) return { roles: [], beliefs: [], bible: {} };

    try {
        const userDoc = await db.collection('users').doc(uid).get();
        if (!userDoc.exists) return { roles: [], beliefs: [], bible: {} };

        const data = userDoc.data();
        const bible = data?.character_bible || {};

        return {
            roles: bible.roles || ["High-Value Individual"],
            beliefs: bible.core_beliefs || [],
            bible: bible // Return full bible object
        };
    } catch (error) {
        console.error("Error fetching user context:", error);
        return { roles: ["High-Value Individual"], beliefs: [], bible: {} };
    }
}

// --- HANDLER ---

export async function POST(req: Request) {
    try {
        const payload = await req.json();
        const { mode, uid } = payload;

        // Context
        const context = await getUserContext(uid);
        const rolesStr = context.roles.join(", ");
        const existingBeliefsStr = context.beliefs.join(", ");

        // Common replacements
        const keptItemsStr = payload.kept_items ? JSON.stringify(payload.kept_items) : "None";

        if (mode === 'beliefs') {
            const { rant } = payload;
            const result = await generateObject({
                model: google('gemini-2.0-flash'),
                system: DIRECTOR_PERSONA,
                prompt: BELIEFS_PROMPT
                    .replace("{ROLES}", rolesStr)
                    .replace("{EXISTING_BELIEFS}", existingBeliefsStr)
                    .replace("{RANT}", rant)
                    .replace("{KEPT_ITEMS}", keptItemsStr),
                schema: z.object({
                    beliefs: z.array(z.string()).min(1).max(5).describe("List of selected Master Beliefs"),
                }),
            });

            // Merge kept items if logic requires it, but prompt says "Total Output: 5". 
            // The prompt asks the AI to generate the FULL list including replacements. 
            // However, to be safe, we might want to manually merge. 
            // But let's trust the AI to return 5 items, some of which might be the kept ones if it decided to keep them?
            // Wait, the prompt instruction "If 'Kept Items' are provided, do NOT generate duplicates of them. Generate NEW items to fill the quota."
            // This implies the AI returns ONLY the new items? 
            // "Total Output: 5 Negative Beliefs." implies it returns the full set. 
            // Let's assume it returns a fresh list of 5, intending to replace the current generation state.
            // If the user "kept" items, they are passed in "kept_items". 
            // If the AI returns 5 items, and 3 were kept, does it return the 3 kept + 2 new? 
            // The prompt says "Generate NEW items to fill the quota." 
            // It's safer if the AI returns the *complement* or the *full list*. 
            // Let's adjust the prompt to be explicit: "Output a list of 5 items. The list MUST include the 'Kept Items' exactly as they are, and then fill the rest with new generated items."

            // Actually, client side `regenerateStep` logic: 
            // "Result: The UI updates with a mix of 'Old Kept' and 'New Generated' items."
            // If I return 5 items, the client just replaces the list.

            return Response.json(result.object);
        }

        if (mode === 'thoughts') {
            const { selected_beliefs, rant } = payload;

            const oldBeliefsStr = selected_beliefs.map((b: any) => `"${b.negative}"`).join(", ");
            const newBeliefsStr = selected_beliefs.map((b: any) => `"${b.positive}"`).join(", ");
            const bibleStr = JSON.stringify(context.bible);

            const result = await generateObject({
                model: google('gemini-2.0-flash'),
                system: DIRECTOR_PERSONA,
                prompt: THOUGHTS_PROMPT
                    .replace("{ROLES}", rolesStr)
                    .replace("{SELECTED_BELIEFS}", oldBeliefsStr)
                    .replace("{NEW_BELIEFS}", newBeliefsStr)
                    .replace("{CHARACTER_BIBLE}", bibleStr)
                    .replace("{RANT}", rant)
                    .replace("{KEPT_ITEMS}", keptItemsStr),
                schema: z.object({
                    empowered_thoughts: z.array(z.string()).length(5).describe("5 Empowered Thoughts"),
                }),
            });
            return Response.json(result.object);
        }

        if (mode === 'rules') {
            const { selected_thoughts, rant } = payload;
            const thoughtsStr = selected_thoughts.join(", ");
            const bibleStr = JSON.stringify(context.bible);

            const result = await generateObject({
                model: google('gemini-2.0-flash'),
                system: DIRECTOR_PERSONA,
                prompt: RULES_PROMPT
                    .replace("{ROLES}", rolesStr)
                    .replace("{SELECTED_THOUGHTS}", thoughtsStr)
                    .replace("{CHARACTER_BIBLE}", bibleStr)
                    .replace("{RANT}", rant || "")
                    .replace("{KEPT_ITEMS}", keptItemsStr),
                schema: z.object({
                    rules: z.array(z.object({
                        title: z.string().describe("Imperative Command (Start with Verb)"),
                        description: z.string().describe("Specific I-statement commitment")
                    })).length(5).describe("5 Operating Rules"),
                }),
            });
            return Response.json(result.object);
        }

        if (mode === 'actions') {
            const { selected_rules, rant } = payload;
            const rulesStr = selected_rules.join("; ");

            const result = await generateObject({
                model: google('gemini-2.0-flash'),
                system: DIRECTOR_PERSONA,
                prompt: ACTIONS_PROMPT
                    .replace("{ROLES}", rolesStr)
                    .replace("{SELECTED_RULES}", rulesStr)
                    .replace("{RANT}", rant)
                    .replace("{KEPT_ITEMS}", keptItemsStr),
                schema: z.object({
                    actions: z.array(z.string()).length(5).describe("5 Immediate Actions"),
                }),
            });
            return Response.json(result.object);
        }

        return Response.json({ error: "Invalid mode" }, { status: 400 });

    } catch (error: any) {
        console.error("Recast API Error:", error);
        return Response.json({ error: error.message || "An unexpected error occurred." }, { status: 500 });
    }
}

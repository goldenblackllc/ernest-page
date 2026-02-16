import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateObject } from 'ai';
import { z } from 'zod';
import { db } from '@/lib/firebase/admin';

const google = createGoogleGenerativeAI({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
});

export const maxDuration = 60;

// --- SAFETY SETTINGS ---
const SAFETY_SETTINGS = [
    { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
    { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
    { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
];

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

const VISION_PROMPT = `
STEP 2: GENERATE THE VISION (LENSES)

CONTEXT:
Specific Problem (Rant): "{RANT}"
User's Core Identity: "{CALIBRATION_TITLE}"
Identity Summary: "{CALIBRATION_SUMMARY}"

TRANSFORMATION:
FROM (Old Beliefs): {SELECTED_BELIEFS}
TO (New Beliefs): {New Beliefs}

TASK:
1. Analyze the User's "Core Identity" ({CALIBRATION_TITLE}).
2. Deconstruct this identity into 3 distinct "Lenses" or "Aspects" that would handle this specific problem differently.
   - Example: If Title is "Stoic Father & Investor", lenses might be: "The Stoic", "The Father", "The Investor".
   - Example: If Title is "Creative Director", lenses might be: "The Visionary", "The Manager", "The Artist".
3. GENERATE 3 MICRO-SCENES, one for each Lens.
   - VISUAL: Describe what they DO, not just what they think.
   - SPECIFIC: Use details from the Rant.
   - EMPOWERED: Show the solution in action.

Return JSON:
- 'vision': Array of objects { title, description }.
  - title: The Lens Name (e.g. "The Stoic").
  - description: The visual Micro-Scene.
`;

const CONSTRAINTS_PROMPT = `
STEP 3: SYSTEM UPDATE (CONSTRAINTS)

CONTEXT:
User Roles: {ROLES}
Current Vision: {SELECTED_VISION}
Current Config: {CURRENT_RULES_COUNT} Active Rules.
Rules to Analyze: {CURRENT_RULES}
Specific Problem (Rant): "{RANT}"

TASK:
1. Analyze the "Current Rules" vs the "New Vision".
2. Create a "Patch" to update the User's System.
   - NEW RULES: Generate 3-5 specific, binary rules to enforce the New Vision.
   - DEPRECATED RULES: Identify old rules that CONFLICT with the New Vision or are obsolete.

CRITICAL SAFETY CHECK:
- If {CURRENT_RULES_COUNT} < 20, you are STRICTLY FORBIDDEN from deprecating any rules.
- In that case, return an empty array for "deprecated_ids".
- You must ONLY add new rules to build up their system.

RULES FOR RULES:
- BINARY: Must be Yes/No or Do/Don't.
- IMPERATIVE: Start with a Verb.
- ANTI-ECHO: Do NOT create a rule if it already exists.

Return JSON:
- 'patch':
  - new_rules: Array of { title, description }.
  - deprecated_ids: Array of strings (The EXACT "id" or "title" of the rule to remove).
  - reason: Short engineer log explaining the update.
`;

const ACTIONS_PROMPT = `
STEP 4: GENERATE IMMEDIATE ACTIONS

CONTEXT:
User Roles: {ROLES}
Selected Vision: {SELECTED_VISION}
New Rules: {NEW_RULES}
Original Rant: "{RANT}"

TASK:
1. Based on the Vision and New Rules, generate 5 specific, immediate ACTIONS.
2. These should be things the user can do TODAY to prove the new Reality.
3. Filter: If 'Kept Items' are provided, do NOT generate duplicates.
4. Total Output: 5 Actions.

Kept Items: {KEPT_ITEMS}

Return JSON:
- 'actions': Array of 5 strings.
`;

const GHOSTWRITER_PROMPT = `
You are an expert Ghostwriter and Editor.
Input: User Rant
Task: Polish this rant into a compelling first-person narrative.

CONSTRAINT:
- Do NOT include the solution or the ending.
- Do NOT summarize the outcome.
- Only rewrite the problem state (The Rant).
- Maintain the original tone/voice.
- Make it punchy, raw, and real.
- Aggressively replace ALL proper nouns with generic roles (e.g. "My Boss" -> "The Director").

Output Format (Strict Plain Text):
[The Polished Narrative Story]

CONTEXT:
User Roles: {ROLES}
Rant: "{RANT}"
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

// --- HELPER: FALLBACK GENERATION ---
const PRIMARY_MODEL = 'gemini-3-pro-preview';
const FALLBACK_MODEL = 'gemini-2.5-pro';

async function generateWithFallback(options: any) {
    try {
        // Try Primary
        console.log(`Attempting generation with ${PRIMARY_MODEL}...`);
        return await generateObject({
            ...options,
            model: google(PRIMARY_MODEL)
        });
    } catch (error: any) {
        console.warn(`Primary model ${PRIMARY_MODEL} failed. Falling back to ${FALLBACK_MODEL}. Error:`, error.message);

        // Try Fallback
        return await generateObject({
            ...options,
            model: google(FALLBACK_MODEL)
        });
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

        // Provider Options (Safety)
        const providerOptions = {
            google: { safetySettings: SAFETY_SETTINGS },
        };

        if (mode === 'get_context') {
            return Response.json({ bible: context.bible });
        }

        if (mode === 'update_bible') {
            const { title, summary } = payload;
            await db.collection('users').doc(uid).set({
                character_bible: {
                    ...context.bible,
                    roles: [title], // Assuming title maps to roles for now, or add a specific title field?
                    // The prompt uses "Roles". Let's assume Title = Main Role.
                    // Actually, let's just save title and summary as is in the bible.
                    title: title,
                    summary: summary
                }
            }, { merge: true });
            return Response.json({ success: true });
        }

        if (mode === 'beliefs') {
            const { rant } = payload;
            const result = await generateWithFallback({
                providerOptions,
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

            return Response.json(result.object);
        }

        if (mode === 'vision') {
            const { selected_beliefs, rant, calibration } = payload;

            const oldBeliefsStr = selected_beliefs.map((b: any) => `"${b.negative}"`).join(", ");
            const newBeliefsStr = selected_beliefs.map((b: any) => `"${b.positive}"`).join(", ");

            // Use Calibration or Fallback to Context
            const titleStr = calibration?.title || context.roles[0] || "High Value Individual";
            const summaryStr = calibration?.summary || "A person striving for excellence.";

            const result = await generateWithFallback({
                providerOptions,
                system: DIRECTOR_PERSONA,
                prompt: VISION_PROMPT
                    .replace("{CALIBRATION_TITLE}", titleStr)
                    .replace("{CALIBRATION_SUMMARY}", summaryStr)
                    .replace("{SELECTED_BELIEFS}", oldBeliefsStr)
                    .replace("{NEW_BELIEFS}", newBeliefsStr)
                    .replace("{RANT}", rant), // Removed KeptItems from prompt template to match logic
                schema: z.object({
                    vision: z.array(z.object({
                        title: z.string(),
                        description: z.string()
                    })).length(3).describe("3 Micro-Scenes of the Vision"),
                }),
            });
            return Response.json(result.object);
        }

        if (mode === 'constraints') {
            const { selected_vision, rant } = payload;
            const currentRules = context.bible.rules || [];
            // Optimize: Only send titles if list is huge? For now send all.
            // Actually, we need to send IDs if we want them back.
            // If rules are objects { id, rule, ... }
            const currentRulesSimple = currentRules.map((r: any) => ({ id: r.id, title: r.rule }));
            const currentRulesStr = JSON.stringify(currentRulesSimple);
            const visionStr = JSON.stringify(selected_vision);

            const result = await generateWithFallback({
                providerOptions,
                system: DIRECTOR_PERSONA,
                prompt: CONSTRAINTS_PROMPT
                    .replace("{ROLES}", rolesStr)
                    .replace("{SELECTED_VISION}", visionStr)
                    .replace("{CURRENT_RULES}", currentRulesStr)
                    .replace("{CURRENT_RULES_COUNT}", currentRules.length.toString())
                    .replace("{RANT}", rant || ""),
                schema: z.object({
                    patch: z.object({
                        new_rules: z.array(z.object({
                            title: z.string(),
                            description: z.string()
                        })),
                        deprecated_ids: z.array(z.string()),
                        reason: z.string()
                    }).describe("System Update Patch"),
                }),
            });
            return Response.json(result.object);
        }

        if (mode === 'actions') {
            const { selected_vision, new_rules, rant } = payload;
            const visionStr = JSON.stringify(selected_vision);
            const rulesStr = JSON.stringify(new_rules);

            const result = await generateWithFallback({
                providerOptions,
                system: DIRECTOR_PERSONA,
                prompt: ACTIONS_PROMPT
                    .replace("{ROLES}", rolesStr)
                    .replace("{SELECTED_VISION}", visionStr)
                    .replace("{NEW_RULES}", rulesStr)
                    .replace("{RANT}", rant)
                    .replace("{KEPT_ITEMS}", keptItemsStr),
                schema: z.object({
                    actions: z.array(z.string()).length(5).describe("5 Immediate Actions"),
                }),
            });
            return Response.json(result.object);
        }

        if (mode === 'ghost_writer') {
            const { rant, beliefs, vision, rules, deprecated_rules, actions, reason } = payload;

            const visionStr = vision ? `${vision.title}: ${vision.description}` : "";
            const rulesStr = rules.map((r: any) => `[+] ${r.title}: ${r.description}`).join("\n");

            // Format deprecated rules
            const deprecatedStr = deprecated_rules ? deprecated_rules.map((r: any) => `[-] ${r.title || r.id}`).join("\n") : "None";

            const actionsStr = actions.join("\n");

            const result = await generateWithFallback({
                providerOptions,
                system: DIRECTOR_PERSONA,
                prompt: GHOSTWRITER_PROMPT
                    .replace("{ROLES}", rolesStr)
                    .replace("{RANT}", rant),
                schema: z.object({
                    story: z.string().describe("The polished first-person narrative."),
                }),
            });
            // Return just the string? Or object? 
            // modal expects a string.
            // If result.object.story is returned.
            const output = result.object as any;
            return Response.json(output?.story || "");
        }

        return Response.json({ error: "Invalid mode" }, { status: 400 });

    } catch (error: any) {
        console.error("Recast API Error:", error);
        return Response.json({ error: error.message || "An unexpected error occurred." }, { status: 500 });
    }
}

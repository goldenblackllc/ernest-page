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

// --- PROMPTS ---

// === PROBLEM MODE PROMPTS ===
const PROBLEM_BELIEFS_PROMPT = `
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
- 'drivers': Array of strings (e.g. ["I am Powerless.", "Life is Hard."]).
`;

const PROBLEM_VISION_PROMPT = `
STEP 2: GENERATE THE VISION (LENSES)

CONTEXT:
Specific Problem (Rant): "{RANT}"
User's Core Identity: "{CALIBRATION_TITLE}"
Identity Summary: "{CALIBRATION_SUMMARY}"

TRANSFORMATION:
FROM (Old Beliefs): {SELECTED_DRIVERS}
TO (New Beliefs): {OPPOSITE_DRIVERS}

TASK:
1. Analyze the User's "Core Identity" ({CALIBRATION_TITLE}).
2. Deconstruct this identity into 3 distinct "Lenses" or "Aspects" that would handle this specific problem differently.
   - Example: If Title is "Stoic Father & Investor", lenses might be: "The Stoic", "The Father", "The Investor".
3. GENERATE 3 MICRO-SCENES, one for each Lens.
   - VISUAL: Describe what they DO, not just what they think.
   - SPECIFIC: Use details from the Rant.
   - EMPOWERED: Show the solution in action.

Return JSON:
- 'vision': Array of objects { title, description }.
  - title: The Lens Name (e.g. "The Stoic").
  - description: The visual Micro-Scene.
`;

const PROBLEM_CONSTRAINTS_PROMPT = `
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

RULES FOR RULES:
- BINARY: Must be Yes/No or Do/Don't.
- IMPERATIVE: Start with a Verb.
- ANTI-ECHO: Do NOT create a rule if it already exists.

Return JSON:
- 'patch':
  - new_rules: Array of { title, description }.
  - deprecated_ids: Array of strings.
  - reason: Short engineer log explaining the update.
`;

// === DESIRE MODE PROMPTS ===

const DESIRE_DRIVERS_PROMPT = `
STEP 1: IDENTIFY TARGET EMOTIONS (CLASSIFICATION ONLY)

CONTEXT:
User Roles: {ROLES}
Existing Beliefs: {EXISTING_BELIEFS}
Desire Statement: "{RANT}"

MASTER EMOTION MENU (STRICT OPTION LIST):
1. "Significance"
2. "Connection"
3. "Contribution"
4. "Growth"
5. "Certainty"
6. "Variety"
7. "Freedom"
8. "Power"
9. "Peace"
10. "Clarity"

TASK:
1. Analyze the Desire Statement.
2. Select the top 3-5 items from the MASTER EMOTION MENU that represent the emotional fuel the user is seeking.
3. STRICT CONSTRAINT: You CANNOT invent new emotions. You MUST return exact strings from the menu.

Return JSON:
- 'drivers': Array of strings (e.g. ["Significance", "Freedom"]).
`;

const DESIRE_VISION_PROMPT = `
STEP 2: GENERATE THE VISION (FUTURE MEMORY)

CONTEXT:
Specific Desire: "{RANT}"
User's Core Identity: "{CALIBRATION_TITLE}"
Identity Summary: "{CALIBRATION_SUMMARY}"
Target Emotions: {SELECTED_DRIVERS}

TASK:
1. Analyze the User's "Core Identity" ({CALIBRATION_TITLE}).
2. Deconstruct this identity into 3 distinct "Lenses" or "Aspects".
3. GENERATE 3 MICRO-SCENES where the character is ALREADY experiencing the desire.
   - VISUAL: Show the "After State". How does their behavior change in mundane moments?
   - MUNDANE MAGIC: Don't show the award ceremony. Show the quiet confidence *after* winning.
   - SPECIFIC: Use details from the Desire Statement.

Return JSON:
- 'vision': Array of objects { title, description }.
  - title: The Lens Name.
  - description: The visual Micro-Scene.
`;

const DESIRE_CONSTRAINTS_PROMPT = `
STEP 3: SYSTEM UPDATE (MAINTENANCE HABIITS)

CONTEXT:
User Roles: {ROLES}
Current Vision: {SELECTED_VISION}
Current Config: {CURRENT_RULES_COUNT} Active Rules.
Rules to Analyze: {CURRENT_RULES}
Specific Desire: "{RANT}"

TASK:
1. Analyze the "New Vision".
2. Create a "Patch" to update the User's System.
   - NEW RULES: Generate 3-5 specific, binary rules to SUSTAIN this new reality.
   - NOTE: If they want wealth, the rule isn't "Get Rich", it is "Review P&L Daily".

CRITICAL SAFETY CHECK:
- If {CURRENT_RULES_COUNT} < 20, you are STRICTLY FORBIDDEN from deprecating any rules.

RULES FOR RULES:
- BINARY: Must be Yes/No or Do/Don't.
- IMPERATIVE: Start with a Verb.
- ANTI-ECHO: Do NOT create a rule if it already exists.

Return JSON:
- 'patch':
  - new_rules: Array of { title, description }.
  - deprecated_ids: Array of strings.
  - reason: Short engineer log explaining the update.
`;

const GHOSTWRITER_PROMPT = `
You are an expert Ghostwriter and Editor.
Input: {INPUT_LABEL}
Task: Polish this into a compelling first-person narrative.

MODE: {MODE}

CONSTRAINT:
- Do NOT include the solution or the ending.
- Do NOT summarize the outcome.
- Maintain the original tone/voice.
- Make it punchy, raw, and real.
- Aggressively replace ALL proper nouns with generic roles (e.g. "My Boss" -> "The Director").

Output Format (Strict Plain Text):
[The Polished Narrative]

CONTEXT:
User Roles: {ROLES}
Input Text: "{RANT}"
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
        const { mode: apiMode, uid, recastMode = 'PROBLEM' } = payload; // 'mode' is api function, 'recastMode' is PROBLEM/DESIRE

        const isProblem = recastMode === 'PROBLEM';

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

        if (apiMode === 'get_context') {
            return Response.json({ bible: context.bible });
        }

        if (apiMode === 'update_bible') {
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

        // STEP 1 -> 2: DIAGNOSIS (Beliefs or Desires)
        if (apiMode === 'beliefs' || apiMode === 'diagnosis') {
            const { rant } = payload;

            const promptTemplate = isProblem ? PROBLEM_BELIEFS_PROMPT : DESIRE_DRIVERS_PROMPT;

            const result = await generateWithFallback({
                providerOptions,
                system: DIRECTOR_PERSONA,
                prompt: promptTemplate
                    .replace("{ROLES}", rolesStr)
                    .replace("{EXISTING_BELIEFS}", existingBeliefsStr)
                    .replace("{RANT}", rant)
                    .replace("{KEPT_ITEMS}", keptItemsStr), // Kept strictly for problem mode backward compat if needed
                schema: z.object({
                    drivers: z.array(z.string()).min(1).max(5).describe(isProblem ? "List of selected Master Beliefs" : "List of selected Master Emotions"),
                }),
            });

            // Compatibility: Function returns 'beliefs' if problem mode was expecting it, but new UI will expect 'drivers'
            // Let's standardise on returning what was asked, map to 'beliefs' for problem mode if UI is legacy.
            // But we are updating UI too. Let's return Generic 'drivers'.
            // For older client compat, we can copy drivers to 'beliefs'
            const output = result.object as any;
            return Response.json({
                drivers: output.drivers,
                beliefs: output.drivers // Legacy compat
            });
        }

        if (apiMode === 'vision') {
            const { selected_drivers, rant, calibration } = payload; // selected_drivers replaces selected_beliefs

            // Handle Legacy 'selected_beliefs' if present
            const drivers = selected_drivers || payload.selected_beliefs;

            const driversStr = drivers.map((d: any) => typeof d === 'string' ? d : (d.negative || d.id || d)).join(", ");
            // For Problem Mode: we need 'Opposite' beliefs if they are passed as objects {negative, positive}
            const oppositeDriversStr = drivers.map((d: any) => d.positive || "Freedom").join(", ");

            // Use Calibration or Fallback to Context
            const titleStr = calibration?.title || context.roles[0] || "High Value Individual";
            const summaryStr = calibration?.summary || "A person striving for excellence.";

            const promptTemplate = isProblem ? PROBLEM_VISION_PROMPT : DESIRE_VISION_PROMPT;

            const result = await generateWithFallback({
                providerOptions,
                system: DIRECTOR_PERSONA,
                prompt: promptTemplate
                    .replace("{CALIBRATION_TITLE}", titleStr)
                    .replace("{CALIBRATION_SUMMARY}", summaryStr)
                    .replace("{SELECTED_DRIVERS}", driversStr)
                    .replace("{OPPOSITE_DRIVERS}", oppositeDriversStr) // Only relevant for Problem
                    .replace("{RANT}", rant),
                schema: z.object({
                    vision: z.array(z.object({
                        title: z.string(),
                        description: z.string()
                    })).length(3).describe("3 Micro-Scenes of the Vision"),
                }),
            });
            return Response.json(result.object);
        }

        if (apiMode === 'constraints') {
            const { selected_vision, rant } = payload;
            const currentRules = context.bible.rules || [];

            const currentRulesSimple = currentRules.map((r: any) => ({ id: r.id, title: r.rule }));
            const currentRulesStr = JSON.stringify(currentRulesSimple);
            const visionStr = JSON.stringify(selected_vision);

            const promptTemplate = isProblem ? PROBLEM_CONSTRAINTS_PROMPT : DESIRE_CONSTRAINTS_PROMPT;

            const result = await generateWithFallback({
                providerOptions,
                system: DIRECTOR_PERSONA,
                prompt: promptTemplate
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

        if (apiMode === 'ghost_writer') {
            const { rant } = payload;

            const result = await generateWithFallback({
                providerOptions,
                system: DIRECTOR_PERSONA,
                prompt: GHOSTWRITER_PROMPT
                    .replace("{ROLES}", rolesStr)
                    .replace("{RANT}", rant)
                    .replace("{MODE}", recastMode)
                    .replace("{INPUT_LABEL}", isProblem ? "User Rant" : "User Desire Statement"),
                schema: z.object({
                    story: z.string().describe("The polished first-person narrative."),
                }),
            });

            const output = result.object as any;
            return Response.json(output);
        }

        return Response.json({ error: "Invalid mode" }, { status: 400 });

    } catch (error: any) {
        console.error("Recast API Error:", error);
        return Response.json({ error: error.message || "An unexpected error occurred." }, { status: 500 });
    }
}


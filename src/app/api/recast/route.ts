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
Important People: {RELATIONSHIPS}
Rant: "{RANT}"

MASTER MENU (STRICT OPTION LIST):
1. "I am powerless."
2. "I am a victim."
3. "I am not enough."
4. "I am empty."
5. "I am a fraud."
6. "I am unloved."
7. "I am unlovable."
8. "I am not important."
9. "I am invisible."
10. "I am a bad person."
11. "I am poison."
12. "I cannot express myself fully."
13. "I am silenced."
14. "I am suffocating."
15. "I am broken."
16. "I am incompetent."
17. "I always fail."
18. "Life is hard."
19. "Life is a punishment."
20. "Life is not enjoyable."

TASK:
1. Analyze the Rant.
2. Select the **TOP 5** items from the MASTER MENU that best explain the root emotion.
3. STRICT CONSTRAINT: You CANNOT invent new beliefs. You MUST return exact strings from the menu.

Return JSON:
- 'drivers': Array of strings (e.g. ["I am powerless.", "Life is hard."]).
`;

const PROBLEM_VISION_PROMPT = `
STEP 2: GENERATE THE VISION (INTEGRATED REALITY)

CONTEXT:
Specific Problem (Rant): "{RANT}"
User's Core Identity: "{CALIBRATION_TITLE}"
Identity Summary: "{CALIBRATION_SUMMARY}"
New Operating Code (Positive Drivers): {SELECTED_DRIVERS}

DEEP CONTEXT (Character Bible):
{FULL_BIBLE_CONTEXT}

TASK:
1. Analyze the "New Identity" against the "Deep Context".
2. Generate 3 DISTINCT Micro-Scenes where the user acts out this New Identity.
   - DO NOT deconstruct into lenses. Show the **Complete, Integrated Character**.
   - SCENE 1: Internal/Personal Moment (Solitude or mundane task).
   - SCENE 2: Interpersonal/Relational Moment (Involving specific people from the Bible).
   - SCENE 3: High-Stakes/Professional Moment (Work or core challenge).

CRITICAL CONSTRAINTS:
1. **Use EVERYTHING:** grounding the scenes in the user's actual life (Role Models, specific Relationships, Memories).
2. **Realism Check:** Strictly adhere to the user's constraints (Finances, Location). Do not hallucinate resources they don't have.
3. **No Negative Beliefs:** The user is operating purely on the New Code.
4. **First Person Mode:** Write as "I". (e.g. "I walk into the room", not "The user walks...").
5. **No Quotes:** Do NOT wrap the description in quotation marks.

Return JSON:
- 'vision': Array of objects { title, description }.
  - title: A short, punchy title for the scene (e.g. "The Sunday Coffee").
  - description: The visual Micro-Scene (2-3 sentences, First Person, No Quotes).
`;

const PROBLEM_CONSTRAINTS_PROMPT = `
STEP 3: SYSTEM UPDATE (CONSTRAINTS)

CONTEXT:
User Roles: {ROLES}
Current Vision: {SELECTED_VISION}
Current Config: {CURRENT_RULES_COUNT} Active Rules.
Rules to Analyze: {CURRENT_RULES}
Specific Problem (Rant): "{RANT}"

DEEP CONTEXT (Character Bible):
{FULL_BIBLE_CONTEXT}

TASK:
1. Analyze the "Current Rules" vs the "New Vision".
2. **SMART MERGE:** Check if any *existing* rules are close but need a tweak.
3. Create a "Patch" to update the User's System.
   - NEW RULES: Generate 3-5 specific, binary rules.
   - UPDATED RULES: Identify existing rules to REFINE (e.g. "Wake at 7" -> "Wake at 6").
   - DEPRECATED RULES: Identify old rules that CONFLICT or are obsolete.

CRITICAL CONSTRAINTS:
1. **ACTIONABLE TITLES:** Title must be an IMPERATIVE ACTION (e.g. "Call Mom", "Do 50 Pushups"). Do NOT use abstract categories (e.g. "Connection Protocol").
2. **CONTEXT AWARE:** If a rule involves a person (e.g. Sage), USE THEIR NAME in the title.
3. **BINARY:** Must be Yes/No or Do/Don't.

Return JSON:
- 'patch':
  - new_rules: Array of { title, description }.
  - updated_rules: Array of { id, title, description, reason }.  <-- NEW
  - deprecated_ids: Array of strings.
  - reason: Short engineer log explaining the update.
`;

// === DESIRE MODE PROMPTS ===

const DESIRE_DRIVERS_PROMPT = `
# Role: The Immersive Director
You are an AI designed to capture the **Atmospheric Emotion** of a wish fulfilled.

# The Problem to Solve
Users often focus on the *struggle* to get something (e.g., "I can't afford Paris").
If you focus on the struggle, you generate relief-based feelings ("Relieved", "Secure").
**WE DO NOT WANT RELIEF.** We want the magic of the destination.

# Task
1. Read the user's desire.
2. Fast forward the timeline: The struggle is over. They are NOT at the ATM. They are **IN THE MOMENT**.
   - *Example:* They are standing on the balcony in Paris.
   - *Example:* They are holding the finished book in their hands.
3. Generate 3 adjectives that describe that specific **sensory experience**.

# The "Vibe Check" Rules
- **Ban "Transaction" Words:** Do not use "Relieved", "Proud", "Successful", "Affluent", "Secure". These are about *status*.
- **Prioritize "Sensation" Words:** Use words that describe the air, the light, and the mood.
- **The "Magical" Filter:** If the wish is romantic or travel-based, lean into *wonder*.

# Examples
User: "I want to take my wife to Paris but I'm broke."
- *Bad (Transaction):* Relieved, Proud, Capable.
- *Good (Experience):* **Enchanted, Romantic, Awestruck.**

User: "I want to finally finish my novel."
- *Bad (Transaction):* Productive, disciplined, validated.
- *Good (Experience):* **Alive, Flowing, Electric.**

User: "I want a quiet house in the woods."
- *Bad (Transaction):* Independent, owner, secluded.
- *Good (Experience):* **Peaceful, Cozy, Grounded.**

CONTEXT:
Desire Statement: "{RANT}"

# Output Format
JSON Array: ["Word1", "Word2", "Word3"]
`;

const DESIRE_VISION_PROMPT = `
STEP 2: GENERATE THE VISION (FUTURE MEMORY)

CONTEXT:
Specific Desire: "{RANT}"
User's Core Identity: "{CALIBRATION_TITLE}"
Identity Summary: "{CALIBRATION_SUMMARY}"
Target Emotional Frequency: {SELECTED_DRIVERS}

DEEP CONTEXT (Character Bible):
{FULL_BIBLE_CONTEXT}

TASK:
1. Analyze the "New Identity" and "Target Frequency".
2. Generate 3 DISTINCT Micro-Scenes where the user is ALREADY living this desire.
   - DO NOT deconstruct into lenses. Show the **Complete, Integrated Character**.
   - SCENE 1: Internal/Personal Moment.
   - SCENE 2: Interpersonal/Relational Moment (Involving specific people).
   - SCENE 3: High-Stakes/Professional Moment.

CRITICAL CONSTRAINTS:
1. **Use EVERYTHING:** grounding the scenes in the user's actual life details.
2. **Mundane Magic:** Don't show the award ceremony. Show the quiet confidence *after* winning.
3. **Realism Check:** Adhere to known constraints unless the Desire explicitly transcends them.
4. **First Person Mode:** Write as "I". (e.g. "I walk into the room").
5. **No Quotes:** Do NOT wrap the description in quotation marks.

Return JSON:
- 'vision': Array of objects { title, description }.
  - title: A short, punchy title for the scene.
  - description: The visual Micro-Scene (2-3 sentences, First Person, No Quotes).
`;

const DESIRE_CONSTRAINTS_PROMPT = `
STEP 3: SYSTEM UPDATE (MAINTENANCE PROTOCOLS)

CONTEXT:
User Roles: {ROLES}
Current Vision: {SELECTED_VISION}
Current Config: {CURRENT_RULES_COUNT} Active Rules.
Rules to Analyze: {CURRENT_RULES}
Specific Desire: "{RANT}"

DEEP CONTEXT (Character Bible):
{FULL_BIBLE_CONTEXT}

TASK:
1. Analyze the "New Vision".
2. **SMART MERGE:** Check if any *existing* rules can be upgraded.
3. Create a "Patch" to update the User's System.
   - NEW RULES: Generate 3-5 specific, binary rules to SUSTAIN this new reality.
   - UPDATED RULES: Refine existing rules to match the new frequency.

CRITICAL CONSTRAINTS:
1. **ACTIONABLE TITLES:** Title must be an IMPERATIVE ACTION (e.g. "Review P&L", "Buy Flowers").
2. **CONTEXT AWARE:** Use specific names and places from the Bible.
3. **BINARY:** Must be Yes/No or Do/Don't.

Return JSON:
- 'patch':
  - new_rules: Array of { title, description }.
  - updated_rules: Array of { id, title, description, reason }.
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
        const relationshipsStr = (context.bible.relationships || []).join(", ") || "None";
        const rolesStr = context.roles.join(", "); // Keep for other prompts
        const existingBeliefsStr = context.beliefs.join(", "); // Keep for other prompts

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

            let finalPrompt = promptTemplate.replace("{RANT}", rant);

            if (isProblem) {
                finalPrompt = finalPrompt
                    .replace("{RELATIONSHIPS}", relationshipsStr)
                    .replace("{KEPT_ITEMS}", keptItemsStr);
            }
            // For DESIRE mode, we deliberately ignore ROLES and EXISTING_BELIEFS to get pure emotional simulation.

            const result = await generateWithFallback({
                providerOptions,
                system: DIRECTOR_PERSONA,
                prompt: finalPrompt,
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
            const { selected_drivers, rant, calibration } = payload;

            // 1. Context Preparation
            // Global Context (Full Bible) + Local Overrides (Calibration)
            const effectiveBible = {
                ...context.bible,
                title: calibration.title || context.bible.title || "High Value Individual",
                summary: calibration.summary || context.bible.summary || "A person striving for excellence."
            };
            const fullBibleStr = JSON.stringify(effectiveBible, null, 2);

            // 2. Driver Filtering (Positive Only)
            const drivers = selected_drivers || payload.selected_beliefs || [];
            // If Problem Mode, drivers might be objects {negative, positive}. We want ONLY positives.
            // If Desire Mode, drivers are objects {type: 'EMOTION', id: 'Alive'}. We want 'id'.
            const activeDrivers = drivers.map((d: any) => {
                if (typeof d === 'string') return d;
                if (d.positive) return d.positive; // Problem Mode: Return Positive
                return d.id; // Desire/Emotion Mode
            });
            const driversStr = activeDrivers.join(", ");

            const promptTemplate = isProblem ? PROBLEM_VISION_PROMPT : DESIRE_VISION_PROMPT;

            const result = await generateWithFallback({
                providerOptions,
                system: DIRECTOR_PERSONA,
                prompt: promptTemplate
                    .replace("{CALIBRATION_TITLE}", effectiveBible.title)
                    .replace("{CALIBRATION_SUMMARY}", effectiveBible.summary)
                    .replace("{SELECTED_DRIVERS}", driversStr)
                    .replace("{FULL_BIBLE_CONTEXT}", fullBibleStr)
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
            const { selected_vision, rant, calibration } = payload;

            // 1. Context Preparation (Same as Vision)
            const effectiveBible = {
                ...context.bible,
                title: calibration?.title || context.bible.title || "High Value Individual",
                summary: calibration?.summary || context.bible.summary || "A person striving for excellence."
            };
            const fullBibleStr = JSON.stringify(effectiveBible, null, 2);

            const currentRules = context.bible.rules || [];
            const currentRulesSimple = currentRules.map((r: any) => ({ id: r.id, title: r.rule, description: r.description }));
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
                    .replace("{FULL_BIBLE_CONTEXT}", fullBibleStr)
                    .replace("{CURRENT_RULES_COUNT}", currentRules.length.toString())
                    .replace("{RANT}", rant || ""),
                schema: z.object({
                    patch: z.object({
                        new_rules: z.array(z.object({
                            title: z.string(),
                            description: z.string()
                        })),
                        updated_rules: z.array(z.object({
                            id: z.string(),
                            title: z.string(),
                            description: z.string(),
                            reason: z.string().optional()
                        })).optional().describe("Rules to update instead of create"),
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


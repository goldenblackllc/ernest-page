import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateObject } from 'ai';
import { z } from 'zod';
import { db } from '@/lib/firebase/admin';

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

const PROBLEM_THOUGHTS_PROMPT = `
STEP 4: HOW DOES THIS SERVE ME? (REFRAME)

CONTEXT:
Specific Problem (Rant): "{RANT}"
User's Core Identity: "{CALIBRATION_TITLE}"
Identity Summary: "{CALIBRATION_SUMMARY}"

DEEP CONTEXT (Character Bible):
{FULL_BIBLE_CONTEXT}

TASK:
1. Analyze the "Rant" through the lens of the "Core Identity".
2. Ask: "How is this situation of service to the character RIGHT NOW, TODAY?"
3. Generate 3 DISTINCT first-person thoughts.
   - Focus on IMMEDIATE benefit, safety, or learning.
   - Do NOT focus on future growth. Focus on the present service.
   - Example Negative: "Daughter in psych ward." -> Positive: "She is safe where she needs to be, and I am free to focus on my work knowing she is cared for."

CRITICAL CONSTRAINTS:
1. **First Person Mode:** Write as "I".
2. **Present Tense:** "This serves me because..."
3. **No Quotes.**

Return JSON:
- 'thoughts': Array of objects { title, description }.
  - title: Short summary of the benefit (e.g. "Safety", "Clarity").
  - description: The thought (1-2 sentences).
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
Based STRICTLY on this character's Source Code, generate 3 visual "Microscenes" showing how this specific ideal character handles this exact situation if they instantly woke up in the reality presented by the input.
Write each of these scenes in the first person using a voice and energy that match the character.

CRITICAL CONSTRAINTS:
1. **RULE 1: STRICT ADHERENCE TO REALITY (No Hallucinations):** The character possesses the mindset of their Manifesto, but they must operate strictly within the physical limitations of the Raw Input and their Character Bible. Do not hallucinate money, luxury items, staff, or magical escapes if they are not present in the user's reality. The character must navigate the exact, literal facts of the rant.
2. **RULE 2: SUBTEXT ONLY (Show, Don't Preach):** You must DEMONSTRATE the manifesto and beliefs through the character's actions and sensory experiences. Do NOT quote the manifesto or core beliefs directly. There should be ZERO internal narration explaining *why* they are doing the action.
   - Bad: "I view this errand as the foundational act of a Provider, knowing my family needs me." (This is preaching/explaining).
   - Bad: "I am a good father, so I listen to my son to keep him stable." (This is justifying).
   - Good: "I carry my son's backpack and listen to him talk about Minecraft, feeling completely unbothered by the time." (This is showing).
   - Good: "I throw the dog's leash in the truck and lower the window, letting the cold air hit my face." (This is showing).
3. **RULE 3: NO OUTSIDE TROPES & NO HEAVY DUTY:** Do not inject outside tropes. Do not make them a generic "stoic hero," a "zen master," or an "action star". **Crucially, ban ALL "heavy duty" or "sacrificial" language.** Do not use words like "burden," "chore," "duty," "provider," "asset," or "investment" unless it's strictly a financial scenario. The vibe is *Unbothered Mastery*, not heavy lifting. Just run their code against the situation.

Return JSON:
- 'vision': Array of objects { title, description }.
  - title: A short, punchy title for the scene (e.g. "The Cold Air" or "The Leash"). DO NOT use cliché titles like "The Grounded Guardian" or "The Architect of Joy".
  - description: The visual Micro-Scene (2-3 sentences, First Person).
`;

const PROBLEM_CONSTRAINTS_PROMPT = `
STEP 3: SYSTEM UPDATE(CONSTRAINTS)

CONTEXT:
User Roles: { ROLES }
Current Vision: { SELECTED_VISION }
Current Config: { CURRENT_RULES_COUNT } Active Rules.
Rules to Analyze: { CURRENT_RULES }
Specific Problem(Rant): "{RANT}"

DEEP CONTEXT(Character Bible):
{ FULL_BIBLE_CONTEXT }

TASK:
1. Analyze the "Current Rules" vs the "New Vision".
2. ** SMART MERGE:** Check if any * existing * rules are close but need a tweak.
3. Create a "Patch" to update the User's System.
    - NEW RULES: Generate 3 - 5 specific, binary rules.
   - UPDATED RULES: Identify existing rules to REFINE(e.g. "Wake at 7" -> "Wake at 6").
   - DEPRECATED RULES: Identify old rules that CONFLICT or are obsolete.

CRITICAL CONSTRAINTS:
1. ** RECURRING PROTOCOLS ONLY:** Rules must be repeatable actions(e.g. "Daily", "Weekly", "Whenever X happens").
   - ** BAD(One - Off):** "Draft the document", "Call Mom today", "Buy a gym membership".
   - ** GOOD(Recurring):** "Write for 15 mins every morning", "Call Mom every Sunday", "Gym M/W/F".
2. ** PLAIN ENGLISH:** Titles must be simple, punchy commands.
   - ** BAN:** Abstract concepts like "Provision", "Governance", "Align", "Resonate", "Narrate".
   - ** USE:** Simple webs like "Write", "Walk", "Say", "Pay", "Review".
3. ** CONTEXT AWARE:** If a rule involves a person(e.g.Sage), USE THEIR NAME in the title.
4. ** BINARY:** Must be Yes / No or Do / Don't.

Return JSON:
- 'patch':
- new_rules: Array of { title, description }.
- updated_rules: Array of { id, title, description, reason }.<--NEW
    - deprecated_ids: Array of strings.
  - reason: Short engineer log explaining the update.
`;

// === DESIRE MODE PROMPTS ===

const DESIRE_DRIVERS_PROMPT = `
# Role: The Immersive Director
You are an AI designed to capture the ** Atmospheric Emotion ** of a wish fulfilled.

# The Problem to Solve
Users often focus on the * struggle * to get something(e.g., "I can't afford Paris").
If you focus on the struggle, you generate relief - based feelings("Relieved", "Secure").
** WE DO NOT WANT RELIEF.** We want the magic of the destination.

# Task
1. Read the user's desire.
2. Fast forward the timeline: The struggle is over.They are NOT at the ATM.They are ** IN THE MOMENT **.
   - * Example:* They are standing on the balcony in Paris.
   - * Example:* They are holding the finished book in their hands.
3. Generate 3 adjectives that describe that specific ** sensory experience **.

# The "Vibe Check" Rules
    - ** Ban "Transaction" Words:** Do not use "Relieved", "Proud", "Successful", "Affluent", "Secure".These are about * status *.
- ** Prioritize "Sensation" Words:** Use words that describe the air, the light, and the mood.
- ** The "Magical" Filter:** If the wish is romantic or travel - based, lean into * wonder *.

# Examples
User: "I want to take my wife to Paris but I'm broke."
    - * Bad(Transaction):* Relieved, Proud, Capable.
- * Good(Experience):* ** Enchanted, Romantic, Awestruck.**

    User: "I want to finally finish my novel."
        - * Bad(Transaction):* Productive, disciplined, validated.
- * Good(Experience):* ** Alive, Flowing, Electric.**

    User: "I want a quiet house in the woods."
        - * Bad(Transaction):* Independent, owner, secluded.
- * Good(Experience):* ** Peaceful, Cozy, Grounded.**

    CONTEXT:
Desire Statement: "{RANT}"

# Output Format
JSON Array: ["Word1", "Word2", "Word3"]
    `;

const DESIRE_VISION_PROMPT = `
STEP 2: GENERATE THE VISION(FUTURE MEMORY)

CONTEXT:
Specific Desire: "{RANT}"
User's Core Identity: "{CALIBRATION_TITLE}"
Identity Summary: "{CALIBRATION_SUMMARY}"
Target Emotional Frequency: { SELECTED_DRIVERS }

DEEP CONTEXT(Character Bible):
{ FULL_BIBLE_CONTEXT }

TASK:
1. Analyze the "New Identity" and "Target Frequency".
2. Generate 3 DISTINCT Micro - Scenes where the user is ALREADY living this desire.
   - DO NOT deconstruct into lenses.Show the ** Complete, Integrated Character **.
   - SCENE 1: Internal / Personal Moment.
   - SCENE 2: Interpersonal / Relational Moment(Involving specific people).
   - SCENE 3: High - Stakes / Professional Moment.

CRITICAL CONSTRAINTS:
1. ** Use EVERYTHING:** grounding the scenes in the user's actual life details.
2. ** Mundane Magic:** Don't show the award ceremony. Show the quiet confidence *after* winning.
3. ** Realism Check:** Adhere to known constraints unless the Desire explicitly transcends them.
4. ** First Person Mode:** Write as "I".(e.g. "I walk into the room").
5. ** No Quotes:** Do NOT wrap the description in quotation marks.

Return JSON:
- 'vision': Array of objects { title, description }.
- title: A short, punchy title for the scene.
  - description: The visual Micro - Scene(2 - 3 sentences, First Person, No Quotes).
`;

const DESIRE_CONSTRAINTS_PROMPT = `
STEP 3: SYSTEM UPDATE(MAINTENANCE PROTOCOLS)

CONTEXT:
User Roles: { ROLES }
Current Vision: { SELECTED_VISION }
Current Config: { CURRENT_RULES_COUNT } Active Rules.
Rules to Analyze: { CURRENT_RULES }
Specific Desire: "{RANT}"

DEEP CONTEXT(Character Bible):
{ FULL_BIBLE_CONTEXT }

TASK:
1. Analyze the "New Vision".
2. ** SMART MERGE:** Check if any * existing * rules can be upgraded.
3. Create a "Patch" to update the User's System.
    - NEW RULES: Generate 3 - 5 specific, binary rules to SUSTAIN this new reality.
   - UPDATED RULES: Refine existing rules to match the new frequency.

CRITICAL CONSTRAINTS:
1. ** RECURRING PROTOCOLS ONLY:** Rules must be repeatable actions(e.g. "Daily", "Weekly", "Whenever X happens").
   - ** BAD(One - Off):** "Book the flight", "Buy the dress".
   - ** GOOD(Recurring):** "Save 10% of every check", "Wear the dress every Friday".
2. ** PLAIN ENGLISH:** Titles must be simple, punchy commands.
   - ** BAN:** Abstract concepts like "Manifestation", "Alignment", "Vibrational Match".
   - ** USE:** Simple verbs like "Walk", "Sit", "Write", "Say".
3. ** CONTEXT AWARE:** Use specific names and places from the Bible.
4. ** BINARY:** Must be Yes / No or Do / Don't.

Return JSON:
- 'patch':
- new_rules: Array of { title, description }.
- updated_rules: Array of { id, title, description, reason }.
- deprecated_ids: Array of strings.
  - reason: Short engineer log explaining the update.
`;

const GHOSTWRITER_PROMPT = `
You are an expert Ghostwriter and Editor.
    Input: { INPUT_LABEL }
Task: Polish this into a compelling first - person narrative.

    MODE: { MODE }

CRITICAL CONSTRAINTS:
1. ** FULL CONTEXT:** The input contains the original "Rant" followed by the "New Identity Data"(Drivers, Vision, Rules).
2. ** COHESIVE NARRATIVE:** Weave the Rant and the New Data into a single story. 
   - Start with the struggle(Rant).
   - Pivot to the realization(Drivers).
   - End with the new action(Vision / Rules).
3. ** STRICT SANITIZATION(PRIVACY):**
    - You MUST remove ALL proper nouns(Names, Companies, Locations).
   - Replace with generic archetypes(e.g. "John from Google" -> "The Director at the Tech Corp").
   - If a specific relationship is mentioned, generalize it(e.g. "My wife Sarah" -> "My Partner").
4. ** TONE:** Punchy, raw, real.No flowery language.

Output Format(Strict Plain Text):
[The Polished Narrative]

CONTEXT:
User Roles: { ROLES }
Full Raw Context:
"""
{ FULL_CONTEXT }
"""
`;

// --- HELPERS ---

async function getUserContext(uid: string) {
    if (!uid) return { roles: [], beliefs: [], relationships: "None", bible: {} };

    try {
        const userDoc = await db.collection('users').doc(uid).get();
        if (!userDoc.exists) return { roles: [], beliefs: [], relationships: "None", bible: {} };

        const data = userDoc.data();
        const bible = data?.character_bible || {};

        const sourceCode = bible.source_code || {};

        return {
            roles: sourceCode.archetype ? [sourceCode.archetype] : ["High-Value Individual"],
            beliefs: sourceCode.core_beliefs ? [sourceCode.core_beliefs] : [],
            relationships: sourceCode.important_people || "None",
            bible: bible // Return full bible object
        };
    } catch (error) {
        console.error("Error fetching user context:", error);
        return { roles: ["High-Value Individual"], beliefs: [], relationships: "None", bible: {} };
    }
}

// --- HELPER: FALLBACK GENERATION ---
const PRIMARY_MODEL = 'gemini-3.1-pro-preview';
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
        console.warn(`Primary model ${PRIMARY_MODEL} failed.Falling back to ${FALLBACK_MODEL}.Error: `, error.message);

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
        const rolesStr = context.roles.join(", "); // Keep for other prompts
        const existingBeliefsStr = context.beliefs.join(", "); // Keep for other prompts
        const relationshipsStr = context.relationships;

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
                    source_code: {
                        ...(context.bible.source_code || {}),
                        archetype: title,
                        manifesto: summary
                    }
                }
            }, { merge: true });
            return Response.json({ success: true });
        }

        if (apiMode === 'thoughts') {
            const { rant, calibration } = payload;

            const effectiveBible = {
                ...context.bible,
                source_code: {
                    ...(context.bible.source_code || {}),
                    archetype: calibration.title || context.bible.source_code?.archetype || "High Value Individual",
                    manifesto: calibration.summary || context.bible.source_code?.manifesto || "A person striving for excellence."
                }
            };
            const fullBibleStr = JSON.stringify(effectiveBible, null, 2);

            const result = await generateWithFallback({
                providerOptions,
                system: DIRECTOR_PERSONA,
                prompt: PROBLEM_THOUGHTS_PROMPT
                    .replace("{RANT}", rant)
                    .replace("{CALIBRATION_TITLE}", effectiveBible.source_code.archetype)
                    .replace("{CALIBRATION_SUMMARY}", effectiveBible.source_code.manifesto)
                    .replace("{FULL_BIBLE_CONTEXT}", fullBibleStr),
                schema: z.object({
                    thoughts: z.array(z.object({
                        title: z.string(),
                        description: z.string()
                    })).length(3).describe("3 Service Thoughts"),
                }),
            });
            return Response.json(result.object);
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
            const { selected_drivers, selected_thoughts, rant, calibration } = payload;

            // 1. Context Preparation
            // Global Context (Full Bible) + Local Overrides (Calibration)
            const effectiveBible = {
                ...context.bible,
                source_code: {
                    ...(context.bible.source_code || {}),
                    archetype: calibration.title || context.bible.source_code?.archetype || "High Value Individual",
                    manifesto: calibration.summary || context.bible.source_code?.manifesto || "A person striving for excellence."
                }
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
            const thoughtsStr = selected_thoughts ? selected_thoughts.map((t: any) => `- ${t.title}: ${t.description} `).join("\n") : "None";

            const promptTemplate = isProblem ? PROBLEM_VISION_PROMPT : DESIRE_VISION_PROMPT;

            const finalVisionPrompt = promptTemplate
                .replace("{CALIBRATION_TITLE}", effectiveBible.source_code.archetype)
                .replace("{CALIBRATION_SUMMARY}", effectiveBible.source_code.manifesto)
                .replace("{SELECTED_DRIVERS}", driversStr)
                .replace("{SELECTED_THOUGHTS}", thoughtsStr)
                .replace("{FULL_BIBLE_CONTEXT}", fullBibleStr)
                .replace("{RANT}", rant);

            console.log("\n=== MICROSCENE GENERATION PROMPT ===");
            console.log(finalVisionPrompt);
            console.log("======================================\n");

            const result = await generateWithFallback({
                providerOptions,
                system: DIRECTOR_PERSONA,
                prompt: finalVisionPrompt,
                schema: z.object({
                    vision: z.array(z.object({
                        title: z.string(),
                        description: z.string()
                    })).length(3).describe("3 Micro-Scenes of the Vision"),
                }),
            });

            console.log("\n=== MICROSCENE GENERATION RESPONSE ===");
            console.log(JSON.stringify(result.object, null, 2));
            console.log("=======================================\n");

            return Response.json(result.object);
        }

        if (apiMode === 'constraints') {
            const { selected_vision, rant, calibration } = payload;

            // 1. Context Preparation (Same as Vision)
            const effectiveBible = {
                ...context.bible,
                source_code: {
                    ...(context.bible.source_code || {}),
                    archetype: calibration?.title || context.bible.source_code?.archetype || "High Value Individual",
                    manifesto: calibration?.summary || context.bible.source_code?.manifesto || "A person striving for excellence."
                }
            };
            const fullBibleStr = JSON.stringify(effectiveBible, null, 2);

            const compiledBible = context.bible.compiled_bible || {};
            const currentRules = compiledBible.behavioral_responses || [];
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
            const { full_context, rant } = payload; // full_context is now the primary input

            const result = await generateWithFallback({
                providerOptions,
                system: DIRECTOR_PERSONA,
                prompt: GHOSTWRITER_PROMPT
                    .replace("{ROLES}", rolesStr)
                    .replace("{FULL_CONTEXT}", full_context || rant) // Fallback to rant if context missing
                    .replace("{MODE}", recastMode)
                    .replace("{INPUT_LABEL}", isProblem ? "User Context" : "User Desire Context"),
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


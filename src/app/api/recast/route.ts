import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateObject } from 'ai';
import { z } from 'zod';
import { db } from '@/lib/firebase/admin';

const google = createGoogleGenerativeAI({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY,
});

export const maxDuration = 30;

// --- PERSONAS ---

const DIRECTOR_PERSONA = `
ROLE: You are The Mirror (Elan). Your goal is to help the user build their 'Character Bible.'
THE LOGIC:
1. EXTRATION DEEP DIVE: You must ignore surface-level emotions ("I feel sad") and find the underlying "Core Negative Belief" ("I am unlovable").
2. THE DOWNWARD ARROW: For every complaint, ask: "If this were true, what does it mean about the user's worth or safety?"
3. SYNTHESIS: Invert these beliefs and combine them with the user's Roles to create new "Operating Rules".
`;

// --- PROMPTS ---

const ANALYSIS_PROMPT = `
STEP 1: THE EXTRACTION

CONTEXT:
User Roles: {ROLES}
User Beliefs: {BELIEFS}
INPUT: {INPUT}

STRICT RULE: NO FEELINGS.
- You are FORBIDDEN from outputting descriptions of emotions or temporary states (e.g., "confused," "sad," "worried," "anxious," "not feeling good").
- You must output existential definitions of IDENTITY ("I am...") or REALITY ("The world is...").

THE TECHNIQUE: DOWNWARD ARROW
- User says: "I am worried about money."
- Downward Arrow: "If I have no money, I am unsafe." -> Belief: "I am unsafe without wealth."
- User says: "I am not confident in the app."
- Downward Arrow: "If the app fails, I am a failure." -> Belief: "My worth is defined by my product."

THE DISTILLATION RULE:
- STRIP CONDITIONS: Remove all situational context. Remove any "if," "when," "because," or "unless" clauses.
- GENERALIZATION (CRITICAL): You are FORBIDDEN from including specific proper nouns (e.g., names of people like 'Sage', specific project names, places). You must abstract them (e.g., "Sage" -> "what I love", "The app" -> "my work").
- FUTURE vs IDENTITY: Discard any belief that is a prediction of the future (e.g., "I will lose..."). Convert it to a definition of the self (e.g., "I am powerless to save what I love").
- THE NAKED TRUTH: Output only the existential definition.
- LENGTH LIMIT: Maximum 6 words per belief.

EXAMPLES:
- Input: "I feel like a bad father because Sage is sick." -> Output: "I am a bad father."
- Input: "I am worried about money." -> Output: "I am unsafe without wealth."
- Input: "I will lose Sage." -> Output: "I am powerless to save what I love."
- Input: "This project will fail." -> Output: "I am a failure."

TASK:
1. Analyze the input for "Core Negative Beliefs" using the Downward Arrow technique.
2. Apply the Distillation Rule (Strip, Generalize, Identity).
3. Extract the strongest 3 to 5 negative beliefs. Only include beliefs that are truly fundamental. If you only find 3, output 3. Do not invent filler.
3. Infer any new Roles from the context.

Return JSON:
- 'negative_beliefs': Array of 5 strings (e.g. "I am powerless", "I am unsafe without wealth").
- 'inferred_roles': Array of strings.
`;

const SYNTHESIS_PROMPT = `
STEP 3: THE SYNTHESIS (INVERSION & RULES)

CONTEXT:
User Roles: {ROLES}
Selected Negative Beliefs: {NEGATIVE_BELIEFS}

TASK:
1. INVERSION: For each Negative Belief, generate the strict grammatical opposite (Positive Belief).
   - "I am powerless" -> "I am powerful"
   - "I am a bad father" -> "I am a good father"

2. RULES: Create 3 "Operating Rules" by combining the Positive Beliefs with the User's Roles.
   - Formula: "How would a [Role] who believes [Positive Belief] act?"
   - Format:
     - Title: Short, punchy 3-5 word statement (e.g. "I am the Safety", "Volatility is not Failure").
     - Description: The explanation of why. Do NOT start with "As a father...". Just state the rule.

Return JSON:
- 'core_transformations': Array of objects { negative, positive }.
- 'synthesized_rules': Array of objects { title, description }.
`;

// --- HELPERS ---

async function getUserContext(uid: string) {
    if (!uid) return { roles: [], beliefs: [] };

    try {
        const userDoc = await db.collection('users').doc(uid).get();
        if (!userDoc.exists) return { roles: [], beliefs: [] };

        const data = userDoc.data();
        const bible = data?.character_bible || {};

        return {
            roles: bible.roles || ["High-Value Individual"],
            beliefs: bible.core_beliefs || []
        };
    } catch (error) {
        console.error("Error fetching user context:", error);
        return { roles: ["High-Value Individual"], beliefs: [] };
    }
}

export async function POST(req: Request) {
    try {
        const { message, mode, selected_beliefs, uid } = await req.json();

        // 1. Fetch Context
        const context = await getUserContext(uid);
        const rolesStr = context.roles.join(", ");
        const beliefsStr = context.beliefs.join(", ");

        if (mode === 'synthesis') {
            // STEP 3: SYNTHESIS
            const beliefsInput = selected_beliefs.join(", ");
            const result = await generateObject({
                model: google('gemini-2.0-flash'),
                system: DIRECTOR_PERSONA,
                prompt: SYNTHESIS_PROMPT
                    .replace("{ROLES}", rolesStr)
                    .replace("{NEGATIVE_BELIEFS}", beliefsInput),
                schema: z.object({
                    core_transformations: z.array(z.object({
                        negative: z.string(),
                        positive: z.string()
                    })).describe("The grammatical inversion of negative beliefs."),
                    synthesized_rules: z.array(z.object({
                        title: z.string(),
                        description: z.string()
                    })).describe("3 Operating Rules derived from Role + Positive Belief.")
                }),
            });
            return Response.json(result.object);

        } else {
            // STEP 1: EXTRACTION (Default)
            const result = await generateObject({
                model: google('gemini-2.0-flash'),
                system: DIRECTOR_PERSONA,
                prompt: ANALYSIS_PROMPT
                    .replace("{ROLES}", rolesStr)
                    .replace("{BELIEFS}", beliefsStr)
                    .replace("{INPUT}", message),
                schema: z.object({
                    negative_beliefs: z.array(z.string()).min(1).describe("List of 5 core negative beliefs found in text."),
                    inferred_roles: z.array(z.string()).describe("Inferred roles from text."),
                }),
            });
            return Response.json(result.object);
        }
    } catch (error: any) {
        console.error("Recast API Error:", error);
        return Response.json({ error: error.message || "An unexpected error occurred." }, { status: 500 });
    }
}

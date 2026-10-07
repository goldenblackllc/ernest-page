import { onRequest } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { db } from './lib/firebase/admin.js';
import { REGION } from './lib/config/region.js';
import { enqueueBuildCharacter } from './characterBuild.js';
import { generateWithFallback, OPUS_MODEL, SONNET_MODEL } from './lib/ai/models.js';
import { REALITY_RULES } from './lib/constants/realityRules.js';
import { computeAge } from './lib/utils/parseBirthDate.js';

// --- SAFETY SETTINGS ---
const SAFETY_SETTINGS = [
    { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
    { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
    { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
];

const SYSTEM_PROMPT = `You are creating a specific person who is already living their ideal life inside a universe governed by the following laws. The character understands and operates by these laws — they live them through their actions, mindset, and voice, but never preach or list them.
${REALITY_RULES}

Write in first person, present tense. Preserve every proper noun, brand, name, and specific detail from the inputs — never generalize them.`;

// --- PHASE 1: FACT COMPILER (translates aspirational inputs → present-tense character facts) ---
const PHASE1_SYSTEM_PROMPT = `You are a Fact Compiler. Your sole job is to take raw personal data — goals, dreams, desires, physical descriptions, and relationship notes — and rewrite them as present-tense statements of fact about an existing person who is completely loving, integrated, and at peace.

Rules:
- Every output statement must be present tense. "I am," "I have," "I live," "I earn." Never "I want," "I'm working toward," "I dream of," "I'm building."
- Do not invent new details. Only rewrite what is provided.
- Do not editorialize or add emotional color. Just state facts.
- If two inputs overlap or contradict, merge them into one clean statement. Example: want="be financially free" + dream_financial="$3M net worth" → "I have a $3M net worth."
- Physical traits should be stated as natural attributes, not achievements. Example: "be 182 pounds, be strong and fit" + height="6'1" → "I'm six-one, 182 pounds, strong and fit."
- Strip the aspiration, keep the specificity. Every brand, number, place name, and proper noun survives.
- For people: rewrite each person's description from the perspective of someone who is completely loving and at peace. Others may carry friction toward this person, but this person does not carry it back. State the relationship as settled, warm, and clear-eyed — not aspirational, not conflicted.`;

const PHASE1_USER_PROMPT = `Rewrite the following raw inputs as present-tense facts about a real, living person who is fully actualized and at peace.

--- RAW INPUTS ---

Goals & Desires: {WANTS}

Dream Living Situation: {DREAM_LIVING}

Dream Financial Situation: {DREAM_FINANCIAL}

Physical Description: {PHYSICAL_TRAITS}

People:
{IMPORTANT_PEOPLE}

--- OUTPUT FORMAT ---

Rewrite into these sections:

1. "Living Situation" — Where and how this person lives. Present tense.
2. "Financial Reality" — This person's financial standing. Present tense.
3. "Physical Profile" — This person's body, appearance, and physical state. Present tense.
4. "Character Facts" — Everything else from the goals/desires, restated as facts about who this person already is and what they already do. Present tense.
5. "People" — For each person provided, rewrite their entry as a present-tense fact about the relationship, from the perspective of someone who is loving and at peace.`;

const PHASE1_SCHEMA = z.object({
    living_situation: z.string().describe("Where and how this person lives — present tense fact"),
    financial_reality: z.string().describe("This person's financial standing — present tense fact"),
    physical_profile: z.string().describe("Body, appearance, physical state — present tense fact"),
    character_facts: z.string().describe("Everything else restated as present-tense facts about who they are"),
    people: z.array(z.object({
        name: z.string().describe("Person's name"),
        relationship: z.string().describe("Relationship label — e.g. daughter, business partner, ex-wife"),
        description: z.string().describe("Present-tense, loving description of this person and the relationship"),
    })).describe("Each person rewritten as a present-tense, loving relationship fact"),
});

const PROMPT_IDEAL_BIBLE = `Build a Character Bible from the following inputs. Output exactly 7 sections. Each section must contain multiple subsections using **Subheading:** format. Expand beyond the inputs: invent logical details that fit the character. Use sensory language. Do not include dates — use ages or durations. Do not mention "Core Beliefs" or "Manifesto."

Sections:
1. "Style & Presence" — Wardrobe (specific items and brands), grooming, physicality, travel style
2. "Daily Life & Habits" — Morning ritual, work, weekends, passions
3. "People & Connections" — Each person gets their OWN **Name:** subsection. End with **Communication Style:** and **Social Energy:**
4. "The Inner Mind" — Emotions, pressure, self-talk, relationship with reality
5. "Quirks & Details" — Diet, languages, pets, guilty pleasures
6. "Order & Sanctuary" — Home, car, workspace, systems
7. "The World I Love" — Specific artists, shows, movies, books, food, games, sports. Use real names, not genres. Describe the relationship to each one.

--- CHARACTER INPUTS ---

Identity: {DEFINING_WORDS}

Living Situation: {PRESENT_LIVING}

Financial Reality: {PRESENT_FINANCIAL}

Physical Profile: {PRESENT_PHYSICAL}

About the Character: {PRESENT_FACTS}

People:
{PRESENT_PEOPLE}

Things They Love: {THINGS_I_LOVE}`;

const IDEAL_BIBLE_SCHEMA = z.object({
    Style_and_Presence: z.string().describe("Aesthetics, Wardrobe, Physicality"),
    Daily_Life_and_Habits: z.string().describe("Routines, Occupations, Passions"),
    People_and_Connections: z.string().describe("Relationships, Communication, Social Interaction"),
    The_Inner_Mind: z.string().describe("How they process emotions, crisis, and reality"),
    Quirks_and_Details: z.string().describe("Pets, diet, languages, unique variables"),
    Order_and_Sanctuary: z.string().describe("Cleanliness, organization, mise-en-place, how they maintain their home/car/workspace"),
    The_World_I_Love: z.string().describe("The cultural identity — specific artists, shows, movies, books, food, music, games, sports, and the named things that define their taste. Use real names, not abstractions.")
});

const PROVIDER_OPTIONS = {
    google: { safetySettings: SAFETY_SETTINGS },
};

/** Raw My Life inputs, formatted for the Phase 1 and Phase 2 prompts. */
interface CompileInputs {
    /** Defining words (passed through to Phase 2 unchanged) */
    definingWords: string;
    /** Interests/loves (passed through to Phase 2 unchanged) */
    interests: string;
    // Translated by Phase 1:
    wants: string;
    dreamLiving: string;
    dreamFinancial: string;
    physicalTraits: string;
    people: string;
    /** Counts for logging */
    counts: { wants: number; people: number; interests: number };
}

// ─── Assemble raw inputs from My Life data ───
function buildCompileInputs(data: FirebaseFirestore.DocumentData): CompileInputs {
    const definingWords = data?.defining_words || [];
    const allWants = (data?.wants || []).map((w: any) => w.text);
    const unifiedPeople = data?.people || [];
    const unifiedInterests = data?.interests || [];

    const physicalTraits: string[] = [];
    if (data.gender) physicalTraits.push(data.gender);
    if (data.birthdate) {
        const age = computeAge(data.birthdate);
        if (age !== null) physicalTraits.push(`${age} years old`);
    }
    if (data.skin_tone) physicalTraits.push(`skin tone: ${data.skin_tone}`);
    if (data.hair_colors?.length) physicalTraits.push(`hair: ${data.hair_colors.join('/')}`);
    if (data.hair_texture) physicalTraits.push(`hair texture: ${data.hair_texture}`);
    if (data.eye_color) physicalTraits.push(`eyes: ${data.eye_color}`);
    if (data.height) physicalTraits.push(`height: ${data.height}`);
    if (data.ethnicity) physicalTraits.push(`ethnicity: ${data.ethnicity}`);

    return {
        definingWords: definingWords.length > 0 ? definingWords.join(', ') : 'Not specified',
        interests: unifiedInterests.length > 0 ? unifiedInterests.join(', ') : 'Not specified.',
        wants: allWants.length > 0 ? allWants.join(', ') : 'None specified',
        dreamLiving: data?.dream_living || 'Not specified',
        dreamFinancial: data?.dream_financial || 'Not specified',
        physicalTraits: physicalTraits.length > 0 ? physicalTraits.join(', ') : 'Not specified',
        people: unifiedPeople.length > 0
            ? unifiedPeople.map((p: any) =>
                `Name: ${p.name}\nRelationship: ${p.relationship}\nAbout: ${p.who || 'N/A'}`
            ).join('\n\n')
            : 'None',
        counts: { wants: allWants.length, people: unifiedPeople.length, interests: unifiedInterests.length },
    };
}

// ─── PHASE 1: Translate aspirational inputs → present-tense character facts ───
async function compilePresentTenseFacts(inputs: CompileInputs): Promise<z.infer<typeof PHASE1_SCHEMA>> {
    const phase1Prompt = PHASE1_USER_PROMPT
        .replace('{WANTS}', inputs.wants)
        .replace('{DREAM_LIVING}', inputs.dreamLiving)
        .replace('{DREAM_FINANCIAL}', inputs.dreamFinancial)
        .replace('{PHYSICAL_TRAITS}', inputs.physicalTraits)
        .replace('{IMPORTANT_PEOPLE}', inputs.people);

    console.log(`[BibleCompile] Phase 1: Translating inputs to present-tense facts...`);
    const phase1Result = await generateWithFallback({
        primaryModelId: SONNET_MODEL,
        abortSignal: AbortSignal.timeout(30_000), // 30s — this is a fast, small task
        maxTokens: 2000,
        providerOptions: PROVIDER_OPTIONS,
        system: PHASE1_SYSTEM_PROMPT,
        prompt: phase1Prompt,
        schema: PHASE1_SCHEMA,
    });

    const phase1 = phase1Result.object as z.infer<typeof PHASE1_SCHEMA>;
    console.log(`[BibleCompile] Phase 1 complete: living=${phase1.living_situation.length}ch, financial=${phase1.financial_reality.length}ch, physical=${phase1.physical_profile.length}ch, facts=${phase1.character_facts.length}ch, people=${phase1.people.length}`);
    return phase1;
}

// ─── PHASE 2: Generate Character Bible from pre-translated facts ───
async function generateIdealSections(
    inputs: CompileInputs,
    phase1: z.infer<typeof PHASE1_SCHEMA>,
    userLocale: string,
): Promise<{ heading: string; content: string }[]> {
    // Format Phase 1 people output for Phase 2
    const presentPeopleString = phase1.people.length > 0
        ? phase1.people.map(p => `**${p.name}** (${p.relationship}): ${p.description}`).join('\n\n')
        : 'None';

    const idealPrompt = PROMPT_IDEAL_BIBLE
        .replace('{DEFINING_WORDS}', inputs.definingWords)
        .replace('{PRESENT_LIVING}', phase1.living_situation)
        .replace('{PRESENT_FINANCIAL}', phase1.financial_reality)
        .replace('{PRESENT_PHYSICAL}', phase1.physical_profile)
        .replace('{PRESENT_FACTS}', phase1.character_facts)
        .replace('{PRESENT_PEOPLE}', presentPeopleString)
        .replace('{THINGS_I_LOVE}', inputs.interests)
        + (userLocale !== 'en' ? `\n\nCRITICAL LANGUAGE INSTRUCTION: Write the ENTIRE character bible in ${userLocale === 'es' ? 'Spanish' : userLocale === 'pt' ? 'Portuguese' : userLocale === 'fr' ? 'French' : userLocale === 'de' ? 'German' : 'English'}. All section content must be in this language. Section headings may remain in English for parsing.` : '');

    const idealResult = await generateWithFallback({
        primaryModelId: OPUS_MODEL,
        abortSignal: AbortSignal.timeout(480_000), // 8 min — Cloud Functions have room
        maxTokens: 32000,
        providerOptions: PROVIDER_OPTIONS,
        system: SYSTEM_PROMPT,
        prompt: idealPrompt,
        schema: IDEAL_BIBLE_SCHEMA,
    });

    const rawObj = idealResult.object as any;

    // Debug: log each section's content length
    const sectionKeys = ['Style_and_Presence', 'Daily_Life_and_Habits', 'People_and_Connections', 'The_Inner_Mind', 'Quirks_and_Details', 'Order_and_Sanctuary', 'The_World_I_Love'];
    const sectionLengths = sectionKeys.map(k => `${k}=${(rawObj[k] || '').length}`).join(', ');
    console.log(`[BibleCompile] Model output lengths: ${sectionLengths}`);

    return [
        { heading: "Style & Presence", content: rawObj.Style_and_Presence },
        { heading: "Daily Life & Habits", content: rawObj.Daily_Life_and_Habits },
        { heading: "People & Connections", content: rawObj.People_and_Connections },
        { heading: "The Inner Mind", content: rawObj.The_Inner_Mind },
        { heading: "Quirks & Details", content: rawObj.Quirks_and_Details },
        { heading: "Order & Sanctuary", content: rawObj.Order_and_Sanctuary },
        { heading: "The World I Love", content: rawObj.The_World_I_Love },
    ];
}

/** The user's chosen name, or a generated first name that fits their defining words. */
async function resolveCharacterName(data: FirebaseFirestore.DocumentData, definingWords: string): Promise<string> {
    const userProvidedName = data?.name || '';
    if (userProvidedName) return userProvidedName;

    try {
        const nameResult = await generateWithFallback({
            primaryModelId: OPUS_MODEL,
            abortSignal: AbortSignal.timeout(15_000),
            prompt: `Based on this character archetype "${definingWords}" generate a single fitting first name for this character. Output ONLY the name, nothing else.`,
            schema: z.object({ name: z.string().describe("A single first name") }),
        });
        return (nameResult.object as any).name || 'The Architect';
    } catch {
        return 'The Architect';
    }
}

/**
 * Pick a default ElevenLabs voice matching the user's gender, age, and locale.
 * Returns null when none is found. Never throws.
 */
async function findDefaultVoice(data: FirebaseFirestore.DocumentData): Promise<{ id: string; name: string } | null> {
    try {
        const userGender = (data?.gender || '').toLowerCase();
        const userBirthdate = data?.birthdate || '';
        const gender = userGender.includes('female') || userGender.includes('woman') ? 'female' : 'male';

        let ageCategory = 'middle_aged';
        const ageNum = computeAge(userBirthdate);
        if (ageNum !== null) {
            if (ageNum < 30) ageCategory = 'young';
            else if (ageNum >= 60) ageCategory = 'old';
        }

        const apiKey = process.env.ELEVENLABS_API_KEY;
        if (!apiKey) return null;

        const preferredLocale = data?.preferred_locale || 'en';
        const params = new URLSearchParams({
            page_size: '1',
            language: preferredLocale,
            gender,
            age: ageCategory,
            ...(preferredLocale === 'en' ? { accent: 'british' } : {}),
            sort: 'usage_character_count_1y',
        });

        const voiceRes = await fetch(
            `https://api.elevenlabs.io/v1/shared-voices?${params}`,
            { headers: { 'xi-api-key': apiKey } }
        );
        if (!voiceRes.ok) return null;

        const voiceData = await voiceRes.json();
        const topVoice = voiceData.voices?.[0];
        if (!topVoice) return null;

        console.log(`[BibleCompile] Auto-assigned voice: ${topVoice.name} (${topVoice.voice_id})`);
        return { id: topVoice.voice_id, name: topVoice.name };
    } catch (err: any) {
        console.error('[BibleCompile] Voice auto-default failed (non-fatal):', err.message);
        return null;
    }
}

/**
 * Compile a user's Character Bible and save it to users/{uid}.bible, along with
 * their character name, a default voice, and a pending avatar status.
 *
 * Phase 1 rewrites the aspirational My Life inputs as present-tense facts;
 * Phase 2 writes the seven bible sections from those facts. Called by the
 * buildCharacter task (characterBuild.ts).
 */
export async function compileCharacterBibleForUser(uid: string): Promise<{ success: boolean; ideal?: any[]; error?: string }> {
    const userDocRef = db.collection('users').doc(uid);
    const userDoc = await userDocRef.get();
    const data = userDoc.data();

    if (!data) {
        return { success: false, error: 'User data not found' };
    }

    const userLocale = data?.preferred_locale || 'en';
    const inputs = buildCompileInputs(data);

    console.log(`[BibleCompile] Inputs for ${uid}: defining_words=${inputs.definingWords.substring(0, 50)}, wants=${inputs.counts.wants}, people=${inputs.counts.people}, interests=${inputs.counts.interests}`);

    const phase1 = await compilePresentTenseFacts(inputs);
    const idealSections = await generateIdealSections(inputs, phase1, userLocale);

    // Save back to Firestore
    if (userDoc.exists) {
        const characterName = await resolveCharacterName(data, inputs.definingWords);

        // Auto-default voice
        const freshVoiceSnap = await userDocRef.get();
        const freshData = freshVoiceSnap.data() || {};
        let voiceId = freshData.voice?.id || '';
        let voiceName = freshData.voice?.name || '';

        if (!voiceId) {
            const defaultVoice = await findDefaultVoice(data);
            if (defaultVoice) {
                voiceId = defaultVoice.id;
                voiceName = defaultVoice.name;
            }
        }

        // Save bible
        await userDocRef.set({
            bible: {
                sections: idealSections,
                status: 'ready',
                last_updated: Date.now()
            },
            name: characterName,
            voice: {
                id: voiceId,
                name: voiceName,
                confirmed: freshData.voice?.confirmed || false,
            },
            avatar: {
                status: freshData.avatar?.status || 'pending',
                attempt_count: freshData.avatar?.attempt_count || 0,
            },
            last_compile_at: Date.now(),
        }, { merge: true });
    }

    return { success: true, ideal: idealSections };
}

/**
 * HTTP Cloud Function for onboarding, called by the website's onboarding API
 * route with the internal key. It does not compile anything itself: it only
 * queues a buildCharacter task (bible compile + avatar) and returns 202 right
 * away. The compile runs in compileCharacterBibleForUser.
 */
export const compileCharacterBible = onRequest(
    { region: REGION, timeoutSeconds: 60, memory: '256MiB' },
    async (req, res) => {
        // Verify internal auth
        const internalKey = req.headers['x-internal-key'] as string;
        const cronSecret = process.env.CRON_SECRET;
        if (!cronSecret || internalKey !== cronSecret) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        const { uid } = req.body;
        if (!uid) {
            res.status(400).json({ error: 'Missing uid' });
            return;
        }

        try {
            await enqueueBuildCharacter({ uid, reason: 'onboarding' });
            res.status(202).json({ queued: true });
        } catch (error: any) {
            console.error('[BibleCompile] Failed to enqueue build:', error.message);
            res.status(500).json({ error: error.message || 'Unexpected error' });
        }
    }
);

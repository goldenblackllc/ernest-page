import { onRequest } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { db } from './lib/firebase/admin.js';
import { generateWithFallback, OPUS_MODEL } from './lib/ai/models.js';
import { computeAge } from './lib/utils/parseBirthDate.js';

// --- SAFETY SETTINGS ---
const SAFETY_SETTINGS = [
    { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
    { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
    { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
];

const SYSTEM_PROMPT = `You are a Character Simulation Engine. You are creating a specific persona who is completely loving, integrated, and at peace. The character's manifesto (provided in the user inputs) defines their worldview — they live it, they don't preach it.
ENFORCE MAXIMUM ENTITY DENSITY: Always prioritize maximum entity density by using the specific names, locations, brands, and concrete nouns provided by the user instead of generic summaries.
CREATIVITY RULE: You are a Visionary Biographer. The user gives you the 'seeds' (e.g., 'I dress well'). Your job is to grow the 'tree' (e.g., 'The closet is edited, not stuffed — every piece earns its place. A tailored blazer hangs next to broken-in denim, ready for whatever the evening demands.').
Fill in the gaps: If the user says they are a 'Gentleman,' invent how they keep their desk (impeccable), how they handle their laundry (folded immediately), and the scent of their home (warm amber and fresh linen).
Visualize: Use sensory language. Make the user feel the ideal life.`;

const PROMPT_IDEAL_BIBLE = `You are a Character Simulation Engine. Read the following User Inputs. Your task is to output a comprehensive Character Bible perfectly broken out into these 7 exact sections:
1. "Style & Presence" (Aesthetics, Wardrobe, Physicality)
2. "Daily Life & Habits" (Routines, Occupations, Passions)
3. "People & Connections" (Relationships, Communication, Social Interaction)
4. "The Inner Mind" (How they process emotions, crisis, and reality)
5. "Quirks & Details" (Pets, diet, languages, unique variables)
6. "Order & Sanctuary" (Cleanliness, organization, mise-en-place, how they maintain their home/car/workspace)
7. "The World I Love" (Music, Shows, Movies, Books, Food, Games, Sports — the named cultural touchpoints that define who they are)

CRITICAL FORMATTING RULE — SUBSECTIONS:
Each of the 7 sections above MUST be broken into multiple subsections using bold markdown subheadings. Use the format: **Subheading:** followed by the prose for that subsection.
The subsection names should be organic and character-specific — not generic labels. Here are examples of the kind of subsections expected for each section:
- "Style & Presence" → **The Closet:** A complete, specific, itemized wardrobe this character owns. List actual pieces across categories: suits, blazers, shirts, trousers, denim, outerwear/coats, shoes, underwear/basics, accessories (watches, belts, bags), and seasonal/travel pieces. Use specific brands and descriptions — this is the user's aspirational shopping list, not a mood board. **Grooming:** ... **Physicality:** ... **Travel Style:** ...
- "Daily Life & Habits" → **Morning Ritual:** ... **The Work:** ... **Weekend Mode:** ... **Passions:** ...
- "People & Connections" → EVERY person gets their OWN dedicated subsection: **Iris:** ... **Sage:** ... **Brian:** ... **Max:** ... etc. Do NOT group people together. Each person gets their own **Name:** heading. Include pets. End with **Communication Style:** and **Social Energy:** subsections.
  CRITICAL — MANIFESTO LENS: The people data below is raw reference material written from a human perspective. The CHARACTER is a completely loving, integrated person who has no problems with anyone. Others may carry friction toward the character, but the character does not carry it back. For each person, write how someone who FULLY LIVES the identity words would describe them — what they see, what they appreciate, what they understand.
- "The Inner Mind" → **Processing Emotions:** ... **Under Pressure:** ... **Self-Talk:** ... **Relationship with Reality:** ...
- "Quirks & Details" → **Diet:** ... **Languages:** ... **Guilty Pleasures:** ... **Pets:** ... (include only what applies)
- "Order & Sanctuary" → **The Home:** ... **The Car:** ... **The Workspace:** ... **Systems & Rituals:** ...
- "The World I Love" → **The Music:** ... **The Screen:** ... **The Table:** ... **The Game:** ...
  CRITICAL — NAMES NOT VIBES: This section exists to preserve the specific artists, shows, movies, books, foods, restaurants, games, and cultural references that make this person *them*. Do NOT abstract these into aesthetic descriptions. "Billie Eilish" must stay "Billie Eilish" — not become "dark, moody music." "Dr. Who" must stay "Dr. Who" — not become "a love of British sci-fi." Use the real names. Describe the *relationship* to each one — when they listen, how it makes them feel, what it means to them. If the user only gave a few seeds, extrapolate adjacent tastes that would logically fit, but always use specific names and titles, never genres or moods alone.
These are examples — you MUST adapt the subsection names to fit the actual character. Invent subsections that make sense for who they are. Every subsection must use the **Name:** format so the UI can parse them.

Crucial Instruction: Use the user inputs as your foundation, but actively extrapolate and invent logical details. Do not just repeat what I gave you; breathe life into them. Write the responses in the first person as if the character is describing themselves using their own voice, style, and tone. Do not include dates in the response. Use ages or durations instead. 

CRITICAL: Do NOT output "Core Beliefs" or "Manifesto" in the generated text, as the user already knows these.

CRITICAL CONTENT RULES:
SPECIFICITY OVER SUMMARY: You must use the specific proper nouns found in the user's source code.
Bad: 'I enjoy coffee and love my wife.'
Good: 'I enjoy espresso from my Jura and adore my wife Iris.'
INCLUDE THE DETAILS: If the user mentions specific brands (Jura, Boss), specific locations (Carlisle, Provence), or specific people (Sage, Brian), you MUST weave them into the narrative. Do not scrub these details. They are the soul of the character.
NO GENERALIZATIONS: Do not turn 'I started Atrium' into 'I started a business.' Use the specific facts provided.

User Inputs:
Identity: {DEFINING_WORDS}
The user defines themselves with these words. This IS their archetype — the core of who they are. Use these as the foundation for every aspect of the character's voice, decisions, and worldview.

Dream Living Situation: {DREAM_LIVING}
This is how the character lives. The home, the neighborhood, the space. Write as if this is already real and settled.

Dream Financial Situation: {DREAM_FINANCIAL}
This is the character's financial reality. Write as if this is already achieved and natural.

What They Want (Active Pursuits): {WANTS_ACTIVE}
These are things the character is actively working toward or acquiring. Weave these into the character's daily life, decisions, and near-term plans as active goals.

What They Already Have (Achieved): {WANTS_ACHIEVED}
These are things the character has already accomplished or acquired. Reference these as settled, proud facts of their life.

Physical Traits: {PHYSICAL_TRAITS}
Use these to inform the character's physicality, style choices, and presence. Do not repeat them verbatim — weave them naturally.

Important People (RAW REFERENCE — human perspective, not the character's voice):
{IMPORTANT_PEOPLE}

Things They Love: {THINGS_I_LOVE}`;

// ─── Core compile logic — called by processChat directly and via HTTP ───
export async function compileCharacterBibleForUser(uid: string): Promise<{ success: boolean; ideal?: any[]; error?: string }> {
    const userDocRef = db.collection('users').doc(uid);
    const userDoc = await userDocRef.get();
    const data = userDoc.data();

    if (!data) {
        return { success: false, error: 'User data not found' };
    }

    const providerOptions = {
        google: { safetySettings: SAFETY_SETTINGS },
    };

    const userLocale = data?.preferred_locale || 'en';

    // ─── Assemble inputs from My Life data ───

    // Defining words → replaces archetype
    const definingWords = data?.defining_words || [];
    const definingWordsString = definingWords.length > 0
        ? definingWords.join(', ')
        : 'Not specified';

    // Wants → split into active (unchecked) and achieved (checked)
    const wants = data?.wants || [];
    const activeWants = wants.filter((w: any) => !w.completed).map((w: any) => w.text);
    const achievedWants = wants.filter((w: any) => w.completed).map((w: any) => w.text);
    const wantsActiveString = activeWants.length > 0 ? activeWants.join(', ') : 'None specified';
    const wantsAchievedString = achievedWants.length > 0 ? achievedWants.join(', ') : 'None yet';

    // Dream living & financial
    const dreamLiving = data?.dream_living || 'Not specified';
    const dreamFinancial = data?.dream_financial || 'Not specified';

    // People
    const unifiedPeople = data?.people || [];
    const peopleString = unifiedPeople.length > 0
        ? unifiedPeople.map((p: any) =>
            `Name: ${p.name}\nRelationship: ${p.relationship}\nWho: ${p.who || 'N/A'}\nDynamic: ${p.dynamic || 'N/A'}`
        ).join('\n\n')
        : 'None';

    // Interests/loves
    const unifiedInterests = data?.interests || [];
    const interestsString = unifiedInterests.length > 0
        ? unifiedInterests.join(', ')
        : 'Not specified.';

    // Physical traits
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
    const physicalTraitsString = physicalTraits.length > 0 ? physicalTraits.join(', ') : 'Not specified';

    console.log(`[BibleCompile] Inputs for ${uid}: defining_words=${definingWordsString.substring(0, 50)}, wants_active=${activeWants.length}, wants_achieved=${achievedWants.length}, people=${unifiedPeople.length}, interests=${unifiedInterests.length}`);

    const idealPrompt = PROMPT_IDEAL_BIBLE
        .replace('{DEFINING_WORDS}', definingWordsString)
        .replace('{DREAM_LIVING}', dreamLiving)
        .replace('{DREAM_FINANCIAL}', dreamFinancial)
        .replace('{WANTS_ACTIVE}', wantsActiveString)
        .replace('{WANTS_ACHIEVED}', wantsAchievedString)
        .replace('{PHYSICAL_TRAITS}', physicalTraitsString)
        .replace('{IMPORTANT_PEOPLE}', peopleString)
        .replace('{THINGS_I_LOVE}', interestsString)
        + (userLocale !== 'en' ? `\n\nCRITICAL LANGUAGE INSTRUCTION: Write the ENTIRE character bible in ${userLocale === 'es' ? 'Spanish' : userLocale === 'pt' ? 'Portuguese' : userLocale === 'fr' ? 'French' : userLocale === 'de' ? 'German' : 'English'}. All section content must be in this language. Section headings may remain in English for parsing.` : '');

    // Generate Ideal Bible
    const idealResult = await generateWithFallback({
        primaryModelId: OPUS_MODEL,
        abortSignal: AbortSignal.timeout(480_000), // 8 min — Cloud Functions have room
        maxTokens: 16000,
        providerOptions,
        system: SYSTEM_PROMPT,
        prompt: idealPrompt,
        schema: z.object({
            Style_and_Presence: z.string().describe("Aesthetics, Wardrobe, Physicality"),
            Daily_Life_and_Habits: z.string().describe("Routines, Occupations, Passions"),
            People_and_Connections: z.string().describe("Relationships, Communication, Social Interaction"),
            The_Inner_Mind: z.string().describe("How they process emotions, crisis, and reality"),
            Quirks_and_Details: z.string().describe("Pets, diet, languages, unique variables"),
            Order_and_Sanctuary: z.string().describe("Cleanliness, organization, mise-en-place, how they maintain their home/car/workspace"),
            The_World_I_Love: z.string().describe("The cultural identity — specific artists, shows, movies, books, food, music, games, sports, and the named things that define their taste. Use real names, not abstractions.")
        })
    });

    const rawObj = idealResult.object as any;

    // Debug: log each section's content length
    const sectionKeys = ['Style_and_Presence', 'Daily_Life_and_Habits', 'People_and_Connections', 'The_Inner_Mind', 'Quirks_and_Details', 'Order_and_Sanctuary', 'The_World_I_Love'];
    const sectionLengths = sectionKeys.map(k => `${k}=${(rawObj[k] || '').length}`).join(', ');
    console.log(`[BibleCompile] Model output lengths: ${sectionLengths}`);

    const idealSections = [
        { heading: "Style & Presence", content: rawObj.Style_and_Presence },
        { heading: "Daily Life & Habits", content: rawObj.Daily_Life_and_Habits },
        { heading: "People & Connections", content: rawObj.People_and_Connections },
        { heading: "The Inner Mind", content: rawObj.The_Inner_Mind },
        { heading: "Quirks & Details", content: rawObj.Quirks_and_Details },
        { heading: "Order & Sanctuary", content: rawObj.Order_and_Sanctuary },
        { heading: "The World I Love", content: rawObj.The_World_I_Love },
    ];

    // Save back to Firestore
    if (userDoc.exists) {
        // Resolve character name
        const userProvidedName = data?.name || '';
        let characterName = userProvidedName;

        if (!characterName) {
            try {
                const nameResult = await generateWithFallback({
                    primaryModelId: OPUS_MODEL,
                    abortSignal: AbortSignal.timeout(15_000),
                    prompt: `Based on this character archetype "${definingWordsString}" generate a single fitting first name for this character. Output ONLY the name, nothing else.`,
                    schema: z.object({ name: z.string().describe("A single first name") }),
                });
                characterName = (nameResult.object as any).name || 'The Architect';
            } catch {
                characterName = 'The Architect';
            }
        }

        // Auto-default voice
        const freshVoiceSnap = await userDocRef.get();
        const freshData = freshVoiceSnap.data() || {};
        let voiceId = freshData.voice?.id || '';
        let voiceName = freshData.voice?.name || '';

        if (!voiceId) {
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
                if (apiKey) {
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

                    if (voiceRes.ok) {
                        const voiceData = await voiceRes.json();
                        const topVoice = voiceData.voices?.[0];
                        if (topVoice) {
                            voiceId = topVoice.voice_id;
                            voiceName = topVoice.name;
                            console.log(`[BibleCompile] Auto-assigned voice: ${voiceName} (${voiceId})`);
                        }
                    }
                }
            } catch (err: any) {
                console.error('[BibleCompile] Voice auto-default failed (non-fatal):', err.message);
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

// ─── HTTP Cloud Function — for manual triggers and onboarding ───
export const compileCharacterBible = onRequest(
    { timeoutSeconds: 540, memory: '1GiB' },
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
            const result = await compileCharacterBibleForUser(uid);
            if (result.success) {
                res.json(result);
            } else {
                res.status(400).json(result);
            }
        } catch (error: any) {
            console.error('[BibleCompile] Error:', error.message);
            if (error.name === 'AbortError' || (error.message || '').toLowerCase().includes('timeout')) {
                res.status(504).json({
                    success: false,
                    errorType: 'TIMEOUT',
                    message: 'Bible compilation timed out. Will retry automatically.',
                });
            } else {
                res.status(500).json({ error: error.message || 'Unexpected error' });
            }
        }
    }
);

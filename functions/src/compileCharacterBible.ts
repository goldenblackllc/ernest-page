import { onRequest } from 'firebase-functions/v2/https';
import { z } from 'zod';
import * as admin from 'firebase-admin';
import { generateWithFallback, OPUS_MODEL } from './lib/ai/models.js';
import { REALITY_RULES } from './lib/constants/realityRules.js';
import { computeAge } from './lib/utils/parseBirthDate.js';

const db = admin.firestore();

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
- "People & Connections" → EVERY person gets their OWN dedicated subsection: **Iris:** ... **Sage:** ... **Brian:** ... **Max:** ... etc. Do NOT group people together (e.g., "**Iris's Family:**" cramming mother, father, brother into one paragraph). Each person deserves their own **Name:** heading with a full description of who they are and how the character relates to them. Include pets. End with **Communication Style:** and **Social Energy:** subsections. This should be the LONGEST section — give it room to breathe.
  CRITICAL — FACTS NOT JUDGMENTS: For this section, extract factual relationship details (names, roles, ages, relationship dynamics like jealousy, estrangement, or distance) but do NOT incorporate the user's personal emotional judgments, complaints, or negative opinions about people. Example: "His sister-in-law harbors jealousy toward his family" is a fact to include. "I hate my sister" is a personal judgment to exclude. The character sees relationships through the lens of the Reality Rules — they understand the beliefs behind friction but do not adopt the user's raw grievances.
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
NO GENERALIZATIONS: Do not turn 'I started Atrium' into 'I started a business.' Use the specific facts provided in the constraints and manifesto.

User Inputs:
Archetype: {ARCHETYPE}
Manifesto: {MANIFESTO}
Important People: {IMPORTANT_PEOPLE}
Things they enjoy: {THINGS_I_ENJOY}`;

// ─── Core compile logic — called by processChat directly and via HTTP ───
export async function compileCharacterBibleForUser(uid: string, sourceCodeOverride?: any): Promise<{ success: boolean; ideal?: any[]; error?: string }> {
    const userDocRef = db.collection('users').doc(uid);
    const userDoc = await userDocRef.get();
    const data = userDoc.data();

    const resolvedSourceCode = sourceCodeOverride || data?.character_bible?.source_code;
    if (!resolvedSourceCode) {
        return { success: false, error: 'Missing source_code and no existing bible found' };
    }

    const providerOptions = {
        google: { safetySettings: SAFETY_SETTINGS },
    };

    const userLocale = data?.preferred_locale || 'en';

    // Read people from unified profile (master list)
    const unifiedPeople = data?.unified_profile?.people || [];
    const peopleString = unifiedPeople.length > 0
        ? unifiedPeople.map((p: any) =>
            `Name: ${p.name}\nRelationship: ${p.relationship}\nWho: ${p.who || 'N/A'}\nDynamic: ${p.dynamic || 'N/A'}`
        ).join('\n\n')
        : resolvedSourceCode.important_people || 'None';

    // Read interests from unified profile
    const unifiedInterests = data?.unified_profile?.interests || [];
    const interestsString = unifiedInterests.length > 0
        ? unifiedInterests.join(', ')
        : resolvedSourceCode.things_i_enjoy || 'Not specified.';

    console.log(`[BibleCompile] Inputs for ${uid}: archetype=${(resolvedSourceCode.archetype || 'EMPTY').substring(0, 50)}, manifesto=${(resolvedSourceCode.manifesto || 'EMPTY').substring(0, 50)}, people=${unifiedPeople.length} entries, interests=${unifiedInterests.length} entries`);

    const idealPrompt = PROMPT_IDEAL_BIBLE
        .replace('{ARCHETYPE}', resolvedSourceCode.archetype || 'None')
        .replace('{MANIFESTO}', resolvedSourceCode.manifesto || 'None')
        .replace('{IMPORTANT_PEOPLE}', peopleString)
        .replace('{THINGS_I_ENJOY}', interestsString)
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
        const currentBible = data?.character_bible || { source_code: resolvedSourceCode, compiled_bible: {}, compiled_output: { ideal: [] }, last_updated: Date.now() };

        // Resolve character name
        const userProvidedName = data?.identity?.character_name || '';
        let characterName = userProvidedName;

        if (!characterName) {
            try {
                const nameResult = await generateWithFallback({
                    primaryModelId: OPUS_MODEL,
                    abortSignal: AbortSignal.timeout(15_000),
                    prompt: `Based on this character archetype "${resolvedSourceCode.archetype || 'Unknown'}" and manifesto "${(resolvedSourceCode.manifesto || '').slice(0, 200)}", generate a single fitting first name for this character. Output ONLY the name, nothing else.`,
                    schema: z.object({ name: z.string().describe("A single first name") }),
                });
                characterName = (nameResult.object as any).name || 'The Architect';
            } catch {
                characterName = 'The Architect';
            }
        }

        // Auto-default voice
        const freshVoiceSnap = await userDocRef.get();
        const freshBible = freshVoiceSnap.data()?.character_bible || {};
        let voiceId = freshBible.voice_id || '';
        let voiceName = freshBible.voice_name || '';

        if (!voiceId) {
            try {
                const userGender = (data?.identity?.gender || '').toLowerCase();
                const userBirthdate = data?.identity?.birthdate || '';
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

        const updatedBible = {
            ...currentBible,
            source_code: {
                ...currentBible.source_code,
                ...resolvedSourceCode
            },
            compiled_output: {
                ...currentBible.compiled_output,
                ideal: idealSections
            },
            character_name: characterName,
            voice_id: voiceId,
            voice_name: voiceName,
            last_updated: Date.now()
        };

        // Save bible
        await userDocRef.set({
            character_bible: {
                ...updatedBible,
                avatar_status: 'pending',
                avatar_attempt_count: 0,
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

        const { uid, source_code } = req.body;
        if (!uid) {
            res.status(400).json({ error: 'Missing uid' });
            return;
        }

        try {
            const result = await compileCharacterBibleForUser(uid, source_code);
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

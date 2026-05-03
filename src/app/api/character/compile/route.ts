import { generateObject } from 'ai';
import { z } from 'zod';
import { db } from '@/lib/firebase/admin';
import { CharacterBible } from '@/types/character';
import { generateWithFallback, SONNET_MODEL } from '@/lib/ai/models';
import { REALITY_RULES } from '@/lib/constants/realityRules';
import { verifyInternalAuth, unauthorizedResponse } from '@/lib/auth/serverAuth';
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rateLimit';
import { generateVoiceDesignPrompt } from '@/lib/ai/voiceCatalog';
import { designAndSaveVoice } from '@/lib/ai/voiceDesign';

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
- "Style & Presence" → **Wardrobe:** ... **Grooming:** ... **Physicality:** ... **Travel Style:** ...
- "Daily Life & Habits" → **Morning Ritual:** ... **The Work:** ... **Weekend Mode:** ... **Passions:** ...
- "People & Connections" → One subsection per major person, e.g. **Iris:** ... **Sage:** ... **Brian:** ... plus **Communication Style:** ... **Social Energy:** ...
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

// Removed PROMPT_REALITY_BIBLE
export async function POST(req: Request) {
    try {
        if (!verifyInternalAuth(req)) return unauthorizedResponse();

        const payload = await req.json();
        const { uid, source_code } = payload;

        if (!uid || !source_code) {
            return Response.json({ error: "Missing uid or source_code" }, { status: 400 });
        }

        // In-memory burst guard (kept as first line of defense)
        const rl = checkRateLimit(`compile:${uid}`, RATE_LIMITS.compile);
        if (!rl.allowed) return rateLimitResponse(rl.resetMs);

        // ─── FIRESTORE-PERSISTED LIMITS (authoritative) ──────────────────
        const userDocRef = db.collection('users').doc(uid);
        const userDoc = await userDocRef.get();
        const data = userDoc.data();

        // Determine tier: paid users get higher limits
        const sub = data?.subscription;
        const hasActiveSub = sub?.status === 'active' && sub?.subscribedUntil && new Date(sub.subscribedUntil) > new Date();
        const isPaid = hasActiveSub;

        const MAX_COMPILES_PER_DAY = isPaid ? 10 : 3;
        const COOLDOWN_MS = isPaid ? 2 * 60_000 : 10 * 60_000; // 2 min paid, 10 min free

        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        const compilesToday = data?.compile_count_date === today ? (data?.compile_count || 0) : 0;
        const lastCompileAt = data?.last_compile_at || 0;
        const now = Date.now();

        // Daily cap check
        if (compilesToday >= MAX_COMPILES_PER_DAY) {
            return Response.json({
                error: `You've reached your daily limit of ${MAX_COMPILES_PER_DAY} character rebuilds. Come back tomorrow.`,
                limitType: 'daily',
                remaining: 0,
                resetsAt: 'midnight',
            }, { status: 429 });
        }

        // Cooldown check
        const timeSinceLast = now - lastCompileAt;
        if (lastCompileAt > 0 && timeSinceLast < COOLDOWN_MS) {
            const waitSec = Math.ceil((COOLDOWN_MS - timeSinceLast) / 1000);
            return Response.json({
                error: `Please wait ${waitSec > 60 ? Math.ceil(waitSec / 60) + ' minutes' : waitSec + ' seconds'} before rebuilding your character.`,
                limitType: 'cooldown',
                retryAfter: waitSec,
            }, { status: 429, headers: { 'Retry-After': String(waitSec) } });
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
                Order_and_Sanctuary: z.string().describe("Cleanliness, organization, mise-en-place, how they maintain their home/car/workspace"),
                The_World_I_Love: z.string().describe("The cultural identity — specific artists, shows, movies, books, food, music, games, sports, and the named things that define their taste. Use real names, not abstractions.")
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
            },
            {
                heading: "The World I Love",
                content: rawObj.The_World_I_Love
            }
        ];


        // Generate Reality Bible was here - removed.

        // Save back to Firestore
        if (userDoc.exists) {
            const currentBible: CharacterBible = data?.character_bible || { source_code, compiled_bible: {}, compiled_output: { ideal: [] }, last_updated: Date.now() };

            // Resolve character name: use user-provided name, or generate one
            const userProvidedName = data?.identity?.character_name || '';
            let characterName = userProvidedName;

            if (!characterName) {
                try {
                    const nameResult = await generateWithFallback({
                        primaryModelId: SONNET_MODEL,
                        abortSignal: AbortSignal.timeout(15_000),
                        prompt: `Based on this character archetype "${source_code.archetype || 'Unknown'}" and manifesto "${(source_code.manifesto || '').slice(0, 200)}", generate a single fitting first name for this character. Output ONLY the name, nothing else.`,
                        schema: z.object({ name: z.string().describe("A single first name") }),
                    });
                    characterName = (nameResult.object as any).name || 'The Architect';
                } catch {
                    characterName = 'The Architect';
                }
            }

            // ─── VOICE DESIGN — Generate a custom voice for the character ───
            const userGender = data?.identity?.gender || '';
            const userAge = data?.identity?.age || '';
            const userEthnicity = data?.identity?.ethnicity || '';

            let voiceId = '';
            let voiceDesignPrompt = '';
            let voicePreviews: any[] = [];
            try {
                // Step 1: AI generates the ElevenLabs voice design prompt
                voiceDesignPrompt = await generateVoiceDesignPrompt({
                    manifesto: source_code.manifesto || '',
                    archetype: source_code.archetype || '',
                    characterName,
                    gender: userGender,
                    age: userAge,
                    ethnicity: userEthnicity,
                    appLanguage: 'en', // TODO: derive from request headers
                });

                console.log('[Compile] Voice design prompt:', voiceDesignPrompt);

                // Step 2: Generate 3 previews, auto-select first, save to ElevenLabs
                const oldVoiceId = currentBible.voice_id;
                const result = await designAndSaveVoice(voiceDesignPrompt, characterName, oldVoiceId);
                voiceId = result.voice_id;
                voicePreviews = result.previews.map((p, i) => ({
                    generated_voice_id: p.generated_voice_id,
                    audio_base64: p.audio_base64,
                    duration_secs: p.duration_secs,
                    is_selected: i === result.selected_preview_index,
                }));
            } catch (err) {
                console.error('[Compile] Voice design failed (non-fatal):', err);
                // Preserve existing voice if design fails
                voiceId = currentBible.voice_id || '';
            }

            const updatedBible: CharacterBible = {
                ...currentBible,
                source_code: {
                    ...currentBible.source_code,
                    ...source_code
                },
                compiled_output: {
                    ...currentBible.compiled_output,
                    ideal: idealSections
                },
                character_name: characterName,
                voice_id: voiceId,
                voice_design_prompt: voiceDesignPrompt || currentBible.voice_design_prompt,
                voice_previews: voicePreviews.length > 0 ? voicePreviews : currentBible.voice_previews,
                last_updated: Date.now()
            };

            // Save bible + increment compile counters atomically
            await userDocRef.set({
                character_bible: updatedBible,
                compile_count: compilesToday + 1,
                compile_count_date: today,
                last_compile_at: Date.now(),
            }, { merge: true });
        }

        // Generate avatar — awaited so the client knows everything is ready
        const origin = new URL(req.url).origin;
        try {
            await fetch(`${origin}/api/character/avatar`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-internal-key': process.env.CRON_SECRET || '',
                },
                body: JSON.stringify({ uid }),
            });
        } catch (err) {
            console.error('[Compile] Avatar generation failed (non-fatal):', err);
        }

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
                headers: {
                    'Content-Type': 'application/json',
                    'x-internal-key': process.env.CRON_SECRET || '',
                },
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

import { z } from "zod";
import { db } from "@/lib/firebase/admin";
import { generateWithFallback, SONNET_MODEL } from "@/lib/ai/models";
import { FieldValue } from "firebase-admin/firestore";
import { waitUntil } from "@vercel/functions";
import { verifyAuth, unauthorizedResponse } from "@/lib/auth/serverAuth";

export const maxDuration = 120;

const PROCESS_PROMPT = `You are a Character Simulation Engine for a personal development platform.

A user has written a "dream rant" — a raw, unstructured description of who they wish they were, their ideal life, and their aspirations. Your job is to process this into three outputs:

1. TITLE: Extract 3 concrete, VISUAL roles from the rant. These should be nouns/roles that instantly paint a picture of who this person is — not abstract traits. The roles should be gendered when appropriate (e.g., "Father" not "Parent", "Gentleman" not "Person", "Mother" not "Caregiver"). Infer gender from context clues in the rant (mentions of being a father/mother, husband/wife, he/she, etc.). Use gendered language naturally.
   - GOOD: "Father, Husband, Gentleman" or "R&B Artist, Son" or "Chef, Traveler, Mother"
   - BAD: "Disciplined, Present, Free" (these are traits, not visual roles)
   - BAD: "Leader, Innovator, Visionary" (too corporate/generic)
   The title should be something someone could share with a stranger, and that stranger would immediately picture a type of person. Format: "Role, Role, Role"

2. DREAM SELF: Write a present-tense identity paragraph (3-5 sentences) describing this person AS IF THEY ALREADY ARE who they described. CRITICAL: The user may express desires as wishes ("I want to be rich", "I wish I was fit"). You MUST transform ALL wish-language into present-tense identity. "I wish I was rich" → "I am financially abundant." "I want to be a better father" → "I am a present, engaged father." The output must read as a confident, realized identity — never aspirational. Use pronouns/gendered language consistent with the rant.

3. INITIAL DOSSIER: Extract any concrete facts mentioned (location, family, occupation, preferences, gender). Format as a structured document. If facts are sparse, that's fine — the dossier will grow over time through conversations.

The dream rant:
"{RANT}"`;

const DOSSIER_TEMPLATE = `DOSSIER — {TITLE}
Updated: {DATE} | Sessions: 0

═══ PROFILE ═══
{PROFILE_FACTS}

═══ KEY PEOPLE ═══
{PEOPLE}

═══ ACTIVE GOALS ═══
{GOALS}

═══ PREFERENCES & STYLE ═══
{PREFERENCES}`;

export async function POST(req: Request) {
    try {
        const uid = await verifyAuth(req);
        if (!uid) return unauthorizedResponse();

        const body = await req.json();
        const rawBody = body;

        // Server-side length limits (defense-in-depth, mirrors client maxLength)
        const rant = (rawBody.rant || '').substring(0, 5000);
        const gender = (rawBody.gender || '').substring(0, 50);
        const age = (rawBody.age || '').substring(0, 4);
        const ethnicity = (rawBody.ethnicity || '').substring(0, 100);
        const important_people = (rawBody.important_people || '').substring(0, 3000);
        const things_i_enjoy = (rawBody.things_i_enjoy || '').substring(0, 3000);
        const character_name = (rawBody.character_name || '').substring(0, 100);

        if (!rant) {
            return Response.json(
                { error: "Rant is required." },
                { status: 400 }
            );
        }

        // Prepend gender/age/ethnicity context to the rant so the AI has it
        const contextPrefix = [
            gender ? `The user identifies as: ${gender}.` : null,
            age ? `Birth year: ${age}.` : null,
            ethnicity ? `Ethnicity: ${ethnicity}.` : null,
            important_people ? `People in their life: ${important_people}` : null,
            things_i_enjoy ? `Things they enjoy: ${things_i_enjoy}` : null,
        ].filter(Boolean).join('\n');

        const rantWithContext = contextPrefix
            ? `${contextPrefix}\n\n${rant}`
            : rant;

        const prompt = PROCESS_PROMPT.replace("{RANT}", rantWithContext);

        const result = await generateWithFallback({
            primaryModelId: SONNET_MODEL,
            prompt,
            schema: z.object({
                title: z.string().describe("3 visual roles, comma-separated"),
                dream_self: z.string().describe("Present-tense identity paragraph, 3-5 sentences"),
                dossier: z.object({
                    profile_facts: z.string().describe("Location, occupation, family — or 'Not yet known' if sparse"),
                    people: z.string().describe("Key people mentioned with relationships — or 'Not yet known'"),
                    goals: z.string().describe("Goals extracted from the rant"),
                    preferences: z.string().describe("Personal tastes: music, movies, books, food, drinks, brands, hobbies, routines — or 'Not yet known'"),
                }),
            }),
        });

        const data = result.object as {
            title: string;
            dream_self: string;
            dossier: {
                profile_facts: string;
                people: string;
                goals: string;
                preferences: string;
            };
        };

        // Build the dossier document
        const today = new Date().toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
        });
        const dossierText = DOSSIER_TEMPLATE
            .replace("{TITLE}", data.title)
            .replace("{DATE}", today)
            .replace("{PROFILE_FACTS}", data.dossier.profile_facts)
            .replace("{PEOPLE}", data.dossier.people)
            .replace("{GOALS}", data.dossier.goals)
            .replace("{PREFERENCES}", data.dossier.preferences);

        // Check if user already has an existing dossier (re-edit vs first onboarding)
        const existingUserDoc = await db.collection("users").doc(uid).get();
        const existingIdentity = existingUserDoc.data()?.identity;
        const hasExistingDossier = !!existingIdentity?.dossier;

        // Build identity — preserve existing dossier if one exists
        const identity: Record<string, any> = {
            title: data.title,
            dream_self: data.dream_self,
            dream_rant: rant,
            important_people: important_people || '',
            things_i_enjoy: things_i_enjoy || '',
            gender: gender || '',
            age: age || '',
            ethnicity: ethnicity || '',
            character_name: character_name || '',
        };

        if (!hasExistingDossier) {
            // First onboarding: set the initial dossier
            identity.dossier = dossierText;
            identity.dossier_updated_at = FieldValue.serverTimestamp();
            identity.session_count = 0;
        }
        // If dossier exists, we leave it untouched here.

        // Also populate the legacy source_code fields for backward compatibility
        const legacySourceCode = {
            archetype: data.title,
            manifesto: data.dream_self,
            core_beliefs: "",
            important_people: data.dossier.people,
            things_i_enjoy: data.dossier.preferences,
        };

        // Set status to 'compiling' so the feed can show the status card
        await db.collection("users").doc(uid).set(
            {
                identity,
                character_bible: {
                    source_code: legacySourceCode,
                    compiled_bible: {},
                    compiled_output: { ideal: [] },
                    last_updated: Date.now(),
                    status: 'compiling',
                },
            },
            { merge: true }
        );

        // Kick off bible + avatar generation in the background
        const origin = new URL(req.url).origin;
        waitUntil((async () => {
            try {
                console.log(`[Onboarding] Background: Starting bible compilation for ${uid}`);
                const compileRes = await fetch(`${origin}/api/character/compile`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-internal-key': process.env.CRON_SECRET || '',
                    },
                    body: JSON.stringify({
                        uid,
                        source_code: {
                            archetype: data.title,
                            manifesto: data.dream_self,
                            core_beliefs: '',
                            important_people: important_people || '',
                            things_i_enjoy: things_i_enjoy || '',
                        },
                    }),
                });

                if (!compileRes.ok) {
                    console.error(`[Onboarding] Background: Bible compile failed with status ${compileRes.status}`);
                    await db.collection("users").doc(uid).set({
                        character_bible: { status: 'failed' }
                    }, { merge: true });
                    return;
                }

                // Mark bible as ready + set last_commit so the feed auto-dismiss timer works
                await db.collection("users").doc(uid).set({
                    character_bible: { status: 'ready', last_commit: FieldValue.serverTimestamp() }
                }, { merge: true });

                console.log(`[Onboarding] Background: Complete for ${uid}`);
            } catch (err: any) {
                console.error(`[Onboarding] Background generation error for ${uid}:`, err.message);
                await db.collection("users").doc(uid).set({
                    character_bible: { status: 'failed' }
                }, { merge: true });
            }
        })());

        // Return immediately — client proceeds to dashboard
        return Response.json({
            success: true,
            title: data.title,
            dream_self: data.dream_self,
            dossier: dossierText,
        });
    } catch (error: any) {
        console.error("Onboarding Process API Error:", error);

        if (
            error.name === "AbortError" ||
            (error.message || "").toLowerCase().includes("timeout")
        ) {
            return Response.json(
                {
                    success: false,
                    errorType: "TIMEOUT",
                    message: "The algorithm is taking longer than expected. Please try again.",
                },
                { status: 504 }
            );
        }

        return Response.json(
            { error: error.message || "An unexpected error occurred." },
            { status: 500 }
        );
    }
}

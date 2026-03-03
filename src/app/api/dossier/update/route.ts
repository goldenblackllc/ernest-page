import { db } from "@/lib/firebase/admin";
import { generateTextWithFallback, SONNET_MODEL } from "@/lib/ai/models";
import { FieldValue } from "firebase-admin/firestore";

export const maxDuration = 60;

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { uid, conversation_summary } = body;

        if (!uid || !conversation_summary) {
            return Response.json(
                { error: "UID and conversation summary are required." },
                { status: 400 }
            );
        }

        // Fetch current identity
        const userDoc = await db.collection("users").doc(uid).get();
        const userData = userDoc.data();
        const identity = userData?.identity;

        if (!identity) {
            return Response.json(
                { error: "No identity found. User must complete onboarding first." },
                { status: 400 }
            );
        }

        const currentDossier = identity.dossier || "";
        const sessionCount = (identity.session_count || 0) + 1;

        const prompt = `You are maintaining a personal consultant's client dossier. Your job is to produce an updated dossier that captures everything important about this person.

CURRENT DOSSIER:
${currentDossier}

NEW SESSION TRANSCRIPT:
${conversation_summary}

INSTRUCTIONS:
- Read the transcript and extract any new facts about the client (people, places, preferences, events, goals, emotional patterns)
- Produce a COMPLETE REWRITE of the dossier — not an append. The output replaces the current dossier entirely.
- Keep all existing facts that are still relevant. Drop anything outdated or contradicted by new information.
- The dossier must be UNDER 1200 WORDS. If it grows beyond that, prioritize: active goals > key people > patterns > profile > preferences. Cut the least actionable details.
- Update session count to: ${sessionCount}
- Update date to today
- Write from the consultant's perspective — professional, structured, factual

Use this section format with ═══ headers:

DOSSIER — [Client Title]
Updated: [Date] | Sessions: ${sessionCount}

═══ PROFILE ═══
Gender, age, location, occupation, life stage, identity summary

═══ KEY PEOPLE ═══
Important relationships with enough detail to reference naturally in conversation

═══ ACTIVE GOALS ═══
What they are currently working toward — concrete and specific

═══ OBSERVED PATTERNS ═══
Recurring themes, blind spots, tendencies noticed across sessions

═══ PREFERENCES & STYLE ═══
How they communicate, what resonates, tastes and routines

Output the complete updated dossier as plain text.`;

        const result = await generateTextWithFallback({
            primaryModelId: SONNET_MODEL,
            prompt,
        });

        const updatedDossier = result.text;

        // Save updated dossier
        await db.collection("users").doc(uid).set(
            {
                identity: {
                    ...identity,
                    dossier: updatedDossier,
                    dossier_updated_at: FieldValue.serverTimestamp(),
                    session_count: sessionCount,
                },
            },
            { merge: true }
        );

        return Response.json({
            success: true,
            dossier: updatedDossier,
            session_count: sessionCount,
        });
    } catch (error: any) {
        console.error("Dossier Update API Error:", error);
        return Response.json(
            { error: error.message || "An unexpected error occurred." },
            { status: 500 }
        );
    }
}

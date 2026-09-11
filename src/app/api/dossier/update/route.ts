import { db } from "@/lib/firebase/admin";
import { generateTextWithFallback, OPUS_MODEL } from "@/lib/ai/models";
import { FieldValue } from "firebase-admin/firestore";
import { verifyInternalAuth, unauthorizedResponse } from "@/lib/auth/serverAuth";
import { buildDossierPrompt } from "@/lib/ai/dossierPrompt";

export const maxDuration = 60;

export async function POST(req: Request) {
    try {
        if (!verifyInternalAuth(req)) return unauthorizedResponse();

        const body = await req.json();
        const { uid, conversation_summary } = body;

        if (!uid || !conversation_summary) {
            return Response.json(
                { error: "UID and conversation summary are required." },
                { status: 400 }
            );
        }

        // Fetch current user data
        const userDoc = await db.collection("users").doc(uid).get();
        const userData = userDoc.data();

        if (!userData) {
            return Response.json(
                { error: "No user found. User must complete onboarding first." },
                { status: 400 }
            );
        }

        const currentDossier = userData.dossier || "";
        const sessionCount = (userData.session_count || 0) + 1;

        const prompt = `${buildDossierPrompt(currentDossier, sessionCount)}

NEW SESSION TRANSCRIPT:
${conversation_summary}`;

        const result = await generateTextWithFallback({
            primaryModelId: OPUS_MODEL,
            prompt,
        });

        const updatedDossier = result.text;

        // Save updated dossier
        await db.collection("users").doc(uid).set(
            {
                dossier: updatedDossier,
                dossier_updated_at: FieldValue.serverTimestamp(),
                session_count: sessionCount,
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

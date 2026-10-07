import { db } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { verifyAuth, unauthorizedResponse } from "@/lib/auth/serverAuth";

export const maxDuration = 60;

const DOSSIER_TEMPLATE = `DOSSIER — {TITLE}
Updated: {DATE} | Sessions: 0

═══ ABOUT ═══
{TITLE}

═══ IMPORTANT DATES ═══
Not yet known

═══ ROUTINES & HABITS ═══
Not yet known`;

export async function POST(req: Request) {
    try {
        const uid = await verifyAuth(req);
        if (!uid) return unauthorizedResponse();

        const body = await req.json();
        const definingWords: string[] = body.defining_words || [];
        const name: string = body.name || '';

        // Check if user already has an existing dossier (re-edit vs first onboarding)
        const existingUserDoc = await db.collection("users").doc(uid).get();
        const existingData = existingUserDoc.data();
        const hasExistingDossier = !!existingData?.dossier;

        // Build initial dossier from structured data (no AI needed)
        const title = definingWords.length > 0 ? definingWords.join(', ') : name;
        const today = new Date().toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
        });
        const dossierText = DOSSIER_TEMPLATE
            .replace(/\{TITLE\}/g, title)
            .replace("{DATE}", today);

        const updates: Record<string, any> = {};

        if (!hasExistingDossier) {
            updates.session_credits = 1;
            updates.dossier = dossierText;
            updates.dossier_updated_at = FieldValue.serverTimestamp();
            updates.session_count = 0;
        }

        if (Object.keys(updates).length > 0) {
            await db.collection("users").doc(uid).set(updates, { merge: true });
        }

        // Queue bible compile + avatar generation on Cloud Functions (returns immediately)
        const compileUrl = process.env.COMPILE_FUNCTION_URL || `https://us-central1-earnest-page.cloudfunctions.net/compileCharacterBible`;
        const compileRes = await fetch(compileUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-internal-key': process.env.CRON_SECRET || '',
            },
            body: JSON.stringify({ uid }),
            signal: AbortSignal.timeout(30_000),
        });
        if (!compileRes.ok) {
            console.error(`[Onboarding] Failed to queue bible build for ${uid}: ${compileRes.status}`);
            await db.collection("users").doc(uid).set({
                bible: { status: 'failed', fail_reason: 'compile_error' }
            }, { merge: true });
        }

        // Return immediately — client proceeds to dashboard
        return Response.json({ success: true });
    } catch (error: any) {
        console.error("Onboarding Process API Error:", error);

        if (
            error.name === "AbortError" ||
            (error.message || "").toLowerCase().includes("timeout")
        ) {
            return Response.json({ error: "Processing timed out" }, { status: 504 });
        }

        return Response.json({ error: "Unexpected error" }, { status: 500 });
    }
}

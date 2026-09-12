import { db } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { waitUntil } from "@vercel/functions";
import { verifyAuth, unauthorizedResponse } from "@/lib/auth/serverAuth";

export const maxDuration = 120;

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

        // Kick off bible + avatar generation in the background
        const origin = new URL(req.url).origin;
        waitUntil((async () => {
            try {
                console.log(`[Onboarding] Background: Starting bible compilation for ${uid}`);
                const compileUrl = process.env.COMPILE_FUNCTION_URL || `https://us-central1-earnest-page.cloudfunctions.net/compileCharacterBible`;
                const compileRes = await fetch(compileUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-internal-key': process.env.CRON_SECRET || '',
                    },
                    body: JSON.stringify({ uid }),
                    signal: AbortSignal.timeout(540_000),
                });

                if (!compileRes.ok) {
                    console.error(`[Onboarding] Background: Bible compile failed with status ${compileRes.status}`);
                    await db.collection("users").doc(uid).set({
                        bible: { status: 'failed', fail_reason: 'compile_error' }
                    }, { merge: true });
                    return;
                }

                // Mark bible as ready
                await db.collection("users").doc(uid).set({
                    bible: { status: 'ready', last_commit: FieldValue.serverTimestamp() }
                }, { merge: true });

                // Fire avatar generation independently
                fetch(`${origin}/api/character/avatar`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-internal-key': process.env.CRON_SECRET || '',
                    },
                    body: JSON.stringify({ uid }),
                }).catch(err => console.error(`[Onboarding] Avatar trigger failed (non-fatal):`, err.message));

                console.log(`[Onboarding] Background: Complete for ${uid}`);
            } catch (err: any) {
                console.error(`[Onboarding] Background generation error for ${uid}:`, err.message);
                await db.collection("users").doc(uid).set({
                    bible: { status: 'failed', fail_reason: err.message }
                }, { merge: true });
            }
        })());

        // Return immediately — client proceeds to dashboard
        return Response.json({ success: true });
    } catch (error: any) {
        console.error("Onboarding Process API Error:", error);

        if (
            error.name === "AbortError" ||
            (error.message || "").toLowerCase().includes("timeout")
        ) {
            return Response.json(
                { success: false, errorType: "TIMEOUT", message: "Processing timed out" },
                { status: 504 }
            );
        }

        return Response.json(
            { error: error.message || "Unexpected error" },
            { status: 500 }
        );
    }
}

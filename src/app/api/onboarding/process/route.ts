import { db } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { verifyAuth, unauthorizedResponse } from "@/lib/auth/serverAuth";
import { checkRateLimit, rateLimitResponse } from "@/lib/rateLimit";
import { generateWithFallback } from "@functions/lib/ai/models";
import { identityFromWords } from "@functions/lib/ai/identity";

export const maxDuration = 60;

const ONBOARDING_LIMIT = { maxRequests: 5, windowMs: 10 * 60_000 };

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

        const rateCheck = checkRateLimit(`onboarding:${uid}`, ONBOARDING_LIMIT);
        if (!rateCheck.allowed) return rateLimitResponse(rateCheck.resetMs);

        const body = await req.json();
        const definingWords: string[] = Array.isArray(body.defining_words)
            ? body.defining_words.filter((w: unknown): w is string => typeof w === 'string').map((w: string) => w.trim().slice(0, 60)).filter(Boolean).slice(0, 3)
            : [];
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

        const updates: Record<string, unknown> = {};

        if (!hasExistingDossier) {
            updates.dossier = dossierText;
            updates.dossier_updated_at = FieldValue.serverTimestamp();
            updates.session_count = 0;
        }

        // Who they decided to be, written from the words they chose, before the Bible is built from it
        if (!existingData?.identity && definingWords.length > 0) {
            updates.identity = await identityFromWords(definingWords, generateWithFallback).catch((error) => {
                console.error(`[Onboarding] Identity sentence failed for ${uid}:`, error);
                return { text: title, title };
            });
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
    } catch (error) {
        console.error("Onboarding Process API Error:", error);

        if (
            error instanceof Error &&
            (error.name === "AbortError" || error.message.toLowerCase().includes("timeout"))
        ) {
            return Response.json({ error: "Processing timed out" }, { status: 504 });
        }

        return Response.json({ error: "Unexpected error" }, { status: 500 });
    }
}

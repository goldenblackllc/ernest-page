import { db } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { verifyAuth, unauthorizedResponse } from "@/lib/auth/serverAuth";
import { checkRateLimit, rateLimitResponse } from "@/lib/rateLimit";
import { generateWithFallback } from "@functions/lib/ai/models";
import { deriveIdentityTitle } from "@functions/lib/ai/identity";
import { IDENTITY_MAX_LENGTH, type Identity } from "@functions/lib/identity";

export const maxDuration = 60;

const IDENTITY_LIMIT = { maxRequests: 10, windowMs: 10 * 60_000 };

/**
 * POST /api/identity: saves who the person decided to be, as they wrote it in
 * My Life, with a new title for their byline (functions/src/lib/identity.ts).
 * If the title can't be made, the text is saved with the old one. Empty text
 * clears it. The Bible is rebuilt from it. Body: { text }.
 */
export async function POST(req: Request) {
    const uid = await verifyAuth(req);
    if (!uid) return unauthorizedResponse();

    const rateCheck = checkRateLimit(`identity:${uid}`, IDENTITY_LIMIT);
    if (!rateCheck.allowed) return rateLimitResponse(rateCheck.resetMs);

    try {
        const { text } = await req.json();
        if (typeof text !== "string" || text.trim().length > IDENTITY_MAX_LENGTH) {
            return Response.json({ error: "Missing or too long text" }, { status: 400 });
        }
        const userRef = db.collection("users").doc(uid);
        const current: Identity | undefined = (await userRef.get()).data()?.identity;
        const trimmed = text.trim();
        if (trimmed === (current?.text ?? "")) return Response.json({ identity: current ?? null });

        const title = trimmed && await deriveIdentityTitle(trimmed, generateWithFallback).catch((error) => {
            console.error("Identity title failed, keeping the old one:", error);
            return current?.title ?? "";
        });
        const identity = trimmed ? { text: trimmed, title } : null;
        await userRef.set({
            identity: identity ?? FieldValue.delete(),
            bible_dirty_since: FieldValue.serverTimestamp(),
        }, { merge: true });
        return Response.json({ identity });
    } catch (error) {
        console.error("Identity save error:", error);
        return Response.json({ error: "Server error" }, { status: 500 });
    }
}

import { db, FieldValue } from "@/lib/firebase/admin";
import { verifyAuth, unauthorizedResponse } from "@/lib/auth/serverAuth";
import { commitment } from "@functions/lib/now";

/**
 * Now (functions/src/lib/now.ts): committing to an action, and dropping it without
 * a post. Only the server writes `users/{uid}.now`; the header and the docked card
 * read it live. Finishing is /api/now/posts.
 */

/** POST /api/now: commit to the picked option. Body: { options, action }. Replaces any action underway. */
export async function POST(req: Request) {
    const uid = await verifyAuth(req);
    if (!uid) return unauthorizedResponse();

    try {
        const body = await req.json().catch(() => null);
        const picked = commitment(body?.options, body?.action);
        if (!picked) return Response.json({ error: "Pick one of your options" }, { status: 400 });
        await db.collection("users").doc(uid).set(
            { now: { underway: { ...picked, started_at: FieldValue.serverTimestamp() } } },
            { merge: true },
        );
        return Response.json({ ok: true });
    } catch (error) {
        console.error("Now commit error:", error);
        return Response.json({ error: "Server error" }, { status: 500 });
    }
}

/** DELETE /api/now: drop the action underway, with no post. */
export async function DELETE(req: Request) {
    const uid = await verifyAuth(req);
    if (!uid) return unauthorizedResponse();

    try {
        await db.collection("users").doc(uid).set({ now: { underway: FieldValue.delete() } }, { merge: true });
        return Response.json({ ok: true });
    } catch (error) {
        console.error("Now drop error:", error);
        return Response.json({ error: "Server error" }, { status: 500 });
    }
}

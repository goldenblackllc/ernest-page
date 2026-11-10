import { db } from "@/lib/firebase/admin";
import { verifyAuth, unauthorizedResponse } from "@/lib/auth/serverAuth";
import { tickAction, type Action } from "@functions/lib/actions";
import { localDateKey, safeTimeZone } from "@functions/lib/utils/relativeDates";

/**
 * The person's actions and score (functions/src/lib/actions.ts). Only the server
 * writes them, in a transaction so a session being saved at the same time isn't lost.
 */
async function updateActions(uid: string, change: (actions: Action[]) => { actions: Action[]; points: number } | null): Promise<boolean> {
    const userRef = db.collection("users").doc(uid);
    return db.runTransaction(async (tx) => {
        const saved = (await tx.get(userRef)).data();
        const current: Action[] = saved?.actions || [];
        const next = change(current);
        if (!next) return false;
        if (next.actions === current) return true; // already as asked
        tx.update(userRef, {
            actions: next.actions,
            ...(next.points ? { action_score: Math.max(0, (saved?.action_score || 0) + next.points) } : {}),
        });
        return true;
    });
}

/** PATCH /api/actions: tick or untick an action for today in the person's time zone. Body: { id, done, timeZone }. */
export async function PATCH(req: Request) {
    const uid = await verifyAuth(req);
    if (!uid) return unauthorizedResponse();

    try {
        const { id, done, timeZone } = await req.json();
        if (typeof id !== "string" || typeof done !== "boolean") {
            return Response.json({ error: "Missing id or done" }, { status: 400 });
        }
        const today = localDateKey(new Date(), safeTimeZone(timeZone));
        const found = await updateActions(uid, (actions) => tickAction(actions, id, done, today));
        if (!found) return Response.json({ error: "Action not found" }, { status: 404 });
        return Response.json({ ok: true });
    } catch (error) {
        console.error("Action update error:", error);
        return Response.json({ error: "Server error" }, { status: 500 });
    }
}

/** DELETE /api/actions: remove an action. A point it earned today stays. Body: { id }. */
export async function DELETE(req: Request) {
    const uid = await verifyAuth(req);
    if (!uid) return unauthorizedResponse();

    try {
        const { id } = await req.json();
        if (typeof id !== "string") {
            return Response.json({ error: "Missing id" }, { status: 400 });
        }
        const found = await updateActions(uid, (actions) =>
            actions.some(c => c.id === id) ? { actions: actions.filter(c => c.id !== id), points: 0 } : null);
        if (!found) return Response.json({ error: "Action not found" }, { status: 404 });
        return Response.json({ ok: true });
    } catch (error) {
        console.error("Action delete error:", error);
        return Response.json({ error: "Server error" }, { status: 500 });
    }
}

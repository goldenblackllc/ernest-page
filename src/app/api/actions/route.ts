import { db } from "@/lib/firebase/admin";
import { verifyAuth, unauthorizedResponse } from "@/lib/auth/serverAuth";
import type { Action } from "@functions/lib/actions";

/**
 * The person's actions (functions/src/lib/actions.ts). Only the server writes
 * them, in a transaction so a session being saved at the same time isn't lost.
 */
async function updateActions(uid: string, change: (actions: Action[]) => Action[] | null): Promise<boolean> {
    const userRef = db.collection("users").doc(uid);
    return db.runTransaction(async (tx) => {
        const current: Action[] = (await tx.get(userRef)).data()?.actions || [];
        const next = change(current);
        if (!next) return false;
        tx.update(userRef, { actions: next });
        return true;
    });
}

/** PATCH /api/actions: tick or untick an action. Body: { id, done }. */
export async function PATCH(req: Request) {
    const uid = await verifyAuth(req);
    if (!uid) return unauthorizedResponse();

    try {
        const { id, done } = await req.json();
        if (typeof id !== "string" || typeof done !== "boolean") {
            return Response.json({ error: "Missing id or done" }, { status: 400 });
        }
        const found = await updateActions(uid, (actions) => {
            if (!actions.some(c => c.id === id)) return null;
            return actions.map(c => {
                if (c.id !== id) return c;
                return done
                    ? { ...c, done_at: c.done_at ?? Date.now() }
                    : { id: c.id, text: c.text, decided_on: c.decided_on };
            });
        });
        if (!found) return Response.json({ error: "Action not found" }, { status: 404 });
        return Response.json({ ok: true });
    } catch (error) {
        console.error("Action update error:", error);
        return Response.json({ error: "Server error" }, { status: 500 });
    }
}

/** DELETE /api/actions: remove an action. Body: { id }. */
export async function DELETE(req: Request) {
    const uid = await verifyAuth(req);
    if (!uid) return unauthorizedResponse();

    try {
        const { id } = await req.json();
        if (typeof id !== "string") {
            return Response.json({ error: "Missing id" }, { status: 400 });
        }
        const found = await updateActions(uid, (actions) =>
            actions.some(c => c.id === id) ? actions.filter(c => c.id !== id) : null);
        if (!found) return Response.json({ error: "Action not found" }, { status: 404 });
        return Response.json({ ok: true });
    } catch (error) {
        console.error("Action delete error:", error);
        return Response.json({ error: "Server error" }, { status: 500 });
    }
}

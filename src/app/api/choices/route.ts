import { db } from "@/lib/firebase/admin";
import { verifyAuth, unauthorizedResponse } from "@/lib/auth/serverAuth";
import type { Choice } from "@functions/lib/choices";

/**
 * The person's choices (functions/src/lib/choices.ts). Only the server writes
 * them, in a transaction so a session being saved at the same time isn't lost.
 */
async function updateChoices(uid: string, change: (choices: Choice[]) => Choice[] | null): Promise<boolean> {
    const userRef = db.collection("users").doc(uid);
    return db.runTransaction(async (tx) => {
        const current: Choice[] = (await tx.get(userRef)).data()?.choices || [];
        const next = change(current);
        if (!next) return false;
        tx.update(userRef, { choices: next });
        return true;
    });
}

/** PATCH /api/choices: tick or untick a choice. Body: { id, done }. */
export async function PATCH(req: Request) {
    const uid = await verifyAuth(req);
    if (!uid) return unauthorizedResponse();

    try {
        const { id, done } = await req.json();
        if (typeof id !== "string" || typeof done !== "boolean") {
            return Response.json({ error: "Missing id or done" }, { status: 400 });
        }
        const found = await updateChoices(uid, (choices) => {
            if (!choices.some(c => c.id === id)) return null;
            return choices.map(c => {
                if (c.id !== id) return c;
                return done
                    ? { ...c, done_at: c.done_at ?? Date.now() }
                    : { id: c.id, text: c.text, chosen_on: c.chosen_on };
            });
        });
        if (!found) return Response.json({ error: "Choice not found" }, { status: 404 });
        return Response.json({ ok: true });
    } catch (error) {
        console.error("Choice update error:", error);
        return Response.json({ error: "Server error" }, { status: 500 });
    }
}

/** DELETE /api/choices: remove a choice. Body: { id }. */
export async function DELETE(req: Request) {
    const uid = await verifyAuth(req);
    if (!uid) return unauthorizedResponse();

    try {
        const { id } = await req.json();
        if (typeof id !== "string") {
            return Response.json({ error: "Missing id" }, { status: 400 });
        }
        const found = await updateChoices(uid, (choices) =>
            choices.some(c => c.id === id) ? choices.filter(c => c.id !== id) : null);
        if (!found) return Response.json({ error: "Choice not found" }, { status: 404 });
        return Response.json({ ok: true });
    } catch (error) {
        console.error("Choice delete error:", error);
        return Response.json({ error: "Server error" }, { status: 500 });
    }
}

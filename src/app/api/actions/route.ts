import type { DocumentData } from "firebase-admin/firestore";
import { db } from "@/lib/firebase/admin";
import { verifyAuth, unauthorizedResponse } from "@/lib/auth/serverAuth";
import { tickAction, type Action } from "@functions/lib/actions";
import { localDateKey, safeTimeZone } from "@functions/lib/utils/relativeDates";

/** The person's actions and score as saved: what every reply here carries, so the drawer shows the server's list. */
type Saved = { actions: Action[]; score: number };

const savedOf = (data: DocumentData | undefined): Saved =>
    ({ actions: data?.actions || [], score: data?.action_score || 0 });

/**
 * The person's actions and score (functions/src/lib/actions.ts). Only the server
 * writes them, in a transaction so a session being saved at the same time isn't
 * lost. Returns the list as saved after the change, and whether the action was found.
 */
async function updateActions(uid: string, change: (actions: Action[]) => { actions: Action[]; points: number } | null): Promise<Saved & { found: boolean }> {
    const userRef = db.collection("users").doc(uid);
    return db.runTransaction(async (tx) => {
        const saved = savedOf((await tx.get(userRef)).data());
        const next = change(saved.actions);
        if (!next) return { ...saved, found: false };
        if (next.actions === saved.actions) return { ...saved, found: true }; // already as asked
        const score = next.points ? Math.max(0, saved.score + next.points) : saved.score;
        tx.update(userRef, {
            actions: next.actions,
            ...(next.points ? { action_score: score } : {}),
        });
        return { actions: next.actions, score, found: true };
    });
}

/** A change's reply: the saved list, with a 404 when there is no such action (it may have been merged or deleted since the drawer's list was read). */
function reply({ found, ...saved }: Saved & { found: boolean }) {
    return found ? Response.json(saved) : Response.json({ error: "Action not found", ...saved }, { status: 404 });
}

/** GET /api/actions: the saved actions and score. */
export async function GET(req: Request) {
    const uid = await verifyAuth(req);
    if (!uid) return unauthorizedResponse();

    try {
        const doc = await db.collection("users").doc(uid).get();
        return Response.json(savedOf(doc.data()));
    } catch (error) {
        console.error("Actions read error:", error);
        return Response.json({ error: "Server error" }, { status: 500 });
    }
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
        return reply(await updateActions(uid, (actions) => tickAction(actions, id, done, today)));
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
        return reply(await updateActions(uid, (actions) =>
            actions.some(c => c.id === id) ? { actions: actions.filter(c => c.id !== id), points: 0 } : null));
    } catch (error) {
        console.error("Action delete error:", error);
        return Response.json({ error: "Server error" }, { status: 500 });
    }
}

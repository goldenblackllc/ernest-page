import { Timestamp } from "firebase-admin/firestore";
import { db, FieldValue } from "@/lib/firebase/admin";
import { verifyAuth, unauthorizedResponse } from "@/lib/auth/serverAuth";
import { checkRateLimit, rateLimitResponse } from "@/lib/rateLimit";
import { cleanText, remainingOptions, type NowPostDoc } from "@functions/lib/now";
import { serializeNowPost } from "@/lib/posts/serializeNowPost";
import { deleteNowPhoto, isJpeg, saveNowPhoto } from "@/lib/now/nowPhotos";

export const maxDuration = 30;

/**
 * Now posts (functions/src/lib/now.ts): finishing the action underway, and the
 * person's own posts. Only their author ever reads them, here and in the feed.
 */

const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
/** Finishing can start a polish, an AI call (the polishNowPost function). */
const FINISH_LIMIT = { maxRequests: 30, windowMs: 60 * 60 * 1000 };
const POST_ID = /^[A-Za-z0-9]{1,40}$/;

const nowPosts = (uid: string) => db.collection("users").doc(uid).collection("now_posts");

/**
 * POST /api/now/posts: finish the action underway. Form data: text, polish ("true"),
 * photo (a JPEG, optional). Returns the post and the options Next brings back.
 */
export async function POST(req: Request) {
    const uid = await verifyAuth(req);
    if (!uid) return unauthorizedResponse();
    const rateCheck = checkRateLimit(`now-post:${uid}`, FINISH_LIMIT);
    if (!rateCheck.allowed) return rateLimitResponse(rateCheck.resetMs);

    let photoPath: string | null = null;
    try {
        const form = await req.formData().catch(() => null);
        if (!form) return Response.json({ error: "Expected form data" }, { status: 400 });
        const text = cleanText(form.get("text"));
        const polish = form.get("polish") === "true";
        const photo = form.get("photo");

        const userRef = db.collection("users").doc(uid);
        const postRef = nowPosts(uid).doc();
        const photoFields: { photo_url?: string; photo_path?: string } = {};
        if (photo instanceof Blob && photo.size > 0) {
            if (photo.size > MAX_PHOTO_BYTES) return Response.json({ error: "Photo too large" }, { status: 413 });
            const bytes = Buffer.from(await photo.arrayBuffer());
            if (!isJpeg(bytes)) return Response.json({ error: "Photo must be a JPEG" }, { status: 400 });
            const saved = await saveNowPhoto(uid, postRef.id, bytes);
            photoPath = saved.path;
            photoFields.photo_url = saved.url;
            photoFields.photo_path = saved.path;
        }

        const finished = await db.runTransaction(async (tx) => {
            const underway = (await tx.get(userRef)).data()?.now?.underway;
            if (!underway?.action) return null;
            const post: NowPostDoc = {
                action: underway.action as string,
                raw_text: text,
                polish: polish && text.length > 0,
                ...photoFields,
                started_at: underway.started_at ?? null,
                created_at: Timestamp.now(),
            };
            tx.set(postRef, post);
            tx.set(userRef, { now: { underway: FieldValue.delete(), polish } }, { merge: true });
            return { post, options: Array.isArray(underway.options) ? (underway.options as string[]) : [] };
        });
        if (!finished) {
            if (photoPath) await deleteNowPhoto(photoPath).catch(() => {});
            return Response.json({ error: "No action is underway" }, { status: 409 });
        }
        return Response.json({
            post: serializeNowPost(postRef.id, finished.post),
            remaining: remainingOptions(finished.options, finished.post.action),
        });
    } catch (error) {
        console.error("Now post error:", error);
        if (photoPath) await deleteNowPhoto(photoPath).catch(() => {});
        return Response.json({ error: "Server error" }, { status: 500 });
    }
}

/** GET /api/now/posts?id=: one of the person's posts, so its card can pick up the polished text. */
export async function GET(req: Request) {
    const uid = await verifyAuth(req);
    if (!uid) return unauthorizedResponse();

    try {
        const id = new URL(req.url).searchParams.get("id") || "";
        if (!POST_ID.test(id)) return Response.json({ error: "Missing id" }, { status: 400 });
        const snap = await nowPosts(uid).doc(id).get();
        if (!snap.exists) return Response.json({ error: "Post not found" }, { status: 404 });
        return Response.json({ post: serializeNowPost(snap.id, snap.data()!) });
    } catch (error) {
        console.error("Now post read error:", error);
        return Response.json({ error: "Server error" }, { status: 500 });
    }
}

/** PATCH /api/now/posts: switch a post between the polished words and the person's own. Body: { id, show_raw }. */
export async function PATCH(req: Request) {
    const uid = await verifyAuth(req);
    if (!uid) return unauthorizedResponse();

    try {
        const body = await req.json().catch(() => null);
        const id = body?.id;
        if (typeof id !== "string" || !POST_ID.test(id) || typeof body?.show_raw !== "boolean") {
            return Response.json({ error: "Missing id or show_raw" }, { status: 400 });
        }
        const ref = nowPosts(uid).doc(id);
        if (!(await ref.get()).exists) return Response.json({ error: "Post not found" }, { status: 404 });
        await ref.update({ show_raw: body.show_raw });
        return Response.json({ ok: true });
    } catch (error) {
        console.error("Now post update error:", error);
        return Response.json({ error: "Server error" }, { status: 500 });
    }
}

/** DELETE /api/now/posts: delete a post and its photo. Body: { id }. */
export async function DELETE(req: Request) {
    const uid = await verifyAuth(req);
    if (!uid) return unauthorizedResponse();

    try {
        const body = await req.json().catch(() => null);
        const id = body?.id;
        if (typeof id !== "string" || !POST_ID.test(id)) return Response.json({ error: "Missing id" }, { status: 400 });
        const ref = nowPosts(uid).doc(id);
        const snap = await ref.get();
        if (!snap.exists) return Response.json({ error: "Post not found" }, { status: 404 });
        await ref.delete();
        const photoPath = snap.data()?.photo_path;
        if (typeof photoPath === "string") {
            await deleteNowPhoto(photoPath).catch((err) => console.warn("Now photo delete failed:", err));
        }
        return Response.json({ ok: true });
    } catch (error) {
        console.error("Now post delete error:", error);
        return Response.json({ error: "Server error" }, { status: 500 });
    }
}

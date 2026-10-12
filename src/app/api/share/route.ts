import { db, FieldValue } from "@/lib/firebase/admin";
import { verifyAuth, unauthorizedResponse } from "@/lib/auth/serverAuth";
import { randomBytes } from "crypto";

/**
 * POST /api/share — Generate a share token for a post.
 * 
 * Only the post author can generate a share link.
 * Idempotent: if a shareToken already exists, returns it.
 */
export async function POST(req: Request) {
    const uid = await verifyAuth(req);
    if (!uid) return unauthorizedResponse();

    try {
        const { postId } = await req.json();
        if (!postId || typeof postId !== "string") {
            return Response.json({ error: "Missing postId" }, { status: 400 });
        }

        const postRef = db.collection("posts").doc(postId);
        const postDoc = await postRef.get();

        if (!postDoc.exists) {
            return Response.json({ error: "Post not found" }, { status: 404 });
        }

        const data = postDoc.data()!;

        // Only the author can generate a share link
        if (data.uid !== uid && data.authorId !== uid) {
            return Response.json({ error: "Forbidden" }, { status: 403 });
        }

        // Idempotent: return existing token if one already exists
        if (data.shareToken) {
            return Response.json({
                shareToken: data.shareToken,
            });
        }

        // Holding the link is the permission, so 128 random bits (22 URL-safe characters).
        // Sharing a private post also makes its media (functions/src/postExposure.ts).
        const shareToken = randomBytes(16).toString("base64url");

        await postRef.update({ shareToken });

        return Response.json({ shareToken });
    } catch (error) {
        console.error("Share token generation error:", error);
        return Response.json({ error: "Server error" }, { status: 500 });
    }
}

/**
 * DELETE /api/share — Stop sharing a post by link.
 *
 * Only the post author can. The old link stops working, and a private post's
 * media is deleted (functions/src/postExposure.ts).
 */
export async function DELETE(req: Request) {
    const uid = await verifyAuth(req);
    if (!uid) return unauthorizedResponse();

    try {
        const { postId } = await req.json();
        if (!postId || typeof postId !== "string") {
            return Response.json({ error: "Missing postId" }, { status: 400 });
        }

        const postRef = db.collection("posts").doc(postId);
        const postDoc = await postRef.get();
        if (!postDoc.exists) {
            return Response.json({ error: "Post not found" }, { status: 404 });
        }

        const data = postDoc.data()!;
        if (data.uid !== uid && data.authorId !== uid) {
            return Response.json({ error: "Forbidden" }, { status: 403 });
        }

        if (data.shareToken) await postRef.update({ shareToken: FieldValue.delete() });
        return Response.json({ success: true });
    } catch (error) {
        console.error("Share link removal error:", error);
        return Response.json({ error: "Server error" }, { status: 500 });
    }
}

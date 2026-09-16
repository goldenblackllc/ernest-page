import { db } from "@/lib/firebase/admin";
import { verifyAuth, unauthorizedResponse } from "@/lib/auth/serverAuth";
import { randomUUID } from "crypto";

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

        // Generate a short, URL-friendly token (first 12 chars of a UUID)
        const shareToken = randomUUID().replace(/-/g, "").slice(0, 12);

        await postRef.update({ shareToken });

        return Response.json({ shareToken });
    } catch (error: any) {
        console.error("Share token generation error:", error);
        return Response.json({ error: "Server error" }, { status: 500 });
    }
}

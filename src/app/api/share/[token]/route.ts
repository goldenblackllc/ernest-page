import { db } from "@/lib/firebase/admin";
import { serializePublicPost } from "@/lib/posts/serializePublicPost";

/**
 * GET /api/share/:token — Fetch a shared post by token.
 * 
 * No auth required — this is the public endpoint for shared post viewing.
 * Returns sanitized public post data (no PII, no raw content).
 */
export async function GET(
    req: Request,
    { params }: { params: Promise<{ token: string }> }
) {
    try {
        const { token } = await params;

        if (!token || token.length < 8) {
            return Response.json({ error: "Invalid token" }, { status: 400 });
        }

        // Look up the post by shareToken
        const snapshot = await db
            .collection("posts")
            .where("shareToken", "==", token)
            .limit(1)
            .get();

        if (snapshot.empty) {
            return Response.json({ error: "Post not found" }, { status: 404 });
        }

        const postDoc = snapshot.docs[0];
        const data = postDoc.data();

        // Shared posts skip the is_public gate: holding the token is the permission
        const post = await serializePublicPost(postDoc.id, data);

        return Response.json({ post });
    } catch (error) {
        console.error("Share fetch error:", error);
        return Response.json({ error: "Server error" }, { status: 500 });
    }
}

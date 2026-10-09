import { db } from "@/lib/firebase/admin";
import { serializePublicPost } from "@/lib/posts/serializePublicPost";

export async function GET(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        const postDoc = await db.collection("posts").doc(id).get();
        if (!postDoc.exists) {
            return Response.json({ error: "Post not found" }, { status: 404 });
        }

        const data = postDoc.data()!;

        // Only serve public posts
        if (data.is_public !== true) {
            return Response.json({ error: "Post not found" }, { status: 404 });
        }

        const post = await serializePublicPost(postDoc.id, data);

        return Response.json({ post });
    } catch (error) {
        console.error("Post fetch error:", error);
        return Response.json({ error: "Server error" }, { status: 500 });
    }
}

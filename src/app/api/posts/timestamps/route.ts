import { db } from "@/lib/firebase/admin";
import { verifyAuth, unauthorizedResponse } from "@/lib/auth/serverAuth";

/**
 * GET /api/posts/timestamps?id=<postId>
 *
 * The word timestamps a card's karaoke subtitles follow. The feed leaves them out
 * (they are most of a post's size), so each card loads its own before it plays.
 * Served for public posts and for the author's own.
 */
export async function GET(req: Request) {
    try {
        const uid = await verifyAuth(req);
        if (!uid) return unauthorizedResponse();

        const id = new URL(req.url).searchParams.get("id");
        if (!id) return Response.json({ error: "Missing id" }, { status: 400 });

        const snap = await db.collection("posts").doc(id).get();
        const data = snap.exists ? snap.data()! : null;
        const isAuthor = data && (data.authorId === uid || data.uid === uid);
        if (!data || (data.is_public !== true && !isAuthor)) {
            return Response.json({ error: "Post not found" }, { status: 404 });
        }

        return Response.json({
            audio_word_timestamps: data.audio_word_timestamps ?? null,
            short_audio_word_timestamps: data.short_audio_word_timestamps ?? null,
        });
    } catch (error) {
        console.error("Post timestamps error:", error);
        return Response.json({ error: "An unexpected error occurred." }, { status: 500 });
    }
}

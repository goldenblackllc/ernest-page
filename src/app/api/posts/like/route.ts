import { db } from "@/lib/firebase/admin";
import { getAuth } from "firebase-admin/auth";
import { FieldValue } from "firebase-admin/firestore";

export const maxDuration = 10;

/**
 * Karma Pool Likes — "Send It to the Universe"
 * 
 * When a user taps the heart on a post:
 * 1. The postId is recorded privately on the USER's document (liked_posts array).
 *    This is the user's private record — only they can see it.
 * 2. A random recent public post (not by the liker) receives +1 to its like_count.
 *    The karma goes to the universe, not the tapped post.
 * 
 * Privacy: No trace of the like exists on the post document itself.
 * The likedBy field on posts is NOT used — all like tracking lives on users/{uid}.
 */
export async function POST(req: Request) {
    try {
        // Authenticate via Firebase ID token
        const authHeader = req.headers.get("Authorization");
        if (!authHeader?.startsWith("Bearer ")) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const idToken = authHeader.split("Bearer ")[1];
        let uid: string;
        try {
            const decoded = await getAuth().verifyIdToken(idToken);
            uid = decoded.uid;
        } catch {
            return Response.json({ error: "Invalid token" }, { status: 401 });
        }

        // Read the postId the user tapped
        const { postId } = await req.json();

        // 1. Record the like privately on the user's document
        if (postId) {
            await db.collection("users").doc(uid).update({
                liked_posts: FieldValue.arrayUnion(postId),
            });
        }

        // 2. Karma redistribution — send +1 to a random post
        const recentSnap = await db.collection("posts")
            .where("is_public", "==", true)
            .where("status", "==", "completed")
            .orderBy("created_at", "desc")
            .limit(50)
            .get();

        // Filter out liker's own posts
        const candidates = recentSnap.docs.filter(doc => {
            const data = doc.data();
            return data.authorId !== uid && data.uid !== uid;
        });

        if (candidates.length > 0) {
            const randomIndex = Math.floor(Math.random() * candidates.length);
            const luckyPost = candidates[randomIndex];
            await luckyPost.ref.update({
                like_count: FieldValue.increment(1),
            });
        }

        return Response.json({ success: true });
    } catch (error: any) {
        console.error("Karma like error:", error);
        return Response.json(
            { error: error.message || "An unexpected error occurred." },
            { status: 500 }
        );
    }
}

import { db } from "@/lib/firebase/admin";
import { verifyAuth, unauthorizedResponse } from "@/lib/auth/serverAuth";
import { FieldValue } from "firebase-admin/firestore";
import { checkRateLimit, rateLimitResponse } from "@/lib/rateLimit";

export const maxDuration = 10;

/**
 * Karma Pool Likes — "Send It to the Universe"
 * 
 * When a user taps the heart on a post:
 * 1. The postId is recorded as a document in the user's liked_posts subcollection.
 *    Path: users/{uid}/liked_posts/{postId}  — private to the user.
 * 2. A random recent public post (not by the liker) receives +1 to its like_count.
 *    The karma goes to the universe, not the tapped post.
 * 
 * Privacy: No trace of the like exists on the post document itself.
 */
export async function POST(req: Request) {
    try {
        // Authenticate via Firebase ID token
        const uid = await verifyAuth(req);
        if (!uid) return unauthorizedResponse();

        // Rate limit: 30 likes per minute per user
        const rl = checkRateLimit(`like:${uid}`, { maxRequests: 30, windowMs: 60_000 });
        if (!rl.allowed) return rateLimitResponse(rl.resetMs);

        // Read the postId the user tapped
        const { postId } = await req.json();

        // 1. Record the like privately in the user's liked_posts subcollection
        if (postId) {
            await db.collection("users").doc(uid)
                .collection("liked_posts").doc(postId)
                .set({ liked_at: FieldValue.serverTimestamp() });
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
        return Response.json({ error: "An unexpected error occurred." }, { status: 500 });
    }
}

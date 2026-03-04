import { db } from "@/lib/firebase/admin";
import { getAuth } from "firebase-admin/auth";
import { FieldValue } from "firebase-admin/firestore";

export const maxDuration = 10;

/**
 * Karma Pool Likes — "Send It to the Universe"
 * 
 * When a user taps the heart, the like is NOT applied to
 * the post they liked. Instead, a random recent public post
 * (not by the liker) receives +1 to its like_count.
 * 
 * The liker gets the dopamine of tapping the heart.
 * A random author gets the warmth of being liked.
 * Nobody knows who liked what or where the likes came from.
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

        // Find recent public posts not authored by the liker
        const cutoff = new Date();
        cutoff.setHours(cutoff.getHours() - 48);

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

        if (candidates.length === 0) {
            // No candidates — silently succeed (user still gets their heart fill)
            return Response.json({ success: true });
        }

        // Pick a random candidate
        const randomIndex = Math.floor(Math.random() * candidates.length);
        const luckyPost = candidates[randomIndex];

        // Increment its like_count
        await luckyPost.ref.update({
            like_count: FieldValue.increment(1),
        });

        return Response.json({ success: true });
    } catch (error: any) {
        console.error("Karma like error:", error);
        return Response.json(
            { error: error.message || "An unexpected error occurred." },
            { status: 500 }
        );
    }
}

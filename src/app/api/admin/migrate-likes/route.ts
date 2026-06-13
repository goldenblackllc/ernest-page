import { db } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";

export const maxDuration = 300;

/**
 * One-time migration: copies liked_posts array entries from each user doc
 * into the users/{uid}/liked_posts/{postId} subcollection.
 *
 * Protected by ADMIN_SECRET environment variable.
 * Safe to run multiple times — subcollection .set() is idempotent.
 *
 * Usage: POST /api/admin/migrate-likes
 * Headers: Authorization: Bearer <ADMIN_SECRET>
 */
export async function POST(req: Request) {
    try {
        // Authenticate via admin secret
        const authHeader = req.headers.get("Authorization");
        if (!authHeader?.startsWith("Bearer ") || authHeader.split("Bearer ")[1] !== process.env.ADMIN_SECRET) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const usersSnap = await db.collection("users").get();

        let usersProcessed = 0;
        let likesProcessed = 0;
        let usersSkipped = 0;

        for (const userDoc of usersSnap.docs) {
            const data = userDoc.data();
            const likedPosts: string[] = data.liked_posts || [];

            if (likedPosts.length === 0) {
                usersSkipped++;
                continue;
            }

            // Batch write liked_posts array entries into the subcollection
            // Firestore batches limited to 500 writes
            const BATCH_LIMIT = 450;
            for (let i = 0; i < likedPosts.length; i += BATCH_LIMIT) {
                const chunk = likedPosts.slice(i, i + BATCH_LIMIT);
                const batch = db.batch();

                for (const postId of chunk) {
                    const ref = db.collection("users").doc(userDoc.id)
                        .collection("liked_posts").doc(postId);
                    batch.set(ref, { liked_at: FieldValue.serverTimestamp() }, { merge: true });
                }

                await batch.commit();
                likesProcessed += chunk.length;
            }

            usersProcessed++;
        }

        return Response.json({
            success: true,
            usersProcessed,
            usersSkipped,
            likesProcessed,
            totalUsers: usersSnap.size,
        });
    } catch (error: any) {
        console.error("Migration error:", error);
        return Response.json(
            { error: error.message || "Migration failed" },
            { status: 500 }
        );
    }
}

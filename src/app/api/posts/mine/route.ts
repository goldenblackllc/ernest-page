import { db } from "@/lib/firebase/admin";
import { getAuth } from "firebase-admin/auth";

export const maxDuration = 15;

const PAGE_SIZE = 15;

export async function GET(req: Request) {
    try {
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

        const url = new URL(req.url);
        const cursor = url.searchParams.get("cursor");
        const limit = Math.min(parseInt(url.searchParams.get("limit") || String(PAGE_SIZE)), 50);

        const postsRef = db.collection("posts");

        try {
            let query = postsRef
                .where("authorId", "==", uid)
                .orderBy("created_at", "desc");

            if (cursor) {
                query = query.where("created_at", "<", new Date(cursor));
            }

            const snap = await query.limit(limit).get();

            const posts = snap.docs.map(doc => {
                const data = doc.data();
                const clean: any = { id: doc.id, ...data };

                // Convert timestamps
                if (clean.created_at && clean.created_at._seconds !== undefined) {
                    clean.created_at = {
                        _seconds: clean.created_at._seconds,
                        _nanoseconds: clean.created_at._nanoseconds || 0,
                    };
                }

                return clean;
            });

            let nextCursor: string | null = null;
            if (posts.length === limit) {
                const lastPost = posts[posts.length - 1];
                const lastTime = lastPost.created_at?._seconds
                    ? lastPost.created_at._seconds * 1000
                    : null;
                if (lastTime) {
                    nextCursor = new Date(lastTime).toISOString();
                }
            }

            return Response.json({ posts, nextCursor });
        } catch (indexErr) {
            // Fallback without ordering
            console.warn("My posts index missing, fallback:", indexErr);
            const snap = await postsRef.where("authorId", "==", uid).get();
            const posts = snap.docs.map(doc => {
                const data = doc.data();
                const clean: any = { id: doc.id, ...data };
                if (clean.created_at && clean.created_at._seconds !== undefined) {
                    clean.created_at = {
                        _seconds: clean.created_at._seconds,
                        _nanoseconds: clean.created_at._nanoseconds || 0,
                    };
                }
                return clean;
            });
            // Manual sort
            posts.sort((a: any, b: any) => {
                const aT = a.created_at?._seconds || 0;
                const bT = b.created_at?._seconds || 0;
                return bT - aT;
            });
            return Response.json({ posts, nextCursor: null });
        }
    } catch (error: any) {
        console.error("My Posts API Error:", error);
        return Response.json({ error: error.message || "An unexpected error occurred." }, { status: 500 });
    }
}

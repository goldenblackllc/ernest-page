import { db } from "@/lib/firebase/admin";
import { verifyAuth, unauthorizedResponse } from "@/lib/auth/serverAuth";
import { serializePostsForViewer } from "@/lib/posts/serializePosts";

export const maxDuration = 15;

const PAGE_SIZE = 15;

export async function GET(req: Request) {
    try {
        const uid = await verifyAuth(req);
        if (!uid) return unauthorizedResponse();

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

            const posts = await serializePostsForViewer(
                snap.docs.map(doc => ({ id: doc.id, ...doc.data() })),
                uid,
            );

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
            const posts = await serializePostsForViewer(
                snap.docs.map(doc => ({ id: doc.id, ...doc.data() })),
                uid,
            );
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
        return Response.json({ error: "An unexpected error occurred." }, { status: 500 });
    }
}

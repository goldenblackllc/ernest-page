import { db } from "@/lib/firebase/admin";
import { getAuth } from "firebase-admin/auth";

export const maxDuration = 30;

export async function GET(req: Request) {
    try {
        // 1. Authenticate the caller via Firebase ID token
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

        // 2. Fetch user profile for feed algorithm
        const userDoc = await db.collection("users").doc(uid).get();
        const userData = userDoc.data() || {};
        const followingMap: Record<string, string> = userData.following || {};
        const followedIds = Object.keys(followingMap);
        const myRegion = userData.region || "";

        // 3. Run the blended feed query (same logic as old Ledger.tsx)
        const postsRef = db.collection("posts");
        const seenIds = new Set<string>();
        const allPosts: any[] = [];

        const addPosts = (docs: FirebaseFirestore.QueryDocumentSnapshot[]) => {
            docs.forEach((doc) => {
                if (!seenIds.has(doc.id)) {
                    seenIds.add(doc.id);
                    allPosts.push({ id: doc.id, ...doc.data() });
                }
            });
        };

        // Bucket A: My posts
        try {
            const snapA = await postsRef
                .where("authorId", "==", uid)
                .orderBy("created_at", "desc")
                .limit(10)
                .get();
            addPosts(snapA.docs);
        } catch {
            const snapA = await postsRef
                .where("authorId", "==", uid)
                .limit(20)
                .get();
            addPosts(snapA.docs);
        }

        // Bucket B: Following (chunked, 'in' supports max 10)
        for (let i = 0; i < followedIds.length; i += 10) {
            const chunk = followedIds.slice(i, i + 10);
            try {
                const snapB = await postsRef
                    .where("authorId", "in", chunk)
                    .orderBy("created_at", "desc")
                    .limit(10)
                    .get();
                addPosts(snapB.docs);
            } catch {
                const snapB = await postsRef
                    .where("authorId", "in", chunk)
                    .limit(20)
                    .get();
                addPosts(snapB.docs);
            }
        }

        // Bucket C: Discovery
        const snapC = await postsRef
            .orderBy("created_at", "desc")
            .limit(25)
            .get();
        const discoveryDocs = snapC.docs.filter((doc) => {
            const data = doc.data();
            const isMe = data.authorId === uid;
            const isFollowed = followedIds.includes(data.authorId);
            const isSameRegion = myRegion && data.region === myRegion;
            return !isMe && !isFollowed && !isSameRegion;
        });
        addPosts(discoveryDocs.slice(0, 15));

        // 4. Sort chronologically
        allPosts.sort((a, b) => {
            const aTime = a.created_at?.toMillis?.() || a.created_at?._seconds * 1000 || 0;
            const bTime = b.created_at?.toMillis?.() || b.created_at?._seconds * 1000 || 0;
            return bTime - aTime;
        });

        // 5. Sanitize: strip private fields from non-owned posts, replace likedBy
        const sanitized = allPosts.map((post) => {
            const isOwner = post.authorId === uid || post.uid === uid;
            const likedBy: string[] = post.likedBy || [];
            const isLikedByMe = likedBy.includes(uid);

            // Build the sanitized post
            const clean: any = { ...post };

            // Replace likedBy with isLikedByMe for ALL posts
            delete clean.likedBy;
            clean.isLikedByMe = isLikedByMe;

            // Strip private fields from posts that don't belong to the user
            if (!isOwner) {
                delete clean.content_raw;
                delete clean.rant;
                delete clean.conversation_messages;
                delete clean.counsel;
                delete clean.like_count;
            }

            // Convert Firestore Timestamps to serializable format
            if (clean.created_at && clean.created_at._seconds !== undefined) {
                clean.created_at = {
                    _seconds: clean.created_at._seconds,
                    _nanoseconds: clean.created_at._nanoseconds || 0,
                };
            }

            return clean;
        });

        return Response.json({
            posts: sanitized,
            following: followingMap,
            savedPosts: userData.saved_posts || [],
        });
    } catch (error: any) {
        console.error("Feed API Error:", error);
        return Response.json(
            { error: error.message || "An unexpected error occurred." },
            { status: 500 }
        );
    }
}

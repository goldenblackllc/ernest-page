import { db } from "@/lib/firebase/admin";
import { getAuth } from "firebase-admin/auth";

export const maxDuration = 30;

const FEED_LIMIT = 20;

export async function GET(req: Request) {
    try {
        // 1. Authenticate
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

        // 2. Parse optional newer_than param (for new-post detection)
        const url = new URL(req.url);
        const newerThan = url.searchParams.get("newer_than"); // ISO timestamp
        const newerThanDate = newerThan ? new Date(newerThan) : null;

        // 3. Fetch user profile
        const userDoc = await db.collection("users").doc(uid).get();
        const userData = userDoc.data() || {};
        const followingMap: Record<string, string> = userData.following || {};
        const followedIds = Object.keys(followingMap);
        const myRegion = userData.region || "";

        // 4. Chronological feed: fetch from all buckets, merge, sort newest-first
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

        // Bucket A: My posts (all of them)
        try {
            let queryA = postsRef
                .where("authorId", "==", uid)
                .orderBy("created_at", "desc");
            if (newerThanDate) queryA = queryA.where("created_at", ">", newerThanDate);
            const snapA = await queryA.limit(FEED_LIMIT).get();
            addPosts(snapA.docs);
        } catch (indexErr) {
            console.warn("Bucket A index missing, using fallback:", indexErr);
            const snapA = await postsRef.where("authorId", "==", uid).get();
            snapA.docs.forEach(doc => {
                const data = doc.data();
                const time = data.created_at?.toMillis?.() || 0;
                if (!newerThanDate || time > newerThanDate.getTime()) {
                    if (!seenIds.has(doc.id)) {
                        seenIds.add(doc.id);
                        allPosts.push({ id: doc.id, ...data });
                    }
                }
            });
        }

        // Bucket B: Following (chunked, Firestore 'in' limited to 30)
        for (let i = 0; i < followedIds.length; i += 10) {
            const chunk = followedIds.slice(i, i + 10);
            try {
                let queryB = postsRef
                    .where("authorId", "in", chunk)
                    .where("is_public", "==", true)
                    .orderBy("created_at", "desc");
                if (newerThanDate) queryB = queryB.where("created_at", ">", newerThanDate);
                const snapB = await queryB.limit(FEED_LIMIT).get();
                addPosts(snapB.docs);
            } catch {
                const snapB = await postsRef.where("authorId", "in", chunk).get();
                snapB.docs.forEach(doc => {
                    const data = doc.data();
                    if (data.is_public !== true) return; // skip private posts
                    const time = data.created_at?.toMillis?.() || 0;
                    if (!newerThanDate || time > newerThanDate.getTime()) {
                        if (!seenIds.has(doc.id)) {
                            seenIds.add(doc.id);
                            allPosts.push({ id: doc.id, ...data });
                        }
                    }
                });
            }
        }

        // Bucket C: Discovery (not me, not following, not same region)
        let queryC = postsRef.orderBy("created_at", "desc");
        if (newerThanDate) queryC = queryC.where("created_at", ">", newerThanDate);
        const snapC = await queryC.limit(FEED_LIMIT * 2).get();
        const discoveryDocs = snapC.docs.filter((doc) => {
            const data = doc.data();
            if (data.is_public !== true) return false; // skip private posts
            const isMe = data.authorId === uid;
            const isFollowed = followedIds.includes(data.authorId);
            const isSameRegion = myRegion && data.region === myRegion;
            return !isMe && !isFollowed && !isSameRegion;
        });
        addPosts(discoveryDocs.slice(0, FEED_LIMIT));

        // 5. Sort all posts chronologically: newest first
        const getPostTime = (p: any) => p.created_at?.toMillis?.() || (p.created_at?._seconds ? p.created_at._seconds * 1000 : 0);
        allPosts.sort((a, b) => getPostTime(b) - getPostTime(a));

        // 6. Slice to feed limit
        const page = allPosts.slice(0, FEED_LIMIT);

        // 7. If this is a newer_than check, return just the count (lightweight)
        if (newerThanDate) {
            return Response.json({
                newPostCount: page.length,
            });
        }

        // 8. Batch-fetch author avatars
        const uniqueAuthorIds = [...new Set(page.map(p => p.authorId || p.uid).filter(Boolean))];
        const avatarMap: Record<string, string> = {};
        if (uniqueAuthorIds.length > 0) {
            const authorRefs = uniqueAuthorIds.map(id => db.collection('users').doc(id));
            try {
                const authorDocs = await db.getAll(...authorRefs);
                authorDocs.forEach((doc) => {
                    if (doc.exists) {
                        const data = doc.data();
                        const avatarUrl = data?.character_bible?.compiled_output?.avatar_url;
                        if (avatarUrl) {
                            avatarMap[doc.id] = avatarUrl;
                        }
                    }
                });
            } catch (err) {
                console.warn('Failed to batch-fetch author avatars:', err);
            }
        }

        // 9. Sanitize
        const sanitized = page.map((post) => {
            const isOwner = post.authorId === uid || post.uid === uid;
            const likedBy: string[] = post.likedBy || [];
            const isLikedByMe = likedBy.includes(uid);

            const clean: any = { ...post };
            clean.author_avatar_url = avatarMap[post.authorId || post.uid] || null;

            delete clean.likedBy;
            clean.isLikedByMe = isLikedByMe;

            if (!isOwner) {
                delete clean.content_raw;
                delete clean.rant;
                delete clean.conversation_messages;
                delete clean.counsel;
            }

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

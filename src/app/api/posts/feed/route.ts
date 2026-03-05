import { db } from "@/lib/firebase/admin";
import { getAuth } from "firebase-admin/auth";

export const maxDuration = 30;

const PAGE_SIZE = 15;

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

        // 2. Parse pagination params
        const url = new URL(req.url);
        const cursor = url.searchParams.get("cursor"); // ISO timestamp string
        const limit = Math.min(parseInt(url.searchParams.get("limit") || String(PAGE_SIZE)), 50);

        // 3. Fetch user profile
        const userDoc = await db.collection("users").doc(uid).get();
        const userData = userDoc.data() || {};
        const followingMap: Record<string, string> = userData.following || {};
        const followedIds = Object.keys(followingMap);
        const myRegion = userData.region || "";

        // 4. Blended feed query with cursor support
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

        // Build cursor date for startAfter
        const cursorDate = cursor ? new Date(cursor) : null;

        // Bucket A: My posts
        try {
            let queryA = postsRef
                .where("authorId", "==", uid)
                .orderBy("created_at", "desc");
            if (cursorDate) queryA = queryA.where("created_at", "<", cursorDate);
            const snapA = await queryA.limit(limit).get();
            addPosts(snapA.docs);
        } catch (indexErr) {
            console.warn("Bucket A index missing, using fallback:", indexErr);
            const snapA = await postsRef.where("authorId", "==", uid).get();
            // Manual cursor filter for fallback
            snapA.docs.forEach(doc => {
                const data = doc.data();
                const time = data.created_at?.toMillis?.() || 0;
                if (!cursorDate || time < cursorDate.getTime()) {
                    if (!seenIds.has(doc.id)) {
                        seenIds.add(doc.id);
                        allPosts.push({ id: doc.id, ...data });
                    }
                }
            });
        }

        // Bucket B: Following (chunked)
        for (let i = 0; i < followedIds.length; i += 10) {
            const chunk = followedIds.slice(i, i + 10);
            try {
                let queryB = postsRef
                    .where("authorId", "in", chunk)
                    .orderBy("created_at", "desc");
                if (cursorDate) queryB = queryB.where("created_at", "<", cursorDate);
                const snapB = await queryB.limit(limit).get();
                addPosts(snapB.docs);
            } catch {
                const snapB = await postsRef.where("authorId", "in", chunk).get();
                snapB.docs.forEach(doc => {
                    const data = doc.data();
                    const time = data.created_at?.toMillis?.() || 0;
                    if (!cursorDate || time < cursorDate.getTime()) {
                        if (!seenIds.has(doc.id)) {
                            seenIds.add(doc.id);
                            allPosts.push({ id: doc.id, ...data });
                        }
                    }
                });
            }
        }

        // Bucket C: Discovery
        let queryC = postsRef.orderBy("created_at", "desc");
        if (cursorDate) queryC = queryC.where("created_at", "<", cursorDate);
        const snapC = await queryC.limit(limit * 2).get();
        const discoveryDocs = snapC.docs.filter((doc) => {
            const data = doc.data();
            const isMe = data.authorId === uid;
            const isFollowed = followedIds.includes(data.authorId);
            const isSameRegion = myRegion && data.region === myRegion;
            return !isMe && !isFollowed && !isSameRegion;
        });
        addPosts(discoveryDocs.slice(0, limit));

        // 5. Watermark-based sort: fresh posts first, then shuffled discovery
        const getPostTime = (p: any) => p.created_at?.toMillis?.() || (p.created_at?._seconds ? p.created_at._seconds * 1000 : 0);
        const watermark = userData.feed_watermark?.toMillis?.()
            || (userData.feed_watermark?._seconds ? userData.feed_watermark._seconds * 1000 : 0);

        if (!cursor) {
            // First page: split into fresh (unseen) and seen
            const freshPosts: any[] = [];
            const seenPosts: any[] = [];

            for (const post of allPosts) {
                const postTime = getPostTime(post);
                if (watermark && postTime <= watermark) {
                    seenPosts.push(post);
                } else {
                    freshPosts.push(post);
                }
            }

            // Fresh posts: newest first
            freshPosts.sort((a, b) => getPostTime(b) - getPostTime(a));

            // Seen posts: Fisher-Yates shuffle
            for (let i = seenPosts.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [seenPosts[i], seenPosts[j]] = [seenPosts[j], seenPosts[i]];
            }

            // Rebuild allPosts: fresh first, then shuffled seen
            allPosts.length = 0;
            allPosts.push(...freshPosts, ...seenPosts);

            // Update watermark to now (fire-and-forget)
            db.collection("users").doc(uid).set(
                { feed_watermark: new Date() },
                { merge: true }
            ).catch(() => { /* silent — non-critical */ });
        } else {
            // Paginated loads: shuffle everything (all "seen" by definition)
            for (let i = allPosts.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [allPosts[i], allPosts[j]] = [allPosts[j], allPosts[i]];
            }
        }

        // 6. Paginate: take only `limit` posts
        const page = allPosts.slice(0, limit);

        // 7. Compute next cursor (use index-based since order is no longer purely time-based)
        let nextCursor: string | null = null;
        if (page.length === limit && allPosts.length >= limit) {
            const lastPost = page[page.length - 1];
            const lastTime = lastPost.created_at?.toMillis?.()
                || (lastPost.created_at?._seconds ? lastPost.created_at._seconds * 1000 : null);
            if (lastTime) {
                nextCursor = new Date(lastTime).toISOString();
            }
        }

        // 7b. Fetch recent signals and interleave into feed (only on first page)
        let signals: any[] = [];
        if (!cursor) {
            try {
                const signalCutoff = new Date();
                signalCutoff.setHours(signalCutoff.getHours() - 48);

                const signalSnap = await db.collection('signals')
                    .where('created_at', '>=', signalCutoff)
                    .orderBy('created_at', 'desc')
                    .limit(8)
                    .get();

                signals = signalSnap.docs.map(doc => {
                    const data = doc.data();
                    return {
                        id: doc.id,
                        _type: 'signal' as const,
                        type: data.type,
                        headline: data.headline,
                        summary: data.summary,
                        context: data.context,
                        category: data.category,
                        source_urls: data.source_urls || [],
                        source_names: data.source_names || [],
                        image_url: data.image_url || null,
                        news_date: data.news_date || null,
                        bright_spot_type: data.bright_spot_type || null,
                        thread_id: data.thread_id || null,
                        thread_label: data.thread_label || null,
                        is_update: data.is_update || false,
                        created_at: data.created_at ? {
                            _seconds: data.created_at._seconds ?? Math.floor((data.created_at as Date).getTime?.() / 1000) ?? 0,
                            _nanoseconds: data.created_at._nanoseconds ?? 0,
                        } : null,
                    };
                });
            } catch (signalErr) {
                console.warn('Failed to fetch signals for feed:', signalErr);
            }
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
            signals,
            following: followingMap,
            savedPosts: userData.saved_posts || [],
            nextCursor,
        });
    } catch (error: any) {
        console.error("Feed API Error:", error);
        return Response.json(
            { error: error.message || "An unexpected error occurred." },
            { status: 500 }
        );
    }
}

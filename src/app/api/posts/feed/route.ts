import { db } from "@/lib/firebase/admin";
import { getAuth } from "firebase-admin/auth";

export const maxDuration = 30;

const PAGE_SIZE = 20;
const MAX_PAGES = 10;

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
        const localeParam = url.searchParams.get("locale"); // e.g. "es"
        const pageParam = parseInt(url.searchParams.get("page") || '0', 10);
        const page = Math.min(Math.max(pageParam, 0), MAX_PAGES - 1);
        const fetchLimit = PAGE_SIZE * (page + 1) * 4; // overfetch to compensate for post-fetch filtering

        // 3. Fetch user profile
        const userDoc = await db.collection("users").doc(uid).get();
        const userData = userDoc.data() || {};
        const followingMap: Record<string, string> = userData.following || {};
        const followedIds = Object.keys(followingMap);
        const preferredLocale = localeParam || userData.preferred_locale || "en";
        const shouldTranslate = preferredLocale !== "en";

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

        // Bucket A: My posts (all of them, but only if images are ready)
        try {
            let queryA = postsRef
                .where("authorId", "==", uid)
                .orderBy("created_at", "desc");
            if (newerThanDate) queryA = queryA.where("created_at", ">", newerThanDate);
            const snapA = await queryA.limit(fetchLimit).get();
            snapA.docs.forEach(doc => {
                const data = doc.data();
                // Hide posts still processing images or with no images or no thumbnail
                if (data.images_complete === false) return;
                if (!data.imagen_url && (!data.imagen_urls || data.imagen_urls.length === 0)) return;
                if (!data.thumbnail_url && (data.thumbnail_retries || 0) < 3) return;
                if (!seenIds.has(doc.id)) {
                    seenIds.add(doc.id);
                    allPosts.push({ id: doc.id, ...data });
                }
            });
        } catch (indexErr) {
            console.warn("Bucket A index missing, using fallback:", indexErr);
            const snapA = await postsRef.where("authorId", "==", uid).get();
            snapA.docs.forEach(doc => {
                const data = doc.data();
                // Hide posts still processing images or with no images or no thumbnail
                if (data.images_complete === false) return;
                if (!data.imagen_url && (!data.imagen_urls || data.imagen_urls.length === 0)) return;
                if (!data.thumbnail_url && (data.thumbnail_retries || 0) < 3) return;
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
                const snapB = await queryB.limit(fetchLimit).get();
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

        // Bucket C: Discovery (not me, not following)
        let queryC = postsRef.orderBy("created_at", "desc");
        if (newerThanDate) queryC = queryC.where("created_at", ">", newerThanDate);
        const snapC = await queryC.limit(fetchLimit * 5).get();
        const discoveryDocs = snapC.docs.filter((doc) => {
            const data = doc.data();
            if (data.is_public !== true) return false; // skip private posts
            const isMe = data.authorId === uid;
            const isFollowed = followedIds.includes(data.authorId);
            if (isMe || isFollowed) return false;

            return true;
        });
        addPosts(discoveryDocs.slice(0, fetchLimit));

        // 5. Sort all posts chronologically: newest first
        const getPostTime = (p: any) => p.created_at?.toMillis?.() || (p.created_at?._seconds ? p.created_at._seconds * 1000 : 0);
        allPosts.sort((a, b) => getPostTime(b) - getPostTime(a));

        // 6c. Filter incomplete posts — posts without audio are still processing
        const complete = allPosts.filter(p => {
            return p.audio_url || p.short_audio_url || (p.letter_audio_url && p.response_audio_url);
        });

        // 7. Paginate: slice to the requested page
        const startIdx = page * PAGE_SIZE;
        const pageSlice = complete.slice(startIdx, startIdx + PAGE_SIZE);
        const hasMore = complete.length > startIdx + PAGE_SIZE;

        // 8. If this is a newer_than check, return just the count (lightweight)
        if (newerThanDate) {
            return Response.json({
                newPostCount: pageSlice.length,
            });
        }

        // 9. Batch-fetch author avatars and identity titles
        const uniqueAuthorIds = [...new Set(pageSlice.map(p => p.authorId || p.uid).filter(Boolean))];
        const avatarMap: Record<string, string> = {};
        const titleMap: Record<string, string> = {};
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
                        const identityTitle = data?.identity?.title;
                        if (identityTitle) {
                            titleMap[doc.id] = identityTitle;
                        }
                    }
                });
            } catch (err) {
                console.warn('Failed to batch-fetch author data:', err);
            }
        }

        // 10. Batch-check which posts the user has liked (subcollection lookup)
        const likedRef = db.collection("users").doc(uid).collection("liked_posts");
        const likedRefs = pageSlice.map((post: any) => likedRef.doc(post.id));
        let likedSet = new Set<string>();
        if (likedRefs.length > 0) {
            const likedDocs = await db.getAll(...likedRefs);
            likedSet = new Set(likedDocs.filter(d => d.exists).map(d => d.id));
        }

        // 11. Sanitize & inline cached translations
        const needsTranslation: string[] = [];
        const sanitized = pageSlice.map((post: any) => {
            const isLikedByMe = likedSet.has(post.id);

            const clean: any = { ...post };
            clean.author_avatar_url = avatarMap[post.authorId || post.uid] || null;
            clean.author_title = titleMap[post.authorId || post.uid] || null;

            // Strip likedBy — never expose to client (legacy field)
            delete clean.likedBy;
            clean.isLikedByMe = isLikedByMe;

            const isOwner = post.authorId === uid || post.uid === uid;
            if (!isOwner) {
                delete clean.content_raw;
                delete clean.rant;
                delete clean.conversation_messages;
                delete clean.counsel;
            }

            // Auto-translation: for non-owner posts when locale != en
            if (shouldTranslate && !isOwner) {
                if (clean.translations && clean.translations[preferredLocale]) {
                    clean._translated = clean.translations[preferredLocale];
                } else {
                    needsTranslation.push(clean.id);
                }
            }

            // Strip full translations map — only send the user's locale
            delete clean.translations;

            // Strip imagen_prompt — implementation detail, sponsor info is in sponsored_by/sponsored_link
            delete clean.imagen_prompt;

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
            hasMore,
            needsTranslation: shouldTranslate ? needsTranslation : [],
        }, {
            headers: { 'Cache-Control': 'no-store, max-age=0' },
        });
    } catch (error: any) {
        console.error("Feed API Error:", error);
        return Response.json(
            { error: error.message || "An unexpected error occurred." },
            { status: 500 }
        );
    }
}

import { db } from "@/lib/firebase/admin";
import { getAuth } from "firebase-admin/auth";
import { distanceBetween } from "geofire-common";

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
        const localeParam = url.searchParams.get("locale"); // e.g. "es"

        // 3. Fetch user profile
        const userDoc = await db.collection("users").doc(uid).get();
        const userData = userDoc.data() || {};
        const followingMap: Record<string, string> = userData.following || {};
        const followedIds = Object.keys(followingMap);
        const myRegion = userData.region || "";
        const myLat: number | undefined = userData.home_lat;
        const myLng: number | undefined = userData.home_lng;
        const hasMyCoords = myLat != null && myLng != null;
        const preferredLocale = localeParam || userData.preferred_locale || "en";
        const shouldTranslate = preferredLocale !== "en";

        // 4a. Fetch user's Contact Firewall blocked hashes
        const blockedSnap = await db.collection("users").doc(uid).collection("blocked_hashes").get();
        const blockedHashes = new Set(blockedSnap.docs.map(d => d.id));

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

        // Bucket C: Discovery (not me, not following, proximity filtered)
        let queryC = postsRef.orderBy("created_at", "desc");
        if (newerThanDate) queryC = queryC.where("created_at", ">", newerThanDate);
        const snapC = await queryC.limit(FEED_LIMIT * 2).get();
        const discoveryDocs = snapC.docs.filter((doc) => {
            const data = doc.data();
            if (data.is_public !== true) return false; // skip private posts
            const isMe = data.authorId === uid;
            const isFollowed = followedIds.includes(data.authorId);
            if (isMe || isFollowed) return false;

            // Proximity check: if both reader & post have coords, enforce 200-mile blind spot
            if (hasMyCoords && data.lat != null && data.lng != null) {
                const distanceKm = distanceBetween([myLat!, myLng!], [data.lat, data.lng]);
                if (distanceKm < 321.9) return false; // within 200 miles — block
            } else {
                // Fallback to region-based blocking for posts without coordinates
                const isSameRegion = myRegion && data.region === myRegion;
                if (isSameRegion) return false;
            }

            return true;
        });
        addPosts(discoveryDocs.slice(0, FEED_LIMIT));

        // 5. Sort all posts chronologically: newest first
        const getPostTime = (p: any) => p.created_at?.toMillis?.() || (p.created_at?._seconds ? p.created_at._seconds * 1000 : 0);
        allPosts.sort((a, b) => getPostTime(b) - getPostTime(a));

        // 6. Apply Contact Firewall — remove posts from blocked authors
        const firewalled = allPosts.filter(p => !p.authorHash || !blockedHashes.has(p.authorHash));

        // 6b. Apply Proximity Blind Spot — remove followed-user posts within 200 miles
        // (Bucket C already handled discovery posts; this catches followed-user posts from Bucket B)
        const proximityFiltered = firewalled.filter(p => {
            const isOwn = (p.authorId === uid || p.uid === uid);
            if (isOwn) return true; // never filter own posts
            if (!hasMyCoords || p.lat == null || p.lng == null) return true; // no coords — let through
            const distanceKm = distanceBetween([myLat!, myLng!], [p.lat, p.lng]);
            return distanceKm >= 321.9; // keep only posts >= 200 miles away
        });

        // 7. Slice to feed limit
        const page = proximityFiltered.slice(0, FEED_LIMIT);

        // 8. If this is a newer_than check, return just the count (lightweight)
        if (newerThanDate) {
            return Response.json({
                newPostCount: page.length,
            });
        }

        // 9. Batch-fetch author avatars
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

        // 10. Sanitize & inline cached translations
        const needsTranslation: string[] = [];
        const sanitized = page.map((post) => {
            const likedPosts: string[] = userData.liked_posts || [];
            const isLikedByMe = likedPosts.includes(post.id);

            const clean: any = { ...post };
            clean.author_avatar_url = avatarMap[post.authorId || post.uid] || null;

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

            // Strip authorHash — never expose to client
            delete clean.authorHash;

            // Strip geolocation fields — never expose to client
            delete clean.lat;
            delete clean.lng;
            delete clean.geohash;

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
            needsTranslation: shouldTranslate ? needsTranslation : [],
        });
    } catch (error: any) {
        console.error("Feed API Error:", error);
        return Response.json(
            { error: error.message || "An unexpected error occurred." },
            { status: 500 }
        );
    }
}

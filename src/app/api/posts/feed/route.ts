import type { DocumentData, QueryDocumentSnapshot } from "firebase-admin/firestore";
import { db } from "@/lib/firebase/admin";
import { verifyAuth, unauthorizedResponse } from "@/lib/auth/serverAuth";

export const maxDuration = 30;

const PAGE_SIZE = 20;
const MAX_OFFSET = 200;

// The queries read many candidate posts to fill one page, so they read only the fields
// the filters and the sort need. The page's own posts are then read with the fields a
// card shows (FeedPostCard and components/feed).
const CANDIDATE_FIELDS = [
    "uid", "authorId", "created_at", "is_public", "images_complete", "media_status",
    "imagen_url", "imagen_urls", "thumbnail_url", "thumbnail_retries",
    "audio_url", "short_audio_url", "letter_audio_url", "response_audio_url",
];
// Word timestamps are left out: they are most of a post's size, and each card loads its
// own (/api/posts/timestamps). So are image prompts and other pipeline data.
const CARD_FIELDS = [
    "uid", "authorId", "pseudonym", "title", "created_at", "is_public", "visibility",
    "letter", "response", "tension", "condensed_transcript", "public_post",
    "imagen_url", "imagen_urls", "message_images", "image_style", "user_photo_url",
    "thumbnail_url", "images_complete", "media_status",
    "audio_url", "audio_letter_ratio", "audio_message_boundaries", "letter_audio_url", "response_audio_url",
    "short_question", "short_answer", "short_audio_url", "short_audio_letter_ratio",
    "like_count", "comments", "shareToken",
];
// The author's own conversation, read only for their own posts
const AUTHOR_FIELDS = ["counsel", "rant", "conversation_messages", "content_raw"];

/** Firestore's error when a query needs an index that isn't deployed yet. */
const isMissingIndex = (err: unknown) => (err as { code?: number } | null)?.code === 9;

/** Hide my posts still processing images or with no images or no thumbnail.
 *  A private post (media_status set) has no images until it's shared, only its thumbnail. */
const isMyPostReady = (data: DocumentData) => {
    if (data.images_complete === false) return false;
    if (!data.media_status && !data.imagen_url && (!data.imagen_urls || data.imagen_urls.length === 0)) return false;
    if (!data.thumbnail_url && (data.thumbnail_retries || 0) < 3) return false;
    return true;
};

export async function GET(req: Request) {
    try {
        // 1. Authenticate
        const uid = await verifyAuth(req);
        if (!uid) return unauthorizedResponse();

        // 2. Parse optional newer_than param (for new-post detection)
        const url = new URL(req.url);
        const newerThan = url.searchParams.get("newer_than"); // ISO timestamp
        const newerThanDate = newerThan ? new Date(newerThan) : null;
        // offset: how many posts the client already has; limit: how many it wants next (at most a page)
        const offset = Math.min(Math.max(parseInt(url.searchParams.get("offset") || "0", 10) || 0, 0), MAX_OFFSET);
        const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "0", 10) || PAGE_SIZE, 1), PAGE_SIZE);
        const fetchLimit = (offset + limit) * 4; // overfetch to compensate for post-fetch filtering

        const postsRef = db.collection("posts");
        const isNewEnough = (data: DocumentData) =>
            !newerThanDate || (data.created_at?.toMillis?.() || 0) > newerThanDate.getTime();

        // 3. Read the user profile and every bucket at once. Only the following bucket
        //    needs the profile, so it starts as soon as the profile arrives.

        // Bucket A: My posts (all of them, but only if images are ready)
        const myPosts = async (): Promise<QueryDocumentSnapshot[]> => {
            try {
                let queryA = postsRef
                    .where("authorId", "==", uid)
                    .orderBy("created_at", "desc")
                    .select(...CANDIDATE_FIELDS);
                if (newerThanDate) queryA = queryA.where("created_at", ">", newerThanDate);
                const snapA = await queryA.limit(fetchLimit).get();
                return snapA.docs.filter((doc) => isMyPostReady(doc.data()));
            } catch (indexErr) {
                console.warn("Bucket A index missing, using fallback:", indexErr);
                const snapA = await postsRef.where("authorId", "==", uid).select(...CANDIDATE_FIELDS).get();
                return snapA.docs.filter((doc) => isMyPostReady(doc.data()) && isNewEnough(doc.data()));
            }
        };

        // Bucket B: Following (chunked, Firestore 'in' limited to 30)
        const followedPosts = async (chunk: string[]): Promise<QueryDocumentSnapshot[]> => {
            try {
                let queryB = postsRef
                    .where("authorId", "in", chunk)
                    .where("is_public", "==", true)
                    .orderBy("created_at", "desc")
                    .select(...CANDIDATE_FIELDS);
                if (newerThanDate) queryB = queryB.where("created_at", ">", newerThanDate);
                return (await queryB.limit(fetchLimit).get()).docs;
            } catch {
                const snapB = await postsRef.where("authorId", "in", chunk).select(...CANDIDATE_FIELDS).get();
                // skip private posts
                return snapB.docs.filter((doc) => doc.data().is_public === true && isNewEnough(doc.data()));
            }
        };

        // Bucket C: Discovery (public, not me, not following). Only public posts are read;
        // without the is_public + created_at index it reads recent posts and filters here.
        const discoveryQuery = (publicOnly: boolean) => {
            let q = publicOnly ? postsRef.where("is_public", "==", true) : postsRef;
            q = q.orderBy("created_at", "desc");
            if (newerThanDate) q = q.where("created_at", ">", newerThanDate);
            return q.select(...CANDIDATE_FIELDS);
        };
        const discoveryPosts = async () => {
            try {
                return await discoveryQuery(true).limit(fetchLimit * 2).get();
            } catch (err) {
                if (!isMissingIndex(err)) throw err;
                console.warn("Discovery index missing, using fallback:", err);
                return discoveryQuery(false).limit(fetchLimit * 5).get();
            }
        };

        const profile = db.collection("users").doc(uid).get().then((userDoc) => {
            const followingMap: Record<string, string> = userDoc.data()?.following || {};
            return { followingMap, followedIds: Object.keys(followingMap) };
        });
        const following = profile.then(async ({ followedIds }) => {
            const chunks: string[][] = [];
            for (let i = 0; i < followedIds.length; i += 10) chunks.push(followedIds.slice(i, i + 10));
            return (await Promise.all(chunks.map(followedPosts))).flat();
        });
        const [{ followingMap, followedIds }, docsA, docsB, snapC] =
            await Promise.all([profile, myPosts(), following, discoveryPosts()]);

        // 4. Chronological feed: merge the buckets, sort newest-first
        const seenIds = new Set<string>();
        const allPosts: Array<{ id: string } & DocumentData> = [];
        const addPosts = (docs: QueryDocumentSnapshot[]) => {
            docs.forEach((doc) => {
                if (!seenIds.has(doc.id)) {
                    seenIds.add(doc.id);
                    allPosts.push({ id: doc.id, ...doc.data() });
                }
            });
        };
        addPosts(docsA);
        addPosts(docsB);
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
        const getPostTime = (p: DocumentData) => p.created_at?.toMillis?.() || (p.created_at?._seconds ? p.created_at._seconds * 1000 : 0);
        allPosts.sort((a, b) => getPostTime(b) - getPostTime(a));

        // 6c. Filter incomplete posts: another author's post without audio is still processing.
        // Your own posts always show; a private one has only its text and thumbnail
        // (functions/src/lib/postMedia.ts).
        const complete = allPosts.filter(p => {
            if (p.authorId === uid || p.uid === uid) return true;
            return p.audio_url || p.short_audio_url || (p.letter_audio_url && p.response_audio_url);
        });

        // 7. Paginate: slice to the requested posts
        const pageSlice = complete.slice(offset, offset + limit);
        const hasMore = complete.length > offset + limit;

        // 8. If this is a newer_than check, return just the count (lightweight)
        if (newerThanDate) {
            return Response.json({
                newPostCount: pageSlice.length,
            });
        }

        // 9. Read this page's card fields, its authors' avatars and identity titles, and
        //    which of its posts the user liked, all at once
        const isMine = (p: DocumentData) => p.authorId === uid || p.uid === uid;
        const readCards = async (posts: typeof pageSlice, fieldMask: string[]) =>
            posts.length ? db.getAll(...posts.map((p) => postsRef.doc(p.id)), { fieldMask }) : [];

        const readAuthors = async () => {
            const avatarMap: Record<string, string> = {};
            const titleMap: Record<string, string> = {};
            const uniqueAuthorIds = [...new Set(pageSlice.map(p => p.authorId || p.uid).filter(Boolean))];
            if (uniqueAuthorIds.length === 0) return { avatarMap, titleMap };
            try {
                const authorRefs = uniqueAuthorIds.map(id => db.collection('users').doc(id));
                const authorDocs = await db.getAll(...authorRefs, { fieldMask: ["avatar.url", "identity.title"] });
                authorDocs.forEach((doc) => {
                    if (doc.exists) {
                        const data = doc.data();
                        const avatarUrl = data?.avatar?.url;
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
            return { avatarMap, titleMap };
        };

        // Batch-check which posts the user has liked (subcollection lookup)
        const readLiked = async () => {
            if (pageSlice.length === 0) return new Set<string>();
            const likedRef = db.collection("users").doc(uid).collection("liked_posts");
            const likedDocs = await db.getAll(...pageSlice.map((post) => likedRef.doc(post.id)));
            return new Set(likedDocs.filter(d => d.exists).map(d => d.id));
        };

        const [myDocs, otherDocs, { avatarMap, titleMap }, likedSet] = await Promise.all([
            readCards(pageSlice.filter(isMine), [...CARD_FIELDS, ...AUTHOR_FIELDS]),
            readCards(pageSlice.filter((p) => !isMine(p)), CARD_FIELDS),
            readAuthors(),
            readLiked(),
        ]);
        const cardData = new Map([...myDocs, ...otherDocs].filter((d) => d.exists).map((d) => [d.id, d.data()!]));
        const cards = pageSlice
            .filter((p) => cardData.has(p.id))
            .map((p) => ({ id: p.id, ...cardData.get(p.id) } as { id: string } & DocumentData));

        // 10. Sanitize
        const sanitized = cards.map((post) => {
            const isLikedByMe = likedSet.has(post.id);

            const clean: DocumentData = { ...post };
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
                delete clean.thumbnail_brief; // the author's action
            }

            // Strip the legacy translations map
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
        }, {
            headers: { 'Cache-Control': 'no-store, max-age=0' },
        });
    } catch (error) {
        console.error("Feed API Error:", error);
        return Response.json({ error: "An unexpected error occurred." }, { status: 500 });
    }
}

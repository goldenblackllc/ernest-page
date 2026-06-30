import { db } from "@/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 20;

export async function GET(req: Request) {
    try {
        const url = new URL(req.url);
        const cursorParam = url.searchParams.get('cursor');
        const limitParam = url.searchParams.get('limit');
        const limit = Math.min(Math.max(parseInt(limitParam || '', 10) || DEFAULT_LIMIT, 1), MAX_LIMIT);

        let query = db.collection('posts')
            .where('visibility', '==', 'public')
            .orderBy('created_at', 'desc');

        // Cursor-based pagination: fetch posts older than the cursor
        if (cursorParam) {
            const cursorSeconds = parseInt(cursorParam, 10);
            if (!isNaN(cursorSeconds)) {
                query = query.startAfter(Timestamp.fromMillis(cursorSeconds * 1000));
            }
        }

        query = query.limit(limit);
        const snap = await query.get();

        if (snap.empty) {
            return Response.json({ posts: [], nextCursor: null });
        }

        // Batch-fetch author avatars and identity titles
        const uniqueAuthorIds = [...new Set(snap.docs.map(d => d.data().authorId || d.data().uid).filter(Boolean))];
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

        // Sanitize posts — strip all sensitive fields
        const posts = snap.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                type: data.type || 'checkin',
                post_type: data.post_type || null,
                pseudonym: data.public_post?.pseudonym || data.pseudonym || 'Anonymous',
                letter: data.public_post?.letter || data.letter || data.tension || null,
                response: data.public_post?.response || data.response || data.counsel || null,
                imagen_url: data.public_post?.imagen_url || data.imagen_url || null,
                audio_url: data.audio_url || null,
                audio_letter_ratio: data.audio_letter_ratio ?? null,
                audio_word_timestamps: data.audio_word_timestamps ?? null,
                directive_title: data.directive_title || null,
                unexpected_yield: data.unexpected_yield || null,
                author_avatar_url: avatarMap[data.authorId || data.uid] || null,
                author_title: titleMap[data.authorId || data.uid] || null,
                like_count: data.like_count || data.likes || 0,
                comments: data.comments || 0,
                created_at: data.created_at?._seconds
                    ? { _seconds: data.created_at._seconds, _nanoseconds: data.created_at._nanoseconds || 0 }
                    : data.created_at instanceof Date
                        ? { _seconds: Math.floor(data.created_at.getTime() / 1000), _nanoseconds: 0 }
                        : null,
            };
        });

        // Determine next cursor from the last post
        const lastPost = posts[posts.length - 1];
        const nextCursor = posts.length >= limit && lastPost?.created_at
            ? lastPost.created_at._seconds
            : null;

        return Response.json({ posts, nextCursor });
    } catch (error: any) {
        console.error("[Public Posts API] Error:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
}

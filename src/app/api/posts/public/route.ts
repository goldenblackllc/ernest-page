import { db } from "@/lib/firebase/admin";

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SHOWCASE_LIMIT = 5;

export async function GET() {
    try {
        // Fetch posts with visibility === 'public' (landing page showcase)
        const snap = await db.collection('posts')
            .where('visibility', '==', 'public')
            .orderBy('created_at', 'desc')
            .limit(SHOWCASE_LIMIT)
            .get();

        if (snap.empty) {
            return Response.json({ posts: [] });
        }

        // Batch-fetch author avatars
        const uniqueAuthorIds = [...new Set(snap.docs.map(d => d.data().authorId || d.data().uid).filter(Boolean))];
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

        // Sanitize posts — strip all sensitive fields
        const posts = snap.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                type: data.type || 'checkin',
                post_type: data.post_type || null,
                title: data.public_post?.title || data.title || null,
                pseudonym: data.public_post?.pseudonym || data.pseudonym || 'Anonymous',
                letter: data.public_post?.letter || data.letter || data.tension || null,
                response: data.public_post?.response || data.response || data.counsel || null,
                imagen_url: data.public_post?.imagen_url || data.imagen_url || null,
                directive_title: data.directive_title || null,
                unexpected_yield: data.unexpected_yield || null,
                author_avatar_url: avatarMap[data.authorId || data.uid] || null,
                like_count: data.like_count || data.likes || 0,
                comments: data.comments || 0,
                created_at: data.created_at?._seconds
                    ? { _seconds: data.created_at._seconds, _nanoseconds: data.created_at._nanoseconds || 0 }
                    : data.created_at instanceof Date
                        ? { _seconds: Math.floor(data.created_at.getTime() / 1000), _nanoseconds: 0 }
                        : null,
            };
        });

        return Response.json({ posts });
    } catch (error: any) {
        console.error("[Public Posts API] Error:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
}

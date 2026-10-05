import { db } from '@/lib/firebase/admin';
import { getAuth } from 'firebase-admin/auth';
import { Timestamp } from 'firebase-admin/firestore';
import { serializePostsForViewer } from '@/lib/posts/serializePosts';

export const maxDuration = 15;

const PAGE_SIZE = 15;

/**
 * Liked posts — reads the viewer's private users/{uid}/liked_posts subcollection
 * (newest like first) and resolves each entry to its post.
 *
 * Posts that were deleted or have since been made private by another author are skipped.
 * Pagination cursor is the ISO liked_at of the last like in the page.
 */
export async function GET(req: Request) {
    try {
        const authHeader = req.headers.get('Authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const idToken = authHeader.split('Bearer ')[1];
        let uid: string;
        try {
            const decoded = await getAuth().verifyIdToken(idToken);
            uid = decoded.uid;
        } catch {
            return Response.json({ error: 'Invalid token' }, { status: 401 });
        }

        const url = new URL(req.url);
        const cursor = url.searchParams.get('cursor');
        const locale = url.searchParams.get('locale') || 'en';
        const limit = Math.min(parseInt(url.searchParams.get('limit') || String(PAGE_SIZE)), 30);

        let likedQuery = db.collection('users').doc(uid)
            .collection('liked_posts')
            .orderBy('liked_at', 'desc');

        if (cursor) {
            likedQuery = likedQuery.startAfter(Timestamp.fromDate(new Date(cursor)));
        }

        const likedSnap = await likedQuery.limit(limit).get();

        if (likedSnap.empty) {
            return Response.json({ posts: [], nextCursor: null });
        }

        const postDocs = await db.getAll(
            ...likedSnap.docs.map(d => db.collection('posts').doc(d.id))
        );

        // getAll preserves input order, so posts stay newest-like-first
        const visible = postDocs
            .filter(doc => {
                if (!doc.exists) return false;
                const data = doc.data()!;
                const isOwner = data.authorId === uid || data.uid === uid;
                return isOwner || data.is_public === true;
            })
            .map(doc => ({ id: doc.id, ...doc.data(), isLikedByMe: true }));

        const posts = await serializePostsForViewer(visible, uid, locale);

        let nextCursor: string | null = null;
        if (likedSnap.docs.length === limit) {
            const lastLikedAt = likedSnap.docs[likedSnap.docs.length - 1].get('liked_at') as Timestamp | undefined;
            if (lastLikedAt) nextCursor = lastLikedAt.toDate().toISOString();
        }

        return Response.json({ posts, nextCursor });
    } catch (error: any) {
        console.error('[Saved Posts] Error:', error);
        return Response.json({ error: error.message || 'Failed to fetch saved posts' }, { status: 500 });
    }
}

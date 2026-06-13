import { db } from '@/lib/firebase/admin';
import { getAuth } from 'firebase-admin/auth';

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

        // Get user's liked post IDs from subcollection
        const likedSnap = await db.collection('users').doc(uid)
            .collection('liked_posts')
            .orderBy('liked_at', 'desc')
            .limit(30)
            .get();

        if (likedSnap.empty) {
            return Response.json({ posts: [] });
        }

        const postIds = likedSnap.docs.map(d => d.id);
        const posts: any[] = [];

        const postsSnap = await db.collection('posts')
            .where('__name__', 'in', postIds)
            .get();

        for (const doc of postsSnap.docs) {
            const data = doc.data();
            posts.push({
                id: doc.id,
                ...data,
                isLikedByMe: true,
            });
        }

        // Sort by the order they appear in liked_posts (newest likes first)
        const idOrder = new Map(postIds.map((id, i) => [id, i]));
        posts.sort((a, b) => (idOrder.get(a.id) ?? 99) - (idOrder.get(b.id) ?? 99));

        return Response.json({ posts });
    } catch (error: any) {
        console.error('[Saved Posts] Error:', error);
        return Response.json({ error: error.message || 'Failed to fetch saved posts' }, { status: 500 });
    }
}

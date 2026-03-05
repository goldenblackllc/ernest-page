import { db } from '@/lib/firebase/admin';
import { getAuth } from 'firebase-admin/auth';

export const maxDuration = 10;

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
        const postId = url.searchParams.get('postId');
        if (!postId) {
            return Response.json({ error: 'Missing postId' }, { status: 400 });
        }

        // Fetch comments for this post
        const commentsSnap = await db.collection('posts').doc(postId)
            .collection('comments')
            .orderBy('created_at', 'desc')
            .limit(20)
            .get();

        const comments = commentsSnap.docs
            .map(doc => {
                const data = doc.data();
                // Show AI-generated comments to everyone
                // Show personal comments only to the commenter
                if (data.type === 'personal' && data.commenter_uid !== uid) {
                    return null;
                }

                return {
                    id: doc.id,
                    author_title: data.author_title || 'Someone',
                    author_avatar_url: data.author_avatar_url || null,
                    content: data.content,
                    type: data.type,
                    is_mine: data.commenter_uid === uid,
                    created_at: data.created_at ? {
                        _seconds: data.created_at._seconds,
                        _nanoseconds: data.created_at._nanoseconds || 0,
                    } : null,
                };
            })
            .filter(Boolean);

        return Response.json({ comments });
    } catch (error: any) {
        console.error('[Comments Fetch] Error:', error);
        return Response.json({ error: error.message || 'Failed to fetch comments' }, { status: 500 });
    }
}

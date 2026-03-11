import { db } from '@/lib/firebase/admin';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue } from 'firebase-admin/firestore';

export async function POST(req: Request) {
    try {
        // 1. Authenticate
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

        const { postId, commentId } = await req.json();
        if (!postId || !commentId) {
            return Response.json({ error: 'Missing postId or commentId' }, { status: 400 });
        }

        // 2. Verify comment belongs to the requesting user
        const commentRef = db.collection('posts').doc(postId).collection('comments').doc(commentId);
        const commentDoc = await commentRef.get();

        if (!commentDoc.exists) {
            return Response.json({ error: 'Comment not found' }, { status: 404 });
        }

        const commentData = commentDoc.data()!;
        if (commentData.commenter_uid !== uid) {
            return Response.json({ error: 'Not authorized to delete this comment' }, { status: 403 });
        }

        // 3. Delete the comment and decrement count
        await commentRef.delete();
        await db.collection('posts').doc(postId).update({
            comments: FieldValue.increment(-1),
        });

        return Response.json({ success: true });
    } catch (error: any) {
        console.error('[Comment Delete] Error:', error);
        return Response.json({ error: error.message || 'Failed to delete comment' }, { status: 500 });
    }
}

import { db } from '@/lib/firebase/admin';
import { verifyAuth, unauthorizedResponse } from '@/lib/auth/serverAuth';
import { FieldValue } from 'firebase-admin/firestore';

export async function POST(req: Request) {
    try {
        // 1. Authenticate
        const uid = await verifyAuth(req);
        if (!uid) return unauthorizedResponse();

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
        return Response.json({ error: 'Failed to delete comment' }, { status: 500 });
    }
}

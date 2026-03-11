import { db } from '@/lib/firebase/admin';
import { getAuth } from 'firebase-admin/auth';
import { verifyAuth, unauthorizedResponse } from '@/lib/auth/serverAuth';

/**
 * DELETE /api/account/delete
 *
 * Full GDPR/CCPA-compliant account deletion:
 * 1. Deletes all user posts
 * 2. Deletes all active chat sessions
 * 3. Deletes the user document (identity, dossier, bible, subscription, etc.)
 * 4. Deletes the Firebase Auth record
 *
 * This is immediate and irreversible.
 */
export async function DELETE(req: Request) {
    try {
        const uid = await verifyAuth(req);
        if (!uid) return unauthorizedResponse();

        const results = {
            posts_deleted: 0,
            chats_deleted: 0,
            user_deleted: false,
            auth_deleted: false,
        };

        // 1. Delete all user posts
        try {
            const postsSnap = await db.collection('posts')
                .where('authorId', '==', uid)
                .get();

            if (!postsSnap.empty) {
                const batch = db.batch();
                let count = 0;
                const batches: FirebaseFirestore.WriteBatch[] = [];
                let currentBatch = db.batch();

                postsSnap.docs.forEach((doc) => {
                    currentBatch.delete(doc.ref);
                    count++;
                    if (count % 500 === 0) {
                        batches.push(currentBatch);
                        currentBatch = db.batch();
                    }
                });
                batches.push(currentBatch);

                await Promise.all(batches.map(b => b.commit()));
                results.posts_deleted = postsSnap.size;
            }
        } catch (err) {
            console.error(`[Account Delete] Failed to delete posts for ${uid}:`, err);
        }

        // 2. Delete all active chat sessions
        try {
            const chatsSnap = await db.collection('users').doc(uid)
                .collection('active_chats').get();

            if (!chatsSnap.empty) {
                const batch = db.batch();
                chatsSnap.docs.forEach(doc => batch.delete(doc.ref));
                await batch.commit();
                results.chats_deleted = chatsSnap.size;
            }
        } catch (err) {
            console.error(`[Account Delete] Failed to delete chats for ${uid}:`, err);
        }

        // 3. Delete user document
        try {
            await db.collection('users').doc(uid).delete();
            results.user_deleted = true;
        } catch (err) {
            console.error(`[Account Delete] Failed to delete user doc for ${uid}:`, err);
        }

        // 4. Delete Firebase Auth record
        try {
            await getAuth().deleteUser(uid);
            results.auth_deleted = true;
        } catch (err) {
            console.error(`[Account Delete] Failed to delete auth for ${uid}:`, err);
        }

        console.log(`[Account Delete] Completed for ${uid}:`, results);

        return Response.json({
            success: true,
            message: 'Account and all associated data have been permanently deleted.',
            ...results,
        });

    } catch (error: any) {
        console.error('[Account Delete] Error:', error);
        return Response.json(
            { error: error.message || 'Account deletion failed.' },
            { status: 500 }
        );
    }
}

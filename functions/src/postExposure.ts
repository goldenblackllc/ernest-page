/**
 * postExposure (Firestore trigger) — keeps a post's public media in step
 * with who can see it (see lib/postMedia.ts). When a private post is shared
 * by link or made community/public, the "Dear Earnest" rewrite, images and
 * audio are made (it's had its thumbnail from the start). When it goes back
 * to private with no link, they are deleted.
 */
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { db } from './lib/firebase/admin.js';
import { REGION } from './lib/config/region.js';
import {
    deletePostMediaFiles, generateMediaForPost, hasReaderVersion, isPostExposed, NO_MEDIA_FIELDS, NO_REWRITE_FIELDS,
} from './lib/postMedia.js';
import { errorMessage } from './lib/utils/errors.js';

type PostData = FirebaseFirestore.DocumentData;

/** A generation that started this long ago is assumed dead and may restart. */
export const STALE_GENERATION_MS = 15 * 60 * 1000;

export function exposureAction(before: PostData | undefined, after: PostData | undefined, now: number): 'generate' | 'remove' | null {
    if (!after) return null;
    const exposed = isPostExposed(after);
    const status = after.media_status;
    const stale = status === 'generating' && now - (after.media_started_at || 0) > STALE_GENERATION_MS;
    // A failed generation retries only when the post is shared again, never on its own write.
    const retry = status === 'failed' && !isPostExposed(before);
    if (exposed && (status === 'deferred' || stale || retry)) return 'generate';
    if (!exposed && isPostExposed(before) && after.media_status !== 'generating' && hasReaderVersion(after)) return 'remove';
    return null;
}

async function removeMedia(postId: string, post: PostData) {
    const deleted = await deletePostMediaFiles(postId, post);
    await db.collection('posts').doc(postId).update({ ...NO_MEDIA_FIELDS, ...NO_REWRITE_FIELDS, is_public: false });
    console.log(`[PostExposure] Removed media for ${postId} (${deleted} files)`);
}

export const postExposure = onDocumentUpdated(
    {
        document: 'posts/{postId}',
        region: REGION,
        timeoutSeconds: 540,
        memory: '1GiB',
    },
    async (event) => {
        const postId = event.params.postId;
        const action = exposureAction(event.data?.before.data(), event.data?.after.data(), Date.now());
        if (!action) return;

        const ref = db.collection('posts').doc(postId);

        if (action === 'remove') {
            await removeMedia(postId, event.data!.after.data()!);
            return;
        }

        // Claim the generation so a burst of updates starts it only once.
        const claimed = await db.runTransaction(async (tx) => {
            const current = (await tx.get(ref)).data();
            if (exposureAction(event.data?.before.data(), current, Date.now()) !== 'generate') return null;
            tx.update(ref, { media_status: 'generating', media_started_at: Date.now() });
            return current!;
        });
        if (!claimed) return;

        try {
            console.log(`[PostExposure] Post ${postId} is now shared or public — generating media`);
            await generateMediaForPost(postId, claimed);
        } catch (err) {
            console.error(`[PostExposure] Media generation failed for ${postId}:`, errorMessage(err));
            await ref.update({ media_status: 'failed' });
            return;
        }

        // Unshared while we were generating: take it all back down.
        const latest = (await ref.get()).data();
        if (latest && !isPostExposed(latest)) await removeMedia(postId, latest);
    }
);

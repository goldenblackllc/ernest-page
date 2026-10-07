import { db } from './firebase/admin.js';

/** A post's author uid, from `uid` or, when that is missing, `authorId`. */
export function getPostAuthorId(postData: FirebaseFirestore.DocumentData): string {
    return postData.uid || postData.authorId;
}

/**
 * Save a post's per-message image URLs (index-aligned with `image_prompts`;
 * missing images are falsy).
 *
 * The post's images are complete once every prompt has an image, or when
 * `acceptPartial` is set (retries exhausted). A complete post is published
 * once it has at least one image and its audio, unless its visibility is
 * private (a missing visibility counts as private).
 */
export async function savePostImages(
    postId: string,
    postData: FirebaseFirestore.DocumentData,
    urls: string[],
    { acceptPartial = false }: { acceptPartial?: boolean } = {},
): Promise<{ filledCount: number; complete: boolean; published: boolean }> {
    const imagePrompts: string[] = postData.image_prompts || [];
    const validUrls = urls.filter(Boolean);
    const firstImage = validUrls[0] || null;
    const complete = validUrls.length >= imagePrompts.length || acceptPartial;
    const published = complete
        && !!firstImage
        && !!postData.audio_url
        && (postData.visibility || 'private') !== 'private';

    await db.collection('posts').doc(postId).update({
        message_images: urls.map(u => u || null),
        imagen_urls: validUrls,
        images_complete: complete,
        ...(firstImage && { imagen_url: firstImage }),
        ...(published && { is_public: true }),
    });

    return { filledCount: validUrls.length, complete, published };
}

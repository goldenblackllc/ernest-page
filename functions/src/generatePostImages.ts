import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db } from './lib/firebase/admin.js';
import { generateMessageImages } from './lib/ai/generatePostImage.js';
import { loadUserReferenceImage } from './lib/ai/loadUserReferenceImage.js';

export const generatePostImages = onCall(
    {
        region: 'us-central1',
        timeoutSeconds: 300,
        memory: '1GiB',
        maxInstances: 5,
    },
    async (request) => {
        const { postId } = request.data;
        if (!postId) throw new HttpsError('invalid-argument', 'postId required');
        
        const postDoc = await db.collection('posts').doc(postId).get();
        if (!postDoc.exists) throw new HttpsError('not-found', 'Post not found');
        
        const postData = postDoc.data();
        if (!postData) throw new HttpsError('not-found', 'Post not found');
        
        const imagePrompts = postData.image_prompts;
        if (!imagePrompts || !Array.isArray(imagePrompts) || imagePrompts.length === 0) {
            throw new HttpsError('failed-precondition', 'Post has no image prompts');
        }
        
        console.log(`[GenImages] Generating images for post ${postId}`);
        const uid = postData.uid || postData.authorId;
        const referenceImage = await loadUserReferenceImage(uid);
        const referenceImages = referenceImage ? [referenceImage] : undefined;
        
        const urls = await generateMessageImages({
            prompts: imagePrompts,
            uid,
            filePrefix: postId,
            referenceImages,
            existingUrls: postData.message_images,
        });
        
        const firstImage = urls.find(Boolean) || null;
        const filledCount = urls.filter(Boolean).length;
        const allFilled = filledCount >= imagePrompts.length;

        if (firstImage) {
            const hasAudio = !!postData.audio_url;
            const isComplete = allFilled && hasAudio;
            
            await postDoc.ref.update({
                message_images: urls,
                imagen_urls: urls.filter(Boolean),
                imagen_url: firstImage,
                images_complete: allFilled,
                // Only publish when every image succeeded AND audio exists
                ...(isComplete && { is_public: postData.visibility !== 'private' }),
            });
            console.log(`[GenImages] Updated post ${postId}: ${filledCount}/${imagePrompts.length} images, audio: ${hasAudio}, complete: ${isComplete}`);
            return { success: true, count: filledCount, urls };
        } else {
            console.error(`[GenImages] Failed to generate any images for post ${postId}`);
            throw new HttpsError('internal', 'Failed to generate images');
        }
    }
);

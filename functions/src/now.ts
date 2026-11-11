/**
 * polishNowPost (Firestore trigger): when a Now post is saved with Polish ticked
 * (lib/now.ts), its text is rewritten with the spelling, grammar and flow fixed and
 * saved beside the person's own words, which are kept. The post shows their own
 * words until then, and they can switch back at any time.
 *
 * Nobody waits for it: the website saves the post and shows it at once.
 */
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { REGION } from './lib/config/region.js';
import { generateTextWithFallback, OPUS_MODEL } from './lib/ai/models.js';
import { buildPolishPrompt } from './lib/ai/nowPolishPrompt.js';
import { MAX_TEXT_LENGTH, type NowPostDoc } from './lib/now.js';
import { errorMessage } from './lib/utils/errors.js';

export const polishNowPost = onDocumentCreated(
    {
        document: 'users/{uid}/now_posts/{postId}',
        region: REGION,
        timeoutSeconds: 300,
        memory: '256MiB',
    },
    async (event) => {
        const post = event.data?.data() as Partial<NowPostDoc> | undefined;
        if (!post?.polish || !post.raw_text || post.polished_text) return;

        try {
            const result = await generateTextWithFallback({
                primaryModelId: OPUS_MODEL,
                abortSignal: AbortSignal.timeout(240_000),
                prompt: buildPolishPrompt(post.action || '', post.raw_text),
            });
            const polished = result.text?.trim();
            if (!polished) return;
            // Fails if the person deleted the post meanwhile, which is fine
            await event.data!.ref.update({ polished_text: polished.slice(0, MAX_TEXT_LENGTH * 2) });
        } catch (error) {
            console.error(`[polishNowPost] ${event.params.uid}/${event.params.postId}:`, errorMessage(error));
        }
    },
);

import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase/admin';
import { verifyAuth, unauthorizedResponse } from '@/lib/auth/serverAuth';
import { generateWithFallback, SONNET_MODEL } from '@/lib/ai/models';
import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { checkRateLimit, rateLimitResponse } from '@/lib/rateLimit';

export const maxDuration = 120;

const MAX_BATCH_SIZE = 10;

const TRANSLATION_PROMPT = `You are a professional translator for a social media app. 
Translate the following post content into the target language requested.
Maintain the exact emotional tone, formatting, and perspective. Do not add any commentary.
Target Language: {TARGET_LOCALE}

Content to translate:
{CONTENT}
`;

export async function POST(req: Request) {
    try {
        const uid = await verifyAuth(req);
        if (!uid) return unauthorizedResponse();

        const rl = checkRateLimit(`translate-batch:${uid}`, { maxRequests: 5, windowMs: 60000 });
        if (!rl.allowed) return rateLimitResponse(rl.resetMs);

        const { postIds, targetLocale } = await req.json();

        if (!postIds || !Array.isArray(postIds) || postIds.length === 0 || !targetLocale) {
            return NextResponse.json({ error: 'Missing postIds array or targetLocale' }, { status: 400 });
        }

        if (targetLocale === 'en') {
            return NextResponse.json({ translations: {} });
        }

        const batch = postIds.slice(0, MAX_BATCH_SIZE);
        const translations: Record<string, any> = {};

        // Fetch all posts in parallel
        const postRefs = batch.map(id => db.collection('posts').doc(id));
        const postDocs = await db.getAll(...postRefs);

        // Process translations in parallel
        const translationPromises = postDocs.map(async (postDoc) => {
            if (!postDoc.exists) return;

            const postId = postDoc.id;
            const postData = postDoc.data()!;

            // Check if translation already cached
            if (postData.translations && postData.translations[targetLocale]) {
                translations[postId] = postData.translations[targetLocale];
                return;
            }

            // Prepare content
            let contentToTranslate = '';
            const isRealityShift = postData.post_type === 'reality_shift';

            if (isRealityShift) {
                contentToTranslate = `Unexpected Yield: ${postData.unexpected_yield || ''}`;
            } else {
                const letter = postData.public_post?.letter || postData.letter || postData.tension || '';
                const response = postData.public_post?.response || postData.response || postData.counsel || '';
                const title = postData.public_post?.title || postData.title || '';
                const pseudonym = postData.public_post?.pseudonym || postData.pseudonym || '';
                contentToTranslate = `Title: ${title}\nPseudonym: ${pseudonym}\nLetter: ${letter}\nResponse: ${response}`;
            }

            if (!contentToTranslate.trim()) return;

            const prompt = TRANSLATION_PROMPT
                .replace('{TARGET_LOCALE}', targetLocale)
                .replace('{CONTENT}', contentToTranslate);

            const schema = isRealityShift
                ? z.object({ unexpected_yield: z.string() })
                : z.object({ title: z.string(), pseudonym: z.string(), letter: z.string(), response: z.string() });

            try {
                const result = await generateWithFallback({
                    primaryModelId: SONNET_MODEL,
                    prompt,
                    schema
                });

                const translatedData = result.object;

                // Cache on Firestore
                await db.collection('posts').doc(postId).update({
                    [`translations.${targetLocale}`]: translatedData,
                    updatedAt: FieldValue.serverTimestamp()
                });

                translations[postId] = translatedData;
            } catch (err) {
                console.error(`Translation failed for post ${postId}:`, err);
                // Skip this post — the manual translate button is still available
            }
        });

        await Promise.all(translationPromises);

        return NextResponse.json({ translations });

    } catch (error: any) {
        console.error('Batch Translation Error:', error);
        return NextResponse.json({ error: error.message || 'Batch translation failed' }, { status: 500 });
    }
}

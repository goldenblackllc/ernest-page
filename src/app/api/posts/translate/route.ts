import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase/admin';
import { verifyAuth, unauthorizedResponse } from '@/lib/auth/serverAuth';
import { generateWithFallback, SONNET_MODEL } from '@/lib/ai/models';
import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rateLimit';

export const maxDuration = 60;

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

        const rl = checkRateLimit(`translate:${uid}`, { maxRequests: 20, windowMs: 60000 });
        if (!rl.allowed) return rateLimitResponse(rl.resetMs);

        const { postId, targetLocale } = await req.json();

        if (!postId || !targetLocale) {
            return NextResponse.json({ error: 'Missing postId or targetLocale' }, { status: 400 });
        }

        const postRef = db.collection('posts').doc(postId);
        const postDoc = await postRef.get();

        if (!postDoc.exists) {
            return NextResponse.json({ error: 'Post not found' }, { status: 404 });
        }

        const postData = postDoc.data()!;
        
        // 1. Check if translation exists in cache
        if (postData.translations && postData.translations[targetLocale]) {
            return NextResponse.json({ success: true, translation: postData.translations[targetLocale] });
        }

        // 2. Prepare content to translate
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

        const prompt = TRANSLATION_PROMPT
            .replace('{TARGET_LOCALE}', targetLocale)
            .replace('{CONTENT}', contentToTranslate);

        let schema;
        if (isRealityShift) {
            schema = z.object({
                unexpected_yield: z.string()
            });
        } else {
            schema = z.object({
                title: z.string(),
                pseudonym: z.string(),
                letter: z.string(),
                response: z.string()
            });
        }

        // 3. Translate using AI
        const result = await generateWithFallback({
            primaryModelId: SONNET_MODEL,
            prompt,
            schema
        });

        const translatedData = result.object;

        // 4. Save to cache
        await postRef.update({
            [`translations.${targetLocale}`]: translatedData,
            updatedAt: FieldValue.serverTimestamp()
        });

        return NextResponse.json({ success: true, translation: translatedData });

    } catch (error: any) {
        console.error('Translation Error:', error);
        return NextResponse.json({ error: error.message || 'Translation failed' }, { status: 500 });
    }
}

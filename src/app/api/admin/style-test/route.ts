import { NextRequest, NextResponse } from 'next/server';
import { db, storage } from '@/lib/firebase/admin';
import { verifyAuth, unauthorizedResponse } from '@/lib/auth/serverAuth';
import sharp from 'sharp';
import { generateImage } from '@/lib/ai/generateImage';
import { loadUserReferenceImage } from '@/lib/ai/loadUserReferenceImage';
import { VISUAL_STYLES } from '@/lib/ai/visualStyles';
import type { StyleCategory } from '@/lib/ai/visualStyles';
import { generateWithFallback, SONNET_MODEL } from '@/lib/ai/models';
import { z } from 'zod';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  try {
    const uid = await verifyAuth(req);
    if (!uid) return unauthorizedResponse();

    const { searchParams } = new URL(req.url);
    const postId = searchParams.get('postId');

    if (!postId) {
      return NextResponse.json({ error: 'Missing postId' }, { status: 400 });
    }

    const postDoc = await db.collection('posts').doc(postId).get();
    if (!postDoc.exists) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }
    const postData = postDoc.data() || {};
    
    // Get style test results
    const styleTestDoc = await db.collection('style-tests').doc(postId).get();
    const styleTestData = styleTestDoc.exists ? styleTestDoc.data() : {};

    const styles = VISUAL_STYLES.map(style => ({
      ...style,
      images: styleTestData?.[style.id] || []
    }));

    return NextResponse.json({
      post: {
        letter: postData.public_post?.letter || '',
        uid: postData.uid,
      },
      styles
    });
  } catch (error) {
    console.error('Error in GET /api/admin/style-test:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const uid = await verifyAuth(req);
    if (!uid) return unauthorizedResponse();

    const body = await req.json();
    const { postId, styleId } = body;

    if (!postId || !styleId) {
      return NextResponse.json({ error: 'Missing postId or styleId' }, { status: 400 });
    }

    const style = VISUAL_STYLES.find(s => s.id === styleId);
    if (!style) {
      return NextResponse.json({ error: 'Invalid styleId' }, { status: 400 });
    }

    const postDoc = await db.collection('posts').doc(postId).get();
    if (!postDoc.exists) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }
    
    const postData = postDoc.data() || {};
    const letter = postData.public_post?.letter || '';
    const postUid = postData.uid;

    if (!postUid) {
      return NextResponse.json({ error: 'Post missing uid' }, { status: 400 });
    }

    const userDoc = await db.collection('users').doc(postUid).get();
    const userData = userDoc.data() || {};
    const compiledBible = userData.character_bible?.compiled_output?.ideal || [];

    const referenceImage = await loadUserReferenceImage(postUid);
    const referenceImages = referenceImage ? [referenceImage] : undefined;

    let styledPrompt = '';
    let useReferenceImages: Buffer[] | undefined = undefined;

    if (style.category === 'photographer') {
      styledPrompt = `${style.imagenTag} ${letter}`;
      useReferenceImages = referenceImages;
    } else if (style.category === 'landscape') {
      styledPrompt = `${style.imagenTag} ${JSON.stringify(compiledBible)}`;
      useReferenceImages = undefined;
    } else if (style.category === 'landscape-with-person') {
      styledPrompt = `${style.imagenTag} ${JSON.stringify(compiledBible)}`;
      useReferenceImages = referenceImages;
    } else if (style.category === 'cinematic') {
      // AI generates 5 bespoke prompts using VIBE + SCALE framework
      useReferenceImages = referenceImages;
    } else {
      // Fallback
      styledPrompt = `${style.imagenTag} ${letter}`;
      useReferenceImages = referenceImages;
    }

    // For cinematic: AI pre-pass generates unique prompts per image
    let cinematicPrompts: string[] | null = null;
    if (style.category === 'cinematic') {
      console.log(`[StyleTest] Generating cinematic prompts for style "${style.id}" via AI...`);

      const storySection = style.omitLetter ? '' : `\nSTORY:\n${letter}\n`;

      const styleDirection = style.id === 'life-magazine'
        ? `You are a photo editor at Life Magazine in its golden era. You're commissioning 5 photographs for a photo essay about this person's life. Think like the great Life photographers — Gordon Parks, Margaret Bourke-White, W. Eugene Smith. Some images should be in vivid color, others in dramatic black and white. Each image should tell a story on its own — intimate, human, unforgettable. Documentary realism with cinematic beauty.`
        : `You are a Visual Director for an advice column called Earnest Page. You're creating 5 photographs that capture moments from this person's life.`;

      const aiResult = await generateWithFallback({
        primaryModelId: SONNET_MODEL,
        schema: z.object({
          prompts: z.array(z.string()).min(5).max(5),
        }),
        prompt: `${styleDirection}

First, read the character's identity. For each image, choose:
- A VIBE: the emotional feeling (luxury, grit, serenity, chaos, warmth, ambition, defiance, tenderness, solitude, celebration)
- A SCALE: the shot type

SCALE types:
- "macro": Extreme close-up of an object, texture, or detail from their life.
- "lifestyle": A composed scene or environment that tells a story — their workspace, kitchen, car, bedroom.
- "wide": An aspirational landscape, cityscape, or architectural shot from their world.
- "human": The person in the scene — hands doing something, walking, sitting, from behind, over-the-shoulder.

RULES:
- Highly photorealistic. Cinematic lighting. Instagram-quality.
- 9:16 portrait orientation. No text or watermarks.
- Each of the 5 images MUST use a DIFFERENT scale. Vary the vibes.
- The images should feel like snapshots from a real person's life — intimate, authentic, with depth.
- Ground every image in specific details from the character.

CHARACTER:
${JSON.stringify(compiledBible)}
${storySection}
Return exactly 5 detailed Imagen prompts. Each should be a self-contained image description.`,
      });
      cinematicPrompts = (aiResult.object as any).prompts;
      console.log(`[StyleTest] Generated ${cinematicPrompts!.length} cinematic prompts`);
    }

    // Determine content suffix for non-cinematic styles
    const contentSuffix = (style.category === 'landscape' || style.category === 'landscape-with-person')
      ? ` ${JSON.stringify(compiledBible)}`
      : ` ${letter}`;

    const promises = Array.from({ length: 5 }).map(async (_, idx) => {
      let finalPrompt: string;
      if (cinematicPrompts) {
        finalPrompt = cinematicPrompts[idx];
      } else {
        const promptTag = style.variations
          ? style.variations[idx % style.variations.length]
          : style.imagenTag;
        finalPrompt = `${promptTag}${contentSuffix}`;
      }

      const result = await generateImage({
        prompt: finalPrompt,
        aspectRatio: '9:16',
        logPrefix: 'StyleTest',
        referenceImages: useReferenceImages,
        referenceMode: 'full',
      });
      
      if (!result) throw new Error(`Generation failed for image ${idx}`);

      const finalBuffer = await sharp(result.buffer)
        .resize(1080, 1920, { fit: 'cover', position: 'center' })
        .png()
        .toBuffer();

      const bucket = storage.bucket();
      const ts = Date.now();
      const fileName = `style-tests/${postId}/${styleId}_${ts}_${idx}.png`;
      const file = bucket.file(fileName);
      await file.save(finalBuffer, { metadata: { contentType: 'image/png' } });
      try { await file.makePublic(); } catch { /* UBLA */ }
      return `https://storage.googleapis.com/${bucket.name}/${fileName}`;
    });

    const results = await Promise.allSettled(promises);
    const urls = results
      .filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled')
      .map(r => r.value);

    await db.collection('style-tests').doc(postId).set(
      { [styleId]: urls },
      { merge: true }
    );

    return NextResponse.json({ urls });

  } catch (error) {
    console.error('Error in POST /api/admin/style-test:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

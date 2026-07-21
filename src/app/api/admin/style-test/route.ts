import { NextRequest, NextResponse } from 'next/server';
import { db, storage } from '@/lib/firebase/admin';
import { verifyAuth, unauthorizedResponse } from '@/lib/auth/serverAuth';
import sharp from 'sharp';
import { generateImage } from '@/lib/ai/generateImage';
import { loadUserReferenceImage } from '@/lib/ai/loadUserReferenceImage';
import { VISUAL_STYLES } from '@/lib/ai/visualStyles';
import type { StyleCategory } from '@/lib/ai/visualStyles';

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
    } else {
      // Fallback
      styledPrompt = `${style.imagenTag} ${letter}`;
      useReferenceImages = referenceImages;
    }

    const promises = Array.from({ length: 5 }).map(async (_, idx) => {
      const result = await generateImage({
        prompt: styledPrompt,
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

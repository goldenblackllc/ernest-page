const { getFirestore } = require('firebase-admin/firestore');
const { initializeApp, cert, getApps } = require('firebase-admin/app');
require('dotenv').config({ path: '.env.local' });

if (!getApps().length) {
    initializeApp({
        credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY))
    });
}
const db = getFirestore();

async function check() {
    const snap = await db.collection('posts').orderBy('created_at', 'desc').limit(1).get();
    if (snap.empty) { console.log('No posts found'); return; }
    const post = snap.docs[0].data();
    console.log(JSON.stringify({
        id: snap.docs[0].id,
        imagen_url: post.imagen_url,
        unsplash_url: post.unsplash_url,
        public_post_imagen_url: post.public_post?.imagen_url,
        public_post_unsplash_url: post.public_post?.unsplash_url,
        imagen_prompt: post.imagen_prompt,
        unsplash_query: post.unsplash_query
    }, null, 2));
}
check().catch(console.error);

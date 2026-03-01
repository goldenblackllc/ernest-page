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
    const snap = await db.collection('posts').orderBy('created_at', 'desc').limit(5).get();
    if (snap.empty) { console.log('No posts found'); return; }

    const results = snap.docs.map(doc => {
        const data = doc.data();
        return {
            id: doc.id,
            author: data.author,
            uid: data.uid,
            region: data.region,
            imagen_url: data.imagen_url,
            unsplash_url: data.unsplash_url,
            public_post_imagen_url: data.public_post?.imagen_url,
            public_post_unsplash_url: data.public_post?.unsplash_url,
            title: data.public_post?.title || data.title,
            created_at: data.created_at?.toDate()?.toISOString()
        };
    });
    console.log(JSON.stringify(results, null, 2));
}
check().catch(console.error);

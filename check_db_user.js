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
    const snap = await db.collection('posts').orderBy('created_at', 'desc').limit(10).get();
    if (snap.empty) { console.log('No posts found'); return; }

    // Dump entire object for the specific user UID
    snap.docs.forEach(doc => {
        const data = doc.data();
        if (data.uid === 'XtmPR46JQaUKVt9KpkKo2C23mAi2') {
            console.log("=== POST ===");
            console.log(JSON.stringify(data, null, 2));
        }
    });
}
check().catch(console.error);

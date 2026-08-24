const fs = require('fs');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

// read .env.local manually
const env = fs.readFileSync('.env.local', 'utf-8');
const match = env.match(/FIREBASE_SERVICE_ACCOUNT_KEY='(.*)'/s);
if (!match) throw new Error("Could not find key in .env.local");

const serviceAccount = JSON.parse(match[1]);

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

async function run() {
  const postsSnap = await db.collection('posts').get();
  console.log(`Found ${postsSnap.size} posts in total.`);
  
  const authorIds = new Set();
  postsSnap.forEach(doc => {
    const data = doc.data();
    if (data.authorId) {
      authorIds.add(data.authorId);
    }
  });

  const orphanedAuthors = [];
  for (const uid of authorIds) {
    const userDoc = await db.collection('users').doc(uid).get();
    if (!userDoc.exists) {
      orphanedAuthors.push(uid);
    }
  }

  console.log(`Found ${orphanedAuthors.length} orphaned authors:`, orphanedAuthors);
  
  let deletedCount = 0;
  for (const uid of orphanedAuthors) {
    const orphanPostsSnap = await db.collection('posts').where('authorId', '==', uid).get();
    
    // Batch delete
    let batch = db.batch();
    let i = 0;
    for (const doc of orphanPostsSnap.docs) {
      batch.delete(doc.ref);
      i++;
      if (i % 400 === 0) {
        await batch.commit();
        batch = db.batch();
      }
    }
    if (i % 400 !== 0) {
      await batch.commit();
    }
    console.log(`Deleted ${orphanPostsSnap.size} posts for author ${uid}`);
    deletedCount += orphanPostsSnap.size;
  }
  
  console.log(`Successfully deleted ${deletedCount} orphaned posts.`);
}

run().catch(console.error);

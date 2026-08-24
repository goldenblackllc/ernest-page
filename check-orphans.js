const fs = require('fs');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

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

  console.log(`Found ${authorIds.size} unique authors.`);
  
  const orphanedAuthors = [];
  for (const uid of authorIds) {
    const userDoc = await db.collection('users').doc(uid).get();
    if (!userDoc.exists) {
      orphanedAuthors.push(uid);
    }
  }

  console.log(`Found ${orphanedAuthors.length} orphaned authors:`, orphanedAuthors);
  
  let orphanedPostsCount = 0;
  for (const uid of orphanedAuthors) {
    const orphanPostsSnap = await db.collection('posts').where('authorId', '==', uid).get();
    orphanedPostsCount += orphanPostsSnap.size;
  }
  
  console.log(`Total orphaned posts: ${orphanedPostsCount}`);
}

run().catch(console.error);

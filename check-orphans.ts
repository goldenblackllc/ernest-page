import { config } from 'dotenv';
config({ path: '.env.local' });
import { db } from './src/lib/firebase/admin.js';

async function checkOrphans() {
  const postsSnap = await db.collection('posts').get();
  console.log(`Found ${postsSnap.size} posts in total.`);
  
  const authorIds = new Set<string>();
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

checkOrphans().catch(console.error);

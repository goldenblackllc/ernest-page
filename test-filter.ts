import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}');
initializeApp({ credential: cert(sa) });
const db = getFirestore();

async function run() {
  const postsRef = db.collection('posts');
  const snapC = await postsRef.orderBy('created_at', 'desc').limit(25).get();
  
  if (snapC.empty) {
      console.log('No posts found!');
      return;
  }
  
  console.log('Total Docs in Query C:', snapC.docs.length);

  const myUid = 'Wi7QEgKkGENdns3maoYXgyspGhl1';
  const myRegion = 'MA';                             
  
  const discoveryDocs = snapC.docs.filter(doc => {
      const data = doc.data();
      const isMe = data.authorId === myUid;
      const isFollowed = false; 
      const isSameRegion = myRegion && data.region === myRegion;
      
      console.log('chk:', doc.id, 'region:', data.region, 'isSame:', isSameRegion, 'isPub:', data.is_public);
      
      return !isMe && !isFollowed && !isSameRegion;
  });
  
  console.log('Final Discovery Docs Included (Filtering OUT region MA):');
  discoveryDocs.slice(0, 15).forEach(d => console.log('  - ' + d.id + ' user: ' + d.data().authorId + ' region: ' + d.data().region));
}
run().catch(console.error);

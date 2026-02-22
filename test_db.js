const admin = require('firebase-admin');

admin.initializeApp({
  projectId: 'earnest-page', // Assuming the default project, or we can just require the config
});

const db = admin.firestore();

async function main() {
    const snapshot = await db.collection('posts').orderBy('created_at', 'desc').limit(5).get();
    snapshot.forEach(doc => {
        console.log("Post:", doc.id, "Type:", doc.data().type, "Pseudonym:", doc.data().pseudonym);
    });
}
main().catch(console.error);

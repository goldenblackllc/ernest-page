import { db } from './src/lib/firebase/admin';

async function checkRecentPosts() {
    try {
        console.log("Fetching recent posts...");
        const postsRef = db.collection('posts');
        const snapshot = await postsRef.orderBy('created_at', 'desc').limit(10).get();

        if (snapshot.empty) {
            console.log('No matching documents.');
            return;
        }

        const posts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        console.log(`Found ${posts.length} posts.`);

        const uidsToCheck = new Set<string>();

        posts.forEach((post: any) => {
            console.log("------------------");
            console.log(`Post ID: ${post.id}`);
            console.log(`Type: ${post.type}`);
            console.log(`Region: ${post.region}`);
            console.log(`Author ID: ${post.authorId || post.uid}`);
            if (post.authorId || post.uid) uidsToCheck.add(post.authorId || post.uid);
            console.log(`Created At: ${post.created_at?.toDate()}`);
        });

        console.log("\nChecking associated users...");
        for (const uid of Array.from(uidsToCheck)) {
            const userRef = db.collection('users').doc(uid as string);
            const userSnap = await userRef.get();
            if (userSnap.exists) {
                const userData = userSnap.data();
                console.log("------------------");
                console.log(`User UID: ${uid}`);
                console.log(`User Region: ${userData?.region}`);
            } else {
                console.log(`User UID: ${uid} - NOT FOUND`);
            }
        }
        process.exit(0);

    } catch (error) {
        console.error("Error fetching data:", error);
        process.exit(1);
    }
}

checkRecentPosts();

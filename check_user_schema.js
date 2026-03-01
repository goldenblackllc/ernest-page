const admin = require("firebase-admin");

if (!admin.apps.length) {
    admin.initializeApp({
        projectId: "earnest-test-cde37"
    });
}
const db = admin.firestore();

async function checkUser() {
    try {
        const usersRef = db.collection('users');
        const snapshot = await usersRef.limit(1).get();
        if (snapshot.empty) {
            console.log('No matching documents.');
            return;
        }

        snapshot.forEach(doc => {
            console.log("User Document Schema:", JSON.stringify(doc.data(), null, 2));
        });
    } catch (error) {
        console.error("Error getting user document:", error);
    }
}

checkUser();

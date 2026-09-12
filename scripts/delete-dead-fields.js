/**
 * Delete dead fields from all user documents.
 * These fields have been migrated to new top-level paths and are no longer read or written by any code.
 */
const admin = require('firebase-admin');
const fs = require('fs');

// Load service account
const env = fs.readFileSync('.env.local', 'utf8');
const m = env.match(/FIREBASE_SERVICE_ACCOUNT_KEY='(.+?)'/s);
const sa = JSON.parse(m[1]);

if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(sa) });
}

const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

async function deleteDeadFields() {
    const usersSnapshot = await db.collection('users').get();
    console.log(`Found ${usersSnapshot.size} user documents\n`);

    for (const doc of usersSnapshot.docs) {
        const data = doc.data();
        const uid = doc.id;
        const deletions = {};

        // Delete entire nested objects
        if (data.identity) deletions.identity = FieldValue.delete();
        if (data.unified_profile) deletions.unified_profile = FieldValue.delete();
        if (data.character_bible) deletions.character_bible = FieldValue.delete();
        if (data.source_code) deletions.source_code = FieldValue.delete();
        if (data.wants_for_bible !== undefined) deletions.wants_for_bible = FieldValue.delete();

        const fieldCount = Object.keys(deletions).length;
        if (fieldCount === 0) {
            console.log(`[${uid}] No dead fields found — skipping`);
            continue;
        }

        console.log(`[${uid}] Deleting ${fieldCount} fields: ${Object.keys(deletions).join(', ')}`);
        await doc.ref.update(deletions);
    }

    console.log('\nDone. All dead fields removed.');
}

deleteDeadFields().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});

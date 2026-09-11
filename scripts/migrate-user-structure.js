/**
 * One-time migration script: copies old user document fields to new paths.
 * Uses set({ merge: true }) — only adds new fields, never deletes old ones.
 * 
 * Run with: node scripts/migrate-user-structure.js
 */
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Load service account from .env.local
const envContent = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8');
const saMatch = envContent.match(/FIREBASE_SERVICE_ACCOUNT_KEY='(.+?)'/s);
if (!saMatch) throw new Error('Could not find FIREBASE_SERVICE_ACCOUNT_KEY in .env.local');
const sa = JSON.parse(saMatch[1]);

admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

async function migrateUser(uid) {
    const docRef = db.collection('users').doc(uid);
    const doc = await docRef.get();
    if (!doc.exists) {
        console.log(`  SKIP: ${uid} — document doesn't exist`);
        return;
    }

    const data = doc.data();
    const identity = data?.identity || {};
    const bible = data?.character_bible || {};
    const profile = data?.unified_profile || {};
    const compiledOutput = bible?.compiled_output || {};

    const updates = {};

    // --- User Inputs (flatten from identity + unified_profile) ---

    // Name: prefer character_bible.character_name, fall back to identity.character_name
    if (bible.character_name || identity.character_name) {
        updates.name = bible.character_name || identity.character_name;
    }

    // Physical traits from identity → top-level
    const physicalFields = ['gender', 'birthdate', 'ethnicity', 'skin_tone', 'hair_colors', 'hair_texture', 'hair_volume', 'eye_color', 'height'];
    for (const field of physicalFields) {
        if (identity[field] !== undefined) {
            updates[field] = identity[field];
        }
    }

    // My Life data from unified_profile → top-level
    if (profile.defining_words !== undefined) updates.defining_words = profile.defining_words;
    if (profile.wants !== undefined) updates.wants = profile.wants;
    if (profile.interests !== undefined) updates.interests = profile.interests;
    if (profile.people !== undefined) updates.people = profile.people;
    if (profile.dream_living !== undefined) updates.dream_living = profile.dream_living;
    if (profile.dream_financial !== undefined) updates.dream_financial = profile.dream_financial;

    // --- Session / AI data from identity → top-level ---
    if (identity.dossier !== undefined) updates.dossier = identity.dossier;
    if (identity.dossier_updated_at !== undefined) updates.dossier_updated_at = identity.dossier_updated_at;
    if (identity.session_count !== undefined) updates.session_count = identity.session_count;
    if (identity.onboarding_complete !== undefined) updates.onboarding_complete = identity.onboarding_complete;

    // --- System Outputs ---

    // bible.*
    const bibleUpdates = {};
    if (compiledOutput.ideal !== undefined) bibleUpdates.sections = compiledOutput.ideal;
    if (bible.status !== undefined) bibleUpdates.status = bible.status;
    if (bible.fail_reason !== undefined) bibleUpdates.fail_reason = bible.fail_reason;
    if (bible.last_updated !== undefined) bibleUpdates.last_updated = bible.last_updated;
    if (bible.last_commit !== undefined) bibleUpdates.last_commit = bible.last_commit;
    if (Object.keys(bibleUpdates).length > 0) updates.bible = bibleUpdates;

    // avatar.*
    const avatarUpdates = {};
    if (compiledOutput.avatar_url !== undefined) avatarUpdates.url = compiledOutput.avatar_url;
    if (bible.avatar_status !== undefined) avatarUpdates.status = bible.avatar_status;
    if (bible.avatar_last_attempt !== undefined) avatarUpdates.last_attempt = bible.avatar_last_attempt;
    if (bible.avatar_attempt_count !== undefined) avatarUpdates.attempt_count = bible.avatar_attempt_count;
    if (bible.avatar_error !== undefined) avatarUpdates.error = bible.avatar_error;
    if (Object.keys(avatarUpdates).length > 0) updates.avatar = avatarUpdates;

    // voice.*
    const voiceUpdates = {};
    if (bible.voice_id !== undefined) voiceUpdates.id = bible.voice_id;
    if (bible.voice_name !== undefined) voiceUpdates.name = bible.voice_name;
    if (bible.voice_confirmed !== undefined) voiceUpdates.confirmed = bible.voice_confirmed;
    if (Object.keys(voiceUpdates).length > 0) updates.voice = voiceUpdates;

    if (Object.keys(updates).length === 0) {
        console.log(`  SKIP: ${uid} — nothing to migrate`);
        return;
    }

    // Write new fields (merge: true preserves all old fields)
    await docRef.set(updates, { merge: true });

    console.log(`  DONE: ${uid} — migrated ${Object.keys(updates).length} top-level fields`);
    
    // Log what was written
    for (const [key, val] of Object.entries(updates)) {
        if (typeof val === 'object' && !Array.isArray(val)) {
            console.log(`    ${key}: { ${Object.keys(val).join(', ')} }`);
        } else if (Array.isArray(val)) {
            console.log(`    ${key}: Array(${val.length})`);
        } else {
            const display = typeof val === 'string' ? val.substring(0, 60) : val;
            console.log(`    ${key}: ${display}`);
        }
    }
}

async function main() {
    console.log('Starting user document migration...\n');

    // Get all users
    const usersSnapshot = await db.collection('users').get();
    console.log(`Found ${usersSnapshot.size} user(s)\n`);

    for (const doc of usersSnapshot.docs) {
        console.log(`Migrating ${doc.id}...`);
        try {
            await migrateUser(doc.id);
        } catch (err) {
            console.error(`  ERROR: ${doc.id} — ${err.message}`);
        }
    }

    console.log('\nMigration complete!');
}

main().catch(console.error);

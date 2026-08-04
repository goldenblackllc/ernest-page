/**
 * test-per-message-images.mjs
 *
 * End-to-end test for the per-message image pipeline.
 * Creates a synthetic chat session, triggers cleanup-chats processing,
 * then inspects the resulting post to verify Phase 1 + Phase 2 worked.
 *
 * Usage:
 *   node --env-file=.env.local scripts/test-per-message-images.mjs
 *
 * What it does:
 *   1. Finds a real user who has a character bible + voice
 *   2. Creates a tiny fake chat session (3 messages) under their account
 *   3. Calls the cleanup-chats cron to process it (Phase 1)
 *   4. Calls cleanup-chats again to generate images (Phase 2)
 *   5. Inspects the resulting post and reports results
 *   6. Optionally deletes the test post if --cleanup flag is passed
 */

import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

// ─── Firebase Init ───────────────────────────────────────────────────────────
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}');
if (!getApps().length) {
    initializeApp({
        credential: cert(serviceAccount),
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    });
}
const db = getFirestore();

// ─── Config ──────────────────────────────────────────────────────────────────
const CRON_SECRET = process.env.CRON_SECRET;
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const CLEANUP = process.argv.includes('--cleanup');
const SKIP_PHASE2 = process.argv.includes('--skip-phase2');

// ─── Test Data ───────────────────────────────────────────────────────────────
const TEST_MESSAGES = [
    { role: 'user', content: "I've been thinking about changing careers. I'm a software engineer but I've always been interested in teaching. Is it crazy to give up a good salary for something I'm passionate about?" },
    { role: 'assistant', content: "It's not crazy at all. The fact that you're drawn to teaching says something important about what you value. What would teaching give you that engineering doesn't?" },
    { role: 'user', content: "Impact. I feel like I help companies make money but I don't see the direct difference I'm making. With teaching, I could see students grow. My mom was a teacher and she always said it was the most rewarding thing she ever did." },
    { role: 'assistant', content: "That's a beautiful connection — your mom's legacy calling to you through your own restlessness. Here's what I'd suggest: you don't have to leap off a cliff. Start by volunteering as a tutor or adjunct instructor. Test the water with your toes, not your whole body. The salary question becomes much less scary when you have real experience telling you 'yes, this is what I want.'" },
    { role: 'user', content: "You're right. I actually looked into a weekend coding bootcamp that needs instructors. Maybe I should start there." },
    { role: 'assistant', content: "That's perfect. A coding bootcamp instructor role bridges your two worlds — you're teaching, but you're teaching what you know best. It's the gentlest possible entry point. Do it for one semester and then reassess. You'll know." },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
async function callCron() {
    const res = await fetch(`${BASE_URL}/api/cron/cleanup-chats`, {
        headers: { Authorization: `Bearer ${CRON_SECRET}` },
    });
    return res.json();
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
    console.log('\n━━━ Per-Message Image Pipeline Test ━━━\n');

    // Step 1: Find a suitable test user (has character bible + voice)
    console.log('1️⃣  Finding a test user with character bible...');
    const usersSnap = await db.collection('users')
        .where('character_bible.voice_id', '!=', null)
        .limit(5)
        .get();

    if (usersSnap.empty) {
        console.error('❌ No users with character bible found. Cannot test.');
        process.exit(1);
    }

    // Pick a user who has a compiled bible
    let testUid = null;
    let testUserData = null;
    for (const doc of usersSnap.docs) {
        const data = doc.data();
        if (data.character_bible?.compiled_output?.ideal?.length > 0) {
            testUid = doc.id;
            testUserData = data;
            break;
        }
    }

    if (!testUid) {
        // Fall back to first user
        testUid = usersSnap.docs[0].id;
        testUserData = usersSnap.docs[0].data();
    }

    console.log(`   ✅ Using user: ${testUserData?.displayName || testUid}`);
    console.log(`   UID: ${testUid}`);
    console.log(`   Bible sections: ${testUserData?.character_bible?.compiled_output?.ideal?.length || 0}`);
    console.log(`   Voice ID: ${testUserData?.character_bible?.voice_id || 'none'}`);

    // Step 2: Create a fake chat session
    console.log('\n2️⃣  Creating test chat session...');
    const chatRef = db.collection('users').doc(testUid).collection('active_chats').doc();
    await chatRef.set({
        messages: TEST_MESSAGES,
        isClosed: true,
        closedAt: Date.now() - 60 * 60 * 1000, // 1 hour ago
        sessionRouting: 'private', // private so it doesn't show up for other users
        createdAt: Date.now() - 2 * 60 * 60 * 1000,
        _testSession: true,
    });
    console.log(`   ✅ Chat created: ${chatRef.id}`);

    // Step 3: Run Phase 1 (text + audio + image prompts)
    console.log('\n3️⃣  Running Phase 1 (cleanup-chats cron)...');
    const phase1Start = Date.now();
    const phase1Result = await callCron();
    const phase1Duration = ((Date.now() - phase1Start) / 1000).toFixed(1);
    console.log(`   ✅ Phase 1 complete in ${phase1Duration}s`);
    console.log(`   Result:`, JSON.stringify(phase1Result));

    // Step 4: Find the created post
    console.log('\n4️⃣  Inspecting created post...');
    await sleep(2000); // Brief delay for Firestore eventual consistency
    // Use existing index (authorId + created_at DESC)
    const recentPosts = await db.collection('posts')
        .where('authorId', '==', testUid)
        .orderBy('created_at', 'desc')
        .limit(5)
        .get();

    const postDoc = recentPosts.docs.find(d => d.data().image_style === 'per-message');

    if (!postDoc) {
        console.error('❌ No per-message post found. Phase 1 may have failed.');
        console.log('   Check the dev server console for error logs.');
        process.exit(1);
    }
    const postData = postDoc.data();
    console.log(`   Post ID: ${postDoc.id}`);
    console.log(`   Title: "${postData.title}"`);
    console.log(`   Image style: ${postData.image_style}`);
    console.log(`   Image prompts: ${postData.image_prompts?.length || 0}`);
    console.log(`   Message images: ${postData.message_images?.length || 0} (should be 0 — Phase 2 hasn't run)`);
    console.log(`   Audio URL: ${postData.audio_url ? '✅ present' : '❌ missing'}`);
    console.log(`   Message boundaries: ${postData.audio_message_boundaries?.length || 0}`);
    console.log(`   Is public: ${postData.is_public} (should be false — no images yet)`);
    console.log(`   Visibility: ${postData.visibility}`);

    if (postData.image_prompts?.length > 0) {
        console.log('\n   📝 Sample prompts:');
        postData.image_prompts.slice(0, 2).forEach((p, i) => {
            console.log(`   [${i}] ${p.substring(0, 150)}...`);
        });
    }

    // Verify condensed transcript
    const ct = postData.condensed_transcript || postData.public_post?.condensed_transcript;
    if (ct) {
        console.log(`\n   📖 Condensed transcript: ${ct.length} messages`);
        console.log(`   Prompt/message match: ${postData.image_prompts?.length === ct.length ? '✅' : '❌'} (${postData.image_prompts?.length} prompts, ${ct.length} messages)`);
    }

    if (SKIP_PHASE2) {
        console.log('\n⏭️  Skipping Phase 2 (--skip-phase2 flag)');
    } else {
        // Step 5: Run Phase 2 (image generation)
        console.log('\n5️⃣  Running Phase 2 (image generation)...');
        console.log('   ⏳ This takes ~2s per image...');
        const phase2Start = Date.now();
        const phase2Result = await callCron();
        const phase2Duration = ((Date.now() - phase2Start) / 1000).toFixed(1);
        console.log(`   ✅ Phase 2 complete in ${phase2Duration}s`);
        console.log(`   Result:`, JSON.stringify(phase2Result));

        // Re-read the post
        const updatedPost = (await postDoc.ref.get()).data();
        const filledImages = (updatedPost.message_images || []).filter(Boolean);
        console.log(`\n   📸 Images generated: ${filledImages.length}/${updatedPost.image_prompts?.length || 0}`);
        console.log(`   Is public: ${updatedPost.is_public}`);
        console.log(`   First image URL: ${updatedPost.imagen_url || 'none'}`);

        if (filledImages.length > 0) {
            // Check image sizes
            console.log('\n   📏 Image size check:');
            for (let i = 0; i < Math.min(filledImages.length, 3); i++) {
                try {
                    const res = await fetch(filledImages[i], { method: 'HEAD' });
                    const size = res.headers.get('content-length');
                    const type = res.headers.get('content-type');
                    const cache = res.headers.get('cache-control');
                    const sizeKB = size ? (parseInt(size) / 1024).toFixed(0) : '?';
                    console.log(`   [${i}] ${sizeKB} KB | ${type} | cache: ${cache}`);
                } catch (e) {
                    console.log(`   [${i}] ⚠️ Could not check: ${e.message}`);
                }
            }
        }
    }

    // Step 6: Cleanup
    if (CLEANUP) {
        console.log('\n🧹 Cleaning up test post...');
        await postDoc.ref.delete();
        console.log('   ✅ Deleted');
    } else {
        console.log(`\n💡 Post preserved: ${postDoc.id}`);
        console.log(`   To clean up later: add --cleanup flag`);
        console.log(`   To view: Check your local dev at http://localhost:3000`);
    }

    console.log('\n━━━ Test Complete ━━━\n');
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});

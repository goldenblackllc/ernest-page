const { getFirestore } = require('firebase-admin/firestore');
const { initializeApp, cert, getApps } = require('firebase-admin/app');
require('dotenv').config({ path: '.env.local' });

if (!getApps().length) {
    initializeApp({
        credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY))
    });
}
const db = getFirestore();

async function check() {
    const snap = await db.collection('users').get();
    for (const doc of snap.docs) {
        const data = doc.data();
        if (data?.daily_digest) {
            console.log('=== USER WITH DIGEST ===');
            console.log('UID:', doc.id);
            const sub = data?.subscription;
            const bible = data?.character_bible?.compiled_output?.ideal;
            console.log('Subscription status:', sub?.status);
            console.log('Subscribed until:', sub?.subscribedUntil);
            console.log('Is active:', sub?.status === 'active' && sub?.subscribedUntil && new Date(sub.subscribedUntil) > new Date());
            console.log('Has compiled bible:', Boolean(bible && Array.isArray(bible) && bible.length > 0));
            console.log('Bible sections:', bible?.length || 0);
            console.log('Voice ID:', data?.character_bible?.voice_id || 'none');
            console.log('Rotation index:', data?.digest_rotation_index);
            console.log('Digest date:', data.daily_digest?.date);
            console.log('Digest title:', data.daily_digest?.title);
            console.log('Has image:', Boolean(data.daily_digest?.image_url));
            console.log('Has audio:', Boolean(data.daily_digest?.audio_url));
            console.log('Updated at:', data.daily_digest?.updated_at);
        }
    }

    // Also check: who is actually eligible?
    console.log('\n=== ALL ELIGIBLE USERS ===');
    for (const doc of snap.docs) {
        const data = doc.data();
        const sub = data?.subscription;
        const isSubscriber = sub?.status === 'active' && sub?.subscribedUntil && new Date(sub.subscribedUntil) > new Date();

        let hadRecentSession = false;
        if (!isSubscriber) {
            const purchases = data?.session_purchases || [];
            const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
            hadRecentSession = purchases.some(p =>
                p.purchasedAt && new Date(p.purchasedAt).getTime() > thirtyDaysAgo
            );
        }

        if (!isSubscriber && !hadRecentSession) continue;

        const compiledBible = data?.character_bible?.compiled_output?.ideal;
        const hasBible = compiledBible && Array.isArray(compiledBible) && compiledBible.length > 0;

        console.log(`  ${doc.id} | sub=${isSubscriber} | recentSession=${hadRecentSession} | hasBible=${hasBible} | digest_date=${data?.daily_digest?.date || 'none'}`);
    }
}

check().catch(console.error);

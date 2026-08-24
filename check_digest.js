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
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    console.log(`Today: ${today}`);
    console.log(`Yesterday: ${yesterday}\n`);

    const snap = await db.collection('users').get();
    let hasDigest = 0;
    let todayDigest = 0;
    let yesterdayDigest = 0;
    let eligible = 0;
    const digestDates = {};
    const details = [];

    for (const doc of snap.docs) {
        const data = doc.data();
        const digest = data?.daily_digest;
        const sub = data?.subscription;
        const isSubscriber = sub?.status === 'active' && sub?.subscribedUntil && new Date(sub.subscribedUntil) > new Date();
        const compiledBible = data?.character_bible?.compiled_output?.ideal;
        const hasBible = compiledBible && Array.isArray(compiledBible) && compiledBible.length > 0;

        let hadRecentSession = false;
        if (!isSubscriber) {
            const purchases = data?.session_purchases || [];
            const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
            hadRecentSession = purchases.some(p =>
                p.purchasedAt && new Date(p.purchasedAt).getTime() > thirtyDaysAgo
            );
        }

        if (isSubscriber || hadRecentSession) eligible++;

        if (digest) {
            hasDigest++;
            const d = digest.date || 'unknown';
            digestDates[d] = (digestDates[d] || 0) + 1;
            if (d === today) todayDigest++;
            if (d === yesterday) yesterdayDigest++;

            details.push({
                uid: doc.id.substring(0, 8) + '...',
                date: d,
                title: (digest.title || '').substring(0, 40),
                hasImage: Boolean(digest.image_url),
                hasAudio: Boolean(digest.audio_url),
                hasThumbnail: Boolean(digest.thumbnail_url),
                messageImagesCount: (digest.message_images || []).filter(Boolean).length,
                isSubscriber,
                hasBible,
                rotationIndex: data?.digest_rotation_index,
            });
        }
    }

    console.log('=== DAILY DIGEST STATUS ===');
    console.log(`Total users: ${snap.size}`);
    console.log(`Eligible users (active sub or recent session): ${eligible}`);
    console.log(`Users with any digest: ${hasDigest}`);
    console.log(`Today's digest cards (${today}): ${todayDigest}`);
    console.log(`Yesterday's digest cards (${yesterday}): ${yesterdayDigest}`);
    console.log(`\nDigest dates distribution:`);
    // Sort by date desc
    Object.entries(digestDates).sort(([a], [b]) => b.localeCompare(a)).forEach(([date, count]) => {
        console.log(`  ${date}: ${count} cards`);
    });

    console.log('\n=== DIGEST DETAILS ===');
    details.sort((a, b) => (b.date || '').localeCompare(a.date || '')).forEach(d => {
        console.log(`  ${d.uid} | date=${d.date} | "${d.title}" | img=${d.hasImage} | audio=${d.hasAudio} | thumb=${d.hasThumbnail} | msgImgs=${d.messageImagesCount} | sub=${d.isSubscriber} | bible=${d.hasBible} | rot=${d.rotationIndex}`);
    });
}

check().catch(console.error);

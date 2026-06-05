import { db } from '@/lib/firebase/admin';
import { verifyInternalAuth, unauthorizedResponse } from '@/lib/auth/serverAuth';

export const maxDuration = 300;

export async function GET(req: Request) {
    if (!verifyInternalAuth(req)) return unauthorizedResponse();

    const summary = { processed: 0, succeeded: 0, failed: 0, skipped: 0 };

    try {
        const now = Date.now();
        const oneHourAgo = now - 3600000;
        const origin = new URL(req.url).origin;

        // Query users with failed or pending avatar status
        const failedSnap = await db.collection('users')
            .where('character_bible.avatar_status', 'in', ['failed', 'pending'])
            .get();

        const eligibleUsers: FirebaseFirestore.QueryDocumentSnapshot[] = [];

        for (const doc of failedSnap.docs) {
            const data = doc.data();
            const bible = data.character_bible || {};
            const lastAttempt = bible.avatar_last_attempt;
            const attemptCount = bible.avatar_attempt_count || 0;

            // Skip if max retries reached
            if (attemptCount >= 5) {
                summary.skipped++;
                continue;
            }

            // Skip if attempted less than 1 hour ago
            if (lastAttempt && lastAttempt > oneHourAgo) {
                summary.skipped++;
                continue;
            }

            // Skip if user hasn't completed onboarding
            if (!data.identity) {
                summary.skipped++;
                continue;
            }

            eligibleUsers.push(doc);
        }

        console.log(`[retry-avatars] Found ${eligibleUsers.length} eligible users out of ${failedSnap.size} with failed/pending status`);

        // Process users sequentially to avoid hammering the Google API
        for (const userDoc of eligibleUsers) {
            summary.processed++;
            const uid = userDoc.id;

            try {
                console.log(`[retry-avatars] Retrying avatar for user ${uid}`);

                const res = await fetch(`${origin}/api/character/avatar`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-internal-key': process.env.CRON_SECRET || '',
                    },
                    body: JSON.stringify({ uid }),
                });

                if (res.ok) {
                    console.log(`[retry-avatars] Success for user ${uid}`);
                    summary.succeeded++;
                } else {
                    const err = await res.text();
                    console.error(`[retry-avatars] Failed for user ${uid}: ${res.status} ${err}`);
                    summary.failed++;
                }
            } catch (error: any) {
                console.error(`[retry-avatars] Error for user ${uid}:`, error.message);
                summary.failed++;
            }

            // Small delay between users to avoid hammering the API
            if (summary.processed < eligibleUsers.length) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        console.log(`[retry-avatars] Complete:`, summary);
        return Response.json(summary);

    } catch (error: any) {
        console.error('[retry-avatars] Cron error:', error);
        return Response.json({ error: error.message, ...summary }, { status: 500 });
    }
}

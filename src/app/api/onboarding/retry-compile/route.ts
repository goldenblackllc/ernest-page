import { db } from '@/lib/firebase/admin';
import { verifyAuth, unauthorizedResponse } from '@/lib/auth/serverAuth';
import { waitUntil } from '@vercel/functions';

export const maxDuration = 10; // Quick response — heavy work is background

export async function POST(req: Request) {
    const uid = await verifyAuth(req);
    if (!uid) return unauthorizedResponse();

    const userDoc = await db.collection('users').doc(uid).get();
    const data = userDoc.data();

    if (!data?.character_bible?.source_code) {
        return Response.json({ error: 'No source code found to rebuild.' }, { status: 400 });
    }

    const source_code = data.character_bible.source_code;

    // Reset status to compiling with fresh timestamp
    const { FieldValue } = await import('firebase-admin/firestore');
    await db.collection('users').doc(uid).set({
        character_bible: {
            status: 'compiling',
            fail_reason: FieldValue.delete(),
            last_updated: Date.now(),
        }
    }, { merge: true });

    // Fire the compile in the background
    const origin = new URL(req.url).origin;
    waitUntil((async () => {
        try {
            console.log(`[RetryCompile] Starting bible re-compilation for ${uid}`);
            const compileRes = await fetch(`${origin}/api/character/compile`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-internal-key': process.env.CRON_SECRET || '',
                },
                body: JSON.stringify({ uid, source_code, skipCooldown: true }),
                signal: AbortSignal.timeout(240_000), // 4 min — fail fast so status doesn't stay 'compiling'
            });

            if (!compileRes.ok) {
                console.error(`[RetryCompile] Compile failed with status ${compileRes.status}`);

                // Extract failure reason from the compile response
                let failReason = 'error'; // generic default
                try {
                    const body = await compileRes.json();
                    if (compileRes.status === 429) {
                        failReason = body.limitType === 'daily' ? 'rate_limit_daily' : 'rate_limit_cooldown';
                    }
                } catch { /* body parse failed — keep generic reason */ }

                await db.collection('users').doc(uid).set({
                    character_bible: { status: 'failed', fail_reason: failReason }
                }, { merge: true });
                return;
            }

            // Mark bible as ready
            const { FieldValue } = await import('firebase-admin/firestore');
            await db.collection('users').doc(uid).set({
                character_bible: { status: 'ready', last_commit: FieldValue.serverTimestamp() }
            }, { merge: true });

            // Fire avatar generation independently — non-blocking, errors handled by avatar route
            fetch(`${origin}/api/character/avatar`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-internal-key': process.env.CRON_SECRET || '',
                },
                body: JSON.stringify({ uid }),
            }).catch(err => console.error(`[RetryCompile] Avatar trigger failed (non-fatal):`, err.message));

            console.log(`[RetryCompile] Complete for ${uid}`);
        } catch (err: any) {
            console.error(`[RetryCompile] Error for ${uid}:`, err.message);
            await db.collection('users').doc(uid).set({
                character_bible: { status: 'failed' }
            }, { merge: true });
        }
    })());

    return Response.json({ success: true, message: 'Rebuild started.' });
}

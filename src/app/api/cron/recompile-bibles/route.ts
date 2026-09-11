import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Process users in parallel batches to stay within API rate limits
const BATCH_SIZE = 3;
const BATCH_STAGGER_MS = 3000;
const COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes

export async function GET(req: Request) {
    // Verify cron secret (Vercel sends Authorization: Bearer <CRON_SECRET>)
    const authHeader = req.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const cutoff = new Date(Date.now() - COOLDOWN_MS);

        // Find users whose bible is dirty and the dirty timestamp is older than 10 minutes
        const dirtyUsersSnapshot = await db
            .collection('users')
            .where('bible_dirty_since', '<=', cutoff)
            .get();

        if (dirtyUsersSnapshot.empty) {
            return NextResponse.json({ message: 'No dirty bibles to recompile', count: 0 });
        }

        const users = dirtyUsersSnapshot.docs.map(doc => ({ uid: doc.id, data: doc.data() }));
        console.log(`[RecompileBibles] Found ${users.length} user(s) with dirty bibles ready for recompile`);

        const results: { uid: string; status: 'success' | 'error'; error?: string }[] = [];

        // Process in batches
        for (let i = 0; i < users.length; i += BATCH_SIZE) {
            const batch = users.slice(i, i + BATCH_SIZE);

            const batchResults = await Promise.allSettled(
                batch.map(async ({ uid }) => {
                    try {
                        // Mark as compiling
                        await db.collection('users').doc(uid).set({
                            bible: { status: 'compiling' }
                        }, { merge: true });

                        // Call the Cloud Function to compile the bible
                        const compileUrl = process.env.COMPILE_FUNCTION_URL || `https://us-central1-earnest-page.cloudfunctions.net/compileCharacterBible`;
                        const res = await fetch(compileUrl, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'x-internal-key': process.env.CRON_SECRET || '',
                            },
                            body: JSON.stringify({ uid }),
                            signal: AbortSignal.timeout(540_000), // 9 min
                        });

                        if (!res.ok) {
                            const errorData = await res.json().catch(() => ({}));
                            throw new Error(errorData.error || `HTTP ${res.status}`);
                        }

                        // Success — clear the dirty flag and set status ready
                        await db.collection('users').doc(uid).update({
                            bible_dirty_since: FieldValue.delete(),
                            'bible.status': 'ready',
                        });

                        console.log(`[RecompileBibles] ✅ ${uid} — recompiled successfully`);
                        return { uid, status: 'success' as const };
                    } catch (err: any) {
                        console.error(`[RecompileBibles] ❌ ${uid} — ${err.message}`);
                        // Don't clear bible_dirty_since — will retry next cron cycle
                        // Reset status so the user isn't stuck on 'compiling'
                        await db.collection('users').doc(uid).set({
                            bible: { status: 'stable' }
                        }, { merge: true }).catch(() => {});
                        return { uid, status: 'error' as const, error: err.message };
                    }
                })
            );

            results.push(...batchResults.map(r => r.status === 'fulfilled' ? r.value : { uid: 'unknown', status: 'error' as const, error: 'Promise rejected' }));

            // Stagger between batches
            if (i + BATCH_SIZE < users.length) {
                await new Promise(resolve => setTimeout(resolve, BATCH_STAGGER_MS));
            }
        }

        const successCount = results.filter(r => r.status === 'success').length;
        const errorCount = results.filter(r => r.status === 'error').length;

        return NextResponse.json({
            message: `Recompiled ${successCount} bible(s), ${errorCount} error(s)`,
            results,
        });
    } catch (err: any) {
        console.error('[RecompileBibles] Fatal error:', err.message);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

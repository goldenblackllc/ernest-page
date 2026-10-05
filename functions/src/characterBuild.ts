/**
 * Character build — compile the Character Bible, then regenerate the avatar.
 *
 * buildCharacter   (task queue)  — does the work for one user
 * recompileBibles  (scheduled)   — every 5 minutes, enqueues users whose bible
 *                                  was edited 10+ minutes ago (debounces edits)
 *
 * Onboarding enqueues buildCharacter through the compileCharacterBible HTTP
 * function (called by the Vercel onboarding route).
 */

import { onTaskDispatched } from 'firebase-functions/v2/tasks';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFunctions } from 'firebase-admin/functions';
import { db, FieldValue } from './lib/firebase/admin.js';
import { compileCharacterBibleForUser } from './compileCharacterBible.js';
import { generateAvatarForUser } from './avatar.js';

const REGION = 'us-central1';
const MAX_ATTEMPTS = 3;
const COOLDOWN_MS = 10 * 60 * 1000;       // wait for edits to settle
const QUEUED_STALE_MS = 30 * 60 * 1000;   // re-enqueue if a queued build never finished

export interface BuildCharacterTask {
    uid: string;
    reason: 'onboarding' | 'recompile';
    /** For recompiles: bible_dirty_since (ms) at enqueue time */
    dirtySince?: number;
}

export function enqueueBuildCharacter(task: BuildCharacterTask) {
    return getFunctions()
        .taskQueue<BuildCharacterTask>(`locations/${REGION}/functions/buildCharacter`)
        .enqueue(task);
}

// ─── Task queue worker ──────────────────────────────────────────────────────

export const buildCharacter = onTaskDispatched<BuildCharacterTask>(
    {
        region: REGION,
        timeoutSeconds: 900,
        memory: '1GiB',
        retryConfig: { maxAttempts: MAX_ATTEMPTS, minBackoffSeconds: 60 },
        rateLimits: { maxConcurrentDispatches: 5 },
    },
    async (req) => {
        const { uid, reason, dirtySince } = req.data;
        const userRef = db.collection('users').doc(uid);
        const isFinalAttempt = req.retryCount >= MAX_ATTEMPTS - 1;

        await userRef.set({ bible: { status: 'compiling' } }, { merge: true });

        let result: { success: boolean; error?: string };
        try {
            result = await compileCharacterBibleForUser(uid);
        } catch (err: any) {
            result = { success: false, error: err.message };
        }

        if (!result.success) {
            console.error(`[BuildCharacter] Compile failed for ${uid} (${reason}, attempt ${req.retryCount + 1}):`, result.error);
            if (!isFinalAttempt) throw new Error(result.error || 'Bible compile failed'); // Cloud Tasks retries

            if (reason === 'onboarding') {
                await userRef.set({ bible: { status: 'failed', fail_reason: result.error || 'compile_error' } }, { merge: true });
            } else {
                // Keep bible_dirty_since so the scheduler tries again later; don't leave the UI on 'compiling'
                await userRef.set({ bible: { status: 'stable' }, bible_compile_queued_at: FieldValue.delete() }, { merge: true });
            }
            return;
        }

        // Success — mark ready. For recompiles, clear the dirty flag unless the
        // user edited again while we were compiling (then the scheduler picks it up).
        const updates: Record<string, any> = {
            'bible.status': 'ready',
            bible_compile_queued_at: FieldValue.delete(),
        };
        if (reason === 'onboarding') {
            updates['bible.last_commit'] = FieldValue.serverTimestamp();
        } else {
            const current = (await userRef.get()).data()?.bible_dirty_since;
            const currentMs = current?.toMillis?.() ?? 0;
            if (!dirtySince || currentMs <= dirtySince) updates.bible_dirty_since = FieldValue.delete();
        }
        await userRef.update(updates);

        // Bible changed → avatar should update (failures are retried hourly)
        await generateAvatarForUser(uid);
        console.log(`[BuildCharacter] ✅ ${uid} (${reason})`);
    }
);

// ─── Scheduler: debounce bible edits ────────────────────────────────────────

export const recompileBibles = onSchedule(
    {
        schedule: 'every 5 minutes',
        region: REGION,
        timeoutSeconds: 120,
        memory: '256MiB',
    },
    async () => {
        const now = Date.now();
        const snap = await db.collection('users')
            .where('bible_dirty_since', '<=', new Date(now - COOLDOWN_MS))
            .get();

        let enqueued = 0;
        for (const doc of snap.docs) {
            const data = doc.data();
            // Skip users whose build is already queued or running
            if (data.bible_compile_queued_at && data.bible_compile_queued_at > now - QUEUED_STALE_MS) continue;

            try {
                await doc.ref.set({ bible: { status: 'compiling' }, bible_compile_queued_at: now }, { merge: true });
                await enqueueBuildCharacter({
                    uid: doc.id,
                    reason: 'recompile',
                    dirtySince: data.bible_dirty_since?.toMillis?.(),
                });
                enqueued++;
            } catch (err: any) {
                console.error(`[RecompileBibles] Failed to enqueue ${doc.id}:`, err.message);
            }
        }

        if (enqueued) console.log(`[RecompileBibles] Enqueued ${enqueued} of ${snap.size} dirty bibles`);
    }
);

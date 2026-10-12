// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const h = vi.hoisted(() => {
    const state: { users: Record<string, Record<string, unknown>>; taskIds: Set<string> } = { users: {}, taskIds: new Set() };

    const db = {
        collection: vi.fn(() => ({
            get: async () => ({
                docs: Object.entries(state.users).map(([id, data]) => ({ id, data: () => data })),
            }),
        })),
    };

    // Cloud Tasks rejects a second task with the same id
    const enqueue = vi.fn(async (_data: unknown, opts: { id: string }) => {
        if (state.taskIds.has(opts.id)) {
            throw Object.assign(new Error('exists'), { code: 'functions/task-already-exists' });
        }
        state.taskIds.add(opts.id);
    });

    return { state, db, enqueue };
});

vi.mock('firebase-functions/v2/scheduler', () => ({
    onSchedule: (_opts: unknown, handler: unknown) => handler,
}));
vi.mock('firebase-functions/v2/tasks', () => ({
    onTaskDispatched: (_opts: unknown, handler: unknown) => handler,
}));
vi.mock('firebase-admin/functions', () => ({
    getFunctions: () => ({ taskQueue: () => ({ enqueue: h.enqueue }) }),
}));
vi.mock('../lib/firebase/admin.js', () => ({ db: h.db }));
vi.mock('../lib/ai/processPostContent.js', () => ({ processPostContent: vi.fn() }));
vi.mock('../lib/ai/generatePostImage.js', () => ({ generateMessageImages: vi.fn() }));
vi.mock('../lib/ai/loadUserReferenceImage.js', () => ({ loadUserReferenceImage: vi.fn() }));

import { dailyDigest } from '../dailyDigest.js';

const runScheduler = dailyDigest as unknown as () => Promise<void>;

const UID = 'user-1';

/** Run the 4:00 AM UTC scheduler on the given UTC date. */
async function runAt(date: string) {
    vi.setSystemTime(new Date(`${date}T04:00:00Z`));
    await runScheduler();
}

/** Same write the website's AuthContext makes when the user opens the app. */
function activeAt(isoTimestamp: string) {
    h.state.users[UID].last_active_date = new Date(isoTimestamp).toISOString().split('T')[0];
}

function digestIds() {
    return h.enqueue.mock.calls.map(([, opts]) => (opts as { id: string }).id);
}

beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    h.state.taskIds = new Set();
    h.state.users = {
        [UID]: { bible: { sections: [{ heading: 'Work', content: 'Builds things slowly and with care.' }] } },
    };
});

afterEach(() => {
    vi.useRealTimers();
});

describe('dailyDigest scheduler', () => {
    it('activity at 23:30 UTC yields exactly one digest across two runs', async () => {
        await runAt('2026-10-08'); // before the activity
        activeAt('2026-10-08T23:30:00Z');
        await runAt('2026-10-09');
        await runAt('2026-10-10');

        expect(digestIds()).toEqual([`digest-2026-10-09-${UID}`]);
    });

    it('activity at 02:00 UTC yields exactly one digest across two runs', async () => {
        activeAt('2026-10-09T02:00:00Z');
        await runAt('2026-10-09'); // same UTC day, two hours later
        await runAt('2026-10-10');
        await runAt('2026-10-11');

        expect(digestIds()).toEqual([`digest-2026-10-10-${UID}`]);
    });

    it('skips users with no bible, no activity, or a stale or invalid date', async () => {
        h.state.users = {
            noBible: { last_active_date: '2026-10-08' },
            neverActive: { bible: { sections: [{ content: 'x'.repeat(30) }] } },
            stale: { bible: { sections: [{ content: 'x'.repeat(30) }] }, last_active_date: '2026-10-07' },
            invalid: { bible: { sections: [{ content: 'x'.repeat(30) }] }, last_active_date: 'not a date' },
        };
        await runAt('2026-10-09');
        expect(h.enqueue).not.toHaveBeenCalled();
    });

    it('a repeated run on the same day does not enqueue a second digest', async () => {
        activeAt('2026-10-08T12:00:00Z');
        await runAt('2026-10-09');
        await runAt('2026-10-09');

        expect(h.state.taskIds).toEqual(new Set([`digest-2026-10-09-${UID}`]));
    });
});

// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeDb } from '@/test/fakeFirestore';

vi.mock('firebase-functions/v2/firestore', () => ({
    onDocumentUpdated: (_opts: unknown, handler: unknown) => handler,
}));
vi.mock('../lib/firebase/admin.js', async () => (await import('@/test/fakeFirestore')).adminModuleMock());
vi.mock('firebase-admin/firestore', async () => (await import('@/test/fakeFirestore')).firestoreModuleMock());
vi.mock('firebase-admin/auth', async () => (await import('@/test/fakeFirestore')).authModuleMock());
// One answer for each of the session's calls: dossier, session log and actions
vi.mock('../lib/ai/models.js', () => ({
    OPUS_MODEL: 'opus',
    generateWithFallback: vi.fn(async () => ({
        object: {
            rewritten_dossier: 'Present-tense facts.',
            session_recap: 'Talked about the afternoon.',
            way_in: 'none',
            identity: null,
            done: [],
            changed: [],
            rewritten: [],
            new_actions: [{ text: 'Take a walk after lunch', kind: 'once' }],
        },
    })),
}));
vi.mock('../lib/ai/condensedTranscript.js', () => ({
    generateCondensedTranscript: vi.fn(async () => ({ is_publishable: true, title: 'A quiet afternoon', language: 'en', thumbnail: null })),
}));
vi.mock('../lib/ai/processPostContent.js', () => ({
    processPostContent: vi.fn(async () => ({ imagePrompts: [], audioFields: {}, thumbnailUrl: null })),
}));
vi.mock('../lib/postMedia.js', () => ({ buildDemographicHint: () => '' }));
vi.mock('../lib/email/adminEmail.js', () => ({
    sendAdminEmail: vi.fn(),
    buildNewPostEmail: () => ({ subject: '', html: '' }),
}));

import { processChat } from '../processChat.js';
import { generateCondensedTranscript } from '../lib/ai/condensedTranscript.js';

type ChatData = Record<string, unknown>;

const run = processChat as unknown as (event: unknown) => Promise<void>;

const CHAT = 'users/u1/active_chats/s1';
const open: ChatData = {
    messages: [{ role: 'user', content: 'Hi' }, { role: 'assistant', content: 'Hello.' }],
    createdAt: 1,
    timeZone: 'America/New_York',
};
const closed: ChatData = { ...open, isClosed: true };

/** The event Firestore sends for one update to the chat. */
const update = (before: ChatData, after: ChatData) => ({
    params: { uid: 'u1', sessionId: 's1' },
    data: { before: { data: () => before }, after: { data: () => after } },
});

const posts = () => fakeDb.writes.filter(w => w.op === 'set' && w.path.startsWith('posts/'));

beforeEach(() => {
    fakeDb.reset();
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    fakeDb.seed('users/u1', { actions: [], session_count: 3 });
});

describe('processChat', () => {
    // Two updates half a second apart each started a run: two posts, and the new action twice (beta, 2026-11-10)
    it('processes a closed chat once when a second update lands before the claim', async () => {
        fakeDb.seed(CHAT, closed);
        await Promise.all([
            run(update(open, closed)),
            run(update(closed, { ...closed, updatedAt: 2 })),
        ]);
        expect(generateCondensedTranscript).toHaveBeenCalledTimes(1);
        expect(posts()).toHaveLength(1);
        expect(fakeDb.docs.get('users/u1')?.actions).toHaveLength(1);
    });

    it('does nothing for an update delivered after the chat was processed', async () => {
        // A processed chat is deleted, so nothing is seeded at CHAT
        await run(update(open, closed));
        expect(generateCondensedTranscript).not.toHaveBeenCalled();
        expect(posts()).toHaveLength(0);
    });
});

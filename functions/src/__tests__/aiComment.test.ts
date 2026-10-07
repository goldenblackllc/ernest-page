// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => {
    const state: {
        users: Record<string, any>;
        posts: { id: string; data: any }[];
    } = { users: {}, posts: [] };

    const commentAdd = vi.fn().mockResolvedValue({ id: 'new' });
    const postUpdate = vi.fn().mockResolvedValue(undefined);
    const postsQuery = {
        orderBy: vi.fn(() => postsQuery),
        limit: vi.fn(() => postsQuery),
        get: vi.fn(async () => ({
            docs: state.posts.map(p => ({ id: p.id, data: () => p.data })),
        })),
    };
    const db = {
        collection: vi.fn((name: string) => {
            if (name === 'users') {
                return {
                    doc: (id: string) => ({
                        get: async () => ({ exists: id in state.users, data: () => state.users[id] }),
                    }),
                };
            }
            return {
                ...postsQuery,
                doc: (id: string) => ({
                    update: (data: any) => postUpdate(id, data),
                    collection: () => ({ add: (data: any) => commentAdd(id, data) }),
                }),
            };
        }),
    };
    const FieldValue = {
        serverTimestamp: () => 'SERVER_TS',
        increment: (n: number) => ({ increment: n }),
    };
    const generateTextWithFallback = vi.fn();
    return { state, commentAdd, postUpdate, db, FieldValue, generateTextWithFallback };
});

vi.mock('firebase-functions/v2/firestore', () => ({
    onDocumentCreated: (_opts: unknown, handler: unknown) => handler,
}));
vi.mock('../lib/firebase/admin.js', () => ({ db: h.db, FieldValue: h.FieldValue }));
vi.mock('../lib/ai/models.js', () => ({
    generateTextWithFallback: h.generateTextWithFallback,
    OPUS_MODEL: 'test-model',
}));

import { generateAIComment } from '../aiComment.js';

const handler = generateAIComment as unknown as (event: any) => Promise<void>;

function event(comment: Record<string, unknown> | undefined) {
    return { data: comment ? { data: () => comment } : undefined, params: { postId: 'p', commentId: 'c' } };
}

const COMMENTER = 'commenter-uid';

beforeEach(() => {
    vi.clearAllMocks();
    h.state.users = {
        [COMMENTER]: {
            defining_words: ['Steady', 'Kind'],
            avatar: { url: 'https://img/avatar.jpg' },
            bible: { sections: [{ content: 'Speaks plainly.' }] },
        },
    };
    h.state.posts = [{ id: 'other-post', data: { uid: 'someone-else', letter: 'I am scared to start over.' } }];
    h.generateTextWithFallback.mockResolvedValue({ text: '  You have already started.  ' });
});

describe('generateAIComment', () => {
    it('writes an AI comment on another user\'s post for a personal comment', async () => {
        await handler(event({ type: 'personal', commenter_uid: COMMENTER }));

        expect(h.generateTextWithFallback).toHaveBeenCalledTimes(1);
        expect(h.commentAdd).toHaveBeenCalledWith('other-post', expect.objectContaining({
            commenter_uid: COMMENTER,
            author_title: 'Steady, Kind',
            author_avatar_url: 'https://img/avatar.jpg',
            content: 'You have already started.',
            type: 'ai_generated',
        }));
        expect(h.postUpdate).toHaveBeenCalledWith('other-post', { comments: { increment: 1 } });
    });

    it('ignores its own ai_generated comments (no re-trigger)', async () => {
        await handler(event({ type: 'ai_generated', commenter_uid: COMMENTER }));
        expect(h.generateTextWithFallback).not.toHaveBeenCalled();
        expect(h.commentAdd).not.toHaveBeenCalled();
    });

    it('ignores comments with no type', async () => {
        await handler(event({ commenter_uid: COMMENTER }));
        expect(h.commentAdd).not.toHaveBeenCalled();
    });

    it('ignores personal comments without a commenter', async () => {
        await handler(event({ type: 'personal' }));
        expect(h.commentAdd).not.toHaveBeenCalled();
    });

    it('ignores an event with no data', async () => {
        await handler(event(undefined));
        expect(h.commentAdd).not.toHaveBeenCalled();
    });

    it('never comments on the commenter\'s own posts (uid or legacy authorId)', async () => {
        h.state.posts = [
            { id: 'own-uid', data: { uid: COMMENTER, letter: 'mine' } },
            { id: 'own-legacy', data: { authorId: COMMENTER, letter: 'mine too' } },
        ];
        await handler(event({ type: 'personal', commenter_uid: COMMENTER }));
        expect(h.generateTextWithFallback).not.toHaveBeenCalled();
        expect(h.commentAdd).not.toHaveBeenCalled();
    });

    it('picks only from other users\' posts when both exist', async () => {
        h.state.posts = [
            { id: 'own', data: { uid: COMMENTER, letter: 'mine' } },
            { id: 'theirs', data: { uid: 'x', letter: 'theirs' } },
        ];
        for (let i = 0; i < 5; i++) await handler(event({ type: 'personal', commenter_uid: COMMENTER }));
        const targets = h.commentAdd.mock.calls.map(c => c[0]);
        expect(targets).toHaveLength(5);
        expect(new Set(targets)).toEqual(new Set(['theirs']));
    });

    it('skips posts explicitly marked not public', async () => {
        h.state.posts = [{ id: 'hidden', data: { uid: 'x', letter: 'secret', is_public: false } }];
        await handler(event({ type: 'personal', commenter_uid: COMMENTER }));
        expect(h.commentAdd).not.toHaveBeenCalled();
    });

    it('does nothing when the commenter has no user doc', async () => {
        h.state.users = {};
        await handler(event({ type: 'personal', commenter_uid: COMMENTER }));
        expect(h.generateTextWithFallback).not.toHaveBeenCalled();
    });

    it('does nothing when the commenter has no character data', async () => {
        h.state.users = { [COMMENTER]: { name: 'x' } };
        await handler(event({ type: 'personal', commenter_uid: COMMENTER }));
        expect(h.generateTextWithFallback).not.toHaveBeenCalled();
    });

    it('does not write when the model returns empty text', async () => {
        h.generateTextWithFallback.mockResolvedValue({ text: '   ' });
        await handler(event({ type: 'personal', commenter_uid: COMMENTER }));
        expect(h.commentAdd).not.toHaveBeenCalled();
    });

    it('swallows model errors without writing', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        h.generateTextWithFallback.mockRejectedValue(new Error('down'));
        await expect(handler(event({ type: 'personal', commenter_uid: COMMENTER }))).resolves.toBeUndefined();
        expect(h.commentAdd).not.toHaveBeenCalled();
    });
});

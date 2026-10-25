import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { User } from 'firebase/auth';
import type { Message } from '@/types/chat';

type Snapshot = { messages?: Message[]; status?: string; createdAt?: number } | null;

const mocks = vi.hoisted(() => ({
    mirrorReply: vi.fn(),
    authFetch: vi.fn(),
    onSnapshot: null as ((chat: Snapshot) => void) | null,
}));

vi.mock('firebase/functions', () => ({ httpsCallable: () => mocks.mirrorReply }));
vi.mock('@/lib/firebase/config', () => ({ functions: {} }));
vi.mock('@/lib/auth/authFetch', () => ({ authFetch: mocks.authFetch }));
vi.mock('@/lib/firebase/chat', () => ({
    getMostRecentActiveChat: vi.fn(async () => ({ id: 'session-1' })),
    saveActiveChat: vi.fn(async () => {}),
    deleteActiveChat: vi.fn(async () => {}),
    subscribeToActiveChat: (_uid: string, onUpdate: (chat: Snapshot) => void) => {
        mocks.onSnapshot = onUpdate;
        return () => {};
    },
}));

import { useMirrorSession } from '../useMirrorSession';

const onClose = vi.fn();

function renderSession() {
    return renderHook(() => useMirrorSession({
        uid: 'user-1',
        isOpen: true,
        authUser: {} as User,
        locale: 'en',
        sessionRouting: 'private',
        onClose,
    }));
}

/** Render the hook and wait until it has subscribed to the (still empty) session. */
async function openSession() {
    const hook = renderSession();
    await waitFor(() => expect(mocks.onSnapshot).not.toBeNull());
    act(() => mocks.onSnapshot!(null));
    return hook;
}

describe('useMirrorSession sendMessage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.onSnapshot = null;
        mocks.authFetch.mockResolvedValue({ json: async () => ({ granted: true }) });
    });

    it('shows the message at once and keeps it through snapshots that lack it', async () => {
        mocks.mirrorReply.mockResolvedValue({});
        const { result } = await openSession();

        let sent!: Promise<boolean>;
        act(() => { sent = result.current.sendMessage('Hello'); });
        expect(result.current.messages.map(m => m.content)).toEqual(['Hello']);
        expect(result.current.isLoading).toBe(true);

        // Starting the session writes the active chat before mirrorReply saves the message
        act(() => mocks.onSnapshot!({ createdAt: 1 }));
        expect(result.current.messages.map(m => m.content)).toEqual(['Hello']);
        expect(result.current.isLoading).toBe(true);
        expect(result.current.sessionStartedAt).toBe(1);

        // mirrorReply saves it, then the reply arrives: snapshots apply again
        const saved = result.current.messages;
        act(() => mocks.onSnapshot!({ messages: saved, status: 'generating', createdAt: 1 }));
        const reply: Message = { id: 'r1', role: 'assistant', content: 'Hi' };
        act(() => mocks.onSnapshot!({ messages: [...saved, reply], status: 'idle', createdAt: 1 }));
        expect(result.current.messages.map(m => m.content)).toEqual(['Hello', 'Hi']);
        expect(result.current.isLoading).toBe(false);

        await act(async () => { expect(await sent).toBe(true); });
    });

    it('takes the message back when the session is refused', async () => {
        mocks.authFetch.mockResolvedValue({ json: async () => ({ granted: false }) });
        const { result } = await openSession();

        let sent!: boolean;
        await act(async () => { sent = await result.current.sendMessage('Hello'); });

        expect(sent).toBe(false);
        expect(onClose).toHaveBeenCalled();
        expect(mocks.mirrorReply).not.toHaveBeenCalled();
        expect(result.current.messages).toEqual([]);
        expect(result.current.isLoading).toBe(false);
    });
});

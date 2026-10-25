// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => {
    const state: { user: Record<string, unknown>; chat: Record<string, unknown> | undefined } = { user: {}, chat: undefined };
    const chatSet = vi.fn().mockResolvedValue(undefined);
    const chatRef = { get: async () => ({ data: () => state.chat }), set: chatSet };
    const db = {
        collection: () => ({
            doc: () => ({
                get: async () => ({ exists: true, data: () => state.user }),
                collection: () => ({ doc: () => chatRef }),
            }),
        }),
    };
    const generateTextWithFallback = vi.fn();
    return { state, chatSet, db, generateTextWithFallback };
});

vi.mock('firebase-functions/v2/https', () => ({
    onCall: (_opts: unknown, handler: unknown) => handler,
    HttpsError: class HttpsError extends Error {},
}));
vi.mock('../lib/firebase/admin.js', () => ({ db: h.db }));
vi.mock('../lib/ai/models.js', () => ({
    generateTextWithFallback: h.generateTextWithFallback,
    OPUS_MODEL: 'primary',
    LIVE_FALLBACK: 'fallback',
}));

import { mirrorReply } from '../mirror.js';

type Sent = { role: string; content: string; providerOptions?: unknown }[];
const handler = mirrorReply as unknown as (req: unknown) => Promise<unknown>;
const CACHED = { anthropic: { cacheControl: { type: 'ephemeral', ttl: '1h' } } };

// The session started Monday at 17:30 UTC (café); it is now 18:15 (home)
const STARTED = Date.UTC(2026, 9, 19, 17, 30);
const NOW = Date.UTC(2026, 9, 19, 18, 15);

function reply(messages: { role: 'user' | 'assistant'; content: string }[], localTime = 'Monday 7:05 PM') {
    return handler({
        auth: { uid: 'u1' },
        data: { messages, sessionId: `s-${messages.length}`, localTime, timeZone: 'UTC' },
    });
}

async function sent(messages: { role: 'user' | 'assistant'; content: string }[], localTime?: string): Promise<Sent> {
    await reply(messages, localTime);
    return h.generateTextWithFallback.mock.calls.at(-1)![0].messages;
}

beforeEach(() => {
    vi.clearAllMocks();
    h.state.user = {
        bible: {
            text: '## Style & Presence\n\nCalm.',
            style: {
                situations: [
                    { id: 'cafe', label: 'At the café', portrait: 'Linen shirt.' },
                    { id: 'home', label: 'At home, cooking', portrait: 'Apron.' },
                ],
                week: [
                    { days: ['mon'], from: 8, situation: 'cafe' },
                    { days: ['mon'], from: 18, situation: 'home' },
                ],
            },
        },
    };
    h.state.chat = { access: { source: 'free', granted_at: STARTED }, createdAt: STARTED };
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
    h.generateTextWithFallback.mockResolvedValue({
        text: 'Hello.',
        response: { modelId: 'primary' },
        usage: { inputTokens: 1, outputTokens: 1, inputTokenDetails: {}, outputTokenDetails: {} },
    });
    vi.spyOn(console, 'log').mockImplementation(() => {});
});

describe('mirrorReply prompt caching', () => {
    const conversation = [
        { role: 'user' as const, content: 'Hi' },
        { role: 'assistant' as const, content: 'Hey.' },
        { role: 'user' as const, content: 'What now?' },
    ];

    it('caches the system prompt and the conversation up to the latest message', async () => {
        const messages = await sent(conversation);
        expect(messages[0]).toMatchObject({ role: 'system', providerOptions: CACHED });
        expect(messages.slice(1, 4)).toEqual([
            { role: 'user', content: 'Hi' },
            { role: 'assistant', content: 'Hey.' },
            { role: 'user', content: 'What now?', providerOptions: CACHED },
        ]);
    });

    it('puts the current time last, after every cache breakpoint', async () => {
        const messages = await sent(conversation, 'Monday 7:05 PM');
        expect(messages).toHaveLength(5);
        expect(messages[4]).toEqual({ role: 'system', content: '[CURRENT TIME]\nMonday 7:05 PM' });
        expect(messages[0].content).not.toContain('[CURRENT TIME]');
    });

    it('sends the same cached prefix on the next turn', async () => {
        const turn1 = await sent(conversation, 'Monday 7:05 PM');
        const turn2 = await sent([...conversation, { role: 'assistant', content: 'Go for a walk.' }, { role: 'user', content: 'Ok' }], 'Monday 7:20 PM');
        expect(turn2[0]).toEqual(turn1[0]);
        expect(turn2.slice(1, 3)).toEqual(turn1.slice(1, 3));
        expect(turn2[3].content).toBe(turn1[3].content);
    });

    it('keeps the character where it was when the session started', async () => {
        const system = (await sent(conversation))[0].content;
        expect(system).toContain('[WHERE YOU ARE]\nAt the café\n\nLinen shirt.');
        expect(system).not.toContain('At home, cooking');
    });

    it("doesn't move the session's start time", async () => {
        await reply(conversation.slice(0, 1));
        expect(h.chatSet.mock.calls[0][0]).not.toHaveProperty('createdAt');

        h.state.chat = { access: { source: 'free', granted_at: STARTED } };
        await reply(conversation.slice(0, 1));
        expect(h.chatSet.mock.calls.at(-2)![0]).toMatchObject({ createdAt: NOW });
    });

    it('logs cache usage for each reply', async () => {
        h.generateTextWithFallback.mockResolvedValue({
            text: 'Hello.',
            response: { modelId: 'primary' },
            usage: {
                inputTokens: 23_400,
                outputTokens: 2_000,
                inputTokenDetails: { cacheReadTokens: 22_000, cacheWriteTokens: 1_200, noCacheTokens: 200 },
                outputTokenDetails: { reasoningTokens: 1_500 },
            },
        });
        await reply(conversation);
        const line = JSON.parse(vi.mocked(console.log).mock.calls.at(-1)![0] as string);
        expect(line).toEqual({
            event: 'mirror_usage', sessionId: 's-3', messageCount: 3, model: 'primary',
            cacheRead: 22_000, cacheWrite: 1_200, uncached: 200, output: 2_000, thinking: 1_500,
        });
    });
});

describe("mirrorReply and the person's choices", () => {
    const conversation = [{ role: 'user' as const, content: 'Hi' }];

    it('lists open and ticked choices with when each was chosen and ticked', async () => {
        h.state.user.choices = [
            { id: 'a', text: 'Call Dad on Sunday', chosen_on: '2026-10-17' },
            { id: 'b', text: 'Run by breath', chosen_on: '2026-10-18', done_at: Date.UTC(2026, 9, 19, 8) },
        ];
        const system = (await sent(conversation))[0].content;
        expect(system).toContain('[THEIR CHOICES — FROM EARLIER SESSIONS]');
        expect(system).toContain('- [ ] Call Dad on Sunday (chosen 2 days ago)\n- [x] Run by breath (chosen yesterday, ticked this morning)');
    });

    it('leaves the section out when there are no choices', async () => {
        const system = (await sent(conversation))[0].content;
        expect(system).not.toContain('THEIR CHOICES');
    });
});

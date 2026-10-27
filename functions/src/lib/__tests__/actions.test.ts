// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { applySessionActions, openActions, type Action } from '../actions.js';
import { buildActionsPrompt, toSessionActions } from '../ai/actionsPrompt.js';

const ids = () => { let n = 0; return () => `new-${++n}`; };

const list: Action[] = [
    { id: 'a', text: 'Call Dad on Sunday', decided_on: '2026-10-01' },
    { id: 'b', text: 'Run by breath', decided_on: '2026-10-20' },
    { id: 'c', text: 'Order the notebook', decided_on: '2026-10-22', done_at: 1 },
];
const none = { done: [], changed: [], new_actions: [] };

describe('applySessionActions', () => {
    it('keeps open actions however old, and drops ticked ones', () => {
        expect(applySessionActions(list, none, '2026-10-25', ids())).toEqual(list.slice(0, 2));
    });

    it('drops actions the session says are done', () => {
        const next = applySessionActions(list, { ...none, done: ['a'] }, '2026-10-25', ids());
        expect(next.map(c => c.id)).toEqual(['b']);
    });

    it('rewords a changed action and dates it to this session', () => {
        const next = applySessionActions(list, { ...none, changed: [{ id: 'b', text: ' Run by breath, outdoors ' }] }, '2026-10-25', ids());
        expect(next[1]).toEqual({ id: 'b', text: 'Run by breath, outdoors', decided_on: '2026-10-25' });
    });

    it('adds new actions after the carried ones, skipping blank lines', () => {
        const next = applySessionActions(list, { ...none, new_actions: ['Write one line', '  '] }, '2026-10-25', ids());
        expect(next.slice(2)).toEqual([{ id: 'new-1', text: 'Write one line', decided_on: '2026-10-25' }]);
        expect(next).toHaveLength(3);
    });

    it('ignores ids that were deleted while the session was processing', () => {
        const next = applySessionActions(list.slice(1), { done: ['a'], changed: [{ id: 'a', text: 'x' }], new_actions: [] }, '2026-10-25', ids());
        expect(next).toEqual([list[1]]);
    });
});

describe('the actions extraction', () => {
    const open = openActions(list);

    it('numbers only the open actions', () => {
        const prompt = buildActionsPrompt(open, 'user: hi');
        expect(prompt).toContain('1. Call Dad on Sunday (decided 2026-10-01)\n2. Run by breath (decided 2026-10-20)');
        expect(prompt).not.toContain('Order the notebook');
    });

    it('maps numbers back to ids and drops numbers that are not on the list', () => {
        expect(toSessionActions({ done: [2, 7], changed: [{ number: 1, text: 'Call Dad Saturday' }, { number: 0, text: 'x' }], new_actions: ['New'] }, open))
            .toEqual({ done: ['b'], changed: [{ id: 'a', text: 'Call Dad Saturday' }], new_actions: ['New'] });
    });
});

// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { applySessionChoices, openChoices, type Choice } from '../choices.js';
import { buildChoicesPrompt, toSessionChoices } from '../ai/choicesPrompt.js';

const ids = () => { let n = 0; return () => `new-${++n}`; };

const list: Choice[] = [
    { id: 'a', text: 'Call Dad on Sunday', chosen_on: '2026-10-01' },
    { id: 'b', text: 'Run by breath', chosen_on: '2026-10-20' },
    { id: 'c', text: 'Order the notebook', chosen_on: '2026-10-22', done_at: 1 },
];
const none = { done: [], changed: [], new_choices: [] };

describe('applySessionChoices', () => {
    it('keeps open choices however old, and drops ticked ones', () => {
        expect(applySessionChoices(list, none, '2026-10-25', ids())).toEqual(list.slice(0, 2));
    });

    it('drops choices the session says are done', () => {
        const next = applySessionChoices(list, { ...none, done: ['a'] }, '2026-10-25', ids());
        expect(next.map(c => c.id)).toEqual(['b']);
    });

    it('rewords a changed choice and dates it to this session', () => {
        const next = applySessionChoices(list, { ...none, changed: [{ id: 'b', text: ' Run by breath, outdoors ' }] }, '2026-10-25', ids());
        expect(next[1]).toEqual({ id: 'b', text: 'Run by breath, outdoors', chosen_on: '2026-10-25' });
    });

    it('adds new choices after the carried ones, skipping blank lines', () => {
        const next = applySessionChoices(list, { ...none, new_choices: ['Write one line', '  '] }, '2026-10-25', ids());
        expect(next.slice(2)).toEqual([{ id: 'new-1', text: 'Write one line', chosen_on: '2026-10-25' }]);
        expect(next).toHaveLength(3);
    });

    it('ignores ids that were deleted while the session was processing', () => {
        const next = applySessionChoices(list.slice(1), { done: ['a'], changed: [{ id: 'a', text: 'x' }], new_choices: [] }, '2026-10-25', ids());
        expect(next).toEqual([list[1]]);
    });
});

describe('the choices extraction', () => {
    const open = openChoices(list);

    it('numbers only the open choices', () => {
        const prompt = buildChoicesPrompt(open, 'user: hi');
        expect(prompt).toContain('1. Call Dad on Sunday (chosen 2026-10-01)\n2. Run by breath (chosen 2026-10-20)');
        expect(prompt).not.toContain('Order the notebook');
    });

    it('maps numbers back to ids and drops numbers that are not on the list', () => {
        expect(toSessionChoices({ done: [2, 7], changed: [{ number: 1, text: 'Call Dad Saturday' }, { number: 0, text: 'x' }], new_choices: ['New'] }, open))
            .toEqual({ done: ['b'], changed: [{ id: 'a', text: 'Call Dad Saturday' }], new_choices: ['New'] });
    });
});

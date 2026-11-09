// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { applySessionActions, currentActions, tickAction, type Action, type SessionActions } from '../actions.js';
import { buildActionsPrompt, toSessionActions } from '../ai/actionsPrompt.js';

const TODAY = '2026-10-25';
const ids = () => { let n = 0; return () => `new-${++n}`; };

const list: Action[] = [
    { id: 'a', text: 'Call Dad on Sunday', kind: 'once', decided_on: '2026-10-01' },
    { id: 'b', text: 'Run by breath', kind: 'daily', decided_on: '2026-10-20', done_on: '2026-10-24' },
    { id: 'c', text: 'Order the notebook', decided_on: '2026-10-22', done_on: '2026-10-23' },
    { id: 'd', text: 'Pause before answering', kind: 'daily', decided_on: '2026-10-21', done_on: TODAY },
];
const none: SessionActions = { done: [], changed: [], new_actions: [], rewritten: [] };
const apply = (update: Partial<SessionActions>, current = list) =>
    applySessionActions(current, { ...none, ...update }, TODAY, ids());

describe('currentActions', () => {
    it('drops once actions ticked on an earlier day, and keeps every other one', () => {
        expect(currentActions(list, TODAY).map(a => a.id)).toEqual(['a', 'b', 'd']);
    });

    it('counts an action without a kind as once', () => {
        expect(currentActions([list[2]], '2026-10-23')).toEqual([list[2]]);
        expect(currentActions([list[2]], '2026-10-24')).toEqual([]);
    });
});

describe('tickAction', () => {
    it('ticks for today and earns a point, also for a daily action ticked on an earlier day', () => {
        expect(tickAction(list, 'b', true, TODAY)).toEqual({
            actions: [list[0], { ...list[1], done_on: TODAY }, list[2], list[3]],
            points: 1,
        });
    });

    it('takes the point back when today\'s tick is undone', () => {
        const { actions, points } = tickAction(list, 'd', false, TODAY)!;
        expect(actions[3]).toEqual({ id: 'd', text: 'Pause before answering', kind: 'daily', decided_on: '2026-10-21' });
        expect(points).toBe(-1);
    });

    it('changes nothing when the action is already as asked', () => {
        expect(tickAction(list, 'd', true, TODAY)).toEqual({ actions: list, points: 0 });
        expect(tickAction(list, 'b', false, TODAY)).toEqual({ actions: list, points: 0 });
    });

    it('returns null for an action that does not exist', () => {
        expect(tickAction(list, 'zz', true, TODAY)).toBeNull();
    });
});

describe('applySessionActions', () => {
    it('keeps every current action however old, and drops once actions ticked on an earlier day', () => {
        expect(apply({})).toEqual({ actions: [list[0], list[1], list[3]], ticks: 0 });
    });

    it('ticks the actions the session heard were done, a point each, but not twice in a day', () => {
        const { actions, ticks } = apply({ done: ['a', 'd'] });
        expect(actions[0]).toEqual({ ...list[0], done_on: TODAY });
        expect(actions[2]).toBe(list[3]);
        expect(ticks).toBe(1);
    });

    it('merges actions into the earliest decided one, in its place, with the latest tick', () => {
        const { actions } = apply({ rewritten: [{ ids: ['d', 'b'], text: ' Slow down ', kind: 'daily' }] });
        expect(actions).toEqual([
            list[0],
            { id: 'b', text: 'Slow down', kind: 'daily', decided_on: '2026-10-20', done_on: TODAY },
        ]);
    });

    it('rewrites a single action without dating it to this session', () => {
        const { actions } = apply({ rewritten: [{ ids: ['a'], text: 'Call Dad Sunday', kind: 'once' }] });
        expect(actions[0]).toEqual({ id: 'a', text: 'Call Dad Sunday', kind: 'once', decided_on: '2026-10-01' });
    });

    it('rewords a changed action, sets its kind and dates it to this session', () => {
        const { actions } = apply({ changed: [{ id: 'b', text: ' Run by breath, outdoors ', kind: 'daily' }] });
        expect(actions[1]).toEqual({ id: 'b', text: 'Run by breath, outdoors', kind: 'daily', decided_on: TODAY, done_on: '2026-10-24' });
    });

    it('ticks the merged action when the session heard one of its parts was done', () => {
        const { actions, ticks } = apply({ done: ['a'], rewritten: [{ ids: ['b', 'a'], text: 'Call Dad', kind: 'once' }] });
        expect(actions[0]).toMatchObject({ id: 'a', done_on: TODAY });
        expect(ticks).toBe(1);
    });

    it('drops a tick from an earlier day when an every-day action becomes a once action', () => {
        const merged = apply({ rewritten: [{ ids: ['a', 'b'], text: 'Call Dad', kind: 'once' }] }).actions[0];
        const changed = apply({ changed: [{ id: 'b', text: 'Run by breath once', kind: 'once' }] }).actions[1];
        expect(merged).toEqual({ id: 'a', text: 'Call Dad', kind: 'once', decided_on: '2026-10-01' });
        expect(changed).toEqual({ id: 'b', text: 'Run by breath once', kind: 'once', decided_on: TODAY });
    });

    it('lets a merge win over a change to the same action, and puts each action in one group only', () => {
        const { actions } = apply({
            rewritten: [{ ids: ['a', 'b'], text: 'One', kind: 'once' }, { ids: ['b', 'd'], text: 'Two', kind: 'daily' }],
            changed: [{ id: 'b', text: 'Changed', kind: 'daily' }],
        });
        expect(actions.map(a => [a.id, a.text])).toEqual([['a', 'One'], ['d', 'Two']]);
    });

    it('adds new actions after the current ones, skipping blank lines', () => {
        const { actions } = apply({ new_actions: [{ text: 'Write one line', kind: 'once' }, { text: '  ', kind: 'daily' }] });
        expect(actions.slice(3)).toEqual([{ id: 'new-1', text: 'Write one line', kind: 'once', decided_on: TODAY }]);
        expect(actions).toHaveLength(4);
    });

    it('ignores ids that were deleted while the session was processing', () => {
        const { actions, ticks } = apply({
            done: ['a'],
            changed: [{ id: 'a', text: 'x', kind: 'once' }],
            rewritten: [{ ids: ['a'], text: 'y', kind: 'once' }],
        }, list.slice(1));
        expect(actions).toEqual([list[1], list[3]]);
        expect(ticks).toBe(0);
    });
});

describe('the actions extraction', () => {
    const listed = currentActions(list, TODAY);

    it('numbers the current actions with their kind and today\'s ticks', () => {
        const prompt = buildActionsPrompt(listed, 'user: hi', TODAY);
        expect(prompt).toContain(`TODAY: ${TODAY}`);
        expect(prompt).toContain('1. [once] Call Dad on Sunday (decided 2026-10-01)\n2. [daily] Run by breath (decided 2026-10-20)\n3. [daily] Pause before answering (decided 2026-10-21, ticked today)');
        expect(prompt).not.toContain('Order the notebook');
        expect(prompt).toContain('CONVERSATION:\nuser: hi');
    });

    it('only tidies the list when there is no conversation', () => {
        expect(buildActionsPrompt(listed, '', TODAY)).toContain('CONVERSATION:\n(none)');
    });

    it('maps numbers back to ids and drops numbers that are not on the list', () => {
        expect(toSessionActions({
            done: [2, 7],
            changed: [{ number: 1, text: 'Call Dad Saturday', kind: 'once' }, { number: 0, text: 'x', kind: 'once' }],
            new_actions: [{ text: 'New', kind: 'daily' }],
            rewritten: [{ numbers: [2, 3, 9], text: 'Slow down', kind: 'daily' }, { numbers: [8], text: 'gone', kind: 'once' }],
        }, listed)).toEqual({
            done: ['b'],
            changed: [{ id: 'a', text: 'Call Dad Saturday', kind: 'once' }],
            new_actions: [{ text: 'New', kind: 'daily' }],
            rewritten: [{ ids: ['b', 'd'], text: 'Slow down', kind: 'daily' }],
        });
    });
});

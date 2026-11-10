/**
 * My Actions (`users/{uid}.actions`): every action the person decided to take in
 * their sessions, kept in the actions drawer (the score pill in the header) and
 * given to the Mirror. A reminder of who they are choosing to be, not a to-do list.
 *
 * Two kinds. Every day: a way of being they live by, a trait or a routine. A tick
 * counts for its day, and the next day it is open again. Once: a specific thing
 * to do. A ticked one leaves the list after its day.
 *
 * After each session the list is replaced. A session never removes an action;
 * only the person deletes one. Actions that are one action (the same thing in
 * other words, or every-day ones living the same trait) are merged into one
 * line and wordy ones shortened, actions the person says they did are
 * ticked for the day, and the session's new actions are added.
 *
 * Each tick earns a point in the lifetime score (`users/{uid}.action_score`), and
 * unticking it the same day takes the point back. Only the server writes either field.
 *
 * Pure, no imports; shared with the website (actions drawer, /api/actions).
 */

export const ACTION_KINDS = ['daily', 'once'] as const;
export type ActionKind = typeof ACTION_KINDS[number];

export type Action = {
    id: string;
    /** A checklist line that starts with the verb, in the session's language. */
    text: string;
    /** Missing on actions saved before there were kinds; those count as once. */
    kind?: ActionKind;
    /** Local date of the session it was decided on in, YYYY-MM-DD. */
    decided_on: string;
    /** Local date it was last ticked, YYYY-MM-DD. A tick counts for that day only. */
    done_on?: string;
};

/** What a session's extraction reports about the current actions, by id. */
export type SessionActions = {
    done: string[];
    /** Each group replaced by one line: actions that are one action, or one action reworded. */
    rewritten: { ids: string[]; text: string; kind: ActionKind }[];
    changed: { id: string; text: string; kind: ActionKind }[];
    new_actions: { text: string; kind: ActionKind }[];
};

export function kindOf(action: Action): ActionKind {
    return action.kind ?? 'once';
}

export function tickedToday(action: Action, today: string): boolean {
    return action.done_on === today;
}

/** The actions on the list today: all but the once actions ticked on an earlier day. */
export function currentActions(actions: Action[], today: string): Action[] {
    return actions.filter(a => !(kindOf(a) === 'once' && a.done_on && a.done_on < today));
}

/**
 * Ticks or unticks an action for today. Returns the list and the change to the
 * score: a point for a tick, minus one for unticking today's tick. Null when
 * there is no such action.
 */
export function tickAction(actions: Action[], id: string, done: boolean, today: string): { actions: Action[]; points: number } | null {
    const action = actions.find(a => a.id === id);
    if (!action) return null;
    if (done === tickedToday(action, today)) return { actions, points: 0 };
    const { done_on, ...untouched } = action;
    const next = done ? { ...action, done_on: today } : untouched;
    return { actions: actions.map(a => (a.id === id ? next : a)), points: done ? 1 : -1 };
}

/**
 * The list after a session, and how many ticks the session added (a point
 * each). Applied to the list as it is when saved, so a tick or delete made while
 * the session was processing is kept; ids the extraction reported that no longer
 * exist are ignored.
 *
 * A rewritten group keeps the id and date of its earliest-decided action, in
 * that action's place, and the latest tick of the group.
 */
export function applySessionActions(current: Action[], update: SessionActions, today: string, newId: () => string): { actions: Action[]; ticks: number } {
    const listed = currentActions(current, today);
    const replaced = new Map<string, Action | null>();
    const mergedInto = new Map<string, string>();
    // A tick from an earlier day counted for an every-day action; as a once action it isn't done yet
    const withKind = (action: Action, kind: ActionKind): Action => {
        if (kind === 'once' && action.done_on && action.done_on < today) {
            const { done_on, ...open } = action;
            return { ...open, kind };
        }
        return { ...action, kind };
    };

    for (const group of update.rewritten) {
        const ids = new Set(group.ids);
        const members = listed.filter(a => ids.has(a.id) && !mergedInto.has(a.id));
        if (members.length === 0) continue;
        const keep = members.reduce((oldest, a) => (a.decided_on < oldest.decided_on ? a : oldest));
        const doneOn = members.map(a => a.done_on).filter((d): d is string => !!d).sort().at(-1);
        replaced.set(keep.id, withKind({
            id: keep.id,
            text: group.text.trim() || keep.text,
            decided_on: keep.decided_on,
            ...(doneOn ? { done_on: doneOn } : {}),
        }, group.kind));
        for (const a of members) {
            mergedInto.set(a.id, keep.id);
            if (a.id !== keep.id) replaced.set(a.id, null);
        }
    }

    for (const change of update.changed) {
        const action = listed.find(a => a.id === change.id);
        const text = change.text.trim();
        if (!action || mergedInto.has(action.id) || !text) continue;
        replaced.set(action.id, withKind({ ...action, text, decided_on: today }, change.kind));
    }

    let actions = listed.flatMap(a => {
        const next = replaced.get(a.id);
        return next === null ? [] : [next ?? a];
    });

    const done = new Set(update.done.map(id => mergedInto.get(id) ?? id));
    let ticks = 0;
    actions = actions.map(a => {
        if (!done.has(a.id) || tickedToday(a, today)) return a;
        ticks++;
        return { ...a, done_on: today };
    });

    const added = update.new_actions
        .map(a => ({ text: a.text.trim(), kind: a.kind }))
        .filter(a => a.text)
        .map(a => ({ id: newId(), text: a.text, kind: a.kind, decided_on: today }));
    return { actions: [...actions, ...added], ticks };
}

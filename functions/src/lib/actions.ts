/**
 * The person's actions (`users/{uid}.actions`): what they decided to do in their
 * sessions, shown as a checklist at the top of their feed and given to the
 * Mirror. A reminder of who they are choosing to be, not a to-do list.
 *
 * After each session the list is replaced: open actions carry over (changed if
 * the session changed them) and never expire, ticked ones and ones the session
 * says are done leave, and the session's new actions are added. The person can
 * tick, untick and delete. Only the server writes the field.
 *
 * Pure, no imports; shared with the website (feed card, /api/actions).
 */

export type Action = {
    id: string;
    /** First person, in the session's language. */
    text: string;
    /** Local date of the session it was decided on in, YYYY-MM-DD. */
    decided_on: string;
    /** When the person ticked it, ms since epoch. */
    done_at?: number;
};

/** What a session's extraction reports about the open actions, by id. */
export type SessionActions = {
    done: string[];
    changed: { id: string; text: string }[];
    new_actions: string[];
};

/** Actions the person hasn't ticked; the only ones a session's extraction sees. */
export function openActions(actions: Action[]): Action[] {
    return actions.filter(c => !c.done_at);
}

/**
 * The list after a session. Applied to the list as it is when saved, so a tick
 * or delete made while the session was processing is kept; ids the extraction
 * reported that no longer exist are ignored.
 */
export function applySessionActions(current: Action[], update: SessionActions, today: string, newId: () => string): Action[] {
    const done = new Set(update.done);
    const changed = new Map(update.changed.map(c => [c.id, c.text.trim()]));
    const carried = openActions(current)
        .filter(c => !done.has(c.id))
        .map(c => changed.get(c.id) ? { ...c, text: changed.get(c.id)!, decided_on: today } : c);
    const added = update.new_actions
        .map(text => text.trim())
        .filter(Boolean)
        .map(text => ({ id: newId(), text, decided_on: today }));
    return [...carried, ...added];
}

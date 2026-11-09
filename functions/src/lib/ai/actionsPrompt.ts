import { z } from 'zod';
import { ACTION_KINDS, kindOf, tickedToday, type Action, type SessionActions } from '../actions.js';

const line = { text: z.string(), kind: z.enum(ACTION_KINDS) };

/** The extraction refers to current actions by their number on the list, which the model copies more reliably than ids. */
export const ActionsSchema = z.object({
    done: z.array(z.number()).describe('Numbers of current actions the person says in this conversation they have done: a once action at any time, a daily action today'),
    changed: z.array(z.object({ number: z.number(), ...line })).describe('Current actions the person changed in this conversation, with the new wording'),
    new_actions: z.array(z.object(line)).describe('Actions the person decided on in this conversation that are not on the current list'),
    rewritten: z.array(z.object({ numbers: z.array(z.number()), ...line })).describe('Current actions to rewrite as one line: two or more that say the same thing, or one with far more words than it needs or the wrong kind'),
});

/**
 * Builds the prompt that reads a finished session for the actions the person
 * decided to take (functions/src/lib/actions.ts), given the current list. It
 * records what the person said they will do, everyday actions included,
 * without judging which ones matter, keeps the list short and never removes
 * an action. With no transcript it only tidies the list.
 */
export function buildActionsPrompt(listed: Action[], transcript: string, today: string): string {
    const current = listed.length
        ? listed.map((a, i) => `${i + 1}. [${kindOf(a)}] ${a.text} (decided ${a.decided_on}${tickedToday(a, today) ? ', ticked today' : ''})`).join('\n')
        : '(empty)';
    return `You keep a person's list of actions from their conversations with their ideal self on Earnest Page.

An action is something specific the person said they will do: one they named themselves, or one the ideal self offered that they accepted. Include every one, everyday ones too, however they put it. A plan for their day counts even when they describe it while imagining or playing along, as long as it is what they are actually going to do. So does a way of acting the person said they want to live by, even when it came up as a description of who they want to be. Leave out ideas the person did not take up and anything they only said they might do.

Each action is one of two kinds:
- daily: a way of being they live by, a trait or a routine they can do again every day.
- once: a specific thing to do one time.

You get today's date, the current list and the newest conversation. Report:
- done: current actions the person says in this conversation they have done: a once action done at any time, a daily action done today.
- changed: current actions the person changed in this conversation (a different time, place or form). Give the new wording and its kind.
- new_actions: actions the person decided on in this conversation, each with its kind. Leave out any that a current action already says, even in other words.
- rewritten: current actions to rewrite as one line, each with the line and its kind. Either two or more that say the same thing in other words, merged into one, or a single one with far more words than it needs or the wrong kind. Merge only actions that mean the same thing; related but different actions stay separate.

Every current action stays on the list unless it is merged. Never leave one out because it is old, done or was not mentioned.

Write each action as a line on a checklist, in the language of the list and the conversation, in as few words as it takes: a daily action in a few words ("Rest when tired"), a once action short and specific enough that the person will know when it is done. Start with the verb, with no "I" or other subject, the way people write their own lists in that language.

TODAY: ${today}

CURRENT LIST:
${current}

CONVERSATION:
${transcript || '(none)'}`;
}

/** Maps the numbers in the extraction back to the listed actions' ids, dropping any that don't exist. */
export function toSessionActions(result: z.infer<typeof ActionsSchema>, listed: Action[]): SessionActions {
    const idsOf = (numbers: number[]) => numbers.map(n => listed[n - 1]?.id).filter((id): id is string => !!id);
    return {
        done: idsOf(result.done),
        changed: result.changed.flatMap(c => idsOf([c.number]).map(id => ({ id, text: c.text, kind: c.kind }))),
        new_actions: result.new_actions,
        rewritten: result.rewritten.flatMap(r => {
            const ids = idsOf(r.numbers);
            return ids.length ? [{ ids, text: r.text, kind: r.kind }] : [];
        }),
    };
}

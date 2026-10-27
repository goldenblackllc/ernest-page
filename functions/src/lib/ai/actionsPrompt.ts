import { z } from 'zod';
import type { Action, SessionActions } from '../actions.js';

/** The extraction refers to open actions by their number on the list, which the model copies more reliably than ids. */
export const ActionsSchema = z.object({
    done: z.array(z.number()).describe('Numbers of current actions the person says in this conversation they have already done'),
    changed: z.array(z.object({
        number: z.number(),
        text: z.string(),
    })).describe('Current actions the person changed in this conversation, with the new wording'),
    new_actions: z.array(z.string()).describe('Actions the person decided on in this conversation that are not on the current list'),
});

/**
 * Builds the prompt that reads a finished session for the actions the person
 * decided to take (functions/src/lib/actions.ts), given the ones still open.
 * It records what the person said they will do, everyday actions included,
 * without judging which ones matter.
 */
export function buildActionsPrompt(open: Action[], transcript: string): string {
    const current = open.length
        ? open.map((c, i) => `${i + 1}. ${c.text} (decided ${c.decided_on})`).join('\n')
        : '(empty)';
    return `You keep a person's list of actions from their conversations with their ideal self on Earnest Page.

An action is something specific the person said they will do: one they named themselves, or one the ideal self offered that they accepted. Include every one, everyday ones too. Leave out ideas the person did not take up.

You get the current list and the newest conversation. Report:
- done: current actions the person says in this conversation that they have already done.
- changed: current actions the person changed in this conversation (a different time, place or form). Give the new wording.
- new_actions: actions the person decided on in this conversation that are not already on the list. Leave out anything that repeats a current action.

Every other current action stays as it is. Never leave one out because it is old or was not mentioned.

Write each action as a line on a checklist, in the language of the conversation: start with the verb, with no "I" or other subject, the way people write their own lists in that language. One short line, specific enough that the person will know when it is done.

CURRENT LIST:
${current}

CONVERSATION:
${transcript}`;
}

/** Maps the numbers in the extraction back to the open actions' ids, dropping any that don't exist. */
export function toSessionActions(result: z.infer<typeof ActionsSchema>, open: Action[]): SessionActions {
    const idOf = (n: number) => open[n - 1]?.id;
    return {
        done: result.done.map(idOf).filter((id): id is string => !!id),
        changed: result.changed.flatMap(c => {
            const id = idOf(c.number);
            return id ? [{ id, text: c.text }] : [];
        }),
        new_actions: result.new_actions,
    };
}

import { z } from 'zod';
import type { Choice, SessionChoices } from '../choices.js';

/** The extraction refers to open choices by their number on the list, which the model copies more reliably than ids. */
export const ChoicesSchema = z.object({
    done: z.array(z.number()).describe('Numbers of current choices the person says in this conversation they have already done'),
    changed: z.array(z.object({
        number: z.number(),
        text: z.string(),
    })).describe('Current choices the person changed in this conversation, with the new wording'),
    new_choices: z.array(z.string()).describe('Choices the person made in this conversation that are not on the current list'),
});

/**
 * Builds the prompt that reads a finished session for the person's choices
 * (functions/src/lib/choices.ts), given the choices still open.
 */
export function buildChoicesPrompt(open: Choice[], transcript: string): string {
    const current = open.length
        ? open.map((c, i) => `${i + 1}. ${c.text} (chosen ${c.chosen_on})`).join('\n')
        : '(empty)';
    return `You keep a person's list of choices from their conversations with their ideal self on Earnest Page.

A choice is a specific action the person chose in a conversation, to live as the person they want to be. It is something they said yes to and made theirs, not every idea the ideal self offered. They do it because it pleases them, not to be productive.

You get the current list and the newest conversation. Report:
- done: current choices the person says in this conversation that they have already done.
- changed: current choices the person changed in this conversation (a different time, place or form). Give the new wording.
- new_choices: choices the person made in this conversation that are not already on the list. Leave out anything that repeats a current choice.

Every other current choice stays as it is. Never leave one out because it is old or was not mentioned.

Write each choice in the first person, in the language of the conversation, as one short line, specific enough that the person will know when it is done.

CURRENT LIST:
${current}

CONVERSATION:
${transcript}`;
}

/** Maps the numbers in the extraction back to the open choices' ids, dropping any that don't exist. */
export function toSessionChoices(result: z.infer<typeof ChoicesSchema>, open: Choice[]): SessionChoices {
    const idOf = (n: number) => open[n - 1]?.id;
    return {
        done: result.done.map(idOf).filter((id): id is string => !!id),
        changed: result.changed.flatMap(c => {
            const id = idOf(c.number);
            return id ? [{ id, text: c.text }] : [];
        }),
        new_choices: result.new_choices,
    };
}

/**
 * Builds the prompt that polishes a Now post (lib/now.ts): what the person wrote
 * after taking an action, with spelling, grammar and flow fixed. Their voice,
 * language and meaning stay, and nothing is added.
 */
export function buildPolishPrompt(action: string, text: string): string {
    return `Fix the spelling, grammar, punctuation and flow of this note. Someone wrote it after doing something ("${action}"), about what happened and anything unexpected.

Keep their voice, their language, their meaning and about the same length. Add nothing they did not say: no feelings, facts, advice or conclusions. Leave out nothing they did say.

Reply with the note only.

NOTE:
${text}`;
}

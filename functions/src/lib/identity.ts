/**
 * Who the person decided to be (`users/{uid}.identity`): one or two sentences in
 * their own words that start with "I am", short enough for the mind to hold, and
 * a short title derived from it. The text is private; only the title is shown to
 * others, as the byline of their posts and comments. The person writes the text
 * in My Life (/api/identity), or says yes to new wording in a session
 * (processChat). The title is written by lib/ai/identity.ts.
 *
 * Pure, no imports; shared with the website.
 */
export type Identity = { text: string; title: string };

export const IDENTITY_MAX_LENGTH = 400;

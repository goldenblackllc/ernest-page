/**
 * Now: the Take Action loop. The person lists the options they have right now,
 * picks the one with the most pull and commits to it. While it is underway it
 * shows in a card above the footer. When they finish, they say what happened,
 * and that becomes a post only they ever see, in their own feed. Nothing from
 * sessions or from My Actions comes into Now, and the character never sees it.
 *
 * `users/{uid}.now.underway` is the action in progress and the list it was picked
 * from, so Next can bring back the rest. `users/{uid}.now.polish` is the person's
 * last Polish choice. The posts are in `users/{uid}/now_posts`, apart from session
 * posts, so nothing can publish one. Only the server writes any of it; the
 * polishNowPost function adds the polished text.
 *
 * Pure, no imports; shared with the website (Now sheets, /api/now, the feed).
 */

export const MAX_OPTIONS = 8;
export const MAX_OPTION_LENGTH = 80;
export const MAX_TEXT_LENGTH = 4000;
/** Longer than this, the time is left off the post: overnight almost always means a forgotten Finish. */
export const MAX_SHOWN_MINUTES = 12 * 60;
/** How long a post waits for its polished text. After that it shows the person's own words for good. */
export const POLISH_WAIT_MS = 5 * 60_000;

/** `users/{uid}.now`. `Time` is the Firestore Timestamp type of the side reading it. */
export type NowState<Time = unknown> = {
    underway?: NowUnderway<Time>;
    polish?: boolean;
};

export type NowUnderway<Time = unknown> = {
    /** The option picked, as written; the post's title. */
    action: string;
    /** Every option on the list, the picked one included. */
    options: string[];
    /** When they tapped Commit. */
    started_at: Time;
};

/** A post in `users/{uid}/now_posts`: one finished action. */
export type NowPostDoc<Time = unknown> = {
    action: string;
    /** What happened, as they wrote it. */
    raw_text: string;
    /** Their words with spelling, grammar and flow fixed, once polishNowPost has run. */
    polished_text?: string;
    /** They ticked Polish (and wrote something to polish). */
    polish: boolean;
    /** They switched back to their own words. */
    show_raw?: boolean;
    photo_url?: string;
    photo_path?: string;
    started_at: Time;
    created_at: Time;
};

const tidy = (text: string) => text.replace(/\s+/g, ' ').trim();

/** The options as typed: blanks and repeats dropped, each cut to MAX_OPTION_LENGTH, at most MAX_OPTIONS. */
export function cleanOptions(options: unknown): string[] {
    if (!Array.isArray(options)) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const option of options) {
        if (typeof option !== 'string') continue;
        const text = tidy(option).slice(0, MAX_OPTION_LENGTH).trim();
        if (!text || seen.has(text.toLowerCase())) continue;
        seen.add(text.toLowerCase());
        out.push(text);
        if (out.length === MAX_OPTIONS) break;
    }
    return out;
}

/** What they commit to: the picked option and the list it came from, or null when the pick isn't on the list. */
export function commitment(options: unknown, action: unknown): { action: string; options: string[] } | null {
    const list = cleanOptions(options);
    const picked = typeof action === 'string' ? tidy(action).slice(0, MAX_OPTION_LENGTH).trim().toLowerCase() : '';
    const match = picked && list.find(o => o.toLowerCase() === picked);
    return match ? { action: match, options: list } : null;
}

/** The options Next brings back: the list without the one just done. */
export function remainingOptions(options: string[], action: string): string[] {
    return options.filter(o => o.toLowerCase() !== action.toLowerCase());
}

/**
 * What happened, as written, cut to MAX_TEXT_LENGTH. Line breaks are kept, as plain
 * newlines: a browser sends the ones in form data as \r\n.
 */
export function cleanText(text: unknown): string {
    return typeof text === 'string' ? text.replace(/\r\n?/g, '\n').trim().slice(0, MAX_TEXT_LENGTH).trim() : '';
}

/** Minutes from Commit to Done (at least one), or null when it's too long to be real or a time is missing. */
export function shownMinutes(startedMs: number, finishedMs: number): number | null {
    const minutes = Math.max(1, Math.round((finishedMs - startedMs) / 60_000));
    return minutes <= MAX_SHOWN_MINUTES ? minutes : null;
}

/** The words a post shows: the polished ones unless the person switched back to their own. */
export function shownText(post: { raw_text: string; polished_text?: string | null; show_raw?: boolean }): string {
    return !post.show_raw && post.polished_text ? post.polished_text : post.raw_text;
}

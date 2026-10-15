/**
 * The character's situations: the settings of its life (office, dinner out,
 * in bed reading…), each with its own look, and the weekly routine that says
 * which one it is in at any hour. The bible compile writes both to
 * users/{uid}.bible.style; avatar.ts draws one avatar per situation.
 *
 * Pure, no imports; shared with the website (Mirror header).
 */

export const WEEK_DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
export type WeekDay = typeof WEEK_DAYS[number];

export interface Situation {
    /** Short lowercase slug, e.g. "office" */
    id: string;
    /** Where the character is and what it's doing, e.g. "In bed, reading" */
    label: string;
    /** English, visual-only brief for this situation's avatar photo */
    portrait: string;
}

/** From `from` o'clock on these days, the character is in `situation`. */
export interface WeekBlock {
    days: WeekDay[];
    from: number;
    situation: string;
}

export interface CharacterStyle {
    /** The first is the character's main portrait: the main avatar and reference image. */
    situations: Situation[];
    week: WeekBlock[];
}

/**
 * The situation the character is in at this day and hour: the latest block
 * that has started, looking back through earlier days when today has none yet
 * (so 2 a.m. on Tuesday falls under Monday night's block). Falls back to the
 * main portrait's situation. `day` is 0 = Sunday, like Date.getDay().
 */
export function currentSituation(style: CharacterStyle | undefined, day: number, hour: number): Situation | undefined {
    const situations = style?.situations || [];
    if (situations.length === 0) return undefined;
    const week = style?.week || [];

    for (let back = 0; back < 7; back++) {
        const dayCode = WEEK_DAYS[(day - back + 7) % 7];
        let best: WeekBlock | undefined;
        for (const block of week) {
            if (!block.days?.includes(dayCode)) continue;
            if (back === 0 && block.from > hour) continue;
            if (!best || block.from > best.from) best = block;
        }
        const id = best?.situation;
        const match = id && situations.find(s => s.id === id);
        if (match) return match;
    }
    return situations[0];
}

/** Day of week (0 = Sunday) and hour (0–23) right now in an IANA time zone. */
export function localDayHour(date: Date, timeZone: string): { day: number; hour: number } {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', hour: 'numeric', hourCycle: 'h23' }).formatToParts(date);
    const weekday = (parts.find(p => p.type === 'weekday')?.value || 'Sun').toLowerCase().slice(0, 3);
    const hour = Number(parts.find(p => p.type === 'hour')?.value || 0);
    return { day: Math.max(0, WEEK_DAYS.indexOf(weekday as WeekDay)), hour: hour % 24 };
}

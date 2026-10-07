/**
 * Relative date labels for the Mirror prompt, so the character doesn't have to do
 * date math ("last week" for a session that was last night). Labels are computed
 * when the prompt is built — stored data keeps plain YYYY-MM-DD dates.
 */

const DAY_MS = 86_400_000;

/** Returns the IANA time zone if valid, otherwise UTC. */
export function safeTimeZone(timeZone: unknown): string {
    if (typeof timeZone !== 'string' || !timeZone) return 'UTC';
    try {
        new Intl.DateTimeFormat('en-US', { timeZone });
        return timeZone;
    } catch {
        return 'UTC';
    }
}

/** YYYY-MM-DD for the given moment in the given time zone. */
export function localDateKey(date: Date, timeZone: string): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

function daysBetween(fromKey: string, toKey: string): number {
    return Math.round((Date.parse(`${toKey}T00:00:00Z`) - Date.parse(`${fromKey}T00:00:00Z`)) / DAY_MS);
}

/** "today", "yesterday", "3 days ago", "in 2 weeks", "about 4 months ago". */
export function relativeDayLabel(dateKey: string, todayKey: string): string {
    const diff = daysBetween(todayKey, dateKey);
    const n = Math.abs(diff);
    if (diff === 0) return 'today';
    if (diff === -1) return 'yesterday';
    if (diff === 1) return 'tomorrow';

    let amount: string;
    if (n < 14) amount = `${n} days`;
    else if (n < 60) amount = `${Math.round(n / 7)} weeks`;
    else if (n < 365) amount = `about ${Math.round(n / 30)} months`;
    else amount = `about ${Math.round(n / 365)} year${Math.round(n / 365) === 1 ? '' : 's'}`;
    return diff < 0 ? `${amount} ago` : `in ${amount}`;
}

/** Recap label with time of day when known: "last night", "this morning", "yesterday afternoon". */
export function relativeMomentLabel(timestamp: number, now: Date, timeZone: string): string {
    const when = new Date(timestamp);
    const day = relativeDayLabel(localDateKey(when, timeZone), localDateKey(now, timeZone));
    const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hourCycle: 'h23' }).format(when));
    const part = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : hour < 21 ? 'evening' : 'night';

    if (day === 'today') return part === 'night' ? 'tonight' : `this ${part}`;
    if (day === 'yesterday') return part === 'night' ? 'last night' : `yesterday ${part}`;
    return day;
}

/**
 * Adds a relative label after each full YYYY-MM-DD date within a year of today:
 * "2026-10-06" → "2026-10-06 (yesterday)". Older dates (birthdays, history) are left alone.
 */
export function annotateDates(text: string, todayKey: string): string {
    return text.replace(/\b\d{4}-\d{2}-\d{2}\b/g, (match) => {
        if (Number.isNaN(Date.parse(`${match}T00:00:00Z`))) return match;
        if (Math.abs(daysBetween(todayKey, match)) > 365) return match;
        return `${match} (${relativeDayLabel(match, todayKey)})`;
    });
}

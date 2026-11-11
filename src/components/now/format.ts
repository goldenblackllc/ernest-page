/** Translations from the "now" namespace (useTranslations("now")). */
type NowT = (key: string, values?: Record<string, string | number>) => string;

/** "25 min", "2 hr", "1 hr 40 min", in the person's language. */
export function formatMinutes(minutes: number, t: NowT): string {
    if (minutes < 60) return t("minutes", { count: minutes });
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest ? t("hoursMinutes", { hours, minutes: rest }) : t("hours", { hours });
}

const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** When a Now post was made: "Today, 4:05 PM", "Yesterday, 6:30 PM" or "Nov 3, 6:30 PM". */
export function formatNowDate(date: Date, now: Date, locale: string, t: NowT): string {
    const time = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(date);
    if (sameDay(date, now)) return t("today", { time });
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (sameDay(date, yesterday)) return t("yesterday", { time });
    const day = new Intl.DateTimeFormat(locale, {
        month: "short",
        day: "numeric",
        ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
    }).format(date);
    return t("onDay", { day, time });
}

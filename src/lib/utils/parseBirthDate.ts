/**
 * Robust birth-date parser.
 *
 * Accepts any format the onboarding form has ever allowed:
 *   - ISO date:       "2011-04-11"
 *   - Full text date: "April 11, 2011"
 *   - Month + year:   "September 2005"
 *   - Year only:      "2005"
 *   - US format:      "12/18/2007"
 *   - European:       "18.12.2007"
 *
 * Returns the parsed birth year (or null on failure) and a convenience
 * `computeAge` wrapper that returns the user's current age in whole years.
 */

export interface ParsedBirthDate {
    year: number;
    /** 1-12, or null if only year was provided */
    month: number | null;
    /** 1-31, or null if not provided */
    day: number | null;
}

/**
 * Parse a free-text or ISO birth-date string into structured components.
 * Returns null if the input cannot be understood.
 */
export function parseBirthDate(input: string | undefined | null): ParsedBirthDate | null {
    if (!input || !input.trim()) return null;

    const trimmed = input.trim();
    const currentYear = new Date().getFullYear();

    // ── Strategy 1: Try native Date parsing ──
    // Handles "April 11, 2011", "2011-04-11", "12/18/2007", etc.
    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) {
        const year = parsed.getFullYear();
        if (year >= 1900 && year <= currentYear) {
            return {
                year,
                month: parsed.getMonth() + 1,
                day: parsed.getDate(),
            };
        }
    }

    // ── Strategy 2: Extract a 4-digit year from anywhere in the string ──
    // Handles "September 2005", "born in 2005", or any messy input
    const yearMatch = trimmed.match(/\b(19|20)\d{2}\b/);
    if (yearMatch) {
        const year = parseInt(yearMatch[0], 10);
        if (year >= 1900 && year <= currentYear) {
            // Try to also extract a month name
            const monthNames: Record<string, number> = {
                january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
                july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
                // Common abbreviations
                jan: 1, feb: 2, mar: 3, apr: 4, jun: 6,
                jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
            };
            const lower = trimmed.toLowerCase();
            let month: number | null = null;
            for (const [name, num] of Object.entries(monthNames)) {
                if (lower.includes(name)) {
                    month = num;
                    break;
                }
            }
            return { year, month, day: null };
        }
    }

    // ── Strategy 3: Plain number that looks like a year ──
    // Handles someone entering just "2005"
    const asNumber = parseInt(trimmed, 10);
    if (!isNaN(asNumber) && asNumber >= 1900 && asNumber <= currentYear) {
        return { year: asNumber, month: null, day: null };
    }

    return null;
}

/**
 * Compute the user's current age in whole years from a birth-date string.
 * Returns null if the input cannot be parsed.
 */
export function computeAge(input: string | undefined | null): number | null {
    const birth = parseBirthDate(input);
    if (!birth) return null;

    const now = new Date();
    let age = now.getFullYear() - birth.year;

    // Adjust if birthday hasn't occurred yet this year
    if (birth.month !== null) {
        const currentMonth = now.getMonth() + 1;
        if (birth.month > currentMonth) {
            age--;
        } else if (birth.month === currentMonth && birth.day !== null) {
            if (birth.day > now.getDate()) {
                age--;
            }
        }
    }

    return age >= 0 ? age : null;
}

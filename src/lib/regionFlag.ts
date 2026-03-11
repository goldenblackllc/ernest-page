/**
 * Convert a region code (e.g., "US-PA", "JP-13", "GB") to its country emoji flag.
 * Uses Unicode regional indicator symbols.
 */
export function getCountryFlag(region: string | null | undefined): string {
    if (!region) return '';

    // Extract country code (first 2 chars before any dash)
    const countryCode = region.split('-')[0].toUpperCase();

    if (countryCode.length !== 2) return '';

    // Convert to regional indicator symbols (🇺🇸 = U+1F1FA U+1F1F8)
    const offset = 0x1F1E6 - 65; // 'A' = 65
    return String.fromCodePoint(
        countryCode.charCodeAt(0) + offset,
        countryCode.charCodeAt(1) + offset
    );
}

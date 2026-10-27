/**
 * The weather where the user is, for the Mirror's per-turn block. Conditions
 * only, never a place name: replies end up in anonymous public posts.
 *
 * The place comes from /api/consume-session (active_chats/{sessionId}.place);
 * the result is kept on the chat as `weather` and refreshed after an hour.
 */

export interface Weather { summary: string; at: number }

const MAX_AGE_MS = 60 * 60_000;
const TIMEOUT_MS = 1500;

// WMO weather interpretation codes, as Open-Meteo reports them
const CONDITIONS: Record<number, string> = {
    0: 'clear sky', 1: 'mostly clear', 2: 'partly cloudy', 3: 'overcast',
    45: 'fog', 48: 'freezing fog',
    51: 'light drizzle', 53: 'drizzle', 55: 'heavy drizzle', 56: 'freezing drizzle', 57: 'freezing drizzle',
    61: 'light rain', 63: 'rain', 65: 'heavy rain', 66: 'freezing rain', 67: 'freezing rain',
    71: 'light snow', 73: 'snow', 75: 'heavy snow', 77: 'snow grains',
    80: 'rain showers', 81: 'rain showers', 82: 'heavy rain showers', 85: 'snow showers', 86: 'heavy snow showers',
    95: 'thunderstorm', 96: 'thunderstorm with hail', 99: 'thunderstorm with hail',
};

/**
 * The cached weather while it's fresh, otherwise a new reading. A failed fetch
 * is cached too (empty summary), so a weather outage never slows every turn.
 * Undefined when the session has no place.
 */
export async function currentWeather(place: unknown, cached: unknown, now = Date.now()): Promise<Weather | undefined> {
    if (!isPlace(place)) return undefined;
    if (isWeather(cached) && now - cached.at < MAX_AGE_MS) return cached;
    try {
        return { summary: await fetchSummary(place), at: now };
    } catch (err) {
        console.warn('[Weather] Fetch failed:', err instanceof Error ? err.message : err);
        return { summary: '', at: now };
    }
}

async function fetchSummary({ lat, lon }: { lat: number; lon: number }): Promise<string> {
    // The free host is for non-commercial use; with a key, the customer host is used.
    const key = process.env.OPEN_METEO_API_KEY;
    const url = new URL(key ? 'https://customer-api.open-meteo.com/v1/forecast' : 'https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude', String(lat));
    url.searchParams.set('longitude', String(lon));
    url.searchParams.set('current', 'temperature_2m,apparent_temperature,weather_code,wind_speed_10m,is_day');
    if (key) url.searchParams.set('apikey', key);

    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { current } = await res.json() as { current?: Record<string, number> };
    if (!current) throw new Error('No current weather');
    return describeWeather(current);
}

/** e.g. "9°C (48°F), feels like 5°C (41°F), light rain, windy, dark out" */
export function describeWeather(current: Record<string, number>): string {
    const { temperature_2m: temp, apparent_temperature: feels, weather_code: code, wind_speed_10m: wind, is_day: isDay } = current;
    const degrees = (c: number) => `${Math.round(c)}°C (${Math.round(c * 9 / 5 + 32)}°F)`;
    return [
        Number.isFinite(temp) ? degrees(temp) : '',
        Number.isFinite(temp) && Number.isFinite(feels) && Math.abs(feels - temp) >= 3 ? `feels like ${degrees(feels)}` : '',
        CONDITIONS[code] ?? '',
        wind >= 50 ? 'very windy' : wind >= 30 ? 'windy' : '',
        isDay === 0 ? 'dark out' : '',
    ].filter(Boolean).join(', ');
}

function isPlace(v: unknown): v is { lat: number; lon: number } {
    const p = v as { lat?: unknown; lon?: unknown } | undefined;
    return typeof p?.lat === 'number' && typeof p.lon === 'number' && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180;
}

function isWeather(v: unknown): v is Weather {
    const w = v as Partial<Weather> | undefined;
    return typeof w?.summary === 'string' && typeof w.at === 'number';
}

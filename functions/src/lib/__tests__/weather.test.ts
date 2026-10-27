// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { currentWeather, describeWeather } from '../weather.js';

describe('describeWeather', () => {
    it('gives the conditions in both units, without a place', () => {
        expect(describeWeather({ temperature_2m: 9.4, apparent_temperature: 5, weather_code: 61, wind_speed_10m: 35, is_day: 0 }))
            .toBe('9°C (49°F), feels like 5°C (41°F), light rain, windy, dark out');
        expect(describeWeather({ temperature_2m: 24, apparent_temperature: 25, weather_code: 0, wind_speed_10m: 5, is_day: 1 }))
            .toBe('24°C (75°F), clear sky');
    });
});

describe('currentWeather', () => {
    it('needs a valid place and fetches nothing while the cache is fresh', async () => {
        expect(await currentWeather(undefined, undefined)).toBeUndefined();
        expect(await currentWeather({ lat: 'x', lon: 0 }, undefined)).toBeUndefined();
        const cached = { summary: 'fog', at: 1_000 };
        expect(await currentWeather({ lat: 1, lon: 2 }, cached, 1_000 + 59 * 60_000)).toBe(cached);
    });
});

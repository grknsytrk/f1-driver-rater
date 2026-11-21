import { describe, expect, it } from 'vitest';
import { getConfiguredDriverPortraits, getDriverPortrait } from './driverPortraits';

describe('getDriverPortrait', () => {
    it('configures 2024-2026 portrait paths with valid image paths and no empty entries', () => {
        const entries = getConfiguredDriverPortraits();
        expect(entries.length).toBeGreaterThanOrEqual(70);

        for (const entry of entries) {
            expect(entry.path).toMatch(/^\/images\/drivers\/(2024|2025|2026|team-variants)\/[a-z0-9_-]+\.webp$/);
            expect(getDriverPortrait(entry.season, entry.driverId, entry.constructorId)).toBe(entry.path);
        }

        expect(entries.filter(e => e.season === '2024')).toHaveLength(24);
        expect(entries.filter(e => e.season === '2025')).toHaveLength(23);
        expect(entries.filter(e => e.season === '2026')).toHaveLength(25);
    });

    it('returns distinct race suit variants for mid-season team switches', () => {
        expect(getDriverPortrait('2024', 'bearman', 'ferrari')).toBe('/images/drivers/2024/bearman-ferrari.webp');
        expect(getDriverPortrait('2024', 'bearman', 'haas')).toBe('/images/drivers/2024/bearman-haas.webp');

        expect(getDriverPortrait('2025', 'lawson', 'rb')).toBe('/images/drivers/2025/lawson-rb.webp');
        expect(getDriverPortrait('2025', 'lawson', 'red_bull')).toBe('/images/drivers/2025/lawson-red_bull.webp');

        expect(getDriverPortrait('2025', 'tsunoda', 'rb')).toBe('/images/drivers/2025/tsunoda-rb.webp');
        expect(getDriverPortrait('2025', 'tsunoda', 'red_bull')).toBe('/images/drivers/2025/tsunoda-red_bull.webp');
    });

    it('returns distinct season and team portraits across 2024, 2025, and 2026', () => {
        expect(getDriverPortrait('2024', 'hamilton', 'mercedes')).toBe('/images/drivers/2024/hamilton.webp');
        expect(getDriverPortrait('2025', 'hamilton', 'ferrari')).toBe('/images/drivers/2025/hamilton.webp');
        expect(getDriverPortrait('2026', 'hamilton', 'ferrari')).toBe('/images/drivers/2026/hamilton.webp');

        expect(getDriverPortrait('2024', 'sainz', 'ferrari')).toBe('/images/drivers/2024/sainz.webp');
        expect(getDriverPortrait('2025', 'sainz', 'williams')).toBe('/images/drivers/2025/sainz.webp');
        expect(getDriverPortrait('2026', 'sainz', 'williams')).toBe('/images/drivers/2026/sainz.webp');

        expect(getDriverPortrait('2024', 'colapinto', 'williams')).toBe('/images/drivers/2024/colapinto.webp');
        expect(getDriverPortrait('2025', 'colapinto', 'alpine')).toBe('/images/drivers/2025/colapinto.webp');
        expect(getDriverPortrait('2026', 'colapinto', 'alpine')).toBe('/images/drivers/2026/colapinto.webp');
    });

    it('returns null when constructor does not match the season or season is older than 2024', () => {
        expect(getDriverPortrait('2024', 'hamilton', 'ferrari')).toBeNull();
        expect(getDriverPortrait('2024', 'doohan', 'alpine')).toBeNull();
        expect(getDriverPortrait('2023', 'hamilton', 'mercedes')).toBeNull();
        expect(getDriverPortrait('2020', 'max_verstappen', 'red_bull')).toBeNull();
    });
});

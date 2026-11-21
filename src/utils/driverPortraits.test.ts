import { describe, expect, it } from 'vitest';
import { getConfiguredDriverPortraits, getDriverPortrait } from './driverPortraits';

describe('getDriverPortrait', () => {
    it('configures 2019-2026 portrait paths with valid image paths and expected counts per season', () => {
        const entries = getConfiguredDriverPortraits();
        expect(entries.length).toBe(180);

        for (const entry of entries) {
            expect(entry.path).toMatch(/^\/images\/drivers\/(2019|2020|2021|2022|2023|2024|2025|2026|team-variants)\/[a-z0-9_-]+\.webp$/);
            expect(getDriverPortrait(entry.season, entry.driverId, entry.constructorId)).toBe(entry.path);
        }

        expect(entries.filter(e => e.season === '2018')).toHaveLength(0);
        expect(entries.filter(e => e.season === '2019')).toHaveLength(20);
        expect(entries.filter(e => e.season === '2020')).toHaveLength(23);
        expect(entries.filter(e => e.season === '2021')).toHaveLength(21);
        expect(entries.filter(e => e.season === '2022')).toHaveLength(22);
        expect(entries.filter(e => e.season === '2023')).toHaveLength(22);
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

    it('returns distinct season and team portraits across 2019-2026 transitions', () => {
        expect(getDriverPortrait('2019', 'vettel', 'ferrari')).toBe('/images/drivers/2019/vettel.webp');
        expect(getDriverPortrait('2020', 'vettel', 'ferrari')).toBe('/images/drivers/2020/vettel.webp');
        expect(getDriverPortrait('2021', 'vettel', 'aston_martin')).toBe('/images/drivers/2021/vettel.webp');
        expect(getDriverPortrait('2022', 'vettel', 'aston_martin')).toBe('/images/drivers/2022/vettel.webp');

        expect(getDriverPortrait('2019', 'sainz', 'mclaren')).toBe('/images/drivers/2019/sainz.webp');
        expect(getDriverPortrait('2020', 'sainz', 'mclaren')).toBe('/images/drivers/2020/sainz.webp');
        expect(getDriverPortrait('2023', 'sainz', 'ferrari')).toBe('/images/drivers/2023/sainz.webp');
        expect(getDriverPortrait('2025', 'sainz', 'williams')).toBe('/images/drivers/2025/sainz.webp');

        expect(getDriverPortrait('2019', 'gasly', 'toro_rosso')).toBe('/images/drivers/2019/gasly.webp');
        expect(getDriverPortrait('2020', 'gasly', 'alphatauri')).toBe('/images/drivers/2020/gasly.webp');
        expect(getDriverPortrait('2023', 'gasly', 'alpine')).toBe('/images/drivers/2023/gasly.webp');

        expect(getDriverPortrait('2019', 'albon', 'red_bull')).toBe('/images/drivers/2019/albon.webp');
        expect(getDriverPortrait('2022', 'albon', 'williams')).toBe('/images/drivers/2022/albon.webp');

        expect(getDriverPortrait('2019', 'ricciardo', 'renault')).toBe('/images/drivers/2019/ricciardo.webp');
        expect(getDriverPortrait('2022', 'ricciardo', 'mclaren')).toBe('/images/drivers/2022/ricciardo.webp');
        expect(getDriverPortrait('2023', 'ricciardo', 'alphatauri')).toBe('/images/drivers/2023/ricciardo.webp');
        expect(getDriverPortrait('2024', 'ricciardo', 'rb')).toBe('/images/drivers/2024/ricciardo.webp');

        expect(getDriverPortrait('2019', 'russell', 'williams')).toBe('/images/drivers/2019/russell.webp');
        expect(getDriverPortrait('2021', 'russell', 'williams')).toBe('/images/drivers/2021/russell.webp');
        expect(getDriverPortrait('2022', 'russell', 'mercedes')).toBe('/images/drivers/2022/russell.webp');

        expect(getDriverPortrait('2019', 'bottas', 'mercedes')).toBe('/images/drivers/2019/bottas.webp');
        expect(getDriverPortrait('2022', 'bottas', 'alfa')).toBe('/images/drivers/2022/bottas.webp');
        expect(getDriverPortrait('2024', 'bottas', 'sauber')).toBe('/images/drivers/2024/bottas.webp');
        expect(getDriverPortrait('2026', 'bottas', 'cadillac')).toBe('/images/drivers/2026/bottas.webp');

        expect(getDriverPortrait('2019', 'hamilton', 'mercedes')).toBe('/images/drivers/2019/hamilton.webp');
        expect(getDriverPortrait('2024', 'hamilton', 'mercedes')).toBe('/images/drivers/2024/hamilton.webp');
        expect(getDriverPortrait('2025', 'hamilton', 'ferrari')).toBe('/images/drivers/2025/hamilton.webp');
        expect(getDriverPortrait('2026', 'hamilton', 'ferrari')).toBe('/images/drivers/2026/hamilton.webp');
    });

    it('returns null when constructor does not match the season or season has no cutouts', () => {
        expect(getDriverPortrait('2019', 'gasly', 'red_bull')).toBeNull();
        expect(getDriverPortrait('2019', 'albon', 'toro_rosso')).toBeNull();
        expect(getDriverPortrait('2020', 'hamilton', 'ferrari')).toBeNull();
        expect(getDriverPortrait('2020', 'vettel', 'aston_martin')).toBeNull();
        expect(getDriverPortrait('2020', 'russell', 'mercedes')).toBeNull();
        expect(getDriverPortrait('2024', 'doohan', 'alpine')).toBeNull();
        expect(getDriverPortrait('2018', 'hamilton', 'mercedes')).toBeNull();
        expect(getDriverPortrait('2017', 'hamilton', 'mercedes')).toBeNull();
    });
});

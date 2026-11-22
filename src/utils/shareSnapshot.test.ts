import { describe, expect, it } from 'vitest';
import {
    buildShareUrl,
    createShareSnapshot,
    decodeShareToken,
    encodeShareToken,
    generateShortShareId,
    isShortShareId,
    isStatelessShareToken,
    loadShareSnapshot,
    type ShareSnapshot,
} from './shareSnapshot';

const SAMPLE_SNAPSHOT: ShareSnapshot = {
    version: 1,
    season: '2026',
    mode: 'personal',
    source: 'race',
    ratedRaces: 18,
    createdAt: '2026-11-22',
    drivers: [
        {
            driverId: 'max_verstappen',
            driverName: 'Max Verstappen',
            constructorId: 'red_bull',
            constructorName: 'Red Bull',
            averageRating: 8.92,
            totalRaces: 18,
        },
        {
            driverId: 'hulkenberg',
            driverName: 'Nico Hülkenberg',
            constructorId: 'audi',
            constructorName: 'Audi',
            averageRating: 8.15,
            totalRaces: 18,
        },
        {
            driverId: 'perez',
            driverName: 'Sergio Pérez',
            constructorId: 'cadillac',
            constructorName: 'Cadillac',
            averageRating: 6.5,
            totalRaces: 17,
        },
    ],
};

describe('shareSnapshot utilities', () => {
    it('encodes and decodes UTF-8 driver names and scores losslessly in stateless tokens', () => {
        const token = encodeShareToken(SAMPLE_SNAPSHOT);
        expect(isStatelessShareToken(token)).toBe(true);
        expect(isShortShareId(token)).toBe(false);

        const decoded = decodeShareToken(token);
        expect(decoded).not.toBeNull();
        expect(decoded?.season).toBe('2026');
        expect(decoded?.mode).toBe('personal');
        expect(decoded?.source).toBe('race');
        expect(decoded?.ratedRaces).toBe(18);
        expect(decoded?.drivers).toHaveLength(3);
        expect(decoded?.drivers[1].driverName).toBe('Nico Hülkenberg');
        expect(decoded?.drivers[2].driverName).toBe('Sergio Pérez');
        expect(decoded?.drivers[0].averageRating).toBe(8.92);
    });

    it('rejects invalid or tampered share tokens safely', () => {
        expect(decodeShareToken('')).toBeNull();
        expect(decodeShareToken('abc12345')).toBeNull();
        expect(decodeShareToken('v1.not-valid-base64!!!')).toBeNull();

        const badSeasonToken = `v1.${btoa(JSON.stringify({ v: 1, s: 'bad', m: 'p', src: 'r', r: 1, d: [['ver', 'Max', 'rb', 'RB', 9, 1]] }))}`;
        expect(decodeShareToken(badSeasonToken)).toBeNull();

        const outOfRangeRating = `v1.${btoa(JSON.stringify({ v: 1, s: '2026', m: 'p', src: 'r', r: 1, d: [['ver', 'Max', 'rb', 'RB', 15, 1]] }))}`;
        expect(decodeShareToken(outOfRangeRating)).toBeNull();
    });

    it('generates unambiguous short share IDs and builds canonical share URLs', () => {
        const id = generateShortShareId(8);
        expect(isShortShareId(id)).toBe(true);
        expect(buildShareUrl(id, 'https://f1-driver-rater.vercel.app')).toBe(`https://f1-driver-rater.vercel.app/share/${id}`);
    });

    it('falls back to stateless token storage in test/offline environments and reloads identically', async () => {
        const created = await createShareSnapshot(
            {
                season: '2025',
                mode: 'community',
                source: 'race',
                ratedRaces: 24,
                drivers: SAMPLE_SNAPSHOT.drivers,
            },
            'https://f1-driver-rater.vercel.app',
        );

        expect(created.storage).toBe('token');
        expect(created.id.startsWith('v1.')).toBe(true);
        expect(created.url).toBe(`https://f1-driver-rater.vercel.app/share/${encodeURIComponent(created.id)}`);

        const loaded = await loadShareSnapshot(created.id);
        expect(loaded).not.toBeNull();
        expect(loaded?.season).toBe('2025');
        expect(loaded?.mode).toBe('community');
        expect(loaded?.drivers.map(d => d.driverId)).toEqual(['max_verstappen', 'hulkenberg', 'perez']);

        await expect(loadShareSnapshot('nonexistent123')).resolves.toBeNull();
    });
});

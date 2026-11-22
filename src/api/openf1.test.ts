import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    clearOpenF1Cache,
    getRaceTyreStints,
    groupStintsByDriverNumber,
    matchOpenF1RaceSession,
    normalizeTyreCompound,
    type OpenF1SessionRecord,
} from './openf1';

const SESSIONS_2025: OpenF1SessionRecord[] = [
    {
        session_key: 9693,
        date_start: '2025-03-16T04:00:00+00:00',
        country_name: 'Australia',
        location: 'Melbourne',
        circuit_short_name: 'Melbourne',
        session_name: 'Race',
        year: 2025,
    },
    {
        session_key: 9998,
        date_start: '2025-05-25T13:00:00+00:00',
        country_name: 'Monaco',
        location: 'Monaco',
        circuit_short_name: 'Monte Carlo',
        session_name: 'Race',
        year: 2025,
    },
];

describe('openf1 tyre stints client', () => {
    beforeEach(() => {
        localStorage.clear();
        clearOpenF1Cache();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        localStorage.clear();
        clearOpenF1Cache();
    });

    it('normalizes tyre compounds and maps unknown values safely', () => {
        expect(normalizeTyreCompound('soft')).toBe('SOFT');
        expect(normalizeTyreCompound(' MEDIUM ')).toBe('MEDIUM');
        expect(normalizeTyreCompound('Hard')).toBe('HARD');
        expect(normalizeTyreCompound('INTERMEDIATE')).toBe('INTERMEDIATE');
        expect(normalizeTyreCompound('WET')).toBe('WET');
        expect(normalizeTyreCompound('TEST_UNKNOWN')).toBe('UNKNOWN');
        expect(normalizeTyreCompound(null)).toBe('UNKNOWN');
    });

    it('matches OpenF1 sessions by race date tolerance or fallback location name', () => {
        expect(matchOpenF1RaceSession(SESSIONS_2025, '2025-03-16', 'Australian Grand Prix')?.session_key).toBe(9693);
        expect(matchOpenF1RaceSession(SESSIONS_2025, '2025-03-15', 'Australian Grand Prix')?.session_key).toBe(9693);
        expect(matchOpenF1RaceSession(SESSIONS_2025, '', 'Monaco Grand Prix')?.session_key).toBe(9998);
        expect(matchOpenF1RaceSession(SESSIONS_2025, '2025-09-07', 'Italian Grand Prix')).toBeNull();
    });

    it('groups stints chronologically per driver number and computes lapCount', () => {
        const grouped = groupStintsByDriverNumber([
            { driver_number: 1, stint_number: 2, compound: 'HARD', lap_start: 19, lap_end: 58, tyre_age_at_start: 0 },
            { driver_number: 1, stint_number: 1, compound: 'MEDIUM', lap_start: 1, lap_end: 18, tyre_age_at_start: 0 },
            { driver_number: 16, stint_number: 1, compound: 'INTERMEDIATE', lap_start: 1, lap_end: 30, tyre_age_at_start: 2 },
        ]);

        const verStints = grouped.get(1)!;
        expect(verStints).toHaveLength(2);
        expect(verStints[0].compound).toBe('MEDIUM');
        expect(verStints[0].lapCount).toBe(18);
        expect(verStints[1].compound).toBe('HARD');
        expect(verStints[1].lapCount).toBe(40);
        expect(grouped.get(16)?.[0].compound).toBe('INTERMEDIATE');
    });

    it('skips seasons before 2023, fetches & caches stints for 2023+, and fails gracefully', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
            const href = String(url);
            if (href.includes('/sessions?')) {
                return { ok: true, json: async () => SESSIONS_2025 } as Response;
            }
            if (href.includes('session_key=9693')) {
                return {
                    ok: true,
                    json: async () => [
                        { driver_number: 4, stint_number: 1, compound: 'MEDIUM', lap_start: 1, lap_end: 20 },
                        { driver_number: 4, stint_number: 2, compound: 'HARD', lap_start: 21, lap_end: 58 },
                    ],
                } as Response;
            }
            return { ok: false, json: async () => [] } as Response;
        });

        const pre2023 = await getRaceTyreStints('2021', '2021-12-12', 'Abu Dhabi Grand Prix');
        expect(pre2023.size).toBe(0);
        expect(fetchSpy).not.toHaveBeenCalled();

        const ausStints = await getRaceTyreStints('2025', '2025-03-16', 'Australian Grand Prix');
        expect(ausStints.get(4)?.map(s => s.compound)).toEqual(['MEDIUM', 'HARD']);
        expect(fetchSpy).toHaveBeenCalledTimes(2);

        // Second lookup uses memory/localStorage cache without additional network requests
        const cachedStints = await getRaceTyreStints('2025', '2025-03-16', 'Australian Grand Prix');
        expect(cachedStints.get(4)).toHaveLength(2);
        expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
});

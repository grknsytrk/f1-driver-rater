import { describe, expect, it } from 'vitest';
import {
    getGranularTtl,
    getRaceWeekendWindow,
    getSeasonCacheTtlMs,
    parseRaceDateUtc,
    TTL_TIERS,
} from './f1Api';

describe('4-tier granular TTL resolver (f1Api.ttl.test.ts)', () => {
    describe('parseRaceDateUtc and getRaceWeekendWindow', () => {
        it('parses valid ISO and YYYY-MM-DD date strings into UTC midnight timestamps', () => {
            const parsed = parseRaceDateUtc('2026-03-15');
            expect(parsed).toBe(Date.UTC(2026, 2, 15));
        });

        it('returns null for empty or invalid date strings', () => {
            expect(parseRaceDateUtc('')).toBeNull();
            expect(parseRaceDateUtc('invalid-date')).toBeNull();
        });

        it('calculates the exact Thursday 00:00 UTC to Monday 23:59:59.999 UTC window for a Sunday race', () => {
            // 2026-03-15 is a Sunday
            const window = getRaceWeekendWindow('2026-03-15');
            expect(window).not.toBeNull();
            if (!window) return;

            const thursdayStart = new Date(window.startMs);
            const mondayEnd = new Date(window.endMs);

            expect(thursdayStart.toISOString()).toBe('2026-03-12T00:00:00.000Z');
            expect(thursdayStart.getUTCDay()).toBe(4); // Thursday

            expect(mondayEnd.toISOString()).toBe('2026-03-16T23:59:59.999Z');
            expect(mondayEnd.getUTCDay()).toBe(1); // Monday
        });

        it('calculates the exact Thursday 00:00 UTC to Monday 23:59:59.999 UTC window for a Saturday race', () => {
            // 2024-03-02 was a Saturday (Bahrain GP)
            const window = getRaceWeekendWindow('2024-03-02');
            expect(window).not.toBeNull();
            if (!window) return;

            const thursdayStart = new Date(window.startMs);
            const mondayEnd = new Date(window.endMs);

            expect(thursdayStart.toISOString()).toBe('2024-02-29T00:00:00.000Z');
            expect(thursdayStart.getUTCDay()).toBe(4); // Thursday

            expect(mondayEnd.toISOString()).toBe('2024-03-04T23:59:59.999Z');
            expect(mondayEnd.getUTCDay()).toBe(1); // Monday
        });
    });

    describe('Tier 1: Archived and past seasons (season < currentYear)', () => {
        it('assigns 30-day TTL for past seasons', () => {
            const ttl2020 = getGranularTtl('2020');
            const ttl2023 = getGranularTtl(2023);
            const ttl2025 = getGranularTtl('2025', undefined, undefined, {
                now: new Date('2026-06-01T00:00:00Z').getTime(),
            });

            expect(ttl2020).toBe(TTL_TIERS.ARCHIVED_SEASON_MS);
            expect(ttl2023).toBe(TTL_TIERS.ARCHIVED_SEASON_MS);
            expect(ttl2025).toBe(TTL_TIERS.ARCHIVED_SEASON_MS);
            expect(ttl2023).toBe(30 * 24 * 60 * 60 * 1000);
        });

        it('allows custom archivedMs override in options', () => {
            const customArchivedMs = 365 * 24 * 60 * 60 * 1000;
            const ttl = getGranularTtl('2022', undefined, undefined, {
                archivedMs: customArchivedMs,
                now: new Date('2026-01-01T00:00:00Z').getTime(),
            });
            expect(ttl).toBe(customArchivedMs);
        });
    });

    describe('Tier 2: Completed rounds in current season', () => {
        it('assigns 7-day TTL for past rounds once the race weekend concludes (past Monday 23:59 UTC)', () => {
            // Race on Sunday 2026-03-15; tested on Tuesday 2026-03-17 00:01:00 UTC
            const raceDate = '2026-03-15';
            const tuesdayAfter = new Date('2026-03-17T00:01:00Z').getTime();

            const ttl = getGranularTtl('2026', '1', raceDate, { now: tuesdayAfter });
            expect(ttl).toBe(TTL_TIERS.COMPLETED_ROUND_MS);
            expect(ttl).toBe(7 * 24 * 60 * 60 * 1000);
        });

        it('assigns 7-day TTL for a race completed several weeks ago', () => {
            const raceDate = '2026-03-15';
            const sixWeeksLater = new Date('2026-04-26T12:00:00Z').getTime();

            const ttl = getGranularTtl('2026', '1', raceDate, { now: sixWeeksLater });
            expect(ttl).toBe(TTL_TIERS.COMPLETED_ROUND_MS);
        });
    });

    describe('Tier 3: Active race weekends', () => {
        const raceDate = '2026-03-15'; // Sunday

        it('assigns 2-minute TTL on Thursday at 00:00:01 UTC of race week', () => {
            const thursdayNow = new Date('2026-03-12T00:00:01Z').getTime();
            const ttl = getGranularTtl('2026', '1', raceDate, { now: thursdayNow });
            expect(ttl).toBe(TTL_TIERS.ACTIVE_WEEKEND_MS);
            expect(ttl).toBe(2 * 60 * 1000);
        });

        it('assigns 2-minute TTL on Friday practice sessions', () => {
            const fridayNow = new Date('2026-03-13T14:30:00Z').getTime();
            const ttl = getGranularTtl('2026', '1', raceDate, { now: fridayNow });
            expect(ttl).toBe(TTL_TIERS.ACTIVE_WEEKEND_MS);
        });

        it('assigns 2-minute TTL on Saturday qualifying sessions', () => {
            const saturdayNow = new Date('2026-03-14T16:00:00Z').getTime();
            const ttl = getGranularTtl('2026', '1', raceDate, { now: saturdayNow });
            expect(ttl).toBe(TTL_TIERS.ACTIVE_WEEKEND_MS);
        });

        it('assigns 2-minute TTL during Sunday Grand Prix race day', () => {
            const sundayNow = new Date('2026-03-15T13:00:00Z').getTime();
            const ttl = getGranularTtl('2026', '1', raceDate, { now: sundayNow });
            expect(ttl).toBe(TTL_TIERS.ACTIVE_WEEKEND_MS);
        });

        it('assigns 2-minute TTL during Monday post-race steward reviews (until 23:59:59.999 UTC)', () => {
            const mondayNow = new Date('2026-03-16T23:59:00Z').getTime();
            const ttl = getGranularTtl('2026', '1', raceDate, { now: mondayNow });
            expect(ttl).toBe(TTL_TIERS.ACTIVE_WEEKEND_MS);
        });

        it('flips from active 2-minute TTL to completed 7-day TTL at Tuesday 00:00:01 UTC', () => {
            const mondayLate = new Date('2026-03-16T23:59:59Z').getTime();
            const tuesdayEarly = new Date('2026-03-17T00:00:01Z').getTime();

            expect(getGranularTtl('2026', '1', raceDate, { now: mondayLate })).toBe(TTL_TIERS.ACTIVE_WEEKEND_MS);
            expect(getGranularTtl('2026', '1', raceDate, { now: tuesdayEarly })).toBe(TTL_TIERS.COMPLETED_ROUND_MS);
        });
    });

    describe('Tier 4: Season downtime and future rounds', () => {
        it('assigns 24-hour TTL for future upcoming rounds scheduled weeks ahead', () => {
            const raceDate = '2026-07-19'; // Round 12
            const now = new Date('2026-03-15T12:00:00Z').getTime(); // Currently Round 1

            const ttl = getGranularTtl('2026', '12', raceDate, { now });
            expect(ttl).toBe(TTL_TIERS.DOWNTIME_MS);
            expect(ttl).toBe(24 * 60 * 60 * 1000);
        });

        it('assigns 24-hour TTL on Wednesday before Thursday media day of next race', () => {
            const raceDate = '2026-03-15';
            const wednesdayNow = new Date('2026-03-11T23:59:00Z').getTime();

            const ttl = getGranularTtl('2026', '1', raceDate, { now: wednesdayNow });
            expect(ttl).toBe(TTL_TIERS.DOWNTIME_MS);
        });

        it('resolves whole-season calendar query during off-week downtime to 24-hour TTL', () => {
            const mockCalendar = [
                { round: '1', date: '2026-03-15' },
                { round: '2', date: '2026-03-29' },
            ];
            // Mid-week between races: Tuesday 2026-03-17
            const midWeekNow = new Date('2026-03-17T12:00:00Z').getTime();

            const ttl = getGranularTtl('2026', undefined, undefined, {
                now: midWeekNow,
                racesCalendar: mockCalendar,
            });
            expect(ttl).toBe(TTL_TIERS.DOWNTIME_MS);
        });

        it('resolves whole-season query during active race weekend to 2-minute TTL', () => {
            const mockCalendar = [
                { round: '1', date: '2026-03-15' },
                { round: '2', date: '2026-03-29' },
            ];
            // Saturday 2026-03-14 during round 1 weekend
            const saturdayNow = new Date('2026-03-14T12:00:00Z').getTime();

            const ttl = getGranularTtl('2026', undefined, undefined, {
                now: saturdayNow,
                racesCalendar: mockCalendar,
            });
            expect(ttl).toBe(TTL_TIERS.ACTIVE_WEEKEND_MS);
        });
    });

    describe('Calendar date lookup and fallbacks', () => {
        it('looks up race date from provided calendar when round is specified without raceDate', () => {
            const mockCalendar = [
                { round: '1', date: '2026-03-15' },
                { round: '2', date: '2026-03-29' },
            ];
            const now = new Date('2026-03-20T00:00:00Z').getTime(); // Round 1 completed, round 2 future

            const ttlRound1 = getGranularTtl('2026', '1', undefined, { now, racesCalendar: mockCalendar });
            const ttlRound2 = getGranularTtl('2026', '2', undefined, { now, racesCalendar: mockCalendar });

            expect(ttlRound1).toBe(TTL_TIERS.COMPLETED_ROUND_MS); // 7 days
            expect(ttlRound2).toBe(TTL_TIERS.DOWNTIME_MS);        // 24 hours
        });

        it('handles RaceLike object passed as raceDate', () => {
            const raceObj = { round: '1', date: '2026-03-15', raceName: 'Australia GP' };
            const now = new Date('2026-03-20T00:00:00Z').getTime();

            const ttl = getGranularTtl('2026', '1', raceObj, { now });
            expect(ttl).toBe(TTL_TIERS.COMPLETED_ROUND_MS);
        });

        it('handles Date instance passed as raceDate', () => {
            const raceDateObj = new Date('2026-03-15T00:00:00Z');
            const now = new Date('2026-03-20T00:00:00Z').getTime();

            const ttl = getGranularTtl('2026', '1', raceDateObj, { now });
            expect(ttl).toBe(TTL_TIERS.COMPLETED_ROUND_MS);
        });

        it('returns conservative 10-minute fallback for invalid season inputs', () => {
            expect(getGranularTtl('invalid-season')).toBe(10 * 60 * 1000);
            expect(getGranularTtl(NaN)).toBe(10 * 60 * 1000);
        });
    });

    describe('Backward compatibility wrapper getSeasonCacheTtlMs', () => {
        it('delegates to getGranularTtl and respects custom opts overrides', () => {
            const pastTtl = getSeasonCacheTtlMs('2022');
            expect(pastTtl).toBe(TTL_TIERS.ARCHIVED_SEASON_MS);

            const customTtl = getSeasonCacheTtlMs('2022', { pastMs: 12345 });
            expect(customTtl).toBe(12345);
        });
    });
});

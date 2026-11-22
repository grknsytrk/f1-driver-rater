import { describe, expect, it } from 'vitest';
import type { CompactSeasonBundle } from '../api/staticSeasonData';
import type { Race } from '../types';
import {
    buildCircuitHistory,
    buildWeekendSessions,
    findNextUpcomingRace,
    formatLocalSessionTime,
    isSprintWeekend,
    splitCountdown,
} from './nextRace';

function makeRace(overrides: Partial<Race> = {}): Race {
    return {
        season: '2026',
        round: '22',
        raceName: 'Qatar Grand Prix',
        Circuit: {
            circuitId: 'losail',
            circuitName: 'Lusail International Circuit',
            url: '',
            Location: { locality: 'Lusail', country: 'Qatar' },
        },
        date: '2026-11-29',
        time: '16:00:00Z',
        FirstPractice: { date: '2026-11-27', time: '13:30:00Z' },
        SecondPractice: { date: '2026-11-27', time: '17:00:00Z' },
        ThirdPractice: { date: '2026-11-28', time: '14:30:00Z' },
        Qualifying: { date: '2026-11-28', time: '18:00:00Z' },
        ...overrides,
    };
}

function makeBundle(season: string, races: Race[], results: CompactSeasonBundle['results'], sprints: CompactSeasonBundle['sprints'] = []): CompactSeasonBundle {
    return {
        season,
        version: 2,
        generatedAt: `${season}-12-01T00:00:00Z`,
        isArchived: Number(season) < 2026,
        lastCompletedRound: races.length,
        totalRounds: races.length,
        races,
        results,
        qualifying: [],
        sprints,
        driverStandings: [],
        constructorStandings: [],
    };
}

describe('nextRace utilities', () => {
    it('finds the next upcoming race, preserves it during the 3h live window, and returns null when finished', () => {
        const past = makeRace({ round: '21', raceName: 'Las Vegas Grand Prix', date: '2026-11-22', time: '04:00:00Z' });
        const qatar = makeRace({ round: '22', date: '2026-11-29', time: '16:00:00Z' });
        const abuDhabi = makeRace({ round: '23', raceName: 'Abu Dhabi Grand Prix', date: '2026-12-06', time: '13:00:00Z' });

        // During Qatar race live window (start + 1h): Qatar is still next/live
        const duringQatar = new Date('2026-11-29T17:00:00Z').getTime();
        expect(findNextUpcomingRace([abuDhabi, past, qatar], duringQatar)?.round).toBe('22');

        // After Qatar 3h buffer (start + 3h01m): advances to Abu Dhabi
        const afterQatar = new Date('2026-11-29T19:01:00Z').getTime();
        expect(findNextUpcomingRace([abuDhabi, past, qatar], afterQatar)?.round).toBe('23');

        // After Abu Dhabi 3h buffer: null
        const seasonOver = new Date('2026-12-06T16:30:00Z').getTime();
        expect(findNextUpcomingRace([abuDhabi, past, qatar], seasonOver)).toBeNull();
    });

    it('builds sorted weekend sessions for standard and sprint weekends with lifecycle statuses', () => {
        const standard = makeRace();
        expect(isSprintWeekend(standard)).toBe(false);

        // Between FP2 finish (18:00Z on 27th) and FP3 start (14:30Z on 28th) -> FP3 is next
        const nowBeforeFp3 = new Date('2026-11-28T10:00:00Z').getTime();
        const standardSessions = buildWeekendSessions(standard, nowBeforeFp3);
        expect(standardSessions.map(s => [s.key, s.status])).toEqual([
            ['fp1', 'completed'],
            ['fp2', 'completed'],
            ['fp3', 'next'],
            ['quali', 'upcoming'],
            ['race', 'upcoming'],
        ]);

        const sprintWeekend = makeRace({
            SecondPractice: undefined,
            ThirdPractice: undefined,
            SprintQualifying: { date: '2026-11-27', time: '17:30:00Z' },
            Sprint: { date: '2026-11-28', time: '14:00:00Z' },
            Qualifying: { date: '2026-11-28', time: '18:00:00Z' },
        });
        expect(isSprintWeekend(sprintWeekend)).toBe(true);

        // During Sprint (14:20Z on 28th)
        const duringSprint = new Date('2026-11-28T14:20:00Z').getTime();
        const sprintSessions = buildWeekendSessions(sprintWeekend, duringSprint);
        expect(sprintSessions.map(s => [s.key, s.status])).toEqual([
            ['fp1', 'completed'],
            ['sq', 'completed'],
            ['sprint', 'live'],
            ['quali', 'next'],
            ['race', 'upcoming'],
        ]);
    });

    it('splits countdown intervals accurately and detects live and finished states', () => {
        const target = new Date('2026-11-29T16:00:00Z').getTime();

        const before = splitCountdown(target, new Date('2026-11-27T13:29:15Z').getTime());
        expect(before).toEqual({
            totalMs: (2 * 86400 + 2 * 3600 + 30 * 60 + 45) * 1000,
            days: 2,
            hours: 2,
            minutes: 30,
            seconds: 45,
            isLive: false,
            isFinished: false,
        });

        const live = splitCountdown(target, new Date('2026-11-29T17:15:00Z').getTime());
        expect(live.isLive).toBe(true);
        expect(live.isFinished).toBe(false);

        const done = splitCountdown(target, new Date('2026-11-29T19:30:00Z').getTime());
        expect(done.isLive).toBe(false);
        expect(done.isFinished).toBe(true);
    });

    it('formats session timestamps in local timezones and shows TBA when clock time is absent', () => {
        const startMs = new Date('2026-11-27T13:30:00Z').getTime();
        const istanbul = formatLocalSessionTime(
            { date: '2026-11-27', time: '13:30:00Z', startMs, hasTime: true },
            'Europe/Istanbul',
        );
        expect(istanbul).toEqual({ dayLabel: 'FRI 27 NOV', timeLabel: '16:30' });

        const utc = formatLocalSessionTime(
            { date: '2026-11-27', time: '13:30:00Z', startMs, hasTime: true },
            'UTC',
        );
        expect(utc).toEqual({ dayLabel: 'FRI 27 NOV', timeLabel: '13:30' });

        const tba = formatLocalSessionTime(
            { date: '2026-11-27', time: undefined, startMs: 0, hasTime: false },
            'Europe/Istanbul',
        );
        expect(tba).toEqual({ dayLabel: 'FRI 27 NOV', timeLabel: 'TBA' });
    });

    it('aggregates circuit winners (newest first, including double-headers) and top points scorers (race + sprint)', () => {
        const redBullRing2020 = [
            makeRace({ season: '2020', round: '1', raceName: 'Austrian Grand Prix', date: '2020-07-05', Circuit: { circuitId: 'red_bull_ring', circuitName: 'Red Bull Ring', url: '', Location: { locality: 'Spielberg', country: 'Austria' } } }),
            makeRace({ season: '2020', round: '2', raceName: 'Styrian Grand Prix', date: '2020-07-12', Circuit: { circuitId: 'red_bull_ring', circuitName: 'Red Bull Ring', url: '', Location: { locality: 'Spielberg', country: 'Austria' } } }),
        ];
        const redBullRing2023 = [
            makeRace({ season: '2023', round: '9', raceName: 'Austrian Grand Prix', date: '2023-07-02', Circuit: { circuitId: 'red_bull_ring', circuitName: 'Red Bull Ring', url: '', Location: { locality: 'Spielberg', country: 'Austria' } } }),
        ];

        const bundle2020 = makeBundle('2020', redBullRing2020, [
            { round: '1', raceName: 'Austrian Grand Prix', date: '2020-07-05', driverId: 'bottas', driverName: 'Valtteri Bottas', constructorId: 'mercedes', constructorName: 'Mercedes', position: 1, points: 25, status: 'Finished', gridPosition: 1 },
            { round: '1', raceName: 'Austrian Grand Prix', date: '2020-07-05', driverId: 'leclerc', driverName: 'Charles Leclerc', constructorId: 'ferrari', constructorName: 'Ferrari', position: 2, points: 18, status: 'Finished', gridPosition: 7 },
            { round: '2', raceName: 'Styrian Grand Prix', date: '2020-07-12', driverId: 'hamilton', driverName: 'Lewis Hamilton', constructorId: 'mercedes', constructorName: 'Mercedes', position: 1, points: 25, status: 'Finished', gridPosition: 1 },
            { round: '2', raceName: 'Styrian Grand Prix', date: '2020-07-12', driverId: 'bottas', driverName: 'Valtteri Bottas', constructorId: 'mercedes', constructorName: 'Mercedes', position: 2, points: 18, status: 'Finished', gridPosition: 4 },
        ]);

        const bundle2023 = makeBundle('2023', redBullRing2023, [
            { round: '9', raceName: 'Austrian Grand Prix', date: '2023-07-02', driverId: 'max_verstappen', driverName: 'Max Verstappen', constructorId: 'red_bull', constructorName: 'Red Bull', position: 1, points: 26, status: 'Finished', gridPosition: 1 },
            { round: '9', raceName: 'Austrian Grand Prix', date: '2023-07-02', driverId: 'leclerc', driverName: 'Charles Leclerc', constructorId: 'ferrari', constructorName: 'Ferrari', position: 2, points: 18, status: 'Finished', gridPosition: 2 },
        ], [
            { round: '9', driverId: 'max_verstappen', driverName: 'Max Verstappen', constructorId: 'red_bull', constructorName: 'Red Bull', position: 1, points: 8, status: 'Finished' },
        ]);

        const history = buildCircuitHistory('red_bull_ring', [bundle2020, bundle2023], 6, 5);
        expect(history.totalRaces).toBe(3);
        expect(history.fromYear).toBe('2020');
        expect(history.toYear).toBe('2023');
        expect(history.winners.map(w => `${w.season}-R${w.round}:${w.driverId}`)).toEqual([
            '2023-R9:max_verstappen',
            '2020-R2:hamilton',
            '2020-R1:bottas',
        ]);
        expect(history.topScorers.map(s => [s.driverId, s.totalPoints, s.wins, s.podiums])).toEqual([
            ['bottas', 43, 1, 2],
            ['leclerc', 36, 0, 2],
            ['max_verstappen', 34, 1, 1],
            ['hamilton', 25, 1, 1],
        ]);

        const debutHistory = buildCircuitHistory('madrid', [bundle2020, bundle2023]);
        expect(debutHistory.totalRaces).toBe(0);
        expect(debutHistory.fromYear).toBeNull();
        expect(debutHistory.winners).toEqual([]);
        expect(debutHistory.topScorers).toEqual([]);
    });
});

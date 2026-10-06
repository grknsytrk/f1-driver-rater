import { describe, expect, it } from 'vitest';
import type { ConstructorStanding, SeasonQualifyingResult, SeasonRaceResult } from '../api/f1Api';
import type { AverageRating } from '../types';
import {
    buildComparisonRows,
    buildTeamOptions,
    buildTeamStats,
    calculateTeamH2H,
    countCategoryWins,
    getTeamDrivers,
    resolveTeamSelection,
} from './teamVersus';

function race(round: string, driverId: string, constructorId: string, position: number | null): SeasonRaceResult {
    return {
        round,
        raceName: 'Test Grand Prix',
        date: '2024-03-02',
        driverId,
        driverName: driverId.toUpperCase(),
        constructorId,
        constructorName: constructorId.toUpperCase(),
        position,
        points: 0,
        status: position === null ? 'Retired' : 'Finished',
    };
}

function quali(round: string, driverId: string, constructorId: string, position: number): SeasonQualifyingResult {
    return { round, driverId, driverName: driverId.toUpperCase(), constructorId, constructorName: constructorId.toUpperCase(), position };
}

function average(driverId: string, constructorId: string, ratings: number[]): AverageRating {
    return {
        driverId,
        driverName: driverId.toUpperCase(),
        constructorId,
        constructorName: constructorId.toUpperCase(),
        averageRating: parseFloat((ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(2)),
        totalRaces: ratings.length,
        ratings,
    };
}

const standings: ConstructorStanding[] = [
    { constructorId: 'mclaren', constructorName: 'McLaren', position: 1, points: 400, wins: 8 },
    { constructorId: 'ferrari', constructorName: 'Ferrari', position: 2, points: 300, wins: 3 },
    { constructorId: 'haas', constructorName: 'Haas', position: 3, points: 50, wins: 0 },
];

describe('buildTeamOptions', () => {
    it('orders active teams by WCC position and ignores standings-only teams', () => {
        const results = [
            race('1', 'ver', 'haas', 5),
            race('1', 'nor', 'mclaren', 1),
            race('1', 'lec', 'ferrari', 2),
        ];

        const options = buildTeamOptions(results, [], [], standings);

        expect(options.map(option => option.teamId)).toEqual(['mclaren', 'ferrari', 'haas']);
        expect(options[0].teamName).toBe('McLaren');
    });

    it('falls back to qualifying and then ratings when race data is missing', () => {
        expect(buildTeamOptions([], [quali('1', 'a', 'x', 1)], [], []).map(o => o.teamId)).toEqual(['x']);
        expect(buildTeamOptions([], [], [average('a', 'y', [7])], []).map(o => o.teamId)).toEqual(['y']);
    });
});

describe('resolveTeamSelection', () => {
    const ids = ['mclaren', 'ferrari', 'haas'];

    it('keeps a valid selection', () => {
        expect(resolveTeamSelection('haas', 'ferrari', ids)).toEqual(['haas', 'ferrari']);
    });

    it('defaults to the top two teams when nothing is selected', () => {
        expect(resolveTeamSelection(null, undefined, ids)).toEqual(['mclaren', 'ferrari']);
    });

    it('replaces invalid ids with safe defaults', () => {
        expect(resolveTeamSelection('xyz', 'xyz', ids)).toEqual(['mclaren', 'ferrari']);
        expect(resolveTeamSelection('xyz', 'mclaren', ids)).toEqual(['ferrari', 'mclaren']);
        expect(resolveTeamSelection('ferrari', 'nope', ids)).toEqual(['ferrari', 'mclaren']);
    });

    it('never returns the same team twice', () => {
        expect(resolveTeamSelection('ferrari', 'ferrari', ids)).toEqual(['ferrari', 'mclaren']);
    });

    it('returns null with fewer than two teams', () => {
        expect(resolveTeamSelection('a', 'b', ['a'])).toBeNull();
    });
});

describe('buildTeamStats', () => {
    it('pools every individual rating, counts wins/podiums/DNFs and reads the WCC row', () => {
        const results = [
            race('1', 'nor', 'mclaren', 1),
            race('1', 'pia', 'mclaren', 3),
            race('2', 'nor', 'mclaren', 4),
            race('2', 'pia', 'mclaren', null),
        ];
        const averages = [average('nor', 'mclaren', [8, 9]), average('pia', 'mclaren', [7])];

        const stats = buildTeamStats('mclaren', 'McLaren', results, averages, standings);

        expect(stats.avgRating).toBe(8);
        expect(stats.ratedRaces).toBe(3);
        expect(stats.wins).toBe(1);
        expect(stats.podiums).toBe(2);
        expect(stats.dnfs).toBe(1);
        expect(stats.wccPosition).toBe(1);
        expect(stats.wccPoints).toBe(400);
    });

    it('returns nulls when there is no rating or standing', () => {
        const stats = buildTeamStats('unknown', 'Unknown', [], [], []);

        expect(stats.avgRating).toBeNull();
        expect(stats.wccPosition).toBeNull();
        expect(stats.wins).toBe(0);
    });
});

describe('calculateTeamH2H', () => {
    it('compares the best finisher of each team per round', () => {
        const results = [
            // R1: A best P2 vs B best P1 -> B
            race('1', 'a1', 'A', 2), race('1', 'a2', 'A', 8), race('1', 'b1', 'B', 1), race('1', 'b2', 'B', 9),
            // R2: A best P3 vs B best P5 -> A
            race('2', 'a1', 'A', 3), race('2', 'a2', 'A', 10), race('2', 'b1', 'B', 5), race('2', 'b2', 'B', 6),
        ];

        const h2h = calculateTeamH2H('A', 'B', results, []);

        expect(h2h).toMatchObject({ raceWinsA: 1, raceWinsB: 1, totalRaces: 2 });
    });

    it('awards the round to the only team with a classified finisher and skips double DNF rounds', () => {
        const results = [
            race('1', 'a1', 'A', null), race('1', 'a2', 'A', null), race('1', 'b1', 'B', 12), race('1', 'b2', 'B', null),
            race('2', 'a1', 'A', 4), race('2', 'b1', 'B', null),
            race('3', 'a1', 'A', null), race('3', 'b1', 'B', null),
        ];

        const h2h = calculateTeamH2H('A', 'B', results, []);

        expect(h2h).toMatchObject({ raceWinsA: 1, raceWinsB: 1, totalRaces: 2 });
    });

    it('ignores rounds where only one team took part', () => {
        const results = [race('1', 'a1', 'A', 1), race('2', 'a1', 'A', 1), race('2', 'b1', 'B', 2)];

        expect(calculateTeamH2H('A', 'B', results, []).totalRaces).toBe(1);
    });

    it('compares qualifying with the best position per team', () => {
        const qualifying = [
            quali('1', 'a1', 'A', 1), quali('1', 'a2', 'A', 15), quali('1', 'b1', 'B', 2), quali('1', 'b2', 'B', 3),
            quali('2', 'a1', 'A', 6), quali('2', 'b1', 'B', 4),
        ];

        const h2h = calculateTeamH2H('A', 'B', [], qualifying);

        expect(h2h).toMatchObject({ qualiWinsA: 1, qualiWinsB: 1, totalQualis: 2, totalRaces: 0 });
    });

    it('returns zeroes for empty data', () => {
        expect(calculateTeamH2H('A', 'B', [], [])).toEqual({
            raceWinsA: 0, raceWinsB: 0, totalRaces: 0, qualiWinsA: 0, qualiWinsB: 0, totalQualis: 0,
        });
    });
});

describe('getTeamDrivers', () => {
    it('returns the two drivers with most races and attaches their ratings', () => {
        const results = [
            race('1', 'd1', 'T', 1), race('1', 'd2', 'T', 2),
            race('2', 'd1', 'T', 1), race('2', 'd2', 'T', 2),
            race('3', 'd3', 'T', 5), // reserve driver, single race
        ];
        const averages = [average('d1', 'T', [9]), average('d2', 'T', [6])];

        const drivers = getTeamDrivers('T', results, averages);

        expect(drivers.map(d => d.driverId)).toEqual(['d1', 'd2']);
        expect(drivers[0].averageRating).toBe(9);
    });

    it('works from ratings alone when race data is missing', () => {
        const drivers = getTeamDrivers('T', [], [average('d1', 'T', [7, 8])]);

        expect(drivers).toHaveLength(1);
        expect(drivers[0].races).toBe(2);
    });
});

describe('buildComparisonRows', () => {
    const a = { teamId: 'A', teamName: 'A', avgRating: 8, ratedRaces: 4, wccPosition: 1, wccPoints: 300, wins: 5, podiums: 8, dnfs: 3 };
    const b = { teamId: 'B', teamName: 'B', avgRating: 7, ratedRaces: 4, wccPosition: 2, wccPoints: 100, wins: 5, podiums: 2, dnfs: 1 };
    const h2h = { raceWinsA: 6, raceWinsB: 2, totalRaces: 8, qualiWinsA: 1, qualiWinsB: 3, totalQualis: 4 };

    it('picks the winner per row, treating position and DNFs as lower-is-better', () => {
        const rows = Object.fromEntries(buildComparisonRows(a, b, h2h).map(row => [row.key, row]));

        expect(rows.avgRating.winner).toBe('a');
        expect(rows.wccPosition.winner).toBe('a');
        expect(rows.wccPosition.displayA).toBe('P1');
        expect(rows.wccPoints.winner).toBe('a');
        expect(rows.raceH2H.winner).toBe('a');
        expect(rows.raceH2H.note).toBe('8 races');
        expect(rows.qualiH2H.winner).toBe('b');
        expect(rows.wins.winner).toBe('tie');
        expect(rows.podiums.winner).toBe('a');
        expect(rows.dnfs.winner).toBe('b');
        expect(rows.dnfs.shareA).toBeCloseTo(0.25);
    });

    it('shows dashes and no winner when data is missing or unavailable', () => {
        const noRatings = { ...a, avgRating: null };
        const rows = Object.fromEntries(
            buildComparisonRows(noRatings, b, h2h, { raceAvailable: false, qualiAvailable: true }).map(row => [row.key, row]),
        );

        expect(rows.avgRating).toMatchObject({ displayA: '—', displayB: '7.00', winner: 'none', shareA: null });
        expect(rows.raceH2H).toMatchObject({ displayA: '—', displayB: '—', winner: 'none' });
    });

    it('counts the categories each team won', () => {
        const rows = buildComparisonRows(a, b, h2h);

        expect(countCategoryWins(rows)).toEqual([5, 2]);
    });
});

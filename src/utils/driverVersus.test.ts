import { describe, expect, it } from 'vitest';
import type { DriverStanding, SeasonQualifyingResult, SeasonRaceResult } from '../api/f1Api';
import type { AverageRating } from '../types';
import {
    buildDriverComparisonRows,
    buildDriverOptions,
    buildDriverSeasonStats,
    calculateDirectDriverH2H,
    getAvailableVersusSeasons,
    resolveDistinctBarColors,
    resolveDriverVersusSelection,
    type DriverSeasonDataset,
} from './driverVersus';

function race(
    round: string,
    driverId: string,
    driverName: string,
    constructorId: string,
    constructorName: string,
    position: number | null,
    points = 0,
): SeasonRaceResult {
    return {
        round,
        raceName: `Round ${round}`,
        date: '2025-03-01',
        driverId,
        driverName,
        constructorId,
        constructorName,
        position,
        points,
        status: position === null ? 'Retired' : 'Finished',
    };
}

function quali(
    round: string,
    driverId: string,
    driverName: string,
    constructorId: string,
    constructorName: string,
    position: number,
): SeasonQualifyingResult {
    return {
        round,
        raceName: `Round ${round}`,
        date: '2025-03-01',
        driverId,
        driverName,
        constructorId,
        constructorName,
        position,
        bestTimeSeconds: 80 + position * 0.1,
    };
}

function standing(
    position: string,
    driverId: string,
    givenName: string,
    familyName: string,
    constructorId: string,
    constructorName: string,
    points: string,
    wins = '0',
): DriverStanding {
    return {
        position,
        positionText: position,
        points,
        wins,
        Driver: { driverId, givenName, familyName, url: '' },
        Constructors: [{ constructorId, name: constructorName, url: '' }],
    };
}

const sampleDataset: DriverSeasonDataset = {
    driverStandings: [
        standing('2', 'leclerc', 'Charles', 'Leclerc', 'ferrari', 'Ferrari', '43'),
        standing('1', 'norris', 'Lando', 'Norris', 'mclaren', 'McLaren', '44'),
        standing('3', 'max_verstappen', 'Max', 'Verstappen', 'red_bull', 'Red Bull', '25'),
    ],
    raceResults: [
        race('1', 'norris', 'Lando Norris', 'mclaren', 'McLaren', 1, 25),
        race('1', 'leclerc', 'Charles Leclerc', 'ferrari', 'Ferrari', 2, 18),
        race('1', 'max_verstappen', 'Max Verstappen', 'red_bull', 'Red Bull', null, 0),
        race('2', 'leclerc', 'Charles Leclerc', 'ferrari', 'Ferrari', 1, 25),
        race('2', 'norris', 'Lando Norris', 'mclaren', 'McLaren', 2, 18),
        race('2', 'max_verstappen', 'Max Verstappen', 'red_bull', 'Red Bull', null, 0),
        race('3', 'norris', 'Lando Norris', 'mclaren', 'McLaren', 3, 15),
        race('3', 'leclerc', 'Charles Leclerc', 'ferrari', 'Ferrari', 4, 12),
    ],
    qualiResults: [
        quali('1', 'norris', 'Lando Norris', 'mclaren', 'McLaren', 1),
        quali('1', 'leclerc', 'Charles Leclerc', 'ferrari', 'Ferrari', 2),
        quali('2', 'leclerc', 'Charles Leclerc', 'ferrari', 'Ferrari', 1),
        quali('2', 'norris', 'Lando Norris', 'mclaren', 'McLaren', 3),
    ],
    raceStatus: 'ok',
    qualiStatus: 'ok',
};

const sampleAverages: AverageRating[] = [
    {
        driverId: 'norris',
        driverName: 'Lando Norris',
        constructorId: 'mclaren',
        constructorName: 'McLaren',
        averageRating: 8.8,
        totalRaces: 3,
        ratings: [9, 9, 8.5],
    },
    {
        driverId: 'leclerc',
        driverName: 'Charles Leclerc',
        constructorId: 'ferrari',
        constructorName: 'Ferrari',
        averageRating: 8.4,
        totalRaces: 3,
        ratings: [8, 9.5, 7.7],
    },
];

describe('driverVersus utilities', () => {
    it('returns descending seasons from current/2026 down to 2018', () => {
        const seasons = getAvailableVersusSeasons(2026);
        expect(seasons).toEqual(['2026', '2025', '2024', '2023', '2022', '2021', '2020', '2019', '2018']);
    });

    it('builds deduplicated driver options sorted by WDC position then name', () => {
        const options = buildDriverOptions(sampleDataset, [
            ...sampleAverages,
            {
                driverId: 'bearman',
                driverName: 'Oliver Bearman',
                constructorId: 'haas',
                constructorName: 'Haas',
                averageRating: 7.5,
                totalRaces: 1,
                ratings: [7.5],
            },
        ]);

        expect(options.map(o => o.driverId)).toEqual(['norris', 'leclerc', 'max_verstappen', 'bearman']);
        expect(options[0].wdcPosition).toBe(1);
        expect(options[3].wdcPosition).toBeNull();
    });

    it('resolves cross-season and same-driver era selections while preventing identical same-season self-matchups', () => {
        const seasons = ['2026', '2025', '2023'];
        const options2026 = buildDriverOptions(sampleDataset, sampleAverages);
        const options2023 = buildDriverOptions(sampleDataset, []);

        // Cross-season different drivers
        expect(
            resolveDriverVersusSelection(
                { sa: '2023', da: 'max_verstappen', sb: '2026', db: 'norris' },
                '2026',
                seasons,
                options2023,
                options2026,
            ),
        ).toEqual({
            seasonA: '2023',
            driverA: 'max_verstappen',
            seasonB: '2026',
            driverB: 'norris',
        });

        // Same driver across distinct seasons IS allowed
        expect(
            resolveDriverVersusSelection(
                { sa: '2023', da: 'max_verstappen', sb: '2025', db: 'max_verstappen' },
                '2026',
                seasons,
                options2023,
                options2026,
            ),
        ).toEqual({
            seasonA: '2023',
            driverA: 'max_verstappen',
            seasonB: '2025',
            driverB: 'max_verstappen',
        });

        // Same driver in the same season falls back to second option
        expect(
            resolveDriverVersusSelection(
                { sa: '2026', da: 'norris', sb: '2026', db: 'norris' },
                '2026',
                seasons,
                options2026,
                options2026,
            ),
        ).toEqual({
            seasonA: '2026',
            driverA: 'norris',
            seasonB: '2026',
            driverB: 'leclerc',
        });

        // Invalid seasons/drivers fall back cleanly
        expect(
            resolveDriverVersusSelection(
                { sa: '1999', da: 'ghost', sb: '2050', db: 'missing' },
                '2026',
                seasons,
                options2026,
                options2026,
            ),
        ).toEqual({
            seasonA: '2026',
            driverA: 'norris',
            seasonB: '2026',
            driverB: 'leclerc',
        });
    });

    it('computes season stats accurately including pointsPerRace, averages, DNFs, personal and community ratings', () => {
        const stats = buildDriverSeasonStats(
            '2025',
            'norris',
            sampleDataset,
            sampleAverages,
            [
                { driverId: 'norris', round: '1', averageRating: 9.0, voteCount: 10 },
                { driverId: 'norris', round: '2', averageRating: 8.0, voteCount: 20 },
            ],
            'race',
        );

        expect(stats.wdcPosition).toBe(1);
        expect(stats.wdcPoints).toBe(44);
        expect(stats.racesStarted).toBe(3);
        expect(stats.pointsPerRace).toBeCloseTo(44 / 3, 5);
        expect(stats.wins).toBe(1);
        expect(stats.podiums).toBe(3);
        expect(stats.poles).toBe(1);
        expect(stats.avgFinish).toBeCloseTo(2, 5);
        expect(stats.avgQuali).toBeCloseTo(2, 5);
        expect(stats.dnfs).toBe(0);
        expect(stats.personalAvg).toBe(8.8);
        expect(stats.personalRatedRaces).toBe(3);
        expect(stats.communityAvg).toBeCloseTo(8.5, 5);
        expect(stats.communityVotes).toBe(30);
    });

    it('computes direct H2H only when both drivers finished (excluding DNFs and classified-distance Retired results)', () => {
        const mixedDataset: SeasonRaceResult[] = [
            // R1: Norris P1 Finished vs Leclerc P2 Finished -> Norris wins
            ...sampleDataset.raceResults,
            // R3: Max classified distance P15 but Retired -> must NOT count
            {
                round: '3',
                raceName: 'Round 3',
                date: '2025-03-01',
                driverId: 'max_verstappen',
                driverName: 'Max Verstappen',
                constructorId: 'red_bull',
                constructorName: 'Red Bull',
                position: 15,
                points: 0,
                status: 'Retired',
            },
            // R4: Double DNF -> must NOT count
            race('4', 'norris', 'Lando Norris', 'mclaren', 'McLaren', null, 0),
            race('4', 'max_verstappen', 'Max Verstappen', 'red_bull', 'Red Bull', null, 0),
            // R5: Both finish (Max Lapped ahead vs Norris Lapped) -> Max wins
            {
                round: '5',
                raceName: 'Round 5',
                date: '2025-03-01',
                driverId: 'max_verstappen',
                driverName: 'Max Verstappen',
                constructorId: 'red_bull',
                constructorName: 'Red Bull',
                position: 8,
                points: 4,
                status: 'Lapped',
            },
            {
                round: '5',
                raceName: 'Round 5',
                date: '2025-03-01',
                driverId: 'norris',
                driverName: 'Lando Norris',
                constructorId: 'mclaren',
                constructorName: 'McLaren',
                position: 9,
                points: 2,
                status: '+1 Lap',
            },
        ];

        const h2h = calculateDirectDriverH2H(
            'norris',
            'max_verstappen',
            mixedDataset,
            sampleDataset.qualiResults,
        );

        // R1 & R2 excluded (Max DNF), R3 excluded (Max Retired P15), R4 excluded (double DNF), R5 counted (Max P8 vs Norris P9)
        expect(h2h.raceWinsA).toBe(0);
        expect(h2h.raceWinsB).toBe(1);
        expect(h2h.totalRaces).toBe(1);
        expect(h2h.totalQualis).toBe(0);
    });

    it('includes direct Race/Quali H2H only for same-season matchups and distinguishes identical team colors', () => {
        const statsA = buildDriverSeasonStats('2026', 'norris', sampleDataset, sampleAverages, [], 'race');
        const statsB = buildDriverSeasonStats('2026', 'leclerc', sampleDataset, sampleAverages, [], 'race');
        const h2h = calculateDirectDriverH2H('norris', 'leclerc', sampleDataset.raceResults, sampleDataset.qualiResults);

        const sameSeasonRows = buildDriverComparisonRows(statsA, statsB, { directH2H: h2h });
        const raceRow = sameSeasonRows.find(r => r.key === 'raceH2H');
        expect(raceRow).toBeDefined();
        expect(sameSeasonRows.some(r => r.key === 'qualiH2H')).toBe(true);
        expect(raceRow?.displayA).toBe('2');
        expect(raceRow?.displayB).toBe('1');
        expect(raceRow?.note).toContain('both finished');

        const crossSeasonRows = buildDriverComparisonRows(statsA, { ...statsB, season: '2023' }, { directH2H: null });
        expect(crossSeasonRows.some(r => r.key === 'raceH2H')).toBe(false);
        expect(crossSeasonRows.some(r => r.key === 'qualiH2H')).toBe(false);

        expect(resolveDistinctBarColors('#3671C6', '#3671C6')).toEqual(['#3671C6', '#FACC15']);
        expect(resolveDistinctBarColors('#FACC15', '#FACC15')).toEqual(['#FACC15', '#E10600']);
        expect(resolveDistinctBarColors('#FF8000', '#E8002D')).toEqual(['#FF8000', '#E8002D']);
    });
});

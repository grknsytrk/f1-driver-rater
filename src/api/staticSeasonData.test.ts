import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withMinimumDelay } from '../utils/delay';
import {
    clearStaticSeasonCache,
    detectNewlyCompletedRounds,
    getStaticConstructorStandings,
    getStaticDriverStandings,
    getStaticRaces,
    getStaticRoundQualifying,
    getStaticRoundResults,
    getStaticSeasonBundle,
    getStaticSeasonQualifying,
    getStaticSeasonResults,
    getStaticSeasonSprints,
    isRoundInStaticBundle,
    loadStaticSeasonData,
    mapQualifyingResultsToSeasonQualifying,
    mapRaceResultsToSeasonResults,
    mergeSeasonQualifying,
    mergeSeasonResults,
    mergeSeasonSprints,
    type CompactSeasonBundle,
} from './staticSeasonData';
import {
    getAllSeasonQualifying,
    getAllSeasonResults,
    getAllSeasonSprints,
    getConstructorStandings,
    getDriverSeasonStats,
    getDriverStandings,
    resetCacheSignal,
    wasLastResponseFromCache,
} from './f1Api';
import { getJolpicaQueueStatus, resetJolpicaQueue } from './jolpicaQueue';
import type { RaceResult } from '../types';

const mock2023Bundle: CompactSeasonBundle = {
    season: '2023',
    version: 1,
    generatedAt: '2024-01-01T00:00:00Z',
    isArchived: true,
    lastCompletedRound: 22,
    totalRounds: 22,
    races: [
        {
            season: '2023',
            round: '1',
            raceName: 'Bahrain Grand Prix',
            Circuit: {
                circuitId: 'bahrain',
                circuitName: 'Bahrain International Circuit',
                url: '',
                Location: { locality: 'Sakhir', country: 'Bahrain' },
            },
            date: '2023-03-05',
        },
    ],
    results: [
        {
            round: '1',
            raceName: 'Bahrain Grand Prix',
            date: '2023-03-05',
            driverId: 'max_verstappen',
            driverName: 'Max Verstappen',
            constructorId: 'red_bull',
            constructorName: 'Red Bull',
            gridPosition: 1,
            position: 1,
            positionText: '1',
            points: 25,
            status: 'Finished',
            started: true,
            raceTimeGapSeconds: 0,
        },
    ],
    qualifying: [
        {
            round: '1',
            raceName: 'Bahrain Grand Prix',
            date: '2023-03-04',
            driverId: 'max_verstappen',
            driverName: 'Max Verstappen',
            constructorId: 'red_bull',
            constructorName: 'Red Bull',
            position: 1,
            bestTimeSeconds: 89.708,
        },
    ],
    sprints: [
        {
            round: '4',
            driverId: 'perez',
            driverName: 'Sergio Perez',
            constructorId: 'red_bull',
            constructorName: 'Red Bull',
            position: 1,
            positionText: '1',
            points: 8,
            status: 'Finished',
        },
    ],
    driverStandings: [
        {
            position: '1',
            positionText: '1',
            points: '575',
            wins: '19',
            Driver: {
                driverId: 'max_verstappen',
                givenName: 'Max',
                familyName: 'Verstappen',
                url: '',
            },
            Constructors: [{ constructorId: 'red_bull', name: 'Red Bull', url: '' }],
        },
    ],
    constructorStandings: [
        {
            constructorId: 'red_bull',
            constructorName: 'Red Bull',
            position: 1,
            points: 860,
            wins: 21,
        },
    ],
    roundResults: {
        '1': [
            {
                number: '1',
                position: '1',
                positionText: '1',
                points: '25',
                Driver: { driverId: 'max_verstappen', givenName: 'Max', familyName: 'Verstappen', url: '' },
                Constructor: { constructorId: 'red_bull', name: 'Red Bull', url: '' },
                grid: '1',
                laps: '57',
                status: 'Finished',
                Time: { millis: '5636736', time: '1:33:56.736' },
            },
        ],
    },
    roundQualifying: {
        '1': [
            {
                position: '1',
                Driver: { driverId: 'max_verstappen', givenName: 'Max', familyName: 'Verstappen', url: '' },
                Constructor: { constructorId: 'red_bull', name: 'Red Bull', url: '' },
                Q1: '1:31.295',
                Q2: '1:30.503',
                Q3: '1:29.708',
            },
        ],
    },
};

describe('Milestone 4 (Requirement R4) - Static Season Data Pipeline', () => {
    beforeEach(() => {
        clearStaticSeasonCache();
        resetJolpicaQueue(false);
        resetCacheSignal();
        localStorage.clear();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        clearStaticSeasonCache();
    });

    describe('1. Archived Season Bundle Loading (2020–2025)', () => {
        it('loads archived 2023 season bundle and hydrates SeasonRaceResult[] with all mapped fields', async () => {
            vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
                ok: true,
                json: async () => mock2023Bundle,
            } as Response);

            const bundle = await loadStaticSeasonData('2023');
            expect(bundle).not.toBeNull();
            expect(bundle?.season).toBe('2023');
            expect(bundle?.isArchived).toBe(true);

            const results = await getStaticSeasonResults('2023');
            expect(results).toHaveLength(1);
            expect(results![0]).toEqual({
                round: '1',
                raceName: 'Bahrain Grand Prix',
                date: '2023-03-05',
                driverId: 'max_verstappen',
                driverName: 'Max Verstappen',
                constructorId: 'red_bull',
                constructorName: 'Red Bull',
                gridPosition: 1,
                position: 1,
                positionText: '1',
                points: 25,
                status: 'Finished',
                started: true,
                raceTimeGapSeconds: 0,
            });
        });

        it('loads archived season qualifying and sprints with exact field mappings', async () => {
            vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
                ok: true,
                json: async () => mock2023Bundle,
            } as Response);

            const qualifying = await getStaticSeasonQualifying('2023');
            expect(qualifying).toHaveLength(1);
            expect(qualifying![0].bestTimeSeconds).toBeCloseTo(89.708, 3);
            expect(qualifying![0].driverId).toBe('max_verstappen');

            const sprints = await getStaticSeasonSprints('2023');
            expect(sprints).toHaveLength(1);
            expect(sprints![0].driverId).toBe('perez');
            expect(sprints![0].points).toBe(8);
        });

        it('loads archived driver and constructor standings directly from static bundle', async () => {
            vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
                ok: true,
                json: async () => mock2023Bundle,
            } as Response);

            const driverStandings = await getStaticDriverStandings('2023');
            expect(driverStandings).toHaveLength(1);
            expect(driverStandings![0].Driver.driverId).toBe('max_verstappen');
            expect(driverStandings![0].points).toBe('575');

            const constructorStandings = await getStaticConstructorStandings('2023');
            expect(constructorStandings).toHaveLength(1);
            expect(constructorStandings![0].constructorId).toBe('red_bull');
            expect(constructorStandings![0].points).toBe(860);

            const races = await getStaticRaces('2023');
            expect(races).toHaveLength(1);
            expect(races![0].raceName).toBe('Bahrain Grand Prix');
        });

        it('reports correct round presence via isRoundInStaticBundle', async () => {
            vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
                ok: true,
                json: async () => mock2023Bundle,
            } as Response);

            await loadStaticSeasonData('2023');

            expect(isRoundInStaticBundle('2023', '1')).toBe(true);
            expect(isRoundInStaticBundle('2023', '22')).toBe(true);
            expect(isRoundInStaticBundle('2023', '23')).toBe(false);
            expect(isRoundInStaticBundle('2019', '1')).toBe(false);
        });

        it('retrieves round results and qualifying from bundle', async () => {
            vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
                ok: true,
                json: async () => mock2023Bundle,
            } as Response);

            const round1Results = await getStaticRoundResults('2023', '1');
            expect(round1Results).toHaveLength(1);
            expect(round1Results![0].position).toBe('1');

            const round1Quali = await getStaticRoundQualifying('2023', '1');
            expect(round1Quali).toHaveLength(1);
            expect(round1Quali![0].Q3).toBe('1:29.708');

            const missingRound = await getStaticRoundResults('2023', '99');
            expect(missingRound).toBeNull();
        });
    });

    describe('2. In-Memory Cache Deduplication & Concurrency', () => {
        it('deduplicates concurrent requests for the same season bundle into a single fetch', async () => {
            const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
                await new Promise(r => setTimeout(r, 10));
                return {
                    ok: true,
                    json: async () => mock2023Bundle,
                } as Response;
            });

            const [b1, b2, r1, q1] = await Promise.all([
                loadStaticSeasonData('2023'),
                getStaticSeasonBundle('2023'),
                getStaticSeasonResults('2023'),
                getStaticSeasonQualifying('2023'),
            ]);

            expect(fetchSpy).toHaveBeenCalledTimes(1);
            expect(b1).toBe(mock2023Bundle);
            expect(b2).toBe(mock2023Bundle);
            expect(r1).toHaveLength(1);
            expect(q1).toHaveLength(1);
        });

        it('serves subsequent calls from warm in-memory cache without secondary HTTP fetch', async () => {
            const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
                ok: true,
                json: async () => mock2023Bundle,
            } as Response);

            await loadStaticSeasonData('2023');
            expect(fetchSpy).toHaveBeenCalledTimes(1);

            const resultsSecond = await getStaticSeasonResults('2023');
            expect(resultsSecond).toHaveLength(1);
            expect(fetchSpy).toHaveBeenCalledTimes(1);
        });

        it('clearStaticSeasonCache clears in-memory cache and allows fresh fetch', async () => {
            const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
                ok: true,
                json: async () => mock2023Bundle,
            } as Response);

            await loadStaticSeasonData('2023');
            expect(fetchSpy).toHaveBeenCalledTimes(1);

            clearStaticSeasonCache();

            await loadStaticSeasonData('2023');
            expect(fetchSpy).toHaveBeenCalledTimes(2);
        });
    });

    describe('3. Graceful Fallback & Error Resilience', () => {
        it('returns null gracefully on 404 Not Found without throwing unhandled rejection', async () => {
            vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
                ok: false,
                status: 404,
            } as Response);

            const result = await loadStaticSeasonData('2023');
            expect(result).toBeNull();
        });

        it('returns null gracefully on network failure or malformed JSON', async () => {
            vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network error'));

            const result = await loadStaticSeasonData('2023');
            expect(result).toBeNull();
        });

        it('negative cache prevents repeated 404 network spam for non-existent seasons', async () => {
            const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
                ok: false,
                status: 404,
            } as Response);

            const res1 = await loadStaticSeasonData('2023');
            expect(res1).toBeNull();
            expect(fetchSpy).toHaveBeenCalledTimes(1);

            const res2 = await loadStaticSeasonData('2023');
            expect(res2).toBeNull();
            expect(fetchSpy).toHaveBeenCalledTimes(1);
        });

        it('immediately returns null for unsupported season without network call', async () => {
            const fetchSpy = vi.spyOn(globalThis, 'fetch');

            const res = await loadStaticSeasonData('2019');
            expect(res).toBeNull();
            expect(fetchSpy).not.toHaveBeenCalled();
        });
    });

    describe('4. Active Season Incremental Live Round Merging', () => {
        const mock2026Bundle: CompactSeasonBundle = {
            season: '2026',
            version: 1,
            generatedAt: '2026-03-01T00:00:00Z',
            isArchived: false,
            lastCompletedRound: 2,
            totalRounds: 4,
            races: [
                {
                    season: '2026',
                    round: '1',
                    raceName: 'Round 1',
                    Circuit: { circuitId: 'c1', circuitName: 'C1', url: '', Location: { locality: '', country: '' } },
                    date: '2026-03-01',
                },
                {
                    season: '2026',
                    round: '2',
                    raceName: 'Round 2',
                    Circuit: { circuitId: 'c2', circuitName: 'C2', url: '', Location: { locality: '', country: '' } },
                    date: '2026-03-15',
                },
                {
                    season: '2026',
                    round: '3',
                    raceName: 'Round 3',
                    Circuit: { circuitId: 'c3', circuitName: 'C3', url: '', Location: { locality: '', country: '' } },
                    date: '2026-03-29',
                },
                {
                    season: '2026',
                    round: '4',
                    raceName: 'Round 4',
                    Circuit: { circuitId: 'c4', circuitName: 'C4', url: '', Location: { locality: '', country: '' } },
                    date: '2026-04-12',
                },
            ],
            results: [
                {
                    round: '1',
                    raceName: 'Round 1',
                    date: '2026-03-01',
                    driverId: 'norris',
                    driverName: 'Lando Norris',
                    constructorId: 'mclaren',
                    constructorName: 'McLaren',
                    gridPosition: 1,
                    position: 1,
                    positionText: '1',
                    points: 25,
                    status: 'Finished',
                    started: true,
                },
                {
                    round: '2',
                    raceName: 'Round 2',
                    date: '2026-03-15',
                    driverId: 'verstappen',
                    driverName: 'Max Verstappen',
                    constructorId: 'red_bull',
                    constructorName: 'Red Bull',
                    gridPosition: 1,
                    position: 1,
                    positionText: '1',
                    points: 25,
                    status: 'Finished',
                    started: true,
                },
            ],
            qualifying: [
                {
                    round: '1',
                    raceName: 'Round 1',
                    date: '2026-02-28',
                    driverId: 'norris',
                    driverName: 'Lando Norris',
                    constructorId: 'mclaren',
                    constructorName: 'McLaren',
                    position: 1,
                },
            ],
            sprints: [],
            driverStandings: [],
            constructorStandings: [],
        };

        it('detects newly completed rounds beyond lastCompletedRound via race calendar dates', () => {
            // Reference time is 2026-04-01: Round 3 (March 29) is completed, Round 4 (April 12) is upcoming
            const now = new Date('2026-04-01T12:00:00Z');
            const newRounds = detectNewlyCompletedRounds(mock2026Bundle, undefined, now);

            expect(newRounds).toHaveLength(1);
            expect(newRounds[0].round).toBe('3');
            expect(newRounds[0].raceName).toBe('Round 3');
        });

        it('returns empty array if season is archived', () => {
            const archivedBundle: CompactSeasonBundle = { ...mock2026Bundle, isArchived: true };
            const newRounds = detectNewlyCompletedRounds(archivedBundle);
            expect(newRounds).toEqual([]);
        });

        it('merges new round results into static baseline sorted canonically', () => {
            const newRound3Result = {
                round: '3',
                raceName: 'Round 3',
                date: '2026-03-29',
                driverId: 'leclerc',
                driverName: 'Charles Leclerc',
                constructorId: 'ferrari',
                constructorName: 'Ferrari',
                gridPosition: 2,
                position: 1,
                positionText: '1',
                points: 25,
                status: 'Finished',
                started: true,
            };

            const merged = mergeSeasonResults(mock2026Bundle.results, [newRound3Result]);
            expect(merged).toHaveLength(3);
            expect(merged.map(r => r.round)).toEqual(['1', '2', '3']);
            expect(merged[2].driverId).toBe('leclerc');
        });

        it('maps single-round RaceResult[] to canonical SeasonRaceResult[] accurately', () => {
            const rawRoundResults: RaceResult[] = [
                {
                    number: '16',
                    position: '1',
                    positionText: '1',
                    points: '25',
                    Driver: { driverId: 'leclerc', givenName: 'Charles', familyName: 'Leclerc', url: '' },
                    Constructor: { constructorId: 'ferrari', name: 'Ferrari', url: '' },
                    grid: '1',
                    laps: '57',
                    status: 'Finished',
                    Time: { millis: '5400000', time: '1:30:00.000' },
                },
                {
                    number: '4',
                    position: '2',
                    positionText: '2',
                    points: '18',
                    Driver: { driverId: 'norris', givenName: 'Lando', familyName: 'Norris', url: '' },
                    Constructor: { constructorId: 'mclaren', name: 'McLaren', url: '' },
                    grid: '2',
                    laps: '57',
                    status: 'Finished',
                    Time: { millis: '5405000', time: '+5.000' },
                },
            ];

            const mapped = mapRaceResultsToSeasonResults('3', 'Round 3', '2026-03-29', rawRoundResults);
            expect(mapped).toHaveLength(2);
            expect(mapped[0].driverId).toBe('leclerc');
            expect(mapped[0].raceTimeGapSeconds).toBe(0);
            expect(mapped[1].driverId).toBe('norris');
            expect(mapped[1].raceTimeGapSeconds).toBeCloseTo(5, 1);
        });

        it('maps qualifying results accurately', () => {
            const rawQuali = [
                {
                    position: '1',
                    Driver: { driverId: 'norris', givenName: 'Lando', familyName: 'Norris', url: '' },
                    Constructor: { constructorId: 'mclaren', name: 'McLaren', url: '' },
                    Q1: '1:30.000',
                    Q2: '1:29.500',
                    Q3: '1:29.123',
                },
            ];

            const mapped = mapQualifyingResultsToSeasonQualifying('3', 'Round 3', '2026-03-29', rawQuali);
            expect(mapped).toHaveLength(1);
            expect(mapped[0].bestTimeSeconds).toBeCloseTo(89.123, 3);
        });

        it('merges qualifying and sprint diffs seamlessly without duplicates', () => {
            const newQuali = [
                {
                    round: '2',
                    raceName: 'Round 2',
                    date: '2026-03-14',
                    driverId: 'verstappen',
                    driverName: 'Max Verstappen',
                    constructorId: 'red_bull',
                    constructorName: 'Red Bull',
                    position: 1,
                    bestTimeSeconds: 88.5,
                },
            ];
            const mergedQ = mergeSeasonQualifying(mock2026Bundle.qualifying, newQuali);
            expect(mergedQ).toHaveLength(2);

            const newSprint = [
                {
                    round: '2',
                    driverId: 'verstappen',
                    driverName: 'Max Verstappen',
                    constructorId: 'red_bull',
                    constructorName: 'Red Bull',
                    position: 1,
                    positionText: '1',
                    points: 8,
                    status: 'Finished',
                },
            ];
            const mergedS = mergeSeasonSprints(mock2026Bundle.sprints, newSprint);
            expect(mergedS).toHaveLength(1);
            expect(mergedS[0].driverId).toBe('verstappen');
        });
    });

    describe('5. Integration with delay.ts & Public f1Api', () => {
        it('signals cache hit so withMinimumDelay completes in 0ms on static bundle hit', async () => {
            vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
                ok: true,
                json: async () => mock2023Bundle,
            } as Response);

            const start = performance.now();
            const results = await withMinimumDelay(() => getAllSeasonResults('2023'), 800);
            const duration = performance.now() - start;

            expect(results).toHaveLength(1);
            expect(wasLastResponseFromCache()).toBe(true);
            expect(duration).toBeLessThan(100); // 0ms fast-path, no 800ms delay
        });

        it('verifies static bundle requests do not enter or acquire jolpicaQueue slots', async () => {
            vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
                ok: true,
                json: async () => mock2023Bundle,
            } as Response);

            await getAllSeasonResults('2023');

            const queueStatus = getJolpicaQueueStatus();
            expect(queueStatus.highQueueLength).toBe(0);
            expect(queueStatus.lowQueueLength).toBe(0);
        });

        it('resolves driver and constructor standings from static bundle for archived seasons', async () => {
            vi.spyOn(globalThis, 'fetch').mockResolvedValue({
                ok: true,
                json: async () => mock2023Bundle,
            } as Response);

            const driverStandings = await getDriverStandings('2023');
            expect(driverStandings).toHaveLength(1);
            expect(driverStandings[0].Driver.driverId).toBe('max_verstappen');
            expect(wasLastResponseFromCache()).toBe(true);

            const constructorStandings = await getConstructorStandings('2023');
            expect(constructorStandings).toHaveLength(1);
            expect(constructorStandings[0].constructorId).toBe('red_bull');
            expect(wasLastResponseFromCache()).toBe(true);
        });

        it('resolves all season qualifying and sprints from static bundle for archived seasons in 0ms', async () => {
            vi.spyOn(globalThis, 'fetch').mockResolvedValue({
                ok: true,
                json: async () => mock2023Bundle,
            } as Response);

            const qualifying = await getAllSeasonQualifying('2023');
            expect(qualifying).toHaveLength(1);
            expect(qualifying[0].driverId).toBe('max_verstappen');
            expect(wasLastResponseFromCache()).toBe(true);

            const sprints = await getAllSeasonSprints('2023');
            expect(sprints).toHaveLength(1);
            expect(sprints[0].driverId).toBe('perez');
            expect(wasLastResponseFromCache()).toBe(true);
        });

        it('computes getDriverSeasonStats from static season bundle without paginated Jolpica calls', async () => {
            vi.spyOn(globalThis, 'fetch').mockResolvedValue({
                ok: true,
                json: async () => mock2023Bundle,
            } as Response);

            const stats = await getDriverSeasonStats('2023');
            expect(stats).toHaveLength(1);
            expect(stats[0]).toMatchObject({
                driverId: 'max_verstappen',
                driverName: 'Max Verstappen',
                constructorId: 'red_bull',
                wins: 19,
                poles: 1,
                podiums: 1,
            });
            expect(wasLastResponseFromCache()).toBe(true);
        });
    });
});

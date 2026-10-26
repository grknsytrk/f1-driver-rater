import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    getAllSeasonResults,
    getAllSeasonSprints,
    getConstructorSeasonH2HRaw,
    getDriverCareerStints,
    getDriverSeasonStats,
    getRaceQualifyingResults,
    getRaceResults,
    getRaces,
} from './f1Api';

const apiGet = vi.hoisted(() => vi.fn());
vi.mock('axios', () => ({
    default: { create: () => ({ get: apiGet }), isAxiosError: () => false },
}));

beforeEach(() => {
    apiGet.mockReset();
    localStorage.clear();
    vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe.each([
    ['GP', getAllSeasonResults],
    ['sprint', getAllSeasonSprints],
] as const)('%s result availability', (_label, fetchResults) => {
    it('surfaces failed requests for the points tracker instead of returning zero results', async () => {
        const networkError = new Error('Network unavailable');
        apiGet.mockRejectedValue(networkError);
        await expect(fetchResults('2024', { throwOnError: true })).rejects.toBe(networkError);
    });

    it('preserves the existing fallback for callers that did not request strict errors', async () => {
        apiGet.mockRejectedValue(new Error('Network unavailable'));
        await expect(fetchResults('2024')).resolves.toEqual([]);
    });

    it('accepts a successful response with no published results', async () => {
        apiGet.mockResolvedValue({ data: { MRData: { total: '0', RaceTable: { Races: [] } } } });
        await expect(fetchResults('2024', { throwOnError: true })).resolves.toEqual([]);
    });
});

describe('Jolpica API caching, in-flight deduplication and pagination integrity', () => {
    it('deduplicates concurrent paginated results and calendar requests on Standings load and serves warm cache without data loss', async () => {
        const sampleRace = {
            season: '2024',
            round: '1',
            date: '2024-03-02',
            raceName: 'Bahrain Grand Prix',
            Circuit: {
                circuitId: 'bahrain',
                circuitName: 'Bahrain International Circuit',
                url: '',
                Location: { locality: 'Sakhir', country: 'Bahrain' },
            },
            Results: [
                {
                    number: '1',
                    position: '1',
                    positionText: '1',
                    points: '25',
                    grid: '1',
                    laps: '57',
                    status: 'Finished',
                    Driver: { driverId: 'max_verstappen', givenName: 'Max', familyName: 'Verstappen', code: 'VER', url: '' },
                    Constructor: { constructorId: 'red_bull', name: 'Red Bull', url: '' },
                    Time: { millis: '5500000', time: '1:31:40.000' },
                },
                {
                    number: '4',
                    position: '2',
                    positionText: '2',
                    points: '18',
                    grid: '2',
                    laps: '57',
                    status: 'Finished',
                    Driver: { driverId: 'norris', givenName: 'Lando', familyName: 'Norris', code: 'NOR', url: '' },
                    Constructor: { constructorId: 'mclaren', name: 'McLaren', url: '' },
                    Time: { millis: '5505000', time: '+5.000' },
                },
            ],
            QualifyingResults: [
                {
                    position: '1',
                    Driver: { driverId: 'max_verstappen', givenName: 'Max', familyName: 'Verstappen', code: 'VER', url: '' },
                    Constructor: { constructorId: 'red_bull', name: 'Red Bull', url: '' },
                    Q1: '1:29.400',
                    Q2: '1:29.100',
                    Q3: '1:28.997',
                },
            ],
        };

        apiGet.mockImplementation(async (url: string) => {
            await new Promise(resolve => setTimeout(resolve, 10));
            if (url === '/2024/driverStandings.json') {
                return {
                    data: {
                        MRData: {
                            StandingsTable: {
                                StandingsLists: [{
                                    DriverStandings: [
                                        {
                                            position: '1',
                                            positionText: '1',
                                            points: '25',
                                            wins: '1',
                                            Driver: { driverId: 'max_verstappen', givenName: 'Max', familyName: 'Verstappen', code: 'VER', url: '' },
                                            Constructors: [{ constructorId: 'red_bull', name: 'Red Bull', url: '' }],
                                        },
                                        {
                                            position: '2',
                                            positionText: '2',
                                            points: '18',
                                            wins: '0',
                                            Driver: { driverId: 'norris', givenName: 'Lando', familyName: 'Norris', code: 'NOR', url: '' },
                                            Constructors: [{ constructorId: 'mclaren', name: 'McLaren', url: '' }],
                                        },
                                    ],
                                }],
                            },
                        },
                    },
                };
            }
            if (url.startsWith('/2024/results.json')) {
                return { data: { MRData: { total: '2', RaceTable: { Races: [sampleRace] } } } };
            }
            if (url.startsWith('/2024/qualifying.json')) {
                return { data: { MRData: { total: '1', RaceTable: { Races: [sampleRace] } } } };
            }
            if (url === '/2024.json?limit=100') {
                return { data: { MRData: { total: '1', RaceTable: { Races: [sampleRace] } } } };
            }
            throw new Error(`Unexpected URL ${url}`);
        });

        // Fire concurrent requests just like StandingsPage does
        const [stats, results, calendarA, calendarB] = await Promise.all([
            getDriverSeasonStats('2024'),
            getAllSeasonResults('2024', { throwOnError: true }),
            getRaces('2024'),
            getRaces('2024'),
        ]);

        const calledUrls = apiGet.mock.calls.map(call => call[0]);
        expect(calledUrls.filter(url => url.startsWith('/2024/results.json'))).toHaveLength(1);
        expect(calledUrls.filter(url => url === '/2024.json?limit=100')).toHaveLength(1);

        expect(stats).toHaveLength(2);
        expect(stats[0]).toMatchObject({ driverId: 'max_verstappen', wins: 1, poles: 1, podiums: 1, points: '25' });
        expect(stats[1]).toMatchObject({ driverId: 'norris', wins: 0, poles: 0, podiums: 1, points: '18' });
        expect(results).toHaveLength(2);
        expect(calendarA).toHaveLength(1);
        expect(calendarB).toHaveLength(1);

        // Second call should hit localStorage cache with 0 network calls
        apiGet.mockClear();
        const [cachedStats, cachedResults, cachedCalendar] = await Promise.all([
            getDriverSeasonStats('2024'),
            getAllSeasonResults('2024', { throwOnError: true }),
            getRaces('2024'),
        ]);

        expect(apiGet).not.toHaveBeenCalled();
        expect(cachedStats).toEqual(stats);
        expect(cachedResults).toEqual(results);
        expect(cachedCalendar).toEqual(calendarA);
    });

    it('fetches all pages across paginated offsets and preserves every single race record', async () => {
        const makeRoundRace = (round: number) => ({
            season: '2023',
            round: String(round),
            date: `2023-03-${String(round).padStart(2, '0')}`,
            raceName: `Round ${round} GP`,
            Results: [{
                number: '1',
                position: '1',
                positionText: '1',
                points: '25',
                grid: '1',
                laps: '50',
                status: 'Finished',
                Driver: { driverId: `driver_${round}`, givenName: 'Driver', familyName: String(round), url: '' },
                Constructor: { constructorId: 'red_bull', name: 'Red Bull', url: '' },
            }],
        });

        apiGet.mockImplementation(async (url: string) => {
            if (url === '/2023/results.json?limit=100&offset=0') {
                return {
                    data: {
                        MRData: {
                            total: '150',
                            RaceTable: { Races: [makeRoundRace(1), makeRoundRace(2)] },
                        },
                    },
                };
            }
            if (url === '/2023/results.json?limit=100&offset=100') {
                return {
                    data: {
                        MRData: {
                            total: '150',
                            RaceTable: { Races: [makeRoundRace(3)] },
                        },
                    },
                };
            }
            if (url === '/2023.json?limit=100') {
                return { data: { MRData: { total: '0', RaceTable: { Races: [] } } } };
            }
            throw new Error(`Unexpected URL ${url}`);
        });

        const results = await getAllSeasonResults('2023', { throwOnError: true });
        expect(results.map(r => r.round)).toEqual(['1', '2', '3']);
        expect(results.map(r => r.driverId)).toEqual(['driver_1', 'driver_2', 'driver_3']);
    });

    it('reuses cached full-season results/qualifying for constructor H2H and single-race queries without extra network calls', async () => {
        const sampleRace = {
            season: '2024',
            round: '1',
            date: '2024-03-02',
            raceName: 'Bahrain Grand Prix',
            Circuit: {
                circuitId: 'bahrain',
                circuitName: 'Bahrain International Circuit',
                url: '',
                Location: { locality: 'Sakhir', country: 'Bahrain' },
            },
            Results: [
                {
                    number: '4',
                    position: '1',
                    positionText: '1',
                    points: '25',
                    grid: '1',
                    laps: '57',
                    status: 'Finished',
                    Driver: { driverId: 'norris', givenName: 'Lando', familyName: 'Norris', code: 'NOR', url: '' },
                    Constructor: { constructorId: 'mclaren', name: 'McLaren', url: '' },
                },
                {
                    number: '81',
                    position: '2',
                    positionText: '2',
                    points: '18',
                    grid: '2',
                    laps: '57',
                    status: 'Finished',
                    Driver: { driverId: 'piastri', givenName: 'Oscar', familyName: 'Piastri', code: 'PIA', url: '' },
                    Constructor: { constructorId: 'mclaren', name: 'McLaren', url: '' },
                },
                {
                    number: '1',
                    position: '3',
                    positionText: '3',
                    points: '15',
                    grid: '3',
                    laps: '57',
                    status: 'Finished',
                    Driver: { driverId: 'max_verstappen', givenName: 'Max', familyName: 'Verstappen', code: 'VER', url: '' },
                    Constructor: { constructorId: 'red_bull', name: 'Red Bull', url: '' },
                },
            ],
            QualifyingResults: [
                {
                    position: '1',
                    Driver: { driverId: 'norris', givenName: 'Lando', familyName: 'Norris', code: 'NOR', url: '' },
                    Constructor: { constructorId: 'mclaren', name: 'McLaren', url: '' },
                },
                {
                    position: '2',
                    Driver: { driverId: 'piastri', givenName: 'Oscar', familyName: 'Piastri', code: 'PIA', url: '' },
                    Constructor: { constructorId: 'mclaren', name: 'McLaren', url: '' },
                },
            ],
        };

        apiGet.mockImplementation(async (url: string) => {
            if (url === '/2024/driverStandings.json') {
                return { data: { MRData: { StandingsTable: { StandingsLists: [{ DriverStandings: [] }] } } } };
            }
            if (url.startsWith('/2024/results.json')) {
                return { data: { MRData: { total: '3', RaceTable: { Races: [sampleRace] } } } };
            }
            if (url.startsWith('/2024/qualifying.json')) {
                return { data: { MRData: { total: '2', RaceTable: { Races: [sampleRace] } } } };
            }
            if (url.startsWith('/drivers/norris/results.json')) {
                return { data: { MRData: { total: '1', RaceTable: { Races: [sampleRace] } } } };
            }
            throw new Error(`Unexpected URL ${url}`);
        });

        await getDriverSeasonStats('2024');
        apiGet.mockClear();

        // Now constructor H2H, single-race results, and single-race qualifying should all derive from warm cache
        const [h2h, roundResults, roundQuali] = await Promise.all([
            getConstructorSeasonH2HRaw('2024', 'mclaren', 'McLaren'),
            getRaceResults('2024', '1'),
            getRaceQualifyingResults('2024', '1'),
        ]);

        expect(apiGet).not.toHaveBeenCalled();
        expect(h2h.raceResults.map(r => r.driverId)).toEqual(['norris', 'piastri']);
        expect(h2h.qualiResults.map(r => r.driverId)).toEqual(['norris', 'piastri']);
        expect(roundResults).toHaveLength(3);
        expect(roundQuali).toHaveLength(2);

        // Career stints should persist compact stints in localStorage without persisting raw paginated driver results
        const stints = await getDriverCareerStints('norris');
        expect(stints).toEqual([{ season: '2024', constructorId: 'mclaren', constructorName: 'McLaren' }]);
        expect(localStorage.getItem('jolpica:driver-career-stints:norris:v2')).not.toBeNull();
        expect(localStorage.getItem('jolpica:paginated:/drivers/norris/results.json')).toBeNull();
    });
});

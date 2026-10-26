import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAllSeasonQualifying, getAllSeasonResults } from './f1Api';

const apiGet = vi.hoisted(() => vi.fn());
vi.mock('axios', () => ({
    default: {
        create: () => ({
            get: apiGet,
            interceptors: {
                request: { use: () => undefined },
                response: { use: () => undefined },
            },
        }),
        isAxiosError: () => false,
    },
}));

function driver(driverId: string) {
    return { driverId, givenName: driverId, familyName: 'Driver', url: '' };
}

function constructor(constructorId: string) {
    return { constructorId, name: constructorId, url: '' };
}

function apiResponse(races: unknown[], total = String(races.length)) {
    return { data: { MRData: { total, RaceTable: { Races: races } } } };
}

beforeEach(() => {
    apiGet.mockReset();
    localStorage.clear();
    vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('season awards timing inputs', () => {
    it('converts official race times to gaps to the winner and marks non-starters', async () => {
        apiGet.mockImplementation((url: string) => {
            if (url.startsWith('/2024/results.json')) {
                return Promise.resolve(apiResponse([{
                    season: '2024', round: '1', date: '2024-03-02', raceName: 'Bahrain Grand Prix',
                    Results: [
                        { position: '1', positionText: '1', points: '25', status: 'Finished', laps: '57', Driver: driver('one'), Constructor: constructor('team'), Time: { millis: '90000', time: '1:30.000' } },
                        { position: '2', positionText: '2', points: '18', status: 'Finished', laps: '57', Driver: driver('two'), Constructor: constructor('team'), Time: { millis: '92500', time: '+2.500' } },
                        { position: 'R', positionText: 'R', points: '0', status: 'Engine', laps: '18', Driver: driver('three'), Constructor: constructor('other') },
                        { position: 'R', positionText: 'R', points: '0', status: 'Did not start', laps: '0', Driver: driver('four'), Constructor: constructor('other') },
                        { position: '3', positionText: '3', points: '15', status: 'Finished', laps: '57', Driver: driver('five'), Constructor: constructor('other'), Time: { time: '+3.000' } },
                    ],
                }]));
            }
            if (url === '/2024.json?limit=100') return Promise.resolve(apiResponse([]));
            return Promise.reject(new Error(`Unexpected URL ${url}`));
        });

        const results = await getAllSeasonResults('2024', { throwOnError: true });

        expect(results.find(result => result.driverId === 'one')?.raceTimeGapSeconds).toBe(0);
        expect(results.find(result => result.driverId === 'two')?.raceTimeGapSeconds).toBe(2.5);
        expect(results.find(result => result.driverId === 'five')?.raceTimeGapSeconds).toBe(3);
        expect(results.find(result => result.driverId === 'three')).toMatchObject({ position: null, started: true });
        expect(results.find(result => result.driverId === 'four')).toMatchObject({ position: null, started: false });
    });

    it('uses the best published Q1, Q2, or Q3 lap for each driver', async () => {
        apiGet.mockImplementation((url: string) => {
            if (url.startsWith('/2024/qualifying.json')) {
                return Promise.resolve(apiResponse([{
                    season: '2024', round: '1', date: '2024-03-02', raceName: 'Bahrain Grand Prix',
                    QualifyingResults: [
                        { position: '1', Driver: driver('one'), Constructor: constructor('team'), Q1: '1:21.100', Q2: '1:20.200', Q3: '1:19.300' },
                        { position: '2', Driver: driver('two'), Constructor: constructor('team'), Q1: '1:20.900', Q2: '1:20.100' },
                        { position: '3', Driver: driver('three'), Constructor: constructor('other'), Q1: '\\N' },
                    ],
                }]));
            }
            if (url === '/2024.json?limit=100') return Promise.resolve(apiResponse([]));
            return Promise.reject(new Error(`Unexpected URL ${url}`));
        });

        const results = await getAllSeasonQualifying('2024', { throwOnError: true });

        expect(results.find(result => result.driverId === 'one')?.bestTimeSeconds).toBeCloseTo(79.3);
        expect(results.find(result => result.driverId === 'two')?.bestTimeSeconds).toBeCloseTo(80.1);
        expect(results.find(result => result.driverId === 'three')?.bestTimeSeconds).toBeNull();
    });
});

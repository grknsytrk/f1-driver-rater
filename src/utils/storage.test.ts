import { describe, it, expect, beforeEach } from 'vitest';
import { calculateAverages, getDriverFormSeries, saveQuickRatings } from './storage';
import type { SeasonRatings } from '../types';

describe('calculateAverages', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('should correctly calculate average rating for a single driver across multiple races', () => {
        // ARRANGE: Setup the "exam paper" (mock data)
        const mockData: Record<string, SeasonRatings> = {
            '2024': {
                season: '2024',
                races: [
                    {
                        round: '1',
                        raceName: 'Bahrain GP',
                        date: '2024-03-02',
                        completed: true,
                        ratings: [
                            {
                                driverId: 'verstappen',
                                driverName: 'Max Verstappen',
                                constructorId: 'red_bull',
                                constructorName: 'Red Bull',
                                rating: 8
                            }
                        ]
                    },
                    {
                        round: '2',
                        raceName: 'Saudi Arabian GP',
                        date: '2024-03-09',
                        completed: true,
                        ratings: [
                            {
                                driverId: 'verstappen',
                                driverName: 'Max Verstappen',
                                constructorId: 'red_bull',
                                constructorName: 'Red Bull',
                                rating: 10
                            }
                        ]
                    }
                ]
            }
        };

        // Save to our fake browser storage
        localStorage.setItem('f1_pilot_ratings', JSON.stringify(mockData));

        // ACT: Run the function
        const results = calculateAverages('2024');

        // ASSERT: Check the results
        expect(results).toHaveLength(1);
        expect(results[0].driverName).toBe('Max Verstappen');
        expect(results[0].averageRating).toBe(9.00); // (8 + 10) / 2 = 9
    });

    it('should return empty array if no ratings exist', () => {
        const results = calculateAverages('2024');
        expect(results).toEqual([]);
    });
});

describe('getDriverFormSeries', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('builds a single season line per driver and keeps round order with null gaps', () => {
        const mockData: Record<string, SeasonRatings> = {
            '2024': {
                season: '2024',
                races: [
                    {
                        round: '1',
                        raceName: 'Bahrain GP',
                        date: '2024-03-02',
                        completed: true,
                        ratings: [
                            {
                                driverId: 'verstappen',
                                driverName: 'Max Verstappen',
                                constructorId: 'red_bull',
                                constructorName: 'Red Bull',
                                rating: 8,
                            },
                            {
                                driverId: 'hamilton',
                                driverName: 'Lewis Hamilton',
                                constructorId: 'mercedes',
                                constructorName: 'Mercedes',
                                rating: 7,
                            },
                        ],
                    },
                    {
                        round: '2',
                        raceName: 'Saudi Arabian GP',
                        date: '2024-03-09',
                        completed: true,
                        ratings: [
                            {
                                driverId: 'verstappen',
                                driverName: 'Max Verstappen',
                                constructorId: 'red_bull',
                                constructorName: 'Red Bull',
                                rating: 6,
                            },
                            {
                                driverId: 'hamilton',
                                driverName: 'Lewis Hamilton',
                                constructorId: 'mercedes',
                                constructorName: 'Mercedes',
                                rating: 9,
                            },
                        ],
                    },
                    {
                        round: '3',
                        raceName: 'Australian GP',
                        date: '2024-03-16',
                        completed: true,
                        ratings: [
                            {
                                driverId: 'verstappen',
                                driverName: 'Max Verstappen',
                                constructorId: 'ferrari',
                                constructorName: 'Ferrari',
                                rating: 10,
                            },
                        ],
                    },
                ],
            },
        };

        localStorage.setItem('f1_pilot_ratings', JSON.stringify(mockData));

        const results = getDriverFormSeries('2024');

        expect(results).toHaveLength(2);
        expect(results[0].driverId).toBe('verstappen');
        expect(results[0].changedTeams).toBe(true);
        expect(results[0].latestConstructorId).toBe('ferrari');
        expect(results[0].latestConstructorName).toBe('Ferrari');
        expect(results[0].seasonAverage).toBe(8);
        expect(results[0].bestRating).toBe(10);
        expect(results[0].bestRaceName).toBe('Australian GP');
        expect(results[0].worstRating).toBe(6);
        expect(results[0].worstRaceName).toBe('Saudi Arabian GP');
        expect(results[0].points.map(point => point.round)).toEqual(['1', '2', '3']);
        expect(results[0].points.map(point => point.rating)).toEqual([8, 6, 10]);

        expect(results[1].driverId).toBe('hamilton');
        expect(results[1].changedTeams).toBe(false);
        expect(results[1].seasonAverage).toBe(8);
        expect(results[1].totalRatedRaces).toBe(2);
        expect(results[1].points.map(point => point.rating)).toEqual([7, 9, null]);
        expect(results[1].points[2].constructorId).toBeNull();
    });

    it('returns an empty list for quick-rate-only seasons', () => {
        saveQuickRatings('2024', [
            {
                driverId: 'norris',
                driverName: 'Lando Norris',
                constructorId: 'mclaren',
                constructorName: 'McLaren',
                rating: 9,
            },
        ]);

        const results = getDriverFormSeries('2024');

        expect(results).toEqual([]);
    });

    it('orders drivers by constructor total first, then by driver average inside the team', () => {
        const mockData: Record<string, SeasonRatings> = {
            '2024': {
                season: '2024',
                races: [
                    {
                        round: '1',
                        raceName: 'Bahrain GP',
                        date: '2024-03-02',
                        completed: true,
                        ratings: [
                            {
                                driverId: 'antonelli',
                                driverName: 'Kimi Antonelli',
                                constructorId: 'mercedes',
                                constructorName: 'Mercedes',
                                rating: 8,
                            },
                            {
                                driverId: 'russell',
                                driverName: 'George Russell',
                                constructorId: 'mercedes',
                                constructorName: 'Mercedes',
                                rating: 7,
                            },
                            {
                                driverId: 'leclerc',
                                driverName: 'Charles Leclerc',
                                constructorId: 'ferrari',
                                constructorName: 'Ferrari',
                                rating: 7,
                            },
                            {
                                driverId: 'sainz',
                                driverName: 'Carlos Sainz',
                                constructorId: 'ferrari',
                                constructorName: 'Ferrari',
                                rating: 6,
                            },
                        ],
                    },
                    {
                        round: '2',
                        raceName: 'Saudi Arabian GP',
                        date: '2024-03-09',
                        completed: true,
                        ratings: [
                            {
                                driverId: 'antonelli',
                                driverName: 'Kimi Antonelli',
                                constructorId: 'mercedes',
                                constructorName: 'Mercedes',
                                rating: 8,
                            },
                            {
                                driverId: 'russell',
                                driverName: 'George Russell',
                                constructorId: 'mercedes',
                                constructorName: 'Mercedes',
                                rating: 7,
                            },
                            {
                                driverId: 'leclerc',
                                driverName: 'Charles Leclerc',
                                constructorId: 'ferrari',
                                constructorName: 'Ferrari',
                                rating: 7,
                            },
                            {
                                driverId: 'sainz',
                                driverName: 'Carlos Sainz',
                                constructorId: 'ferrari',
                                constructorName: 'Ferrari',
                                rating: 6,
                            },
                        ],
                    },
                ],
            },
        };

        localStorage.setItem('f1_pilot_ratings', JSON.stringify(mockData));

        const results = getDriverFormSeries('2024');

        expect(results.map(driver => driver.driverId)).toEqual([
            'antonelli',
            'russell',
            'leclerc',
            'sainz',
        ]);
    });
});

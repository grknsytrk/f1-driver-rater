import { describe, it, expect, beforeEach } from 'vitest';
import { calculateAverages } from './storage';
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

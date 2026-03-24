import { beforeEach, describe, expect, it } from 'vitest';
import { getSeasonProgressFromRaces } from './seasonProgress';
import type { Race, SeasonRatings } from '../types';

function makeRace(round: string, date: string): Race {
    return {
        season: '2026',
        round,
        raceName: `Race ${round}`,
        date,
        Circuit: {
            circuitId: `circuit-${round}`,
            circuitName: `Circuit ${round}`,
            url: 'https://example.com',
            Location: {
                locality: 'Somewhere',
                country: 'Testland',
            },
        },
    };
}

describe('getSeasonProgressFromRaces', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('unlocks when all completed races have been rated', () => {
        const storedRatings: Record<string, SeasonRatings> = {
            '2026': {
                season: '2026',
                races: [
                    {
                        round: '1',
                        raceName: 'Race 1',
                        date: '2026-03-08',
                        completed: true,
                        ratings: [],
                    },
                    {
                        round: '2',
                        raceName: 'Race 2',
                        date: '2026-03-15',
                        completed: true,
                        ratings: [],
                    },
                ],
            },
        };

        localStorage.setItem('f1_pilot_ratings', JSON.stringify(storedRatings));

        const progress = getSeasonProgressFromRaces('2026', [
            makeRace('1', '2026-03-08'),
            makeRace('2', '2026-03-15'),
            makeRace('3', '2026-04-12'),
        ]);

        expect(progress.completedCount).toBe(2);
        expect(progress.ratedCount).toBe(2);
        expect(progress.unlocked).toBe(true);
    });

    it('stays locked for quick-rate-only seasons because no races were logged', () => {
        localStorage.setItem('f1_quick_ratings', JSON.stringify({
            '2026': [
                {
                    driverId: 'norris',
                    driverName: 'Lando Norris',
                    constructorId: 'mclaren',
                    constructorName: 'McLaren',
                    rating: 9,
                },
            ],
        }));

        const progress = getSeasonProgressFromRaces('2026', [
            makeRace('1', '2026-03-08'),
            makeRace('2', '2026-03-15'),
            makeRace('3', '2026-04-12'),
        ]);

        expect(progress.completedCount).toBe(2);
        expect(progress.ratedCount).toBe(0);
        expect(progress.unlocked).toBe(false);
    });
});

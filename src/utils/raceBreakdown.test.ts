import { describe, expect, it } from 'vitest';
import type { CommunityRating } from './communityRatings';
import type { DriverRow, RaceColumn } from './storage';
import { buildCommunityBreakdownDrivers } from './raceBreakdown';

const races: RaceColumn[] = [
    { round: '1', raceName: 'Australian', countryCode: 'AU' },
    { round: '2', raceName: 'Chinese', countryCode: 'CN' },
];
const drivers: DriverRow[] = [
    { driverId: 'lec', driverName: 'Charles Leclerc', constructorId: 'ferrari', constructorName: 'Ferrari', totalAverage: 9, raceRatings: { '1': 9, '2': 9 } },
    { driverId: 'ham', driverName: 'Lewis Hamilton', constructorId: 'ferrari', constructorName: 'Ferrari', totalAverage: 7, raceRatings: { '1': 7 } },
];

describe('community race breakdown', () => {
    it('uses per-race community averages with equal race weights and leaves personal data intact', () => {
        const ratings: CommunityRating[] = [
            { driverId: 'lec', round: '1', averageRating: 6, voteCount: 100 },
            { driverId: 'lec', round: '2', averageRating: 10, voteCount: 1 },
            { driverId: 'lec', round: '3', averageRating: 2, voteCount: 5 },
            { driverId: 'other', round: '1', averageRating: 8, voteCount: 3 },
            { driverId: 'ham', round: '1', averageRating: 4, voteCount: 0 },
        ];

        const community = buildCommunityBreakdownDrivers(races, drivers, ratings);
        expect(community[0]).toMatchObject({
            driverId: 'lec', raceRatings: { '1': 6, '2': 10 }, voteCounts: { '1': 100, '2': 1 }, totalAverage: 8,
        });
        expect(community[1]).toMatchObject({ raceRatings: {}, voteCounts: {}, totalAverage: 0 });
        expect(drivers[0].raceRatings).toEqual({ '1': 9, '2': 9 });
    });
});

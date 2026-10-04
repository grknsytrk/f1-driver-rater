import { describe, expect, it } from 'vitest';
import type { CommunityRating } from './communityRatings';
import type { DriverRow, RaceColumn } from './storage';
import { buildCommunityBreakdown } from './raceBreakdown';

const races: RaceColumn[] = [
    { round: '1', raceName: 'Australian', countryCode: 'AU' },
    { round: '2', raceName: 'Chinese', countryCode: 'CN' },
];
const drivers: DriverRow[] = [
    { driverId: 'lec', driverName: 'Charles Leclerc', constructorId: 'ferrari', constructorName: 'Ferrari', totalAverage: 9, raceRatings: { '1': 9, '2': 9 } },
    { driverId: 'ham', driverName: 'Lewis Hamilton', constructorId: 'ferrari', constructorName: 'Ferrari', totalAverage: 7, raceRatings: { '1': 7 } },
];

describe('community race breakdown', () => {
    it('shows all voted races and drivers, including those absent from personal ratings', () => {
        const ratings: CommunityRating[] = [
            { driverId: 'lec', round: '1', averageRating: 6, voteCount: 100 },
            { driverId: 'lec', round: '3', averageRating: 10, voteCount: 1 },
            { driverId: 'lec', round: '4', averageRating: 8, voteCount: 5 },
            { driverId: 'other', round: '3', averageRating: 8, voteCount: 3 },
            { driverId: 'ham', round: '1', averageRating: 4, voteCount: 0 },
        ];
        const calendar: RaceColumn[] = [
            { round: '3', raceName: 'Japanese', countryCode: 'JP' },
            { round: '5', raceName: 'Bahrain', countryCode: 'BH' },
        ];

        const community = buildCommunityBreakdown(races, drivers, ratings, calendar, [
            { driverId: 'other', driverName: 'Other Driver', constructorId: 'mclaren', constructorName: 'McLaren' },
        ]);
        expect(community.races).toEqual([
            races[0],
            calendar[0],
            { round: '4', raceName: 'Round 4', countryCode: 'XX' },
        ]);
        expect(community.drivers[0]).toMatchObject({
            driverId: 'lec', raceRatings: { '1': 6, '3': 10, '4': 8 },
            voteCounts: { '1': 100, '3': 1, '4': 5 }, totalAverage: 8,
        });
        expect(community.drivers[1]).toMatchObject({
            driverId: 'other', driverName: 'Other Driver', constructorName: 'McLaren',
            raceRatings: { '3': 8 }, totalAverage: 8,
        });
        expect(community.drivers).toHaveLength(2);
        expect(drivers[0].raceRatings).toEqual({ '1': 9, '2': 9 });
    });
});

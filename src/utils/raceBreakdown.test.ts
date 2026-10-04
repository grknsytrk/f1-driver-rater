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
    it('keeps completed races without votes and averages only the rated cells', () => {
        const ratings: CommunityRating[] = [
            { driverId: 'lec', round: '1', averageRating: 6, voteCount: 100 },
            { driverId: 'lec', round: '3', averageRating: 10, voteCount: 1 },
            { driverId: 'lec', round: '4', averageRating: 8, voteCount: 5 },
            { driverId: 'other', round: '3', averageRating: 8, voteCount: 3 },
            { driverId: 'ham', round: '1', averageRating: 4, voteCount: 0 },
            { driverId: 'lec', round: '6', averageRating: 10, voteCount: 3 },
        ];
        const calendar: RaceColumn[] = [
            races[0], races[1],
            { round: '3', raceName: 'Japanese', countryCode: 'JP' },
            { round: '4', raceName: 'Italian', countryCode: 'IT' },
            { round: '5', raceName: 'Bahrain', countryCode: 'BH' },
        ];

        const community = buildCommunityBreakdown(races, drivers, ratings, calendar, [
            { driverId: 'other', driverName: 'Other Driver', constructorId: 'mclaren', constructorName: 'McLaren' },
        ]);
        expect(community.races).toEqual(calendar);
        expect(community.drivers[0]).toMatchObject({
            driverId: 'lec', raceRatings: { '1': 6, '3': 10, '4': 8 },
            voteCounts: { '1': 100, '3': 1, '4': 5 }, totalAverage: 8,
        });
        expect(community.drivers[1]).toMatchObject({ driverId: 'ham', raceRatings: {}, totalAverage: 0 });
        expect(community.drivers[2]).toMatchObject({
            driverId: 'other', driverName: 'Other Driver', constructorName: 'McLaren',
            raceRatings: { '3': 8 }, totalAverage: 8,
        });
        expect(community.drivers).toHaveLength(3);
        expect(community.drivers[0].raceRatings).not.toHaveProperty('5');
        expect(community.drivers[0].raceRatings).not.toHaveProperty('6');
        expect(drivers[0].raceRatings).toEqual({ '1': 9, '2': 9 });
    });
});

import { describe, expect, it } from 'vitest';
import {
    extractHistoricalSeasonData,
    type CompactHistoricalH2HPayload,
} from './historicalH2H';

describe('extractHistoricalSeasonData', () => {
    it('normalizes race and qualifying entries while skipping qualifying-only race placeholders', () => {
        const payload: CompactHistoricalH2HPayload = {
            version: 1,
            drivers: [['driver', 'Test Driver'], ['qualifier', 'Qualifying Only']],
            constructors: [['team', 'Test Team']],
            statuses: ['Finished', 'Did not start'],
            seasons: {
                '2024': [[
                    '1',
                    'Test Grand Prix',
                    '2024-03-01',
                    [
                        [0, 0, 2, 1, 25, 0, 1, 1],
                        [1, 0, null, null, 0, 1, 0, 2],
                    ],
                ]],
            },
        };

        expect(extractHistoricalSeasonData(payload, '2023')).toBeNull();
        expect(extractHistoricalSeasonData(payload, '2024')).toEqual({
            raceResults: [{
                round: '1',
                raceName: 'Test Grand Prix',
                date: '2024-03-01',
                driverId: 'driver',
                driverName: 'Test Driver',
                constructorId: 'team',
                constructorName: 'Test Team',
                gridPosition: 2,
                position: 1,
                points: 25,
                status: 'Finished',
                started: true,
            }],
            qualiResults: [
                {
                    round: '1',
                    raceName: 'Test Grand Prix',
                    date: '2024-03-01',
                    driverId: 'driver',
                    driverName: 'Test Driver',
                    constructorId: 'team',
                    constructorName: 'Test Team',
                    position: 1,
                },
                {
                    round: '1',
                    raceName: 'Test Grand Prix',
                    date: '2024-03-01',
                    driverId: 'qualifier',
                    driverName: 'Qualifying Only',
                    constructorId: 'team',
                    constructorName: 'Test Team',
                    position: 2,
                },
            ],
        });
    });

    it('loads Leclerc’s full 2024 season from the committed archive', async () => {
        const rawData = await import('../../public/data/historical-h2h-v1.json');
        const payload = (rawData.default ?? rawData) as unknown as CompactHistoricalH2HPayload;
        const season = extractHistoricalSeasonData(payload, '2024');

        expect(season?.raceResults.filter(result => result.driverId === 'leclerc')).toHaveLength(24);
        expect(season?.qualiResults.filter(result => result.driverId === 'leclerc')).toHaveLength(24);
        expect(season?.raceResults.find(result => result.driverId === 'leclerc' && result.round === '8')).toMatchObject({
            raceName: 'Monaco Grand Prix',
            position: 1,
        });
    });
});

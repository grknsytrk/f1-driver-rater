import { describe, expect, it } from 'vitest';
import type { DriverFormSeries } from './storage';
import { buildFormChartData, reconcileFormDriverSelection, toggleFormDriverSelection } from './formTracker';

function makeSeries(driverId: string, ratings: Array<number | null>): DriverFormSeries {
    return {
        driverId,
        driverName: driverId,
        latestConstructorId: 'team',
        latestConstructorName: 'Team',
        seasonAverage: 7,
        totalRatedRaces: ratings.filter(rating => rating !== null).length,
        bestRating: 9,
        bestRaceName: 'Miami GP',
        worstRating: 5,
        worstRaceName: 'Miami GP',
        changedTeams: false,
        points: ratings.map((rating, index) => ({
            round: String(index + 1),
            roundNumber: index + 1,
            raceName: index < 2 ? 'Miami GP' : 'Monaco GP',
            countryCode: index < 2 ? 'US' : 'MC',
            date: `2026-03-0${index + 1}`,
            rating,
            constructorId: rating === null ? null : 'team',
            constructorName: rating === null ? null : 'Team',
        })),
    };
}

describe('Form Tracker driver selection', () => {
    it('adds drivers and allows removing the last selected driver', () => {
        expect(toggleFormDriverSelection(['norris'], 'piastri')).toEqual(['norris', 'piastri']);
        expect(toggleFormDriverSelection(['norris', 'piastri'], 'norris')).toEqual(['piastri']);
        expect(toggleFormDriverSelection(['piastri'], 'piastri')).toEqual([]);
    });

    it('keeps an empty selection and falls back when selected drivers disappear', () => {
        const selected = ['norris', 'gone'];
        expect(reconcileFormDriverSelection(selected, ['norris', 'piastri'])).toEqual(['norris']);
        expect(reconcileFormDriverSelection(['gone'], ['norris', 'piastri'])).toEqual(['norris']);
        expect(reconcileFormDriverSelection(['gone'], [])).toEqual([]);
        expect(reconcileFormDriverSelection([], ['norris', 'piastri'])).toEqual([]);
    });
});

describe('buildFormChartData', () => {
    it('merges driver ratings by round, keeps null gaps, and disambiguates repeated race labels', () => {
        const data = buildFormChartData([
            makeSeries('norris', [8, null, 9]),
            makeSeries('piastri', [7, 8, null]),
        ]);

        expect(data.map(point => point.roundLabel)).toEqual(['MIA', 'MIA-2', 'MC']);
        expect(data.map(point => point.norris)).toEqual([8, null, 9]);
        expect(data.map(point => point.piastri)).toEqual([7, 8, null]);
        expect(buildFormChartData([])).toEqual([]);
    });
});

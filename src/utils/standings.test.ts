import { describe, expect, it } from 'vitest';
import type { DriverSeasonStats, SeasonRaceResult, SeasonSprintResult } from '../api/f1Api';
import { buildChampionshipProgress, buildDriverTrackerEntries, buildPointsTimeline, buildWccRaceMap, buildWdcRaceMap, getWdcCellDisplay, normalizeStandingStatus } from './standings';

describe('driver tracker labels', () => {
    it('uses the F1 code when available and a three-letter surname fallback', () => {
        const drivers: DriverSeasonStats[] = [
            { driverId: 'leclerc', driverName: 'Charles Leclerc', code: 'LEC' },
            { driverId: 'hamilton', driverName: 'Lewis Hamilton' },
            { driverId: 'antonelli', driverName: 'Andrea Kimi Antonelli', code: 'ANT' },
            { driverId: 'michael_schumacher', driverName: 'Michael Schumacher', code: 'MSC' },
        ].map((driver, index) => ({
            constructorId: 'ferrari', constructorName: 'Ferrari', position: String(index + 1),
            points: '0', wins: 0, poles: 0, podiums: 0, ...driver,
        }));

        const entries = buildDriverTrackerEntries(drivers, new Map());
        expect(entries.map(entry => entry.code)).toEqual(['LEC', 'HAM', 'ANT', 'MSC']);
        expect(entries.map(entry => entry.name)).toEqual(drivers.map(driver => driver.driverName));
        expect(entries.map(entry => entry.label)).toEqual(['Leclerc', 'Hamilton', 'Antonelli', 'Schumacher']);
    });
});

function makeRaceResult(overrides: Partial<SeasonRaceResult>): SeasonRaceResult {
    return {
        round: '1',
        driverId: 'max_verstappen',
        driverName: 'Max Verstappen',
        constructorId: 'red_bull',
        constructorName: 'Red Bull',
        position: 1,
        points: 25,
        status: 'Finished',
        ...overrides,
    };
}

function makeSprintResult(overrides: Partial<SeasonSprintResult>): SeasonSprintResult {
    return {
        round: '1',
        driverId: 'max_verstappen',
        driverName: 'Max Verstappen',
        constructorId: 'red_bull',
        constructorName: 'Red Bull',
        position: 1,
        points: 8,
        status: 'Finished',
        ...overrides,
    };
}

describe('normalizeStandingStatus', () => {
    it('maps DSQ and DNS explicitly while collapsing other non-classified statuses to DNF', () => {
        expect(normalizeStandingStatus('Disqualified')).toBe('DSQ');
        expect(normalizeStandingStatus('Did not start')).toBe('DNS');
        expect(normalizeStandingStatus('Engine')).toBe('DNF');
    });
});

describe('buildWdcRaceMap', () => {
    it('adds sprint points to classified GP results', () => {
        const raceMap = buildWdcRaceMap(
            [makeRaceResult({ points: 25, position: 1 })],
            [makeSprintResult({ points: 8 })]
        );

        expect(raceMap.get('max_verstappen')?.get('1')).toEqual({
            position: 1,
            points: 33,
            status: 'Finished',
        });
    });

    it('keeps GP status while adding sprint points for non-classified results', () => {
        const raceMap = buildWdcRaceMap(
            [makeRaceResult({ points: 0, position: null, status: 'Disqualified' })],
            [makeSprintResult({ points: 2 })]
        );

        expect(raceMap.get('max_verstappen')?.get('1')).toEqual({
            position: null,
            points: 2,
            status: 'Disqualified',
        });
    });

    it('keeps sprint-only weekends as points without GP status', () => {
        const raceMap = buildWdcRaceMap([], [
            makeSprintResult({ driverId: 'oscar_piastri', driverName: 'Oscar Piastri', points: 3 }),
        ]);

        expect(raceMap.get('oscar_piastri')?.get('1')).toEqual({
            position: undefined,
            points: 3,
        });
    });
});

describe('getWdcCellDisplay', () => {
    it('shows weekend points and classified finishing position', () => {
        expect(getWdcCellDisplay({ position: 2, points: 21, status: 'Finished' })).toEqual({
            kind: 'classified',
            points: 21,
            position: 2,
        });
    });

    it('shows weekend points and DNF when sprint points exist', () => {
        expect(getWdcCellDisplay({ position: null, points: 3, status: 'Engine' })).toEqual({
            kind: 'points-status',
            points: 3,
            statusLabel: 'DNF',
        });
    });

    it('shows weekend points and DSQ when sprint points exist', () => {
        expect(getWdcCellDisplay({ position: null, points: 2, status: 'Disqualified' })).toEqual({
            kind: 'points-status',
            points: 2,
            statusLabel: 'DSQ',
        });
    });

    it('shows weekend points and DNS when sprint points exist', () => {
        expect(getWdcCellDisplay({ position: null, points: 1, status: 'Did not start' })).toEqual({
            kind: 'points-status',
            points: 1,
            statusLabel: 'DNS',
        });
    });

    it('shows only status when GP result is non-classified with zero points', () => {
        expect(getWdcCellDisplay({ position: null, points: 0, status: 'Engine' })).toEqual({
            kind: 'status-only',
            statusLabel: 'DNF',
        });
    });

    it('shows sprint-only weekends as points-only', () => {
        expect(getWdcCellDisplay({ position: undefined, points: 4 })).toEqual({
            kind: 'points-only',
            points: 4,
        });
    });

    it('shows empty state when no weekend data exists', () => {
        expect(getWdcCellDisplay(undefined)).toEqual({
            kind: 'empty',
        });
    });
});

describe('buildChampionshipProgress', () => {
    it('accumulates GP and sprint points in numeric round order without adding future races', () => {
        const calendar = [
            { round: '1', raceName: 'Australian Grand Prix' },
            { round: '2', raceName: 'Chinese Grand Prix' },
            { round: '10', raceName: 'Spanish Grand Prix' },
            { round: '11', raceName: 'Austrian Grand Prix' },
        ];
        const raceMap = buildWdcRaceMap([
            makeRaceResult({ round: '10', points: 25 }),
            makeRaceResult({ round: '2', points: 25 }),
            makeRaceResult({ round: '1', points: 18 }),
        ], [makeSprintResult({ round: '2', points: 4 })]);

        const timeline = buildChampionshipProgress(['max_verstappen'], calendar, raceMap);

        expect(timeline.map(point => point.round)).toEqual(['1', '2', '10']);
        expect(timeline.map(point => point.scores.max_verstappen)).toEqual([
            { weekendPoints: 18, totalPoints: 18 },
            { weekendPoints: 29, totalPoints: 47 },
            { weekendPoints: 25, totalPoints: 72 },
        ]);
        expect(timeline.map(point => point.raceName)).toEqual(calendar.slice(0, 3).map(race => race.raceName));
        expect(timeline.every(point => !point.sprintOnly)).toBe(true);
    });

    it('preserves fractional points and carries totals through zero points and non-participation', () => {
        const timeline = buildChampionshipProgress(['max_verstappen', 'reserve'], [], buildWdcRaceMap([
            makeRaceResult({ round: '1', points: 12.5 }),
            makeRaceResult({ round: '2', points: 0, position: 12 }),
            makeRaceResult({ round: '2', driverId: 'reserve', points: 0.5 }),
            makeRaceResult({ round: '3', driverId: 'reserve', points: 1 }),
        ], []));

        expect(timeline.map(point => point.scores.max_verstappen.totalPoints)).toEqual([12.5, 12.5, 12.5]);
        expect(timeline.map(point => point.scores.reserve.totalPoints)).toEqual([0, 0.5, 1.5]);
        expect(timeline[2].scores.max_verstappen.weekendPoints).toBe(0);
        expect(timeline[0].raceName).toBe('Round 1');
    });

    it.each(['Engine', 'Disqualified', 'Did not start'])('keeps sprint points when the GP status is %s', status => {
        const timeline = buildChampionshipProgress(['max_verstappen'], [], buildWdcRaceMap([
            makeRaceResult({ points: 0, position: null, status }),
        ], [makeSprintResult({ points: 3 })]));

        expect(timeline[0].scores.max_verstappen).toEqual({ weekendPoints: 3, totalPoints: 3 });
        expect(timeline[0].sprintOnly).toBe(false);
    });

    it('includes a sprint-only weekend with its calendar name before the GP has happened', () => {
        const timeline = buildChampionshipProgress(['max_verstappen', 'reserve'], [
            { round: '2', raceName: 'Chinese Grand Prix' },
        ], buildWdcRaceMap([
            makeRaceResult({ points: 25 }),
        ], [makeSprintResult({ round: '2', points: 8 })]));

        expect(timeline[1]).toEqual({
            round: '2',
            raceName: 'Chinese Grand Prix',
            sprintOnly: true,
            scores: {
                max_verstappen: { weekendPoints: 8, totalPoints: 33 },
                reserve: { weekendPoints: 0, totalPoints: 0 },
            },
        });
    });

    it('does not mark a weekend sprint-only when another driver has a GP result', () => {
        const timeline = buildChampionshipProgress(['max_verstappen'], [], buildWdcRaceMap([
            makeRaceResult({ driverId: 'reserve' }),
        ], [makeSprintResult({ points: 8 })]));
        expect(timeline[0].sprintOnly).toBe(false);
        expect(timeline[0].scores.max_verstappen.totalPoints).toBe(8);
    });

    it('does not manufacture a timeline when there are no published results', () => {
        expect(buildChampionshipProgress(['max_verstappen'], [
            { round: '1', raceName: 'Australian Grand Prix' },
        ], new Map())).toEqual([]);
    });
});

describe('constructor points timeline', () => {
    it('adds both teammates and sprint points to the team recorded in each result, including transfers and reserves', () => {
        const races = [
            makeRaceResult({ round: '1', driverId: 'regular', constructorId: 'ferrari', points: 25 }),
            makeRaceResult({ round: '1', driverId: 'transfer', constructorId: 'ferrari', points: 18 }),
            makeRaceResult({ round: '2', driverId: 'reserve', constructorId: 'ferrari', points: 6 }),
            makeRaceResult({ round: '2', driverId: 'transfer', constructorId: 'red_bull', points: 15 }),
        ];
        const sprints = [
            makeSprintResult({ round: '1', driverId: 'regular', constructorId: 'ferrari', points: 8 }),
            makeSprintResult({ round: '1', driverId: 'transfer', constructorId: 'ferrari', points: 7 }),
            makeSprintResult({ round: '2', driverId: 'reserve', constructorId: 'ferrari', points: 2 }),
            makeSprintResult({ round: '2', driverId: 'transfer', constructorId: 'red_bull', points: 3 }),
        ];
        const weekendPoints = buildWccRaceMap(races, sprints);
        expect(weekendPoints.get('ferrari')?.get('1')).toBe(58);
        expect(weekendPoints.get('ferrari')?.get('2')).toBe(8);
        expect(weekendPoints.get('red_bull')?.get('1')).toBeUndefined();
        const timeline = buildPointsTimeline(['ferrari', 'red_bull'], [], weekendPoints, new Set(['1', '2']));
        expect(timeline.map(point => point.scores)).toEqual([
            { ferrari: { weekendPoints: 58, totalPoints: 58 }, red_bull: { weekendPoints: 0, totalPoints: 0 } },
            { ferrari: { weekendPoints: 8, totalPoints: 66 }, red_bull: { weekendPoints: 18, totalPoints: 18 } },
        ]);
    });

    it('keeps fractional and zero totals, carries missing teams forward, and includes sprint-only rounds in numeric order', () => {
        const raceMap = buildWccRaceMap([
            makeRaceResult({ round: '2', points: 12.5 }),
            makeRaceResult({ round: '2', driverId: 'teammate', points: 0.5 }),
            makeRaceResult({ round: '9', points: 0, position: null, status: 'Did not start' }),
        ], [
            makeSprintResult({ round: '10', constructorId: 'ferrari', points: 3 }),
            makeSprintResult({ round: '9', points: 1 }),
        ]);
        const timeline = buildPointsTimeline(['red_bull', 'ferrari', 'mercedes'], [
            { round: '10', raceName: 'Chinese Grand Prix' },
            { round: '11', raceName: 'Future Grand Prix' },
        ], raceMap, new Set(['2', '9']));
        expect(timeline.map(point => point.round)).toEqual(['2', '9', '10']);
        expect(timeline.map(point => point.scores.red_bull.totalPoints)).toEqual([13, 14, 14]);
        expect(timeline.map(point => point.scores.mercedes.totalPoints)).toEqual([0, 0, 0]);
        expect(timeline[2]).toMatchObject({
            raceName: 'Chinese Grand Prix', sprintOnly: true,
            scores: { red_bull: { weekendPoints: 0, totalPoints: 14 }, ferrari: { weekendPoints: 3, totalPoints: 3 } },
        });
        expect(timeline.slice(0, 2).every(point => !point.sprintOnly)).toBe(true);
    });
});

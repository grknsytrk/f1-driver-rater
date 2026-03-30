import { describe, expect, it } from 'vitest';
import type { SeasonRaceResult, SeasonSprintResult } from '../api/f1Api';
import { buildWdcRaceMap, getWdcCellDisplay, normalizeStandingStatus } from './standings';

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

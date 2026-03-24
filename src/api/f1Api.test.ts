import { describe, expect, it } from 'vitest';
import type { Constructor, Driver, Race, RaceResult } from '../types';
import { applyCanonicalRounds, buildRaceRecap, normalizeRaceCalendar, type RaceQualifyingResult } from './f1Api';

function makeRace(overrides: Partial<Race>): Race {
    return {
        season: '2026',
        round: '1',
        raceName: 'Test Grand Prix',
        Circuit: {
            circuitId: 'test_circuit',
            circuitName: 'Test Circuit',
            url: '',
            Location: {
                locality: 'Test City',
                country: 'Test Country',
            },
        },
        date: '2026-01-01',
        time: '12:00:00Z',
        ...overrides,
    };
}

function makeDriver(overrides: Partial<Driver>): Driver {
    return {
        driverId: 'test_driver',
        givenName: 'Test',
        familyName: 'Driver',
        url: '',
        ...overrides,
    };
}

function makeConstructor(overrides: Partial<Constructor>): Constructor {
    return {
        constructorId: 'test_constructor',
        name: 'Test Constructor',
        url: '',
        ...overrides,
    };
}

function makeRaceResult(overrides: Partial<RaceResult>): RaceResult {
    return {
        number: '1',
        position: '1',
        positionText: '1',
        points: '25',
        Driver: makeDriver({ driverId: 'winner', givenName: 'Max', familyName: 'Verstappen' }),
        Constructor: makeConstructor({ constructorId: 'red_bull', name: 'Red Bull' }),
        grid: '1',
        laps: '58',
        status: 'Finished',
        Time: { time: '1:31:00.000' },
        ...overrides,
    };
}

function makeQualifyingResult(overrides: Partial<RaceQualifyingResult>): RaceQualifyingResult {
    return {
        position: '1',
        Driver: makeDriver({ driverId: 'pole', givenName: 'Charles', familyName: 'Leclerc' }),
        Constructor: makeConstructor({ constructorId: 'ferrari', name: 'Ferrari' }),
        Q1: '1:28.000',
        Q2: '1:27.500',
        Q3: '1:27.100',
        ...overrides,
    };
}

describe('normalizeRaceCalendar', () => {
    it('rebuilds broken rounds from chronological order', () => {
        const races = [
            makeRace({ round: '23', raceName: 'Saudi Arabian Grand Prix', Circuit: { ...makeRace({}).Circuit, circuitId: 'jeddah' }, date: '2026-04-19' }),
            makeRace({ round: '3', raceName: 'Japanese Grand Prix', Circuit: { ...makeRace({}).Circuit, circuitId: 'suzuka' }, date: '2026-04-05' }),
            makeRace({ round: '22', raceName: 'Bahrain Grand Prix', Circuit: { ...makeRace({}).Circuit, circuitId: 'sakhir' }, date: '2026-04-12' }),
            makeRace({ round: '1', raceName: 'Australian Grand Prix', Circuit: { ...makeRace({}).Circuit, circuitId: 'albert_park' }, date: '2026-03-08' }),
            makeRace({ round: '2', raceName: 'Chinese Grand Prix', Circuit: { ...makeRace({}).Circuit, circuitId: 'shanghai' }, date: '2026-03-15' }),
        ];

        const normalized = normalizeRaceCalendar(races);

        expect(normalized.map(race => race.raceName)).toEqual([
            'Australian Grand Prix',
            'Chinese Grand Prix',
            'Japanese Grand Prix',
            'Bahrain Grand Prix',
            'Saudi Arabian Grand Prix',
        ]);
        expect(normalized.map(race => race.round)).toEqual(['1', '2', '3', '4', '5']);
    });

    it('keeps valid rounds intact while sorting by date', () => {
        const races = [
            makeRace({ round: '2', raceName: 'Chinese Grand Prix', Circuit: { ...makeRace({}).Circuit, circuitId: 'shanghai' }, date: '2026-03-15' }),
            makeRace({ round: '1', raceName: 'Australian Grand Prix', Circuit: { ...makeRace({}).Circuit, circuitId: 'albert_park' }, date: '2026-03-08' }),
        ];

        const normalized = normalizeRaceCalendar(races);

        expect(normalized.map(race => race.raceName)).toEqual([
            'Australian Grand Prix',
            'Chinese Grand Prix',
        ]);
        expect(normalized.map(race => race.round)).toEqual(['1', '2']);
    });
});

describe('applyCanonicalRounds', () => {
    it('maps partial datasets back to season rounds instead of re-numbering 1..N', () => {
        const calendar = [
            makeRace({ round: '1', raceName: 'Australian Grand Prix', Circuit: { ...makeRace({}).Circuit, circuitId: 'albert_park' }, date: '2026-03-08' }),
            makeRace({ round: '2', raceName: 'Chinese Grand Prix', Circuit: { ...makeRace({}).Circuit, circuitId: 'shanghai' }, date: '2026-03-15' }),
            makeRace({ round: '3', raceName: 'Japanese Grand Prix', Circuit: { ...makeRace({}).Circuit, circuitId: 'suzuka' }, date: '2026-04-05' }),
            makeRace({ round: '22', raceName: 'Bahrain Grand Prix', Circuit: { ...makeRace({}).Circuit, circuitId: 'sakhir' }, date: '2026-04-12' }),
            makeRace({ round: '23', raceName: 'Saudi Arabian Grand Prix', Circuit: { ...makeRace({}).Circuit, circuitId: 'jeddah' }, date: '2026-04-19' }),
        ];

        const sprintWeekends = [
            makeRace({ round: '22', raceName: 'Bahrain Grand Prix', Circuit: { ...makeRace({}).Circuit, circuitId: 'sakhir' }, date: '2026-04-12' }),
            makeRace({ round: '23', raceName: 'Saudi Arabian Grand Prix', Circuit: { ...makeRace({}).Circuit, circuitId: 'jeddah' }, date: '2026-04-19' }),
        ];

        const canonical = applyCanonicalRounds(sprintWeekends, calendar);

        expect(canonical.map(race => race.round)).toEqual(['4', '5']);
        expect(canonical.map(race => race.raceName)).toEqual([
            'Bahrain Grand Prix',
            'Saudi Arabian Grand Prix',
        ]);
    });
});

describe('buildRaceRecap', () => {
    it('builds winner, podium, pole, fastest lap and DNF count from race context', () => {
        const recap = buildRaceRecap(
            [
                makeRaceResult({
                    position: '1',
                    positionText: '1',
                    Driver: makeDriver({ driverId: 'piastri', givenName: 'Oscar', familyName: 'Piastri' }),
                    Constructor: makeConstructor({ constructorId: 'mclaren', name: 'McLaren' }),
                }),
                makeRaceResult({
                    position: '2',
                    positionText: '2',
                    Driver: makeDriver({ driverId: 'norris', givenName: 'Lando', familyName: 'Norris' }),
                    Constructor: makeConstructor({ constructorId: 'mclaren', name: 'McLaren' }),
                    Time: { time: '+2.300' },
                }),
                makeRaceResult({
                    position: '3',
                    positionText: '3',
                    Driver: makeDriver({ driverId: 'leclerc', givenName: 'Charles', familyName: 'Leclerc' }),
                    Constructor: makeConstructor({ constructorId: 'ferrari', name: 'Ferrari' }),
                    Time: { time: '+5.500' },
                    FastestLap: {
                        rank: '1',
                        lap: '45',
                        Time: { time: '1:19.876' },
                    },
                }),
                makeRaceResult({
                    position: '18',
                    positionText: '18',
                    Driver: makeDriver({ driverId: 'hamilton', givenName: 'Lewis', familyName: 'Hamilton' }),
                    Constructor: makeConstructor({ constructorId: 'ferrari', name: 'Ferrari' }),
                    status: '+1 Lap',
                    Time: undefined,
                }),
                makeRaceResult({
                    position: '19',
                    positionText: 'R',
                    Driver: makeDriver({ driverId: 'alonso', givenName: 'Fernando', familyName: 'Alonso' }),
                    Constructor: makeConstructor({ constructorId: 'aston_martin', name: 'Aston Martin' }),
                    status: 'Engine',
                    Time: undefined,
                }),
            ],
            [
                makeQualifyingResult({
                    position: '1',
                    Driver: makeDriver({ driverId: 'russell', givenName: 'George', familyName: 'Russell' }),
                    Constructor: makeConstructor({ constructorId: 'mercedes', name: 'Mercedes' }),
                }),
            ]
        );

        expect(recap.winner?.driverName).toBe('Oscar Piastri');
        expect(recap.podium.map(entry => entry.driverName)).toEqual([
            'Oscar Piastri',
            'Lando Norris',
            'Charles Leclerc',
        ]);
        expect(recap.pole?.driverName).toBe('George Russell');
        expect(recap.fastestLap?.driverName).toBe('Charles Leclerc');
        expect(recap.fastestLap?.lapTime).toBe('1:19.876');
        expect(recap.dnfCount).toBe(1);
    });

    it('gracefully degrades when qualifying or fastest lap data is missing', () => {
        const recap = buildRaceRecap(
            [
                makeRaceResult({
                    position: '1',
                    positionText: '1',
                    Driver: makeDriver({ driverId: 'bearman', givenName: 'Oliver', familyName: 'Bearman' }),
                    Constructor: makeConstructor({ constructorId: 'haas', name: 'Haas' }),
                    FastestLap: undefined,
                }),
            ],
            []
        );

        expect(recap.winner?.driverName).toBe('Oliver Bearman');
        expect(recap.podium).toHaveLength(1);
        expect(recap.pole).toBeNull();
        expect(recap.fastestLap).toBeNull();
        expect(recap.dnfCount).toBe(0);
    });
});

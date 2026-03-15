import { describe, expect, it } from 'vitest';
import type { Race } from '../types';
import { applyCanonicalRounds, normalizeRaceCalendar } from './f1Api';

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

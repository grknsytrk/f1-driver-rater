import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CompactSeasonBundle } from '../api/staticSeasonData';
import type { Race } from '../types';
import { NextRaceCountdown } from './NextRaceCountdown';

let container: HTMLDivElement;
let root: Root;

const qatarSprintRace: Race = {
    season: '2026',
    round: '22',
    raceName: 'Qatar Grand Prix',
    Circuit: {
        circuitId: 'losail',
        circuitName: 'Lusail International Circuit',
        url: '',
        Location: { locality: 'Lusail', country: 'Qatar' },
    },
    date: '2026-11-29',
    time: '16:00:00Z',
    FirstPractice: { date: '2026-11-27', time: '13:30:00Z' },
    SprintQualifying: { date: '2026-11-27', time: '17:30:00Z' },
    Sprint: { date: '2026-11-28', time: '14:00:00Z' },
    Qualifying: { date: '2026-11-28', time: '18:00:00Z' },
};

const pastRace: Race = {
    season: '2026',
    round: '21',
    raceName: 'Las Vegas Grand Prix',
    Circuit: {
        circuitId: 'vegas',
        circuitName: 'Las Vegas Street Circuit',
        url: '',
        Location: { locality: 'Las Vegas', country: 'USA' },
    },
    date: '2026-11-22',
    time: '04:00:00Z',
};

const debutRace: Race = {
    season: '2026',
    round: '16',
    raceName: 'Madrid Grand Prix',
    Circuit: {
        circuitId: 'madring',
        circuitName: 'IFEMA Madrid Circuit',
        url: '',
        Location: { locality: 'Madrid', country: 'Spain' },
    },
    date: '2026-09-13',
    time: '13:00:00Z',
};

const sampleBundles: CompactSeasonBundle[] = [
    {
        season: '2026',
        version: 2,
        generatedAt: '2026-11-22T00:00:00Z',
        isArchived: false,
        lastCompletedRound: 21,
        totalRounds: 24,
        races: [pastRace, qatarSprintRace],
        results: [],
        qualifying: [],
        sprints: [],
        driverStandings: [
            {
                position: '1',
                positionText: '1',
                points: '340',
                wins: '7',
                Driver: {
                    driverId: 'max_verstappen',
                    code: 'VER',
                    givenName: 'Max',
                    familyName: 'Verstappen',
                    url: '',
                },
            },
            {
                position: '3',
                positionText: '3',
                points: '280',
                wins: '3',
                Driver: {
                    driverId: 'leclerc',
                    code: 'LEC',
                    givenName: 'Charles',
                    familyName: 'Leclerc',
                    url: '',
                },
            },
        ],
        constructorStandings: [],
    },
    {
        season: '2024',
        version: 2,
        generatedAt: '2024-12-09T00:00:00Z',
        isArchived: true,
        lastCompletedRound: 24,
        totalRounds: 24,
        races: [{ ...qatarSprintRace, season: '2024', round: '23', date: '2024-12-01' }],
        results: [
            {
                round: '23',
                raceName: 'Qatar Grand Prix',
                date: '2024-12-01',
                driverId: 'max_verstappen',
                driverName: 'Max Verstappen',
                constructorId: 'red_bull',
                constructorName: 'Red Bull',
                gridPosition: 2,
                position: 1,
                points: 25,
                status: 'Finished',
            },
            {
                round: '23',
                raceName: 'Qatar Grand Prix',
                date: '2024-12-01',
                driverId: 'leclerc',
                driverName: 'Charles Leclerc',
                constructorId: 'ferrari',
                constructorName: 'Ferrari',
                gridPosition: 5,
                position: 2,
                points: 18,
                status: 'Finished',
            },
        ],
        qualifying: [],
        sprints: [
            {
                round: '23',
                driverId: 'leclerc',
                driverName: 'Charles Leclerc',
                constructorId: 'ferrari',
                constructorName: 'Ferrari',
                position: 5,
                points: 4,
                status: 'Finished',
            },
        ],
        driverStandings: [],
        constructorStandings: [],
    },
    {
        season: '2021',
        version: 2,
        generatedAt: '2021-12-12T00:00:00Z',
        isArchived: true,
        lastCompletedRound: 22,
        totalRounds: 22,
        races: [{ ...qatarSprintRace, season: '2021', round: '20', date: '2021-11-21' }],
        results: [
            {
                round: '20',
                raceName: 'Qatar Grand Prix',
                date: '2021-11-21',
                driverId: 'vettel',
                driverName: 'Sebastian Vettel',
                constructorId: 'aston_martin',
                constructorName: 'Aston Martin',
                gridPosition: 10,
                position: 1,
                points: 25,
                status: 'Finished',
            },
        ],
        qualifying: [],
        sprints: [],
        driverStandings: [],
        constructorStandings: [],
    },
];

beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-27T15:59:55Z'));
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
});

afterEach(async () => {
    await act(async () => {
        root.unmount();
    });
    container.remove();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('NextRaceCountdown', () => {
    it('renders upcoming GP countdown, ticks live per second, shows sprint timetable, and renders circuit history driver links', async () => {
        await act(async () => {
            root.render(
                <MemoryRouter>
                    <NextRaceCountdown
                        races={[pastRace, qatarSprintRace]}
                        season="2026"
                        historyBundles={sampleBundles}
                    />
                </MemoryRouter>,
            );
        });

        expect(container.textContent).toContain('Qatar Grand Prix');
        expect(container.textContent).toContain('Lusail International Circuit');
        expect(container.textContent).toContain('SPRINT WEEKEND');
        expect(container.textContent).toContain('ROUND 22');
        expect(container.textContent).not.toContain('NEXT SESSION');
        expect(container.querySelector('.podium-flag[data-country="QA"]')).not.toBeNull();

        // 2026-11-27T15:59:55Z -> 2026-11-29T16:00:00Z = 2d 0h 0m 5s
        const digitsEl = container.querySelector('[data-testid="countdown-digits"]')!;
        expect(digitsEl.textContent).toContain('02');
        expect(digitsEl.textContent).toContain('05');

        await act(async () => {
            await vi.advanceTimersByTimeAsync(1000);
        });
        expect(digitsEl.textContent).toContain('04');

        // Weekend sessions strip should include Sprint Quali & Sprint
        const scheduleGrid = container.querySelector('[data-testid="weekend-sessions-grid"]')!;
        expect(scheduleGrid.textContent).toContain('Practice 1');
        expect(scheduleGrid.textContent).toContain('Sprint Quali');
        expect(scheduleGrid.textContent).toContain('Sprint');
        expect(scheduleGrid.textContent).toContain('Qualifying');
        expect(scheduleGrid.textContent).toContain('Grand Prix');

        // History section should show Max Verstappen winner link + points totals
        const historySection = container.querySelector('[data-testid="circuit-history-section"]')!;
        expect(historySection.textContent).toContain('PREVIOUS WINNERS');
        expect(historySection.textContent).toContain('FROM P2');
        expect(historySection.textContent).toContain('25 PTS');
        expect(historySection.textContent).toContain('22 PTS'); // 18 GP + 4 Sprint

        const maxLink = historySection.querySelector<HTMLAnchorElement>('a[href="/2026/driver/max_verstappen"]');
        expect(maxLink).not.toBeNull();

        const leclercLink = historySection.querySelector<HTMLAnchorElement>('a[href="/2026/driver/leclerc"]');
        expect(leclercLink).not.toBeNull();

        const retiredVettelLink = historySection.querySelector<HTMLAnchorElement>('a[href="/2021/driver/vettel"]');
        expect(retiredVettelLink).not.toBeNull();

        // Keep RaceList's [role="button"] card selector clean
        expect(container.querySelectorAll('[role="button"]')).toHaveLength(0);
    });

    it('shows debut-circuit state when circuit has no prior static bundle history', async () => {
        vi.setSystemTime(new Date('2026-09-01T12:00:00Z'));

        await act(async () => {
            root.render(
                <MemoryRouter>
                    <NextRaceCountdown
                        races={[debutRace]}
                        season="2026"
                        historyBundles={sampleBundles}
                    />
                </MemoryRouter>,
            );
        });

        expect(container.textContent).toContain('DEBUT CIRCUIT');
    });

    it('renders nothing when all season races are completed', async () => {
        vi.setSystemTime(new Date('2026-12-20T12:00:00Z'));

        await act(async () => {
            root.render(
                <MemoryRouter>
                    <NextRaceCountdown
                        races={[pastRace, qatarSprintRace]}
                        season="2026"
                        historyBundles={sampleBundles}
                    />
                </MemoryRouter>,
            );
        });

        expect(container.querySelector('[data-testid="next-race-countdown"]')).toBeNull();
    });
});

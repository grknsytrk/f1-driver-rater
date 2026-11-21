import { act, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DriverStanding, SeasonQualifyingResult, SeasonRaceResult } from '../api/f1Api';
import { DriverVersus } from './DriverVersus';

const apiMocks = vi.hoisted(() => ({
    results: vi.fn(),
    quali: vi.fn(),
    standings: vi.fn(),
    staticBundle: vi.fn(),
}));

vi.mock('../api/f1Api', async importOriginal => ({
    ...await importOriginal<typeof import('../api/f1Api')>(),
    getAllSeasonResults: apiMocks.results,
    getAllSeasonQualifying: apiMocks.quali,
    getDriverStandings: apiMocks.standings,
}));

vi.mock('../api/staticSeasonData', async importOriginal => ({
    ...await importOriginal<typeof import('../api/staticSeasonData')>(),
    loadStaticSeasonData: apiMocks.staticBundle,
}));

vi.mock('../hooks/useCommunityRatings', async importOriginal => ({
    ...await importOriginal<typeof import('../hooks/useCommunityRatings')>(),
    useCommunityRatings: (_kind: string, season: string) => ({
        status: 'ready' as const,
        ratings: season === '2023'
            ? [{ driverId: 'max_verstappen', round: '1', averageRating: 9.6, voteCount: 40 }]
            : [
                { driverId: 'norris', round: '1', averageRating: 8.9, voteCount: 25 },
                { driverId: 'leclerc', round: '1', averageRating: 8.5, voteCount: 20 },
                { driverId: 'max_verstappen', round: '1', averageRating: 8.8, voteCount: 22 },
            ],
    }),
    useCommunityRatingDistribution: () => ({ status: 'disabled' as const, distribution: null }),
}));

function makeRace(round: string, driverId: string, driverName: string, constructorId: string, constructorName: string, position: number | null, points: number): SeasonRaceResult {
    return {
        round,
        raceName: `Round ${round}`,
        date: '2026-03-01',
        driverId,
        driverName,
        constructorId,
        constructorName,
        position,
        points,
        status: position === null ? 'Retired' : 'Finished',
    };
}

function makeQuali(round: string, driverId: string, driverName: string, constructorId: string, constructorName: string, position: number): SeasonQualifyingResult {
    return {
        round,
        raceName: `Round ${round}`,
        date: '2026-03-01',
        driverId,
        driverName,
        constructorId,
        constructorName,
        position,
        bestTimeSeconds: 80 + position * 0.1,
    };
}

function makeStanding(position: string, driverId: string, driverName: string, constructorId: string, constructorName: string, points: string): DriverStanding {
    const [givenName, ...rest] = driverName.split(' ');
    const familyName = rest.join(' ');
    return {
        position,
        positionText: position,
        points,
        wins: '0',
        Driver: { driverId, givenName, familyName, url: '' },
        Constructors: [{ constructorId, name: constructorName, url: '' }],
    };
}

const DATA_BY_SEASON: Record<string, { races: SeasonRaceResult[]; qualis: SeasonQualifyingResult[]; standings: DriverStanding[] }> = {
    '2026': {
        standings: [
            makeStanding('1', 'norris', 'Lando Norris', 'mclaren', 'McLaren', '50'),
            makeStanding('2', 'leclerc', 'Charles Leclerc', 'ferrari', 'Ferrari', '36'),
            makeStanding('3', 'max_verstappen', 'Max Verstappen', 'red_bull', 'Red Bull', '25'),
        ],
        races: [
            makeRace('1', 'norris', 'Lando Norris', 'mclaren', 'McLaren', 1, 25),
            makeRace('1', 'leclerc', 'Charles Leclerc', 'ferrari', 'Ferrari', 2, 18),
            makeRace('2', 'norris', 'Lando Norris', 'mclaren', 'McLaren', 1, 25),
            makeRace('2', 'leclerc', 'Charles Leclerc', 'ferrari', 'Ferrari', 2, 18),
        ],
        qualis: [
            makeQuali('1', 'norris', 'Lando Norris', 'mclaren', 'McLaren', 1),
            makeQuali('1', 'leclerc', 'Charles Leclerc', 'ferrari', 'Ferrari', 2),
        ],
    },
    '2025': {
        standings: [
            makeStanding('1', 'max_verstappen', 'Max Verstappen', 'red_bull', 'Red Bull', '40'),
            makeStanding('2', 'norris', 'Lando Norris', 'mclaren', 'McLaren', '30'),
        ],
        races: [
            makeRace('1', 'max_verstappen', 'Max Verstappen', 'red_bull', 'Red Bull', 1, 25),
            makeRace('1', 'norris', 'Lando Norris', 'mclaren', 'McLaren', 2, 18),
        ],
        qualis: [
            makeQuali('1', 'max_verstappen', 'Max Verstappen', 'red_bull', 'Red Bull', 1),
        ],
    },
    '2023': {
        standings: [
            makeStanding('1', 'max_verstappen', 'Max Verstappen', 'red_bull', 'Red Bull', '575'),
            makeStanding('2', 'leclerc', 'Charles Leclerc', 'ferrari', 'Ferrari', '206'),
        ],
        races: [
            makeRace('1', 'max_verstappen', 'Max Verstappen', 'red_bull', 'Red Bull', 1, 25),
            makeRace('1', 'leclerc', 'Charles Leclerc', 'ferrari', 'Ferrari', 2, 18),
        ],
        qualis: [
            makeQuali('1', 'max_verstappen', 'Max Verstappen', 'red_bull', 'Red Bull', 1),
        ],
    },
};

function LocationProbe() {
    return <span data-testid="search">{useLocation().search}</span>;
}

let container: HTMLDivElement;
let root: Root;

function currentParams() {
    return new URLSearchParams(container.querySelector('[data-testid="search"]')!.textContent ?? '');
}

async function flush() {
    await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
    });
}

async function renderView(initialEntry: string, onSelectDriver?: (driverId: string, season?: string) => void) {
    await act(async () => {
        root.render(
            <MemoryRouter initialEntries={[initialEntry]}>
                <LocationProbe />
                <DriverVersus
                    defaultSeason="2026"
                    toggle={<div data-testid="toggle" />}
                    onSelectDriver={onSelectDriver}
                />
            </MemoryRouter>,
        );
    });
    await flush();
    await flush();
}

describe('DriverVersus component', () => {
    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        localStorage.clear();
        apiMocks.results.mockImplementation(async (s: string) => DATA_BY_SEASON[s]?.races ?? []);
        apiMocks.quali.mockImplementation(async (s: string) => DATA_BY_SEASON[s]?.qualis ?? []);
        apiMocks.standings.mockImplementation(async (s: string) => DATA_BY_SEASON[s]?.standings ?? []);
        apiMocks.staticBundle.mockImplementation(async (s: string) => {
            const d = DATA_BY_SEASON[s];
            if (!d) return null;
            return {
                driverStandings: d.standings,
                results: d.races,
            };
        });
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
    });

    afterEach(async () => {
        await act(async () => root.unmount());
        container.remove();
        localStorage.clear();
        vi.clearAllMocks();
        vi.unstubAllGlobals();
    });

    it('defaults to the top two WDC drivers in defaultSeason and renders H2H + community distributions', async () => {
        await renderView('/2026/teammate-wars?mode=driver-vs');

        const driverA = container.querySelector<HTMLSelectElement>('select[aria-label="Driver DRIVER A"]')!;
        const driverB = container.querySelector<HTMLSelectElement>('select[aria-label="Driver DRIVER B"]')!;

        expect(driverA.value).toBe('norris');
        expect(driverB.value).toBe('leclerc');
        expect(container.textContent).toContain('WDC Position');
        expect(container.textContent).toContain('Points / Race');
        expect(container.textContent).toContain('Race H2H');
        expect(container.textContent).toContain('2026 COMMUNITY DIST');
    });

    it('supports cross-season driver comparison from URL and omits same-season direct H2H rows', async () => {
        await renderView('/2026/teammate-wars?mode=driver-vs&sa=2023&da=max_verstappen&sb=2026&db=norris');

        expect(container.textContent).toContain('CROSS-SEASON BATTLE');
        expect(container.textContent).toContain('575');
        expect(container.textContent).toContain('50');
        expect(container.textContent).not.toContain('Race H2H');
        expect(container.textContent).not.toContain('Quali H2H');
    });

    it('renders ERA BATTLE badge and season chips when URL specifies same driver across seasons', async () => {
        await renderView('/2026/teammate-wars?mode=driver-vs&sa=2023&da=max_verstappen&sb=2025&db=max_verstappen');

        expect(container.textContent).toContain('ERA BATTLE');
        expect(container.textContent).toContain('SAME DRIVER');
    });

    it('switches to same driver across seasons when clicking VS SELF', async () => {
        await renderView('/2026/teammate-wars?mode=driver-vs');
        const vsSelfButton = container.querySelector<HTMLButtonElement>('button[aria-label="Compare same driver across seasons"]')!;
        await act(async () => {
            vsSelfButton.click();
        });
        await flush();

        expect(currentParams().get('da')).toBe('norris');
        expect(currentParams().get('db')).toBe('norris');
        expect(currentParams().get('sb')).toBe('2025');
        expect(container.textContent).toContain('ERA BATTLE');
    });

    it('swaps both seasons and drivers with the swap button', async () => {
        await renderView('/2026/teammate-wars?mode=driver-vs&sa=2023&da=max_verstappen&sb=2026&db=norris');

        await act(async () => {
            container.querySelector<HTMLButtonElement>('button[aria-label="Swap drivers"]')!.click();
        });

        const params = currentParams();
        expect(params.get('sa')).toBe('2026');
        expect(params.get('da')).toBe('norris');
        expect(params.get('sb')).toBe('2023');
        expect(params.get('db')).toBe('max_verstappen');
    });

    it('swaps rather than duplicating when selecting the identical driver in the same season', async () => {
        await renderView('/2026/teammate-wars?mode=driver-vs');

        const driverB = container.querySelector<HTMLSelectElement>('select[aria-label="Driver DRIVER B"]')!;
        await act(async () => {
            driverB.value = 'norris';
            driverB.dispatchEvent(new Event('change', { bubbles: true }));
        });

        expect(currentParams().get('da')).toBe('leclerc');
        expect(currentParams().get('db')).toBe('norris');
    });

    it('passes the selected driver season when clicking a driver profile link', async () => {
        const onSelectDriver = vi.fn();
        await renderView('/2026/teammate-wars?mode=driver-vs&sa=2023&da=max_verstappen&sb=2026&db=norris', onSelectDriver);

        const maxLink = container.querySelector<HTMLAnchorElement>('a[title="View Max Verstappen (2023) profile"]')!;
        expect(maxLink.getAttribute('href')).toBe('/2023/driver/max_verstappen');
        await act(async () => {
            maxLink.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
        });

        expect(onSelectDriver).toHaveBeenCalledWith('max_verstappen', '2023');
    });

    it('resolves loading state cleanly under React StrictMode double-mount', async () => {
        await act(async () => {
            root.render(
                <StrictMode>
                    <MemoryRouter initialEntries={['/2026/teammate-wars?mode=driver-vs&sa=2026&da=hamilton&sb=2026&db=leclerc']}>
                        <LocationProbe />
                        <DriverVersus
                            defaultSeason="2026"
                            toggle={<div data-testid="toggle" />}
                        />
                    </MemoryRouter>
                </StrictMode>,
            );
        });
        await flush();
        await flush();

        expect(container.textContent).not.toContain('LOADING COMPARISON');
        expect(container.textContent).toContain('WDC Position');
        expect(container.textContent).toContain('NORRIS');
        expect(container.textContent).toContain('LECLERC');
    });
});

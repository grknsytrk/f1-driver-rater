import { act, cloneElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from './ui/tooltip';
import { ResultsDashboard } from './ResultsDashboard';

const communityFixture = vi.hoisted(() => ({
    ratings: [
        { driverId: 'lec', round: '1', averageRating: 6, voteCount: 100 },
        { driverId: 'lec', round: '2', averageRating: 10, voteCount: 1 },
        { driverId: 'lec', round: '7', averageRating: 8, voteCount: 5 },
        { driverId: 'nor', round: '7', averageRating: 7, voteCount: 10 },
    ],
}));

vi.mock('recharts', async importOriginal => ({
    ...await importOriginal<typeof import('recharts')>(),
    ResponsiveContainer: ({ children }: { children: ReactElement<{ width: number; height: number }> }) =>
        cloneElement(children, { width: 800, height: 420 }),
}));

vi.mock('../hooks/useCommunityRatings', () => ({
    useRatingStorage: () => '',
    useCommunityRatings: () => ({ status: 'ready', ratings: communityFixture.ratings }),
}));

vi.mock('../api/f1Api', async importOriginal => ({
    ...await importOriginal<typeof import('../api/f1Api')>(),
    getRaces: vi.fn(async () => [
        { round: '1', raceName: 'Australian Grand Prix' },
        { round: '2', raceName: 'Chinese Grand Prix' },
        { round: '7', raceName: 'Barcelona-Catalunya Grand Prix' },
    ]),
    getSeasonDrivers: vi.fn(async () => [
        { driverId: 'nor', givenName: 'Lando', familyName: 'Norris', constructorId: 'mclaren', constructorName: 'McLaren' },
    ]),
}));

vi.mock('./CommunityRatingRows', () => ({ CommunityRatingRows: () => null }));

vi.mock('../utils/storage', async importOriginal => ({
    ...await importOriginal<typeof import('../utils/storage')>(),
    calculateAverages: () => [
        { driverId: 'lec', driverName: 'Charles Leclerc', constructorId: 'ferrari', constructorName: 'Ferrari', averageRating: 9, totalRaces: 2, ratings: [9, 9] },
        { driverId: 'ham', driverName: 'Lewis Hamilton', constructorId: 'ferrari', constructorName: 'Ferrari', averageRating: 7, totalRaces: 1, ratings: [7] },
    ],
    getRatedRacesCount: () => 2,
    getDriverFormSeries: () => [],
    getSeasonRatings: () => ({ season: '2026', races: [
        { round: '1', raceName: 'Australian Grand Prix', date: '2026-03-01', completed: true, ratings: [
            { driverId: 'lec', driverName: 'Charles Leclerc', constructorId: 'ferrari', constructorName: 'Ferrari', rating: 9 },
        ] },
    ] }),
    getRaceByRaceMatrix: () => ({
        races: [
            { round: '1', raceName: 'Australian', countryCode: 'AU' },
            { round: '2', raceName: 'Chinese', countryCode: 'CN' },
        ],
        drivers: [
            { driverId: 'lec', driverName: 'Charles Leclerc', constructorId: 'ferrari', constructorName: 'Ferrari', totalAverage: 9, raceRatings: { '1': 9, '2': 9 } },
            { driverId: 'ham', driverName: 'Lewis Hamilton', constructorId: 'ferrari', constructorName: 'Ferrari', totalAverage: 7, raceRatings: { '1': 7 } },
        ],
    }),
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    communityFixture.ratings = [
        { driverId: 'lec', round: '1', averageRating: 6, voteCount: 100 },
        { driverId: 'lec', round: '2', averageRating: 10, voteCount: 1 },
        { driverId: 'lec', round: '7', averageRating: 8, voteCount: 5 },
        { driverId: 'nor', round: '7', averageRating: 7, voteCount: 10 },
    ];
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
});

afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
});

describe('race-by-race rating source', () => {
    it('switches cells and row averages between personal ratings and community averages', async () => {
        await act(async () => root.render(<TooltipProvider><ResultsDashboard season="2026" onReset={() => {}} /></TooltipProvider>));
        const rows = () => [...container.querySelectorAll('table[aria-label="Race-by-race breakdown"] tbody tr')];
        const raceHeaders = () => [...container.querySelectorAll('table[aria-label="Race-by-race breakdown"] thead th')].slice(3);
        expect(raceHeaders()).toHaveLength(2);
        expect(rows()[0].textContent).toContain('9.0');
        expect(rows()[0].textContent).not.toContain('6.00');

        const sourceButtons = container.querySelector('[role="group"][aria-label="Race breakdown rating source"]')!;
        const communityButton = [...sourceButtons.querySelectorAll('button')].find(button => button.textContent?.trim() === 'COMMUNITY AVG')!;
        await act(async () => communityButton.click());
        expect(communityButton.getAttribute('aria-pressed')).toBe('true');
        expect(raceHeaders()).toHaveLength(3);
        expect(raceHeaders()[2].getAttribute('title')).toBe('Barcelona-Catalunya Grand Prix');
        expect(raceHeaders()[2].querySelector('svg')).not.toBeNull();
        expect(rows()[0].textContent).toContain('8.00');
        expect(rows()[0].textContent).toContain('6.00');
        expect(rows()[0].textContent).toContain('10.00');
        expect(rows()[1].textContent).toContain('NORRIS');
        expect(rows()[1].querySelectorAll('td')[3].textContent).toBe('-');
        expect(rows()[0].querySelectorAll('td')[3].querySelector('span')?.title).toBe('100 community votes');

        const personalButton = [...sourceButtons.querySelectorAll('button')].find(button => button.textContent?.trim() === 'MY RATINGS')!;
        await act(async () => personalButton.click());
        expect(raceHeaders()).toHaveLength(2);
        expect(rows()[0].textContent).toContain('9.0');
        expect(rows()[0].textContent).not.toContain('6.00');
    });

    it('shows an empty state and blocks PNG export when matching community votes are absent', async () => {
        communityFixture.ratings = [];
        await act(async () => root.render(<TooltipProvider><ResultsDashboard season="2026" onReset={() => {}} /></TooltipProvider>));
        const group = container.querySelector('[role="group"][aria-label="Race breakdown rating source"]')!;
        const communityButton = [...group.querySelectorAll('button')].find(button => button.textContent?.trim() === 'COMMUNITY AVG')!;
        await act(async () => communityButton.click());

        expect(container.textContent).toContain('NO COMMUNITY RATINGS YET');
        expect(container.querySelector<HTMLButtonElement>('button[aria-label="Download the race-by-race breakdown table as a PNG image"]')?.disabled).toBe(true);
        expect(container.querySelector('table[aria-label="Race-by-race breakdown"]')?.parentElement?.classList.contains('hidden')).toBe(true);
    });
});

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SeasonAwardsPage } from './SeasonAwardsPage';

const pageMocks = vi.hoisted(() => ({
    community: {
        status: 'loading' as 'loading' | 'ready' | 'disabled' | 'unavailable',
        ratings: [] as { driverId: string; round?: string; averageRating: number; voteCount: number }[],
    },
    results: [] as {
        round: string;
        raceName: string;
        date: string;
        driverId: string;
        driverName: string;
        constructorId: string;
        constructorName: string;
        position: number | null;
        points: number;
        status: string;
    }[],
    resultsUnavailable: false,
}));

vi.mock('../hooks/useCommunityRatings', () => ({
    useCommunityRatings: () => pageMocks.community,
}));

vi.mock('../api/f1Api', () => ({
    getAllSeasonResults: () => pageMocks.resultsUnavailable
        ? Promise.reject(new Error('Results unavailable'))
        : Promise.resolve(pageMocks.results),
}));

let container: HTMLDivElement;
let root: Root;

const results = [
    {
        round: '1', raceName: 'Bahrain Grand Prix', date: '2024-03-02', driverId: 'max_verstappen',
        driverName: 'Max Verstappen', constructorId: 'red_bull', constructorName: 'Red Bull',
        position: 1, points: 25, status: 'Finished',
    },
];

beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    localStorage.clear();
    pageMocks.community = { status: 'loading', ratings: [] };
    pageMocks.results = results;
    pageMocks.resultsUnavailable = false;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
});

async function renderAwards() {
    await act(async () => {
        root.render(<SeasonAwardsPage season="2024" />);
        await Promise.resolve();
    });
}

describe('SeasonAwardsPage community states', () => {
    it('shows a loading state while community ratings are loading', async () => {
        await renderAwards();

        expect(container.textContent).toContain('Loading community awards');
    });

    it.each(['disabled', 'unavailable'] as const)('explains when community ratings are %s without using local ratings', async status => {
        pageMocks.community = { status, ratings: [] };
        localStorage.setItem('f1_pilot_ratings', JSON.stringify({ '2024': { localOnly: 10 } }));

        await renderAwards();

        expect(container.textContent).toContain(status === 'disabled' ? 'Community ratings unavailable' : 'Community ratings could not load');
        expect(container.textContent).not.toContain('Local Only');
        expect(container.textContent).not.toContain('Finish the grid');
    });

    it('waits for a community rating when the query is empty', async () => {
        pageMocks.community = { status: 'ready', ratings: [] };

        await renderAwards();

        expect(container.textContent).toContain('Waiting for community ratings');
        expect(container.textContent).not.toContain('Finish the grid');
    });

    it('opens on partial community data and shows awards that meet their own thresholds', async () => {
        pageMocks.community = {
            status: 'ready',
            ratings: [{ driverId: 'max_verstappen', round: '1', averageRating: 9.5, voteCount: 1 }],
        };

        await renderAwards();

        expect(container.textContent).toContain('2024 Wrapped');
        expect(container.textContent).toContain('1/1');
        expect(container.textContent).toContain('Drivers rated by community');
        expect(container.textContent).toContain('Awards ready');
        expect(container.textContent).toContain('MaxVerstappen');
        expect(container.textContent).toContain('Community season awards');
        expect(container.textContent).not.toContain('personal season awards');
    });

    it('shows a data-unavailable state if season race results fail to load', async () => {
        pageMocks.community = {
            status: 'ready',
            ratings: [{ driverId: 'max_verstappen', round: '1', averageRating: 9.5, voteCount: 1 }],
        };
        pageMocks.resultsUnavailable = true;

        await renderAwards();
        await act(async () => { await Promise.resolve(); });

        expect(container.textContent).toContain('Race data unavailable');
    });
});

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SeasonAwardsPage } from './SeasonAwardsPage';

const pageMocks = vi.hoisted(() => ({
    community: {
        status: 'loading' as 'loading' | 'ready' | 'disabled' | 'unavailable',
        ratings: [] as { driverId: string; round?: string; averageRating: number; voteCount: number }[],
    },
    distributions: {
        status: 'loading' as 'loading' | 'ready' | 'disabled' | 'unavailable',
        distributions: [] as unknown[],
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
        started: boolean;
        raceTimeGapSeconds: number | null;
    }[],
    resultsUnavailable: false,
}));

vi.mock('../hooks/useCommunityRatings', () => ({
    useCommunityRatings: () => pageMocks.community,
    useCommunityRatingDistributions: () => pageMocks.distributions,
}));

vi.mock('../api/f1Api', () => ({
    getAllSeasonResults: () => pageMocks.resultsUnavailable
        ? Promise.reject(new Error('Results unavailable'))
        : Promise.resolve(pageMocks.results),
    getAllSeasonQualifying: () => Promise.resolve([]),
}));

let container: HTMLDivElement;
let root: Root;

const results = [
    {
        round: '1', raceName: 'Bahrain Grand Prix', date: '2024-03-02', driverId: 'max_verstappen',
        driverName: 'Max Verstappen', constructorId: 'red_bull', constructorName: 'Red Bull',
        position: 1, points: 25, status: 'Finished', started: true, raceTimeGapSeconds: 0,
    },
];

beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    pageMocks.community = { status: 'loading', ratings: [] };
    pageMocks.distributions = { status: 'loading', distributions: [] };
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
        await Promise.resolve();
        await Promise.resolve();
    });
}

describe('SeasonAwardsPage', () => {
    it('shows per-award loading while community metrics are loading', async () => {
        await renderAwards();

        expect(container.textContent).toContain('Loading this award’s data');
        expect(container.textContent).toContain('On-Track Performance');
    });

    it('keeps on-track awards visible when community ratings are disabled', async () => {
        pageMocks.community = { status: 'disabled', ratings: [] };
        pageMocks.distributions = { status: 'disabled', distributions: [] };

        await renderAwards();

        expect(container.textContent).toContain('Community Opinion');
        expect(container.textContent).toContain('On-Track Performance');
        expect(container.textContent).toContain('Race Comeback');
        expect(container.textContent).toContain('Community rating data is not configured');
    });

    it('shows methodology and opens on partial community data', async () => {
        pageMocks.community = {
            status: 'ready',
            ratings: [{ driverId: 'max_verstappen', round: '1', averageRating: 9.5, voteCount: 1 }],
        };
        pageMocks.distributions = { status: 'ready', distributions: [] };

        await renderAwards();

        expect(container.textContent).toContain('2024 Wrapped');
        expect(container.textContent).toContain('Community-rated GPs');
        expect(container.textContent).toContain('Data source');
        expect(container.textContent).toContain('Winner rule');
        expect(container.textContent).toContain('MaxVerstappen');
        expect(container.textContent).not.toContain('personal season awards');
    });

    it('renders an explicit empty state when community data has no ratings', async () => {
        pageMocks.community = { status: 'ready', ratings: [] };
        pageMocks.distributions = { status: 'ready', distributions: [] };

        await renderAwards();

        expect(container.textContent).toContain('Community MVP');
        expect(container.textContent).toContain('not enough eligible data');
        expect(container.textContent).toContain('On-Track Performance');
    });

    it('shows a data-unavailable state if official race results fail to load', async () => {
        pageMocks.resultsUnavailable = true;

        await renderAwards();
        await act(async () => { await Promise.resolve(); });

        expect(container.textContent).toContain('Race data unavailable');
    });
});

import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AverageRating } from '../types';
import type { CommunityComparison } from '../utils/communityRatings';
import { normalizeCommunityDistributions } from '../utils/communityRatingDistribution';
import { CommunityRatingRows, type CommunityDriverRatingRow } from './CommunityRatingRows';

const hookMock = vi.hoisted(() => ({
    result: { status: 'ready' as string, distribution: null as unknown },
    calls: [] as unknown[][],
}));

vi.mock('../hooks/useCommunityRatings', () => ({
    useCommunityRatingDistribution: (...args: unknown[]) => {
        hookMock.calls.push(args);
        return hookMock.result;
    },
}));

vi.mock('recharts', () => ({
    Bar: () => null,
    BarChart: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    CartesianGrid: () => null,
    Cell: () => null,
    ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    Tooltip: () => null,
    XAxis: () => null,
    YAxis: () => null,
}));

const norris: AverageRating = {
    driverId: 'norris', driverName: 'Lando Norris', constructorId: 'mclaren', constructorName: 'McLaren',
    averageRating: 8.1, totalRaces: 2, ratings: [8, 8.2],
};
const piastri: AverageRating = {
    driverId: 'piastri', driverName: 'Oscar Piastri', constructorId: 'mclaren', constructorName: 'McLaren',
    averageRating: 7.5, totalRaces: 1, ratings: [7.5],
};

function row(driver: AverageRating, communityAverage: number | null, voteCount: number): CommunityDriverRatingRow {
    const comparison: CommunityComparison = {
        myAverage: driver.averageRating, communityAverage, voteCount, raceCount: 2, personalRaceCount: 2,
    };
    return { driver, comparison };
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    hookMock.result = { status: 'ready', distribution: null };
    hookMock.calls = [];
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
});

afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
});

async function render(rows = [row(norris, 7.9, 5), row(piastri, 8, 4)], source: 'race' | 'quick' = 'race') {
    await act(async () => root.render(
        <CommunityRatingRows
            rows={rows}
            season="2025"
            source={source}
            communityStatus="ready"
            communityVisible
        />,
    ));
}

function toggle(driverId: string) {
    return container.querySelector<HTMLButtonElement>(`[data-testid="community-rating-row-${driverId}"]`)!;
}

describe('CommunityRatingRows', () => {
    it('expands one driver at a time and preserves the existing community average', async () => {
        const buckets = Array.from({ length: 20 }, (_, index) => ({
            score: (index + 1) / 2,
            count: (index + 1) / 2 === 5 ? 5 : 0,
        }));
        hookMock.result = {
            status: 'ready',
            distribution: normalizeCommunityDistributions([
                { driver_id: 'norris', round: '1', vote_count: 5, rating_distribution: buckets },
            ], 'race')[0],
        };
        await render();

        expect(container.textContent).toContain('8.10');
        expect(container.textContent).toContain('7.90');
        await act(async () => toggle('norris').click());
        expect(toggle('norris').getAttribute('aria-expanded')).toBe('true');
        expect(container.textContent).toContain('POOLED AVG');
        expect(container.textContent).toContain('CONSENSUS');
        expect(container.textContent).toContain('AGREEMENT');
        expect(container.textContent).toContain('100.0');
        expect(container.textContent).toContain('1/1 RACES ASSESSED');
        expect(container.textContent).toContain('Selected ratings may be included in this community data.');
        expect(container.querySelectorAll('[role="region"]')).toHaveLength(1);
        expect(hookMock.calls.at(-1)).toEqual(['race', '2025', 'norris']);

        await act(async () => toggle('piastri').click());
        expect(toggle('norris').getAttribute('aria-expanded')).toBe('false');
        expect(toggle('piastri').getAttribute('aria-expanded')).toBe('true');
        expect(container.querySelectorAll('[role="region"]')).toHaveLength(1);
        expect(container.textContent).toContain('8.10');
        expect(container.textContent).toContain('7.90');

        await act(async () => toggle('piastri').click());
        expect(toggle('piastri').getAttribute('aria-expanded')).toBe('false');
        expect(container.querySelectorAll('[role="region"]')).toHaveLength(0);
    });

    it('shows early data with one vote and does not request a distribution', async () => {
        await render([row(norris, 7.9, 1)]);
        await act(async () => toggle('norris').click());
        expect(container.textContent).toContain('Early data · 1/2 votes');
        expect(container.textContent).not.toContain('POOLED AVG');
        expect(container.textContent).toContain('Selected ratings may be included in this community data.');
        expect(hookMock.calls.at(-1)).toEqual(['race', '2025', null]);
    });

    it('assesses two opinions about the same race', async () => {
        const buckets = Array.from({ length: 20 }, (_, index) => ({ score: (index + 1) / 2, count: index === 15 ? 2 : 0 }));
        hookMock.result = { status: 'ready', distribution: normalizeCommunityDistributions([
            { driver_id: 'norris', round: '1', vote_count: 2, rating_distribution: buckets },
        ], 'race')[0] };
        await render([row(norris, 7.9, 2)]);
        await act(async () => toggle('norris').click());
        expect(container.textContent).toContain('CONSENSUS');
        expect(container.textContent).toContain('100.0');
        expect(hookMock.calls.at(-1)).toEqual(['race', '2025', 'norris']);
    });

    it('shows early data and zero coverage for single votes in multiple races', async () => {
        const buckets = Array.from({ length: 20 }, (_, index) => ({ score: (index + 1) / 2, count: index === 15 ? 1 : 0 }));
        hookMock.result = { status: 'ready', distribution: normalizeCommunityDistributions(['1', '2', '3'].map(round => ({
            driver_id: 'norris', round, vote_count: 1, rating_distribution: buckets,
        })), 'race')[0] };
        await render([row(norris, 7.9, 3)]);
        await act(async () => toggle('norris').click());
        expect(container.textContent).toContain('EARLY DATA');
        expect(container.textContent).toContain('0/3 RACES ASSESSED');
        expect(container.textContent).toContain('POOLED AVG');
        expect(container.textContent).not.toContain('CONSENSUS');
    });

    it('shows a zero score and low agreement for two distant Quick Rate votes', async () => {
        const buckets = Array.from({ length: 20 }, (_, index) => ({
            score: (index + 1) / 2, count: index === 0 || index === 19 ? 1 : 0,
        }));
        hookMock.result = { status: 'ready', distribution: normalizeCommunityDistributions([
            { driver_id: 'norris', round: null, vote_count: 2, rating_distribution: buckets },
        ], 'quick')[0] };
        await render([row(norris, 7.9, 2)], 'quick');
        await act(async () => toggle('norris').click());
        expect(container.textContent).toContain('LOW AGREEMENT');
        expect(container.textContent).toContain('0.0');
        expect(container.textContent).toContain('Quick Rate votes');
        expect(container.textContent).not.toContain('RACES ASSESSED');
        expect(hookMock.calls.at(-1)).toEqual(['quick', '2025', 'norris']);
    });

    it('shows a clear empty state when a driver has no community votes', async () => {
        await render([row(norris, null, 0)]);
        await act(async () => toggle('norris').click());
        expect(container.textContent).toContain('No community data for this driver.');
    });

    it.each([
        ['loading', 'Loading rating distribution…'],
        ['unavailable', 'Community distribution unavailable.'],
    ])('handles the %s distribution state without hiding existing averages', async (status, message) => {
        hookMock.result = { status, distribution: null };
        await render([row(norris, 7.9, 6)]);
        await act(async () => toggle('norris').click());
        expect(container.textContent).toContain(message);
        expect(container.textContent).toContain('8.10');
        expect(container.textContent).toContain('7.90');
    });
});

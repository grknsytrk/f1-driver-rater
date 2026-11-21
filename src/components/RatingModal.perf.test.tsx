import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RatingModal } from './RatingModal';
import { getRaceRatings } from '../utils/storage';

vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);

const mockCommunityValueRender = vi.fn();

vi.mock('../api/f1Api', async importOriginal => ({
    ...await importOriginal<typeof import('../api/f1Api')>(),
    getRaceRatingContext: vi.fn(async () => ({
        drivers: [
            {
                driver: {
                    driverId: 'leclerc',
                    givenName: 'Charles',
                    familyName: 'Leclerc',
                    url: '',
                },
                constructor: {
                    constructorId: 'ferrari',
                    name: 'Ferrari',
                    url: '',
                },
                position: '1',
                grid: '1',
                gap: '1:30:00.000',
                laps: '58',
                status: 'Finished',
            },
            {
                driver: {
                    driverId: 'norris',
                    givenName: 'Lando',
                    familyName: 'Norris',
                    url: '',
                },
                constructor: {
                    constructorId: 'mclaren',
                    name: 'McLaren',
                    url: '',
                },
                position: '2',
                grid: '2',
                gap: '+2.500s',
                laps: '58',
                status: 'Finished',
            },
        ],
        recap: {
            winner: null,
            podium: [],
            pole: null,
            fastestLap: null,
            dnfCount: 0,
        },
    })),
}));

vi.mock('../utils/delay', () => ({
    fetchWithMinDelay: <T,>(fetcher: () => Promise<T>) => fetcher(),
}));

const stableRequestAcceptance = (action: () => void) => action();
const stablePolicyConsent = {
    requestAcceptance: stableRequestAcceptance,
    overlays: null,
};

vi.mock('../hooks/useSitePolicyConsent', () => ({
    useSitePolicyConsent: () => stablePolicyConsent,
}));

const stableCommunityState = {
    status: 'ready' as const,
    ratings: [
        { driverId: 'leclerc', round: '1', averageRating: 8.5, voteCount: 12 },
        { driverId: 'norris', round: '1', averageRating: 7.5, voteCount: 10 },
    ],
};

vi.mock('../hooks/useCommunityRatings', async importOriginal => {
    const actual = await importOriginal<typeof import('../hooks/useCommunityRatings')>();
    return {
        ...actual,
        useCommunityRatings: () => stableCommunityState,
    };
});

vi.mock('./CommunityRating', async importOriginal => {
    const actual = await importOriginal<typeof import('./CommunityRating')>();
    return {
        ...actual,
        CommunityValue: (props: Parameters<typeof actual.CommunityValue>[0]) => {
            mockCommunityValueRender((props.rating as { driverId?: string } | undefined)?.driverId);
            return actual.CommunityValue(props);
        },
    };
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
    localStorage.clear();
    mockCommunityValueRender.mockClear();
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
});

afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    localStorage.clear();
});

describe('RatingModal row memoization and hover isolation', () => {
    it('isolates segment hover re-renders to the hovered driver row and persists toggled scores', async () => {
        await act(async () => {
            root.render(
                <RatingModal
                    season="2026"
                    race={{ season: '2026', round: '1', raceName: 'Australian Grand Prix', date: '2026-03-15' }}
                    onClose={() => {}}
                />,
            );
        });

        expect(mockCommunityValueRender).toHaveBeenCalledWith('leclerc');
        expect(mockCommunityValueRender).toHaveBeenCalledWith('norris');
        mockCommunityValueRender.mockClear();

        const leclercButton = container.querySelector<HTMLButtonElement>('button[aria-label="Charles Leclerc: 8.5 out of 10"]');
        expect(leclercButton).not.toBeNull();

        await act(async () => {
            leclercButton!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
        });

        // Hovering Charles Leclerc must update only Leclerc's row and never re-render sibling Norris
        expect(mockCommunityValueRender.mock.calls.map(call => call[0])).toEqual(['leclerc']);
        expect(container.textContent).toContain('8.50');

        mockCommunityValueRender.mockClear();
        await act(async () => {
            leclercButton!.click();
        });

        expect(leclercButton!.getAttribute('aria-pressed')).toBe('true');
        expect(getRaceRatings('2026', '1')?.ratings.find(r => r.driverId === 'leclerc')?.rating).toBe(8.5);
        expect(mockCommunityValueRender.mock.calls.map(call => call[0])).toEqual(['leclerc']);

        // Clicking the active rating again removes it
        await act(async () => {
            leclercButton!.click();
        });
        expect(leclercButton!.getAttribute('aria-pressed')).toBe('false');
        expect(getRaceRatings('2026', '1')?.ratings.find(r => r.driverId === 'leclerc')).toBeUndefined();
    });
});

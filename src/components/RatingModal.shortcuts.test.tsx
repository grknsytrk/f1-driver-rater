import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RatingModal } from './RatingModal';
import { QuickRateModal } from './QuickRateModal';
import { getQuickRatings, getRaceRatings } from '../utils/storage';

vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);

const consentState = { isOpen: false };

vi.mock('../api/f1Api', async importOriginal => ({
    ...await importOriginal<typeof import('../api/f1Api')>(),
    getRaceRatingContext: vi.fn(async () => ({
        drivers: [
            {
                driver: { driverId: 'leclerc', givenName: 'Charles', familyName: 'Leclerc', url: '' },
                constructor: { constructorId: 'ferrari', name: 'Ferrari', url: '' },
                position: '1',
                grid: '1',
                gap: '1:30:00.000',
                laps: '58',
                status: 'Finished',
            },
            {
                driver: { driverId: 'norris', givenName: 'Lando', familyName: 'Norris', url: '' },
                constructor: { constructorId: 'mclaren', name: 'McLaren', url: '' },
                position: '2',
                grid: '2',
                gap: '+2.500s',
                laps: '58',
                status: 'Finished',
            },
        ],
        recap: { winner: null, podium: [], pole: null, fastestLap: null, dnfCount: 0 },
    })),
    getDriverSeasonStats: vi.fn(async () => [
        {
            driverId: 'leclerc',
            driverName: 'Charles Leclerc',
            constructorId: 'ferrari',
            constructorName: 'Ferrari',
            position: '1',
            points: '25',
            wins: 1,
            poles: 1,
            podiums: 1,
        },
        {
            driverId: 'norris',
            driverName: 'Lando Norris',
            constructorId: 'mclaren',
            constructorName: 'McLaren',
            position: '2',
            points: '18',
            wins: 0,
            poles: 0,
            podiums: 1,
        },
    ]),
}));

vi.mock('../utils/delay', () => ({
    fetchWithMinDelay: <T,>(fetcher: () => Promise<T>) => fetcher(),
}));

vi.mock('../hooks/useSitePolicyConsent', () => ({
    useSitePolicyConsent: () => ({
        isOpen: consentState.isOpen,
        requestAcceptance: (action: () => void) => action(),
        overlays: null,
    }),
}));

vi.mock('../hooks/useCommunityRatings', async importOriginal => ({
    ...await importOriginal<typeof import('../hooks/useCommunityRatings')>(),
    useCommunityRatings: () => ({ status: 'disabled' as const, ratings: [] }),
}));

let container: HTMLDivElement;
let root: Root;

async function pressKey(
    key: string,
    opts: { code?: string; shiftKey?: boolean; ctrlKey?: boolean; target?: HTMLElement } = {},
) {
    await act(async () => {
        const target = opts.target ?? window;
        target.dispatchEvent(new KeyboardEvent('keydown', {
            bubbles: true,
            cancelable: true,
            key,
            code: opts.code ?? '',
            shiftKey: Boolean(opts.shiftKey),
            ctrlKey: Boolean(opts.ctrlKey),
        }));
    });
}

describe('RatingModal and QuickRateModal keyboard shortcuts & undo', () => {
    beforeEach(() => {
        localStorage.clear();
        consentState.isOpen = false;
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
    });

    afterEach(async () => {
        await act(async () => root.unmount());
        container.remove();
        localStorage.clear();
    });

    it('supports rapid keyboard rating, half-point Shift digits, fine-tuning, clear, Ctrl+Z and Undo button in RatingModal', async () => {
        const onClose = vi.fn();

        await act(async () => {
            root.render(
                <RatingModal
                    season="2026"
                    race={{ season: '2026', round: '1', raceName: 'Australian Grand Prix', date: '2026-03-15' }}
                    onClose={onClose}
                />,
            );
        });

        const getScore = (id: string) =>
            getRaceRatings('2026', '1')?.ratings.find(r => r.driverId === id)?.rating;
        const activeDriverId = () =>
            container.querySelector('[data-keyboard-active="true"]')?.getAttribute('data-driver-id');

        // Starts in clean mouse/touch mode without highlighting any row
        expect(activeDriverId()).toBeUndefined();

        // Press '8': auto-selects first unrated (leclerc), saves 8, advances to norris
        await pressKey('8', { code: 'Digit8' });
        expect(getScore('leclerc')).toBe(8);
        expect(activeDriverId()).toBe('norris');

        // Press Shift+7: saves 7.5 for norris
        await pressKey('&', { code: 'Digit7', shiftKey: true });
        expect(getScore('norris')).toBe(7.5);

        // Press ArrowUp -> highlights leclerc, ArrowRight -> 8.5, Backspace -> cleared
        await pressKey('ArrowUp');
        expect(activeDriverId()).toBe('leclerc');

        await pressKey('ArrowRight');
        expect(getScore('leclerc')).toBe(8.5);

        await pressKey('Backspace');
        expect(getScore('leclerc')).toBeUndefined();

        // Ctrl+Z restores 8.5 on leclerc
        await pressKey('z', { ctrlKey: true });
        expect(getScore('leclerc')).toBe(8.5);

        // Clicking UNDO button restores 8 on leclerc
        const undoButton = container.querySelector<HTMLButtonElement>('button[aria-label="Undo last rating change"]')!;
        expect(undoButton.disabled).toBe(false);
        await act(async () => {
            undoButton.click();
        });
        expect(getScore('leclerc')).toBe(8);

        // Escape clears active row highlight first, second Escape closes modal
        await pressKey('Escape');
        expect(activeDriverId()).toBeUndefined();
        expect(onClose).not.toHaveBeenCalled();

        await pressKey('Escape');
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('restores all cleared ratings via Undo after Clear All in QuickRateModal', async () => {
        await act(async () => {
            root.render(<QuickRateModal season="2026" onClose={() => {}} />);
        });

        await pressKey('9', { code: 'Digit9' });
        await pressKey('8', { code: 'Digit8' });
        expect(getQuickRatings('2026')).toHaveLength(2);

        const clearButton = [...container.querySelectorAll('button')]
            .find(btn => btn.textContent?.includes('CLEAR ALL'))!;
        await act(async () => {
            clearButton.click();
        });
        expect(getQuickRatings('2026')).toBeNull();

        await pressKey('z', { ctrlKey: true });
        const restored = getQuickRatings('2026') ?? [];
        expect(restored.find(r => r.driverId === 'leclerc')?.rating).toBe(9);
        expect(restored.find(r => r.driverId === 'norris')?.rating).toBe(8);
    });

    it('ignores keyboard shortcuts when consent dialog is open or event originates in an input', async () => {
        consentState.isOpen = true;
        await act(async () => {
            root.render(
                <RatingModal
                    season="2026"
                    race={{ season: '2026', round: '1', raceName: 'Australian Grand Prix', date: '2026-03-15' }}
                    onClose={() => {}}
                />,
            );
        });

        await pressKey('8', { code: 'Digit8' });
        expect(getRaceRatings('2026', '1')).toBeNull();

        // Re-render with consent closed and verify input target is ignored
        consentState.isOpen = false;
        await act(async () => {
            root.render(
                <RatingModal
                    season="2026"
                    race={{ season: '2026', round: '1', raceName: 'Australian Grand Prix', date: '2026-03-15' }}
                    onClose={() => {}}
                />,
            );
        });

        const input = document.createElement('input');
        container.append(input);
        await pressKey('8', { code: 'Digit8', target: input });
        expect(getRaceRatings('2026', '1')).toBeNull();
    });
});

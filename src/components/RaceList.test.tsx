import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Race } from '../types';
import { RaceList } from './RaceList';

vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);

let container: HTMLDivElement;
let root: Root;

const mockCompletedRace1: Race = {
    season: '2024',
    round: '1',
    raceName: 'Bahrain Grand Prix',
    Circuit: {
        circuitId: 'bahrain',
        url: '',
        circuitName: 'Bahrain International Circuit',
        Location: { lat: '26.0325', long: '50.5106', locality: 'Sakhir', country: 'Bahrain' },
    },
    date: '2024-03-02', // Past date -> completed
    time: '15:00:00Z',
};

const mockCompletedRace2: Race = {
    season: '2024',
    round: '2',
    raceName: 'Saudi Arabian Grand Prix',
    Circuit: {
        circuitId: 'jeddah',
        url: '',
        circuitName: 'Jeddah Corniche Circuit',
        Location: { lat: '21.6319', long: '39.1044', locality: 'Jeddah', country: 'Saudi Arabia' },
    },
    date: '2024-03-09', // Past date -> completed
    time: '17:00:00Z',
};

const mockFutureLockedRace: Race = {
    season: '2026',
    round: '24',
    raceName: 'Abu Dhabi Grand Prix',
    Circuit: {
        circuitId: 'yas_marina',
        url: '',
        circuitName: 'Yas Marina Circuit',
        Location: { lat: '24.4672', long: '54.6031', locality: 'Abu Dhabi', country: 'UAE' },
    },
    date: '2099-12-06', // Future date -> locked
    time: '13:00:00Z',
};

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-01T12:00:00Z'));
    localStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(async () => {
    await act(async () => {
        root.unmount();
    });
    container.remove();
    document.body.innerHTML = '';
    vi.useRealTimers();
    vi.restoreAllMocks();
});

async function renderRaceList(props: {
    races?: Race[];
    season?: string;
    onSelectRace?: (race: Race) => void;
    onRacePrefetch?: (season: string, round: string) => void;
    loading?: boolean;
} = {}) {
    const defaultProps = {
        races: [mockCompletedRace1, mockCompletedRace2],
        season: '2024',
        onSelectRace: vi.fn(),
        onRacePrefetch: vi.fn(),
        loading: false,
        ...props,
    };

    await act(async () => {
        root.render(<RaceList {...defaultProps} />);
    });

    return defaultProps;
}

function getCardElements(): HTMLElement[] {
    return [...container.querySelectorAll<HTMLElement>('[role="button"]')];
}

function fireMouseEnter(el: HTMLElement) {
    el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
}

function fireMouseLeave(el: HTMLElement) {
    el.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
}

function fireFocus(el: HTMLElement) {
    el.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
    el.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
}

function fireBlur(el: HTMLElement) {
    el.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
    el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
}

describe('RaceList Hover Prefetch & Debounce (src/components/RaceList.test.tsx)', () => {
    describe('1. 75ms Hover Debounce & Parameter Passing', () => {
        it('calls onRacePrefetch with (season, round) when mouse hovers for >= 75ms', async () => {
            const onRacePrefetch = vi.fn();
            await renderRaceList({ season: '2024', onRacePrefetch });

            const cards = getCardElements();
            expect(cards.length).toBeGreaterThanOrEqual(2);

            // Hover Round 1
            await act(async () => {
                fireMouseEnter(cards[0]);
            });

            // At 50ms: Debounce window has NOT elapsed yet
            await act(async () => {
                await vi.advanceTimersByTimeAsync(50);
            });
            expect(onRacePrefetch).not.toHaveBeenCalled();

            // At 75ms: Debounce window elapses -> onRacePrefetch must be called with ('2024', '1')
            await act(async () => {
                await vi.advanceTimersByTimeAsync(25);
            });
            expect(onRacePrefetch).toHaveBeenCalledTimes(1);
            expect(onRacePrefetch).toHaveBeenCalledWith('2024', '1');
        });

        it('cancels prefetch if mouse leaves before 75ms debounce completes', async () => {
            const onRacePrefetch = vi.fn();
            await renderRaceList({ season: '2024', onRacePrefetch });

            const cards = getCardElements();

            // Hover card
            await act(async () => {
                fireMouseEnter(cards[0]);
            });

            // Fast sweep: user leaves card after 40ms
            await act(async () => {
                await vi.advanceTimersByTimeAsync(40);
                fireMouseLeave(cards[0]);
            });

            // Advance well past the 75ms threshold
            await act(async () => {
                await vi.advanceTimersByTimeAsync(200);
            });

            // Must NOT have called onRacePrefetch
            expect(onRacePrefetch).not.toHaveBeenCalled();
        });

        it('dispatches prefetch only for the settled card during rapid cursor sweep', async () => {
            const onRacePrefetch = vi.fn();
            await renderRaceList({ season: '2024', onRacePrefetch });

            const cards = getCardElements();

            // Sweep over card 0 for 30ms
            await act(async () => {
                fireMouseEnter(cards[0]);
            });
            await act(async () => {
                await vi.advanceTimersByTimeAsync(30);
                fireMouseLeave(cards[0]);
            });

            // Sweep over card 1 and settle for 100ms
            await act(async () => {
                fireMouseEnter(cards[1]);
            });
            await act(async () => {
                await vi.advanceTimersByTimeAsync(100);
            });

            // Only card 1 (round '2') triggered prefetch
            expect(onRacePrefetch).toHaveBeenCalledTimes(1);
            expect(onRacePrefetch).toHaveBeenCalledWith('2024', '2');
        });
    });

    describe('2. Keyboard Accessibility Focus Debounce', () => {
        it('calls onRacePrefetch after 75ms when card receives focus', async () => {
            const onRacePrefetch = vi.fn();
            await renderRaceList({ season: '2024', onRacePrefetch });

            const cards = getCardElements();

            await act(async () => {
                fireFocus(cards[1]);
            });

            await act(async () => {
                await vi.advanceTimersByTimeAsync(75);
            });

            expect(onRacePrefetch).toHaveBeenCalledTimes(1);
            expect(onRacePrefetch).toHaveBeenCalledWith('2024', '2');
        });

        it('cancels prefetch if card loses focus before 75ms', async () => {
            const onRacePrefetch = vi.fn();
            await renderRaceList({ season: '2024', onRacePrefetch });

            const cards = getCardElements();

            await act(async () => {
                fireFocus(cards[0]);
            });
            await act(async () => {
                await vi.advanceTimersByTimeAsync(30);
                fireBlur(cards[0]);
            });
            await act(async () => {
                await vi.advanceTimersByTimeAsync(150);
            });

            expect(onRacePrefetch).not.toHaveBeenCalled();
        });
    });

    describe('3. Card State & Filtering', () => {
        it('does NOT trigger prefetch on locked / future unrated race cards', async () => {
            const onRacePrefetch = vi.fn();
            await renderRaceList({
                season: '2026',
                races: [mockFutureLockedRace],
                onRacePrefetch,
            });

            // Locked cards have cursor-not-allowed and no role="button"
            const lockedCard = container.querySelector('.cursor-not-allowed') as HTMLElement;
            expect(lockedCard).not.toBeNull();

            await act(async () => {
                fireMouseEnter(lockedCard);
            });
            await act(async () => {
                await vi.advanceTimersByTimeAsync(150);
            });

            expect(onRacePrefetch).not.toHaveBeenCalled();
        });

        it('does not throw when onRacePrefetch prop is not provided', async () => {
            await renderRaceList({ season: '2024', onRacePrefetch: undefined });
            const cards = getCardElements();

            expect(() => {
                act(() => {
                    fireMouseEnter(cards[0]);
                });
            }).not.toThrow();

            await act(async () => {
                await vi.advanceTimersByTimeAsync(100);
            });
        });
    });

    describe('4. Lifecycle & Timer Cleanup', () => {
        it('clears pending debounce timer on component unmount to prevent post-unmount execution', async () => {
            const onRacePrefetch = vi.fn();
            await renderRaceList({ season: '2024', onRacePrefetch });

            const cards = getCardElements();
            await act(async () => {
                fireMouseEnter(cards[0]);
            });

            // Unmount component after 40ms
            await act(async () => {
                await vi.advanceTimersByTimeAsync(40);
                root.unmount();
            });

            // Advance past 75ms
            await act(async () => {
                await vi.advanceTimersByTimeAsync(100);
            });

            expect(onRacePrefetch).not.toHaveBeenCalled();
        });
    });
});

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CompactSeasonBundle } from '../api/staticSeasonData';
import * as staticSeasonData from '../api/staticSeasonData';
import { clearCommandSearchCache } from '../utils/commandSearch';
import { CommandPalette } from './CommandPalette';

const MOCK_BUNDLE_2026: CompactSeasonBundle = {
    season: '2026',
    version: 2,
    generatedAt: '2026-11-01T00:00:00Z',
    isArchived: false,
    lastCompletedRound: 16,
    totalRounds: 24,
    races: [
        {
            season: '2026',
            round: '16',
            raceName: 'Italian Grand Prix',
            date: '2026-09-06',
            Circuit: {
                circuitId: 'monza',
                circuitName: 'Autodromo Nazionale di Monza',
                url: '',
                Location: { locality: 'Monza', country: 'Italy' },
            },
        },
    ],
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
                driverId: 'leclerc',
                code: 'LEC',
                permanentNumber: '16',
                givenName: 'Charles',
                familyName: 'Leclerc',
                nationality: 'Monegasque',
                url: '',
            },
            Constructors: [
                { constructorId: 'ferrari', name: 'Ferrari', nationality: 'Italian', url: '' },
            ],
        },
    ],
    constructorStandings: [
        { constructorId: 'ferrari', constructorName: 'Ferrari', position: 1, points: 590, wins: 8 },
    ],
    roundResults: {},
    roundQualifying: {},
};

let container: HTMLDivElement;
let root: Root;

function LocationProbe() {
    const location = useLocation();
    return <div data-testid="location-probe">{location.pathname}{location.search}</div>;
}

function setNativeInputValue(input: HTMLInputElement, value: string): void {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
}

async function flushAsyncRender(): Promise<void> {
    await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
    });
}

describe('CommandPalette', () => {
    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        clearCommandSearchCache();
        vi.spyOn(staticSeasonData, 'getStaticSeasonBundle').mockImplementation(async (season) => {
            return String(season) === '2026' ? MOCK_BUNDLE_2026 : null;
        });
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
    });

    afterEach(async () => {
        await act(async () => {
            root.unmount();
        });
        container.remove();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        clearCommandSearchCache();
        document.body.style.overflow = '';
    });

    it('renders nothing when closed and focuses search input when opened', async () => {
        const onClose = vi.fn();

        await act(async () => {
            root.render(
                <MemoryRouter initialEntries={['/2026']}>
                    <CommandPalette isOpen={false} onClose={onClose} currentSeason="2026" />
                </MemoryRouter>,
            );
        });

        expect(document.body.querySelector('[role="dialog"]')).toBeNull();

        await act(async () => {
            root.render(
                <MemoryRouter initialEntries={['/2026']}>
                    <CommandPalette isOpen onClose={onClose} currentSeason="2026" />
                </MemoryRouter>,
            );
        });
        await flushAsyncRender();

        const dialog = document.body.querySelector('[role="dialog"][aria-label="Global F1 quick search"]');
        const input = document.body.querySelector<HTMLInputElement>('input[aria-label="Quick search input"]');

        expect(dialog).not.toBeNull();
        expect(input).not.toBeNull();
        expect(document.activeElement).toBe(input);
        expect(dialog?.textContent).toContain('Championship Standings');
    });

    it('loads static bundles, filters by query, renders real anchor links, and navigates on Enter', async () => {
        const onClose = vi.fn();

        await act(async () => {
            root.render(
                <MemoryRouter initialEntries={['/2026']}>
                    <LocationProbe />
                    <CommandPalette isOpen onClose={onClose} currentSeason="2026" />
                </MemoryRouter>,
            );
        });
        await flushAsyncRender();

        const input = document.body.querySelector<HTMLInputElement>('input[aria-label="Quick search input"]');
        expect(input).not.toBeNull();
        expect(document.body.textContent).toContain('Charles Leclerc');

        await act(async () => {
            setNativeInputValue(input!, 'leclerc');
        });

        const options = Array.from(document.body.querySelectorAll<HTMLAnchorElement>('a[role="option"]'));
        expect(options.length).toBeGreaterThanOrEqual(1);
        expect(options[0].tagName).toBe('A');
        expect(options[0].getAttribute('href')).toBe('/2026/driver/leclerc');
        expect(options[0].textContent).toContain('Charles Leclerc');

        await act(async () => {
            input!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        });

        expect(onClose).toHaveBeenCalledTimes(1);
        expect(container.querySelector('[data-testid="location-probe"]')?.textContent).toBe('/2026/driver/leclerc');
    });

    it('filters by category tab and dismisses on Escape without leaking to listeners underneath', async () => {
        const onClose = vi.fn();
        const parentEscapeSpy = vi.fn();
        window.addEventListener('keydown', parentEscapeSpy);

        try {
            await act(async () => {
                root.render(
                    <MemoryRouter initialEntries={['/2026']}>
                        <CommandPalette isOpen onClose={onClose} currentSeason="2026" />
                    </MemoryRouter>,
                );
            });
            await flushAsyncRender();

            expect(document.body.textContent).toContain('Italian Grand Prix');

            const teamsTab = Array.from(document.body.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
                .find(tab => tab.textContent?.trim() === 'TEAMS');
            expect(teamsTab).toBeDefined();

            await act(async () => {
                teamsTab!.click();
            });

            const teamOption = document.body.querySelector<HTMLAnchorElement>('a[role="option"]');
            expect(teamOption?.getAttribute('href')).toBe('/2026/teammate-wars?mode=teams&a=ferrari');

            await act(async () => {
                window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
            });

            expect(onClose).toHaveBeenCalledTimes(1);
            expect(parentEscapeSpy).not.toHaveBeenCalled();
        } finally {
            window.removeEventListener('keydown', parentEscapeSpy);
        }
    });
});

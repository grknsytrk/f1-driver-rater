import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConstructorStanding, SeasonQualifyingResult, SeasonRaceResult } from '../api/f1Api';
import type { AverageRating } from '../types';
import { TeamVersus } from './TeamVersus';

function race(round: string, driverId: string, constructorId: string, constructorName: string, position: number | null): SeasonRaceResult {
    return { round, raceName: 'Test Grand Prix', date: '2024-03-02', driverId, driverName: `Given ${driverId}`, constructorId, constructorName, position, points: 0, status: 'Finished' };
}

const raceResults: SeasonRaceResult[] = [
    race('1', 'nor', 'mclaren', 'McLaren', 1), race('1', 'pia', 'mclaren', 'McLaren', 3),
    race('1', 'lec', 'ferrari', 'Ferrari', 2), race('1', 'ham', 'ferrari', 'Ferrari', 6),
    race('1', 'rus', 'mercedes', 'Mercedes', 4), race('1', 'ant', 'mercedes', 'Mercedes', 5),
];
const qualiResults: SeasonQualifyingResult[] = [];
const standings: ConstructorStanding[] = [
    { constructorId: 'mclaren', constructorName: 'McLaren', position: 1, points: 400, wins: 8 },
    { constructorId: 'ferrari', constructorName: 'Ferrari', position: 2, points: 300, wins: 3 },
    { constructorId: 'mercedes', constructorName: 'Mercedes', position: 3, points: 200, wins: 1 },
];
const averages: AverageRating[] = [];

let container: HTMLDivElement;
let root: Root;

function LocationProbe() {
    return <span data-testid="search">{useLocation().search}</span>;
}

function currentParams() {
    return new URLSearchParams(container.querySelector('[data-testid="search"]')!.textContent ?? '');
}

beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
});

afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
});

async function render(initialEntry: string, props: Partial<Parameters<typeof TeamVersus>[0]> = {}) {
    await act(async () => root.render(
        <MemoryRouter initialEntries={[initialEntry]}>
            <LocationProbe />
            <TeamVersus
                season="2025"
                raceResults={raceResults}
                qualiResults={qualiResults}
                constructorStandings={standings}
                averages={averages}
                loading={false}
                raceStatus="ok"
                qualiStatus="ok"
                toggle={<div data-testid="toggle" />}
                {...props}
            />
        </MemoryRouter>,
    ));
}

function selects() {
    return [...container.querySelectorAll<HTMLSelectElement>('select')];
}

async function choose(select: HTMLSelectElement, value: string) {
    await act(async () => {
        select.value = value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
    });
}

describe('TeamVersus', () => {
    it('defaults to the top two WCC teams and renders their comparison', async () => {
        await render('/2025/teammate-wars?mode=teams');

        const [a, b] = selects();
        expect(a.value).toBe('mclaren');
        expect(b.value).toBe('ferrari');
        expect(container.textContent).toContain('WCC Position');
        expect(container.textContent).toContain('Race H2H');
        expect(container.querySelector('[data-testid="toggle"]')).not.toBeNull();
    });

    it('honours valid ids from the URL', async () => {
        await render('/2025/teammate-wars?mode=teams&a=mercedes&b=ferrari');

        expect(selects().map(select => select.value)).toEqual(['mercedes', 'ferrari']);
    });

    it('falls back to safe defaults for invalid ids in the URL', async () => {
        await render('/2025/teammate-wars?mode=teams&a=xyz&b=xyz');

        expect(selects().map(select => select.value)).toEqual(['mclaren', 'ferrari']);
    });

    it('writes the selection to the URL and swaps instead of duplicating a team', async () => {
        await render('/2025/teammate-wars?mode=teams');

        await choose(selects()[0], 'mercedes');
        expect(currentParams().get('a')).toBe('mercedes');
        expect(currentParams().get('b')).toBe('ferrari');

        await choose(selects()[1], 'mercedes');
        expect(currentParams().get('a')).toBe('ferrari');
        expect(currentParams().get('b')).toBe('mercedes');
    });

    it('swaps both teams with the swap button', async () => {
        await render('/2025/teammate-wars?mode=teams&a=mclaren&b=ferrari');

        await act(async () => {
            container.querySelector<HTMLButtonElement>('button[aria-label="Swap teams"]')!.click();
        });

        expect(currentParams().get('a')).toBe('ferrari');
        expect(currentParams().get('b')).toBe('mclaren');
    });

    it('shows an empty state when fewer than two teams are available', async () => {
        await render('/2025/teammate-wars?mode=teams', { raceResults: raceResults.slice(0, 2), constructorStandings: [] });

        expect(container.textContent).toContain('NO TEAM BATTLES YET');
        expect(selects()).toHaveLength(0);
    });
});

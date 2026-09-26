import { act, type ReactElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConstructorStanding, DriverSeasonStats } from '../api/f1Api';
import { StandingsPage } from './StandingsPage';

const api = vi.hoisted(() => ({
    drivers: vi.fn(), constructors: vi.fn(), races: vi.fn(), sprints: vi.fn(), calendar: vi.fn(),
}));
const chart = vi.hoisted(() => ({ render: vi.fn(), export: vi.fn(), reducedMotion: false }));
vi.mock('html-to-image', () => ({ toPng: chart.export }));
vi.mock('framer-motion', async importOriginal => ({
    ...await importOriginal<typeof import('framer-motion')>(),
    useReducedMotion: () => chart.reducedMotion,
}));
vi.mock('../api/f1Api', async importOriginal => ({
    ...await importOriginal<typeof import('../api/f1Api')>(),
    getDriverSeasonStats: api.drivers,
    getConstructorStandings: api.constructors,
    getAllSeasonResults: api.races,
    getAllSeasonSprints: api.sprints,
    getRaces: api.calendar,
}));

// These tests exercise page selection and loading. StandingsPointsTracker tests cover the real SVG.
vi.mock('recharts', () => ({
    ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    LineChart: ({ children, data }: { children: ReactNode; data: unknown }) => {
        chart.render(data);
        return <div>{children}</div>;
    },
    Line: ({ dataKey, isAnimationActive, animationDuration, shape }: {
        dataKey: string; isAnimationActive: boolean; animationDuration: number;
        shape: ReactElement<{ progress: number }>;
    }) => <div data-line={dataKey} data-animated={isAnimationActive} data-duration={animationDuration}
        data-progress={shape.props.progress} />,
    CartesianGrid: () => null, Curve: () => null, Tooltip: () => null, XAxis: () => null, YAxis: () => null,
}));

const drivers: DriverSeasonStats[] = [
    ['max_verstappen', 'Max Verstappen', 'red_bull', 'Red Bull', '25'],
    ['norris', 'Lando Norris', 'mclaren', 'McLaren', '18'],
    ['leclerc', 'Charles Leclerc', 'ferrari', 'Ferrari', '15'],
    ['piastri', 'Oscar Piastri', 'mclaren', 'McLaren', '12'],
].map(([driverId, driverName, constructorId, constructorName, points], index) => ({
    driverId, driverName, constructorId, constructorName, points,
    position: String(index + 1), wins: 0, poles: 0, podiums: 0,
}));
const nextSeasonDrivers = [...drivers].reverse().map((driver, index) => ({ ...driver, position: String(index + 1) }));
const constructors: ConstructorStanding[] = [
    { constructorId: 'mclaren', constructorName: 'McLaren', position: 1, points: 30, wins: 0 },
    { constructorId: 'red_bull', constructorName: 'Red Bull', position: 2, points: 25, wins: 0 },
    { constructorId: 'ferrari', constructorName: 'Ferrari', position: 3, points: 15, wins: 0 },
    { constructorId: 'mercedes', constructorName: 'Mercedes', position: 4, points: 0, wins: 0 },
];
const nextSeasonConstructors = [...constructors].reverse().map((team, index) => ({ ...team, position: index + 1 }));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.clearAllMocks();
    vi.useFakeTimers();
    chart.reducedMotion = false;
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    api.drivers.mockImplementation(async (season: string) => season === '2025' ? nextSeasonDrivers : drivers);
    api.constructors.mockImplementation(async (season: string) => season === '2025' ? nextSeasonConstructors : constructors);
    api.races.mockResolvedValue(drivers.map(driver => ({
        ...driver, round: '1', position: Number(driver.position), points: Number(driver.points), status: 'Finished',
    })));
    api.sprints.mockResolvedValue([]);
    api.calendar.mockResolvedValue([{ round: '1', raceName: 'Bahrain Grand Prix', date: '2024-03-02' }]);
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
});

afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

async function renderSeason(season = '2024') {
    await act(async () => root.render(<StandingsPage season={season} onBack={() => {}} />));
}

function compareButton(name: string): HTMLButtonElement {
    return container.querySelector<HTMLButtonElement>(`button[aria-label="Compare ${name}"]`)!;
}

function selectedNames(): string[] {
    return [...container.querySelectorAll('button[aria-pressed="true"]')].map(button => button.getAttribute('aria-label')!);
}

function renderedLine(id: string) {
    return container.querySelector<HTMLDivElement>(`[data-line="scores.${id}.totalPoints"]`);
}

async function advance(ms: number) {
    await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}

async function clickButton(name: string) {
    const button = [...container.querySelectorAll('button')].find(button => button.textContent?.trim() === name)!;
    expect(button).toBeDefined();
    await act(async () => button.click());
}

describe('standings points tracker', () => {
    it('defaults to the first three and preserves multi-selection and teammate styles across tabs', async () => {
        await renderSeason();
        expect(selectedNames()).toEqual(['Compare Max Verstappen', 'Compare Lando Norris', 'Compare Charles Leclerc']);
        const originalDash = compareButton('Oscar Piastri').querySelector('line')?.getAttribute('stroke-dasharray');
        expect(originalDash).not.toBe(compareButton('Lando Norris').querySelector('line')?.getAttribute('stroke-dasharray'));

        await act(async () => compareButton('Oscar Piastri').click());
        expect(selectedNames()).toHaveLength(4);
        await act(async () => compareButton('Lando Norris').click());
        expect(compareButton('Oscar Piastri').querySelector('line')?.getAttribute('stroke-dasharray')).toBe(originalDash);
        await clickButton('CONSTRUCTORS');
        expect(selectedNames()).toEqual(['Compare McLaren', 'Compare Red Bull', 'Compare Ferrari']);
        expect(compareButton('McLaren').querySelector('line')?.hasAttribute('stroke-dasharray')).toBe(false);
        await act(async () => compareButton('Ferrari').click());
        await act(async () => compareButton('Mercedes').click());
        await clickButton('DRIVERS');
        expect(selectedNames()).toEqual(['Compare Max Verstappen', 'Compare Charles Leclerc', 'Compare Oscar Piastri']);
        await clickButton('CONSTRUCTORS');
        expect(selectedNames()).toEqual(['Compare McLaren', 'Compare Red Bull', 'Compare Mercedes']);
    });

    it('allows an empty selection and restores defaults for a different season', async () => {
        await renderSeason();
        await advance(1600);
        for (const driver of drivers.slice(0, 3)) {
            await act(async () => compareButton(driver.driverName).click());
        }
        expect(selectedNames()).toEqual([]);
        expect(container.querySelector('[aria-label="Cumulative points by race"]')).not.toBeNull();
        expect(container.textContent).not.toContain('SELECT DRIVERS TO COMPARE');
        await advance(580);
        expect(renderedLine('max_verstappen')).not.toBeNull();
        await advance(70);
        expect(container.textContent).toContain('SELECT DRIVERS TO COMPARE');
        expect(container.querySelector('[aria-label="Cumulative points by race"]')).toBeNull();
        await clickButton('CONSTRUCTORS');
        await clickButton('DRIVERS');
        expect(selectedNames()).toEqual([]);

        await clickButton('CONSTRUCTORS');
        await act(async () => compareButton('Red Bull').click());
        await clickButton('DRIVERS');

        await renderSeason('2025');
        expect(selectedNames()).toEqual(['Compare Oscar Piastri', 'Compare Charles Leclerc', 'Compare Lando Norris']);
        await clickButton('CONSTRUCTORS');
        expect(selectedNames()).toEqual(['Compare Mercedes', 'Compare Ferrari', 'Compare Red Bull']);
        await clickButton('DRIVERS');
        await renderSeason('2024');
        expect(selectedNames()).toEqual(['Compare Max Verstappen', 'Compare Lando Norris', 'Compare Charles Leclerc']);
    });

    it('does not draw incomplete totals after a sprint failure and recovers on retry', async () => {
        api.sprints.mockRejectedValueOnce(new Error('Network unavailable'));
        await renderSeason();
        expect(container.textContent).toContain('POINTS TRACKER UNAVAILABLE');
        expect(container.querySelector('[aria-label="Cumulative points by race"]')).toBeNull();
        await clickButton('CONSTRUCTORS');
        expect(container.textContent).toContain('POINTS TRACKER UNAVAILABLE');
        await clickButton('Retry points data');
        expect(container.querySelector('[aria-label="Cumulative points by race"]')).not.toBeNull();
        expect(selectedNames()).toHaveLength(3);
    });

    it('shows the no-data state when no results have been published', async () => {
        api.races.mockResolvedValue([]);
        await renderSeason();
        expect(container.textContent).toContain('NO POINTS DATA YET');
        expect(container.querySelector('[aria-label="Cumulative points by race"]')).toBeNull();
        await clickButton('CONSTRUCTORS');
        expect(container.textContent).toContain('NO POINTS DATA YET');
    });

    it('ignores a previous season response arriving after the new season', async () => {
        let finishPreviousSeason!: (value: DriverSeasonStats[]) => void;
        api.drivers.mockImplementationOnce(() => new Promise<DriverSeasonStats[]>(resolve => { finishPreviousSeason = resolve; }));
        await renderSeason();
        expect(container.textContent).toContain('LOADING STANDINGS');
        await renderSeason('2025');
        expect(selectedNames()).toEqual(['Compare Oscar Piastri', 'Compare Charles Leclerc', 'Compare Lando Norris']);
        await act(async () => finishPreviousSeason(drivers));
        expect(selectedNames()).toEqual(['Compare Oscar Piastri', 'Compare Charles Leclerc', 'Compare Lando Norris']);
    });

    it('animates only new entries, keeps stable chart data, and cancels stale exits on rapid reselection', async () => {
        await renderSeason();
        const data = chart.render.mock.lastCall?.[0];
        expect(renderedLine('norris')?.dataset.progress).toBe('0');
        await advance(1600);
        await act(async () => compareButton('Oscar Piastri').click());
        expect(renderedLine('piastri')?.dataset.progress).toBe('0');
        expect(renderedLine('norris')?.dataset.duration).toBe('300');
        expect(renderedLine('norris')?.dataset.progress).toBe('1');
        expect(chart.render.mock.lastCall?.[0]).toBe(data);
        await advance(1600);
        await act(async () => compareButton('Oscar Piastri').click());
        expect(renderedLine('piastri')?.dataset.progress).toBe('1');
        await advance(100);
        const reversedFrom = Number(renderedLine('piastri')?.dataset.progress);
        expect(reversedFrom).toBeLessThan(1);
        await act(async () => compareButton('Oscar Piastri').click());
        expect(Number(renderedLine('piastri')?.dataset.progress)).toBe(reversedFrom);
        await advance(100);
        await act(async () => compareButton('Oscar Piastri').click());
        await advance(420); // The first exit's completion must not remove this newer exit.
        expect(renderedLine('piastri')).not.toBeNull();
        await advance(230);
        expect(renderedLine('piastri')).toBeNull();
        expect(renderedLine('norris')).not.toBeNull();
    });

    it('exports completed current selections while a series is entering and another is leaving', async () => {
        await renderSeason();
        await act(async () => compareButton('Oscar Piastri').click());
        await act(async () => compareButton('Lando Norris').click());
        expect(renderedLine('norris')).not.toBeNull();
        let finishExport!: (value: string) => void;
        chart.export.mockImplementationOnce(async (element: HTMLElement) => {
            expect(element.querySelector('[data-line="scores.norris.totalPoints"]')).toBeNull();
            expect(element.querySelectorAll('[data-animated="false"]')).toHaveLength(3);
            return new Promise<string>(resolve => { finishExport = resolve; });
        });
        await clickButton('SAVE IMAGE');
        await advance(50);
        expect(chart.export).toHaveBeenCalledOnce();
        expect(container.textContent).toContain('EXPORTING...');
        await act(async () => finishExport('data:image/png;base64,AA=='));
        expect(container.textContent).toContain('SAVE IMAGE');
        await advance(1500);
        expect(renderedLine('norris')).toBeNull();
        expect(renderedLine('piastri')?.dataset.progress).toBe('1');
    });

    it('finishes transitions immediately when reduced motion is enabled during an exit', async () => {
        await renderSeason();
        await act(async () => compareButton('Lando Norris').click());
        expect(renderedLine('norris')).not.toBeNull();
        chart.reducedMotion = true;
        await renderSeason();
        expect(renderedLine('norris')).toBeNull();
        expect(renderedLine('max_verstappen')?.dataset.animated).toBe('false');
        for (const name of ['Max Verstappen', 'Charles Leclerc']) {
            await act(async () => compareButton(name).click());
        }
        expect(container.textContent).toContain('SELECT DRIVERS TO COMPARE');
    });
});

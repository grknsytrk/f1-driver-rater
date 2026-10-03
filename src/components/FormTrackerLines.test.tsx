import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CartesianGrid, LineChart, XAxis, YAxis } from 'recharts';
import { buildFormChartData } from '../utils/formTracker';
import type { DriverFormSeries } from '../utils/storage';
import { FormTrackerLines } from './FormTrackerLines';

const preferences = vi.hoisted(() => ({ reducedMotion: false }));
vi.mock('framer-motion', () => ({ useReducedMotion: () => preferences.reducedMotion }));

const drivers: DriverFormSeries[] = ['ham', 'ver'].map((driverId, driverIndex) => ({
    driverId,
    driverName: driverId.toUpperCase(),
    latestConstructorId: 'team',
    latestConstructorName: 'Team',
    seasonAverage: 7,
    totalRatedRaces: 3,
    bestRating: 8,
    bestRaceName: 'Race 3',
    worstRating: 6,
    worstRaceName: 'Race 1',
    changedTeams: false,
    points: [1, 2, 3, 4].map((round, index) => ({
        round: String(round),
        roundNumber: round,
        raceName: `Race ${round}`,
        countryCode: 'XX',
        date: `2026-0${round}-01`,
        rating: 6 + index + driverIndex,
        constructorId: 'team',
        constructorName: 'Team',
    })),
}));
const data = buildFormChartData(drivers);
const sparseDrivers = drivers.map(driver => driver.driverId === 'ver'
    ? { ...driver, points: driver.points.map(point => point.round === '3' ? { ...point, rating: null } : point) }
    : driver);
const sparseData = buildFormChartData(sparseDrivers);

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.useFakeTimers();
    preferences.reducedMotion = false;
    Object.defineProperty(SVGElement.prototype, 'getTotalLength', { configurable: true, value: () => 800 });
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
});

afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    Reflect.deleteProperty(SVGElement.prototype, 'getTotalLength');
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

async function render(selectedDriverIds: string[], driverData = drivers, chartData = data) {
    await act(async () => root.render(
        <LineChart width={800} height={420} data={chartData}>
            <CartesianGrid />
            <XAxis dataKey="roundLabel" />
            <YAxis type="number" domain={[0, 10]} />
            <FormTrackerLines drivers={driverData} selectedDriverIds={selectedDriverIds} getColor={() => '#00d2be'} />
        </LineChart>,
    ));
}

async function advance(ms: number) {
    await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}

function curve(name: string) {
    return container.querySelector<SVGPathElement>(`.recharts-line-curve[name="${name}"]`);
}

function dots(name: string) {
    return [...container.querySelectorAll<SVGCircleElement>(`.recharts-line-dot[name="${name}"]`)];
}

function lastX(name: string) {
    const coordinates = curve(name)?.getAttribute('d')?.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
    return coordinates.at(-2) ?? 0;
}

describe('Form Tracker line animation', () => {
    it('reveals each marker with the line and erases a deselected driver from the last race backwards', async () => {
        await render(['ham']);
        await advance(1600);
        expect(dots('ham')).toHaveLength(4);

        await render(['ham', 'ver']);
        expect(dots('ver')).toHaveLength(0);
        await advance(700);
        expect(dots('ver').length).toBeGreaterThan(0);
        expect(dots('ver').length).toBeLessThan(3);

        const drawnEnd = lastX('ver');
        await render(['ham']);
        await advance(180);
        expect(lastX('ver')).toBeLessThan(drawnEnd);
        expect(curve('ham')).not.toBeNull();
        await advance(500);
        expect(curve('ver')).toBeNull();
        expect(dots('ham')).toHaveLength(4);
    });

    it('keeps missing ratings as a visible gap between separately drawn line segments', async () => {
        await render(['ver'], sparseDrivers, sparseData);
        await advance(1600);
        const path = curve('ver')?.getAttribute('d') ?? '';
        expect((path.match(/M/g) ?? [])).toHaveLength(2);
        expect(dots('ver').map(dot => dot.dataset.pointIndex)).toEqual(['0', '1', '3']);
    });

    it('shows all markers immediately when reduced motion is enabled', async () => {
        preferences.reducedMotion = true;
        await render(['ham', 'ver']);
        expect(dots('ham')).toHaveLength(4);
        expect(dots('ver')).toHaveLength(4);
    });
});

import { act, cloneElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConstructorStanding, DriverStanding } from '../../api/f1Api';
import type { AverageRating } from '../../types';
import { OverperformanceScatter } from './OverperformanceScatter';

vi.mock('recharts', async importOriginal => ({
    ...await importOriginal<typeof import('recharts')>(),
    ResponsiveContainer: ({ children }: { children: ReactElement<{ width: number; height: number }> }) =>
        cloneElement(children, { width: 760, height: 360 }),
}));

const CONSTRUCTOR_STANDINGS: ConstructorStanding[] = [
    { constructorId: 'mclaren', constructorName: 'McLaren', position: 1, points: 550, wins: 6 },
    { constructorId: 'ferrari', constructorName: 'Ferrari', position: 2, points: 360, wins: 2 },
    { constructorId: 'haas', constructorName: 'Haas F1 Team', position: 6, points: 62, wins: 0 },
];

const DRIVER_STANDINGS: DriverStanding[] = [
    {
        position: '1',
        positionText: '1',
        points: '295',
        wins: '4',
        Driver: { driverId: 'norris', code: 'NOR', givenName: 'Lando', familyName: 'Norris', url: '' },
        Constructors: [{ constructorId: 'mclaren', name: 'McLaren', url: '' }],
    },
    {
        position: '5',
        positionText: '5',
        points: '170',
        wins: '1',
        Driver: { driverId: 'hamilton', code: 'HAM', givenName: 'Lewis', familyName: 'Hamilton', url: '' },
        Constructors: [{ constructorId: 'ferrari', name: 'Ferrari', url: '' }],
    },
    {
        position: '9',
        positionText: '9',
        points: '38',
        wins: '0',
        Driver: { driverId: 'bearman', code: 'BEA', givenName: 'Oliver', familyName: 'Bearman', url: '' },
        Constructors: [{ constructorId: 'haas', name: 'Haas F1 Team', url: '' }],
    },
];

const AVERAGES: AverageRating[] = [
    { driverId: 'norris', driverName: 'Lando Norris', constructorId: 'mclaren', constructorName: 'McLaren', averageRating: 8.6, totalRaces: 10, ratings: [] },
    { driverId: 'hamilton', driverName: 'Lewis Hamilton', constructorId: 'ferrari', constructorName: 'Ferrari', averageRating: 6.1, totalRaces: 10, ratings: [] },
    { driverId: 'bearman', driverName: 'Oliver Bearman', constructorId: 'haas', constructorName: 'Haas F1 Team', averageRating: 8.3, totalRaces: 10, ratings: [] },
];

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
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
});

describe('OverperformanceScatter', () => {
    it('renders scatter points, clickable standout links, and X-axis mode toggle', async () => {
        await act(async () => {
            root.render(
                <MemoryRouter>
                    <OverperformanceScatter
                        season="2025"
                        averages={AVERAGES}
                        driverStandings={DRIVER_STANDINGS}
                        constructorStandings={CONSTRUCTOR_STANDINGS}
                        activeMode="personal"
                        minimumRatedRaces={5}
                        standingsLoading={false}
                    />
                </MemoryRouter>,
            );
        });

        expect(container.textContent).toContain('PERFORMANCE VS CAR');
        expect(container.textContent).toContain('OVERPERFORMING');
        expect(container.textContent).toContain('CONSTRUCTOR POINTS (WCC)');

        const chart = container.querySelector('[data-testid="overperformance-scatter-chart"]')!;
        expect(chart.textContent).toContain('NOR');
        expect(chart.textContent).toContain('HAM');
        expect(chart.textContent).toContain('BEA');

        expect(container.textContent).toContain('TOP OVERPERFORMERS');
        expect(container.textContent).toContain('BELOW EXPECTATION');

        const bearmanLink = container.querySelector<HTMLAnchorElement>('a[href="/2025/driver/bearman"]');
        const hamiltonLink = container.querySelector<HTMLAnchorElement>('a[href="/2025/driver/hamilton"]');
        expect(bearmanLink).not.toBeNull();
        expect(hamiltonLink).not.toBeNull();

        const driverTab = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
            .find(tab => tab.textContent?.includes('DRIVER POINTS (WDC)'));
        expect(driverTab).toBeDefined();

        await act(async () => {
            driverTab!.click();
        });

        expect(driverTab!.getAttribute('aria-selected')).toBe('true');
        expect(container.textContent).toContain('CHAMPIONSHIP POINTS (WDC)');
    });

    it('renders telemetry unavailable state when fewer than 3 drivers are rated', async () => {
        await act(async () => {
            root.render(
                <MemoryRouter>
                    <OverperformanceScatter
                        season="2025"
                        averages={AVERAGES.slice(0, 2)}
                        driverStandings={DRIVER_STANDINGS}
                        constructorStandings={CONSTRUCTOR_STANDINGS}
                        activeMode="community"
                        minimumRatedRaces={1}
                        standingsLoading={false}
                    />
                </MemoryRouter>,
            );
        });

        expect(container.textContent).toContain('NOT ENOUGH TELEMETRY YET');
        expect(container.querySelector('[data-testid="overperformance-scatter-chart"]')).toBeNull();
    });
});

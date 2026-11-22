import {
    Children,
    act,
    cloneElement,
    isValidElement,
    useEffect,
    type ReactElement,
    type ReactNode,
} from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConstructorStanding, DriverStanding } from '../../api/f1Api';
import type { AverageRating } from '../../types';
import { OverperformanceScatter } from './OverperformanceScatter';

const chartInspect = vi.hoisted(() => ({
    tooltipContent: null as ((props: { active?: boolean; payload?: Array<{ payload?: unknown }> }) => ReactNode) | null,
    scatterData: [] as Array<{ driverId: string }>,
}));

function collectChartProps(node: ReactNode): void {
    Children.forEach(node, child => {
        if (!isValidElement<{ children?: ReactNode; content?: unknown; data?: unknown }>(child)) return;
        if (typeof child.props.content === 'function') {
            chartInspect.tooltipContent = child.props.content as typeof chartInspect.tooltipContent;
        }
        if (Array.isArray(child.props.data)) {
            chartInspect.scatterData = child.props.data as Array<{ driverId: string }>;
        }
        if (child.props.children) {
            collectChartProps(child.props.children);
        }
    });
}

vi.mock('recharts', async importOriginal => ({
    ...await importOriginal<typeof import('recharts')>(),
    ResponsiveContainer: function MockResponsiveContainer({
        children,
    }: {
        children: ReactElement<{ width: number; height: number }>;
    }) {
        useEffect(() => {
            collectChartProps(children);
        });
        return cloneElement(children, { width: 760, height: 360 });
    },
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
    it('renders scatter points, clickable standout links, zoom filters, and scale toggles', async () => {
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
        expect(container.textContent).toContain('UNDERPERFORMING');
        expect(container.textContent).toContain('CONSTRUCTOR POINTS (WCC)');

        const chart = container.querySelector('[data-testid="overperformance-scatter-chart"]')!;
        expect(chart.textContent).toContain('NOR');
        expect(chart.textContent).toContain('HAM');
        expect(chart.textContent).toContain('BEA');

        const bearmanLink = container.querySelector<HTMLAnchorElement>('a[href="/2025/driver/bearman"]');
        const hamiltonLink = container.querySelector<HTMLAnchorElement>('a[href="/2025/driver/hamilton"]');
        expect(bearmanLink).not.toBeNull();
        expect(hamiltonLink).not.toBeNull();

        // Filter to Midfield only -> NOR & HAM filtered out, BEA remains
        const midfieldBtn = Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
            .find(btn => btn.textContent?.trim() === 'MIDFIELD')!;
        await act(async () => {
            midfieldBtn.click();
        });
        expect(chart.textContent).toContain('BEA');
        expect(chart.textContent).not.toContain('NOR');

        // Toggle Linear scale
        const linearBtn = Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
            .find(btn => btn.textContent?.trim() === 'LINEAR')!;
        await act(async () => {
            linearBtn.click();
        });
        expect(linearBtn.getAttribute('aria-pressed')).toBe('true');

        // Switch X-axis to Driver Points
        const driverTab = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
            .find(tab => tab.textContent?.includes('DRIVER POINTS (WDC)'))!;
        await act(async () => {
            driverTab.click();
        });

        expect(driverTab.getAttribute('aria-selected')).toBe('true');
        expect(container.textContent).toContain('CHAMPIONSHIP POINTS (WDC)');

        // Open and close the ? guide panel
        const helpBtn = container.querySelector<HTMLButtonElement>('button[aria-label="How to read Performance vs Car chart"]')!;
        expect(helpBtn).not.toBeNull();
        expect(container.querySelector('#overperformance-guide')).toBeNull();

        await act(async () => {
            helpBtn.click();
        });
        const guideEl = container.querySelector('#overperformance-guide');
        expect(guideEl).not.toBeNull();
        expect(guideEl?.textContent).toContain('HOW TO READ THIS CHART');
        expect(guideEl?.textContent).toContain('Expected Rating');
        expect(guideEl?.textContent).toContain('your personal ratings');

        const closeGuideBtn = container.querySelector<HTMLButtonElement>('button[aria-label="Close chart guide"]')!;
        await act(async () => {
            closeGuideBtn.click();
        });
        expect(container.querySelector('#overperformance-guide')).toBeNull();
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

    it('shows all co-located drivers in the tooltip when teammates share identical coordinates', async () => {
        const tiedAverages: AverageRating[] = [
            ...AVERAGES,
            { driverId: 'leclerc', driverName: 'Charles Leclerc', constructorId: 'ferrari', constructorName: 'Ferrari', averageRating: 6.1, totalRaces: 10, ratings: [] },
        ];
        const tiedStandings: DriverStanding[] = [
            ...DRIVER_STANDINGS,
            {
                position: '6',
                positionText: '6',
                points: '165',
                wins: '1',
                Driver: { driverId: 'leclerc', code: 'LEC', givenName: 'Charles', familyName: 'Leclerc', url: '' },
                Constructors: [{ constructorId: 'ferrari', name: 'Ferrari', url: '' }],
            },
        ];

        await act(async () => {
            root.render(
                <MemoryRouter>
                    <OverperformanceScatter
                        season="2025"
                        averages={tiedAverages}
                        driverStandings={tiedStandings}
                        constructorStandings={CONSTRUCTOR_STANDINGS}
                        activeMode="personal"
                        minimumRatedRaces={5}
                        standingsLoading={false}
                    />
                </MemoryRouter>,
            );
        });

        const leclercPoint = chartInspect.scatterData.find(pt => pt.driverId === 'leclerc');
        const norrisPoint = chartInspect.scatterData.find(pt => pt.driverId === 'norris');
        expect(leclercPoint).toBeDefined();
        expect(norrisPoint).toBeDefined();
        expect(chartInspect.tooltipContent).not.toBeNull();

        const tooltipHost = document.createElement('div');
        const tooltipRoot = createRoot(tooltipHost);

        // Hovering the tied point renders both Ferrari teammates + TIED (2 DRIVERS) badge
        await act(async () => {
            tooltipRoot.render(chartInspect.tooltipContent!({
                active: true,
                payload: [{ payload: leclercPoint }],
            }));
        });
        expect(tooltipHost.textContent).toContain('TIED (2 DRIVERS)');
        expect(tooltipHost.textContent).toContain('Charles Leclerc');
        expect(tooltipHost.textContent).toContain('Lewis Hamilton');
        expect(tooltipHost.textContent).not.toContain('Lando Norris');

        // Hovering a distinct point stays single-driver without the tied badge
        await act(async () => {
            tooltipRoot.render(chartInspect.tooltipContent!({
                active: true,
                payload: [{ payload: norrisPoint }],
            }));
        });
        expect(tooltipHost.textContent).not.toContain('TIED (');
        expect(tooltipHost.textContent).toContain('Lando Norris');
        expect(tooltipHost.textContent).not.toContain('Lewis Hamilton');

        await act(async () => {
            tooltipRoot.unmount();
        });
    });
});

import { useMemo, useState, type ReactElement } from 'react';
import { Crosshair, HelpCircle, TrendingDown, TrendingUp, X } from 'lucide-react';
import {
    CartesianGrid,
    ReferenceLine,
    ResponsiveContainer,
    Scatter,
    ScatterChart,
    Tooltip,
    XAxis,
    YAxis,
    ZAxis,
} from 'recharts';
import type { ConstructorStanding, DriverStanding } from '../../api/f1Api';
import type { AverageRating } from '../../types';
import {
    buildOverperformanceDataset,
    type LabelPlacement,
    type OverperformancePoint,
    type PerformanceAxisMode,
    type PerformanceGridFilter,
    type PerformanceScaleMode,
} from '../../utils/overperformance';
import type { BreakdownSource } from '../../utils/raceBreakdown';
import { DriverProfileLink } from '../DriverProfileLink';

export interface OverperformanceScatterProps {
    season: string;
    averages: AverageRating[];
    driverStandings: DriverStanding[];
    constructorStandings: ConstructorStanding[];
    activeMode: BreakdownSource;
    minimumRatedRaces: number;
    standingsLoading: boolean;
    onSelectDriver?: (driverId: string) => void;
}

interface ScatterShapeProps {
    cx?: number;
    cy?: number;
    payload?: OverperformancePoint;
}

const AXIS_TICK = { fill: '#8E9196', fontSize: 11, fontFamily: 'Oxanium, sans-serif' };
const CHART_MARGIN = { top: 20, right: 24, bottom: 16, left: 4 };
const Z_RANGE: [number, number] = [90, 90];

function getLabelTextProps(placement: LabelPlacement): {
    dx: number;
    dy: number;
    textAnchor: 'start' | 'middle' | 'end';
} {
    switch (placement) {
        case 'bottom':
            return { dx: 0, dy: 16, textAnchor: 'middle' };
        case 'left':
            return { dx: -11, dy: 3, textAnchor: 'end' };
        case 'right':
            return { dx: 11, dy: 3, textAnchor: 'start' };
        case 'top':
        default:
            return { dx: 0, dy: -11, textAnchor: 'middle' };
    }
}

function renderScatterNode(
    rawProps: unknown,
    onSelectDriver?: (driverId: string) => void,
): ReactElement {
    const { cx, cy, payload } = (rawProps ?? {}) as ScatterShapeProps;
    if (typeof cx !== 'number' || typeof cy !== 'number' || !payload) {
        return <g />;
    }

    const { dx, dy, textAnchor } = getLabelTextProps(payload.labelPlacement);
    const radius = payload.qualified ? 5.5 : 4.5;

    return (
        <g
            data-driver-id={payload.driverId}
            className={onSelectDriver ? 'cursor-pointer' : undefined}
            onClick={() => onSelectDriver?.(payload.driverId)}
        >
            <circle
                cx={cx}
                cy={cy}
                r={radius + 3}
                fill={payload.color}
                fillOpacity={0.14}
            />
            <circle
                cx={cx}
                cy={cy}
                r={radius}
                fill={payload.color}
                fillOpacity={payload.qualified ? 0.95 : 0.45}
                stroke="#0a0a0b"
                strokeWidth={1.5}
            />
            <text
                x={cx + dx}
                y={cy + dy}
                textAnchor={textAnchor}
                fill={payload.qualified ? '#E5E7EB' : '#8E9196'}
                fontSize={10}
                fontWeight={600}
                fontFamily="Oxanium, sans-serif"
                className="pointer-events-none select-none"
            >
                {payload.shortCode}
            </text>
        </g>
    );
}

function formatSignedDelta(delta: number): string {
    const sign = delta >= 0 ? '+' : '';
    return `${sign}${delta.toFixed(2)}`;
}

interface StandoutListColumnProps {
    title: string;
    emptyText: string;
    variant: 'positive' | 'negative';
    items: OverperformancePoint[];
    season: string;
    onSelectDriver?: (driverId: string) => void;
}

function StandoutListColumn({
    title,
    emptyText,
    variant,
    items,
    season,
    onSelectDriver,
}: StandoutListColumnProps) {
    const isPositive = variant === 'positive';
    const deltaColorClass = isPositive ? 'text-[#00FF88]' : 'text-[var(--accent-red)]';

    return (
        <div>
            <div className="mb-2.5 flex items-center gap-2 border-b border-[var(--border-color)] pb-1.5">
                {isPositive ? (
                    <TrendingUp size={14} className="text-[#00FF88]" aria-hidden="true" />
                ) : (
                    <TrendingDown size={14} className="text-[var(--accent-red)]" aria-hidden="true" />
                )}
                <h4 className="font-oxanium text-[10px] font-bold uppercase tracking-[0.18em] text-white">
                    {title}
                </h4>
            </div>
            {items.length === 0 ? (
                <p className="font-oxanium text-[11px] uppercase text-[var(--text-muted)]">
                    {emptyText}
                </p>
            ) : (
                <div className="divide-y divide-white/[0.04]">
                    {items.map((pt) => (
                        <div key={pt.driverId} className="flex items-center justify-between gap-3 py-2">
                            <div className="flex min-w-0 items-center gap-2.5">
                                <span className="h-4 w-1 shrink-0" style={{ backgroundColor: pt.color }} />
                                <div className="min-w-0">
                                    <DriverProfileLink
                                        season={season}
                                        driverId={pt.driverId}
                                        onNavigate={onSelectDriver ? () => onSelectDriver(pt.driverId) : undefined}
                                        className="block truncate font-display text-sm uppercase text-white transition-colors hover:text-[var(--accent-yellow)]"
                                    >
                                        {pt.driverName}
                                    </DriverProfileLink>
                                    <div className="truncate font-oxanium text-[9px] uppercase tracking-wider text-[var(--text-muted)]">
                                        {pt.constructorName} · {pt.rating.toFixed(2)} AVG · {pt.xValue} PTS
                                    </div>
                                </div>
                            </div>
                            <span className={`shrink-0 font-oxanium text-xs font-bold tabular-nums ${deltaColorClass}`}>
                                {formatSignedDelta(pt.delta)}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

/**
 * Compares personal or community driver ratings against constructor (car) or WDC points
 * using a scatter plot with spread/linear X-scaling, midfield zoom filters, and OLS trendline.
 */
export function OverperformanceScatter({
    season,
    averages,
    driverStandings,
    constructorStandings,
    activeMode,
    minimumRatedRaces,
    standingsLoading,
    onSelectDriver,
}: OverperformanceScatterProps) {
    const [axisMode, setAxisMode] = useState<PerformanceAxisMode>('car');
    const [scaleMode, setScaleMode] = useState<PerformanceScaleMode>('spread');
    const [gridFilter, setGridFilter] = useState<PerformanceGridFilter>('all');
    const [showAllDrivers, setShowAllDrivers] = useState(false);
    const [showGuide, setShowGuide] = useState(false);

    const dataset = useMemo(
        () => buildOverperformanceDataset({
            averages,
            driverStandings,
            constructorStandings,
            axisMode,
            scaleMode,
            gridFilter,
            includeUnqualified: showAllDrivers,
            minimumRatedRaces,
        }),
        [
            averages,
            driverStandings,
            constructorStandings,
            axisMode,
            scaleMode,
            gridFilter,
            showAllDrivers,
            minimumRatedRaces,
        ],
    );

    const hasStandings = driverStandings.length > 0 || constructorStandings.length > 0;
    const isUnavailable = dataset.totalDriverCount < 3 || !hasStandings;
    const xAxisCaption = axisMode === 'car'
        ? 'CONSTRUCTOR POINTS (WCC)'
        : 'CHAMPIONSHIP POINTS (WDC)';
    const raterLabel = activeMode === 'community' ? 'community voters' : 'your personal ratings';

    return (
        <section className="space-y-4" aria-label="Performance vs car analysis">
            {/* Section Title + Axis Mode Toggle */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-color)] pb-2">
                <div className="flex items-center gap-2.5">
                    <Crosshair size={16} className="text-[var(--accent-red)]" aria-hidden="true" />
                    <h3 className="font-display text-2xl text-white uppercase tracking-wider">
                        PERFORMANCE VS CAR
                    </h3>
                    <button
                        type="button"
                        aria-expanded={showGuide}
                        aria-controls="overperformance-guide"
                        aria-label="How to read Performance vs Car chart"
                        title="How to read this chart"
                        onClick={() => setShowGuide(prev => !prev)}
                        className={`inline-flex items-center justify-center text-[var(--accent-red)] transition-opacity hover:opacity-100 ${
                            showGuide ? 'opacity-100' : 'opacity-85'
                        }`}
                    >
                        <HelpCircle size={19} aria-hidden="true" />
                    </button>
                </div>

                <div
                    role="tablist"
                    aria-label="Scatter plot X-axis metric"
                    className="flex items-center gap-4"
                >
                    {(
                        [
                            { id: 'car', label: 'CAR POINTS (WCC)' },
                            { id: 'driver', label: 'DRIVER POINTS (WDC)' },
                        ] as const
                    ).map((tab) => {
                        const isSelected = axisMode === tab.id;
                        return (
                            <button
                                key={tab.id}
                                type="button"
                                role="tab"
                                aria-selected={isSelected}
                                onClick={() => setAxisMode(tab.id)}
                                className={`border-b-2 pb-1 font-oxanium text-[10px] tracking-[0.16em] uppercase transition-colors ${
                                    isSelected
                                        ? 'border-[var(--accent-red)] text-white'
                                        : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                                }`}
                            >
                                {tab.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            {showGuide && (
                <div
                    id="overperformance-guide"
                    className="relative border border-[var(--border-color)] border-l-2 border-l-[var(--accent-red)] bg-[var(--bg-darker)] p-4 text-xs"
                >
                    <div className="mb-2.5 flex items-center justify-between gap-2 border-b border-white/[0.06] pb-2">
                        <span className="font-oxanium text-[10px] font-bold tracking-[0.18em] uppercase text-white">
                            HOW TO READ THIS CHART
                        </span>
                        <button
                            type="button"
                            onClick={() => setShowGuide(false)}
                            aria-label="Close chart guide"
                            className="text-[var(--text-muted)] transition-colors hover:text-white"
                        >
                            <X size={14} aria-hidden="true" />
                        </button>
                    </div>
                    <div className="grid grid-cols-1 gap-3 font-ui text-[12px] leading-relaxed text-[var(--text-secondary)] md:grid-cols-2">
                        <div>
                            <span className="font-oxanium text-[10px] font-bold tracking-wider uppercase text-white">
                                Expected Rating (Dashed Line)
                            </span>
                            <p className="mt-0.5 text-[var(--text-muted)]">
                                Shows the average rating {raterLabel} typically give for a car or driver with that points total, not objective on-track telemetry.
                            </p>
                        </div>
                        <div>
                            <span className="font-oxanium text-[10px] font-bold tracking-wider uppercase text-white">
                                Rating Delta (<span className="text-[#00FF88]">+</span> / <span className="text-[var(--accent-red)]">-</span>)
                            </span>
                            <p className="mt-0.5 text-[var(--text-muted)]">
                                Positive (<span className="text-[#00FF88]">+</span>) means {raterLabel} score that driver higher than their results baseline; negative (<span className="text-[var(--accent-red)]">-</span>) means rated lower than expected; near <span className="text-white">0.00</span> is right in line.
                            </p>
                        </div>
                        <div>
                            <span className="font-oxanium text-[10px] font-bold tracking-wider uppercase text-white">
                                Car Points (WCC) vs Driver Points (WDC)
                            </span>
                            <p className="mt-0.5 text-[var(--text-muted)]">
                                WCC lines teammates up on the same team score to show who {raterLabel} rate higher in equal machinery. WDC compares ratings against each driver&apos;s own championship points.
                            </p>
                        </div>
                        <div>
                            <span className="font-oxanium text-[10px] font-bold tracking-wider uppercase text-white">
                                Spread & View Filters
                            </span>
                            <p className="mt-0.5 text-[var(--text-muted)]">
                                <span className="text-white">SPREAD</span> spaces out lower-scoring midfield teams while keeping real point numbers. <span className="text-white">MIDFIELD</span> / <span className="text-white">TOP TEAMS</span> zoom the view without changing full-grid deltas.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            <div className="bg-[var(--bg-panel)] border border-[var(--border-color)] p-4 md:p-6 relative scanline overflow-hidden">
                <div
                    className="absolute inset-0 pointer-events-none opacity-5"
                    style={{
                        backgroundImage:
                            'linear-gradient(var(--border-color) 1px, transparent 1px), linear-gradient(90deg, var(--border-color) 1px, transparent 1px)',
                        backgroundSize: '20px 20px',
                    }}
                />

                {standingsLoading && !hasStandings ? (
                    <div className="relative z-10 h-[340px] md:h-[400px] animate-pulse bg-white/[0.02]" />
                ) : isUnavailable ? (
                    <div className="relative z-10 flex flex-col gap-2 py-8 md:flex-row md:items-center md:justify-between" role="status">
                        <div>
                            <div className="font-display text-xl text-white uppercase tracking-wider">
                                NOT ENOUGH TELEMETRY YET
                            </div>
                            <p className="mt-1 font-oxanium text-xs text-[var(--text-secondary)]">
                                Rate at least 3 drivers alongside available {season} standings data to plot car-adjusted overperformance.
                            </p>
                        </div>
                        <span className="font-oxanium text-[10px] uppercase tracking-widest text-[var(--text-muted)]">
                            MIN 3 DRIVERS REQUIRED
                        </span>
                    </div>
                ) : (
                    <div className="relative z-10 space-y-5">
                        {/* Zoom & Scale Filter Bar */}
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-color)]/60 pb-3">
                            <div className="flex flex-wrap items-center gap-4">
                                <div role="group" aria-label="Grid tier filter" className="flex items-center gap-3">
                                    <span className="font-oxanium text-[9px] tracking-[0.18em] text-[var(--text-muted)] uppercase">
                                        VIEW:
                                    </span>
                                    {(
                                        [
                                            { id: 'all', label: 'ALL GRID' },
                                            { id: 'midfield', label: 'MIDFIELD' },
                                            { id: 'leaders', label: axisMode === 'car' ? 'TOP TEAMS' : 'TOP 8' },
                                        ] as const
                                    ).map((item) => {
                                        const isActive = gridFilter === item.id;
                                        return (
                                            <button
                                                key={item.id}
                                                type="button"
                                                aria-pressed={isActive}
                                                onClick={() => setGridFilter(item.id)}
                                                className={`border-b pb-0.5 font-oxanium text-[10px] tracking-[0.14em] uppercase transition-colors ${
                                                    isActive
                                                        ? 'border-[var(--accent-yellow)] text-white'
                                                        : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                                                }`}
                                            >
                                                {item.label}
                                            </button>
                                        );
                                    })}
                                </div>

                                <div role="group" aria-label="X-axis scale mode" className="flex items-center gap-3 border-l border-[var(--border-color)] pl-4">
                                    <span className="font-oxanium text-[9px] tracking-[0.18em] text-[var(--text-muted)] uppercase">
                                        SCALE:
                                    </span>
                                    {(
                                        [
                                            { id: 'spread', label: 'SPREAD' },
                                            { id: 'linear', label: 'LINEAR' },
                                        ] as const
                                    ).map((modeOption) => {
                                        const isActive = scaleMode === modeOption.id;
                                        return (
                                            <button
                                                key={modeOption.id}
                                                type="button"
                                                aria-pressed={isActive}
                                                onClick={() => setScaleMode(modeOption.id)}
                                                className={`border-b pb-0.5 font-oxanium text-[10px] tracking-[0.14em] uppercase transition-colors ${
                                                    isActive
                                                        ? 'border-[var(--accent-red)] text-white'
                                                        : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                                                }`}
                                            >
                                                {modeOption.label}
                                            </button>
                                        );
                                    })}
                                </div>

                                {dataset.unqualifiedCount > 0 && (
                                    <button
                                        type="button"
                                        aria-pressed={showAllDrivers}
                                        onClick={() => setShowAllDrivers(prev => !prev)}
                                        className="border-l border-[var(--border-color)] pl-4 font-oxanium text-[10px] tracking-[0.14em] uppercase text-[var(--text-muted)] transition-colors hover:text-white"
                                    >
                                        {showAllDrivers
                                            ? 'HIDE RESERVE/PART-TIME'
                                            : `+${dataset.unqualifiedCount} PART-TIME`}
                                    </button>
                                )}
                            </div>

                            <div className="flex items-center gap-4 font-oxanium text-[10px] uppercase tracking-widest text-[var(--text-muted)]">
                                <span className="inline-flex items-center gap-2 text-[var(--text-secondary)]">
                                    <span className="inline-block w-5 border-t border-dashed border-white/50" />
                                    EXPECTED TREND
                                </span>
                                <span>{dataset.points.length} SHOWN</span>
                            </div>
                        </div>

                        {/* Recharts Scatter Plot */}
                        <div
                            className="relative h-[340px] md:h-[400px]"
                            data-testid="overperformance-scatter-chart"
                        >
                            <span className="pointer-events-none absolute top-2 left-12 z-10 font-oxanium text-[9px] font-bold tracking-[0.2em] uppercase text-[#00FF88]/60">
                                OVERPERFORMING
                            </span>
                            <span className="pointer-events-none absolute right-6 bottom-14 z-10 font-oxanium text-[9px] font-bold tracking-[0.2em] uppercase text-[var(--accent-red)]/65">
                                UNDERPERFORMING
                            </span>

                            <ResponsiveContainer width="100%" height="100%">
                                <ScatterChart margin={CHART_MARGIN}>
                                    <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
                                    <XAxis
                                        type="number"
                                        dataKey="xPlot"
                                        name={axisMode === 'car' ? 'Car Points' : 'Driver Points'}
                                        domain={dataset.xDomain}
                                        ticks={dataset.xTicks}
                                        padding={{ left: 18, right: 20 }}
                                        axisLine={false}
                                        tickLine={false}
                                        tick={AXIS_TICK}
                                        tickFormatter={(value: number) =>
                                            scaleMode === 'spread'
                                                ? String(Math.round(value * value))
                                                : String(Math.round(value))
                                        }
                                    />
                                    <YAxis
                                        type="number"
                                        dataKey="rating"
                                        name="Rating"
                                        domain={dataset.yDomain}
                                        axisLine={false}
                                        tickLine={false}
                                        tick={AXIS_TICK}
                                        tickFormatter={(value: number) => value.toFixed(1)}
                                        width={36}
                                    />
                                    <ZAxis range={Z_RANGE} />
                                    {dataset.trend && (
                                        <ReferenceLine
                                            segment={dataset.trend.segment}
                                            stroke="rgba(255,255,255,0.35)"
                                            strokeWidth={1.5}
                                            strokeDasharray="5 4"
                                        />
                                    )}
                                    <Tooltip
                                        cursor={{ stroke: 'rgba(255,255,255,0.12)', strokeDasharray: '3 3' }}
                                        content={({ active, payload }) => {
                                            if (!active || !payload || payload.length === 0) return null;
                                            const pt = payload[0]?.payload as OverperformancePoint | undefined;
                                            if (!pt) return null;

                                            const isPositive = pt.delta >= 0;
                                            return (
                                                <div className="min-w-[210px] border border-[var(--border-color)] bg-[#050608] p-3.5 shadow-2xl">
                                                    <div className="flex items-center gap-2">
                                                        <span className="h-3.5 w-1 shrink-0" style={{ backgroundColor: pt.color }} />
                                                        <div className="min-w-0">
                                                            <div className="truncate font-display text-base uppercase leading-none text-white">
                                                                {pt.driverName}
                                                            </div>
                                                            <div className="mt-1 font-oxanium text-[9px] uppercase tracking-wider text-[var(--text-muted)]">
                                                                {pt.constructorName}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="mt-3 space-y-1.5 border-t border-white/10 pt-2.5 font-oxanium text-xs">
                                                        <div className="flex items-center justify-between gap-4">
                                                            <span className="text-[var(--text-muted)]">AVG RATING</span>
                                                            <span className="font-bold tabular-nums text-[var(--accent-yellow)]">
                                                                {pt.rating.toFixed(2)}
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center justify-between gap-4">
                                                            <span className="text-[var(--text-muted)]">
                                                                {axisMode === 'car' ? 'CAR PTS (WCC)' : 'DRIVER PTS (WDC)'}
                                                            </span>
                                                            <span className="tabular-nums text-white">{pt.xValue}</span>
                                                        </div>
                                                        {dataset.trend && (
                                                            <>
                                                                <div className="flex items-center justify-between gap-4">
                                                                    <span className="text-[var(--text-muted)]">EXPECTED</span>
                                                                    <span className="tabular-nums text-[var(--text-secondary)]">
                                                                        {pt.expectedRating.toFixed(2)}
                                                                    </span>
                                                                </div>
                                                                <div className="flex items-center justify-between gap-4 border-t border-white/10 pt-1.5">
                                                                    <span className="text-[var(--text-muted)]">DELTA VS PACE</span>
                                                                    <span
                                                                        className={`font-bold tabular-nums ${
                                                                            isPositive ? 'text-[#00FF88]' : 'text-[var(--accent-red)]'
                                                                        }`}
                                                                    >
                                                                        {formatSignedDelta(pt.delta)}
                                                                    </span>
                                                                </div>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        }}
                                    />
                                    <Scatter
                                        data={dataset.points}
                                        isAnimationActive={false}
                                        shape={(rawProps: unknown) => renderScatterNode(rawProps, onSelectDriver)}
                                    />
                                </ScatterChart>
                            </ResponsiveContainer>
                        </div>

                        <div className="text-center font-oxanium text-[10px] tracking-[0.2em] uppercase text-[var(--text-muted)]">
                            {activeMode === 'community' ? 'COMMUNITY AVG' : 'MY RATINGS'} · {xAxisCaption}
                        </div>

                        {/* Standout Overperformers & Underperformers */}
                        {(dataset.topOverperformers.length > 0 || dataset.topUnderperformers.length > 0) && (
                            <div className="grid grid-cols-1 gap-6 border-t border-[var(--border-color)] pt-5 md:grid-cols-2">
                                <StandoutListColumn
                                    title="TOP OVERPERFORMERS"
                                    emptyText="NO CLEAR OUTLIERS ABOVE TRENDLINE"
                                    variant="positive"
                                    items={dataset.topOverperformers}
                                    season={season}
                                    onSelectDriver={onSelectDriver}
                                />
                                <StandoutListColumn
                                    title="BELOW EXPECTATION"
                                    emptyText="NO CLEAR OUTLIERS BELOW TRENDLINE"
                                    variant="negative"
                                    items={dataset.topUnderperformers}
                                    season={season}
                                    onSelectDriver={onSelectDriver}
                                />
                            </div>
                        )}
                    </div>
                )}
            </div>
        </section>
    );
}

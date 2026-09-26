import { useCallback, useState, type ComponentProps } from 'react';
import { useReducedMotion } from 'framer-motion';
import { ChartNoAxesCombined } from 'lucide-react';
import { CartesianGrid, Curve, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, useActiveTooltipDataPoints } from 'recharts';
import { POINTS_RESCALE_MS, usePointsTrackerSeries } from '../hooks/usePointsTrackerSeries';
import type { ChampionshipProgressPoint, PointsTrackerEntry } from '../utils/standings';
import { revealPointsLine, type TrackerCoordinate } from '../utils/pointsTracker';
import { getCountryCode } from '../utils/storage';

interface StandingsPointsTrackerProps {
    season: string;
    mode: 'drivers' | 'constructors';
    entries: PointsTrackerEntry[];
    points: ChampionshipProgressPoint[];
    selectedIds: string[] | null;
    onSelectionChange: (ids: string[]) => void;
    isExporting: boolean;
    error: string | null;
    onRetry: () => void;
}

const RACE_LABELS: Record<string, string> = {
    'Emilia Romagna': 'IMO',
    '70th Anniversary': '70A',
    Styrian: 'STY',
    Eifel: 'EIF',
    Sakhir: 'SAK',
    Tuscan: 'TUS',
    Miami: 'MIA',
    'Las Vegas': 'LV',
    'United States': 'USA',
};
const pointsFormatter = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 3 });
const CHART_MARGIN = { left: 0, right: 16, top: 20, bottom: 10 };
const POINTS_DOMAIN: [number, 'auto'] = [0, 'auto'];
const AXIS_TICK = { fill: '#8E9196', fontSize: 11, fontFamily: 'Oxanium, sans-serif' };

function raceLabel(point: ChampionshipProgressPoint): string {
    const shortName = point.raceName.replace(' Grand Prix', '').replace(' GP', '');
    const country = getCountryCode(point.raceName);
    return RACE_LABELS[shortName] ?? (country !== 'XX' ? country : `R${point.round}`);
}

function LineSwatch({ color, dash }: Pick<PointsTrackerEntry, 'color' | 'dash'>) {
    return (
        <svg width="26" height="10" viewBox="0 0 26 10" aria-hidden="true" className="shrink-0">
            <line x1="0" x2="26" y1="5" y2="5" stroke={color} strokeWidth="3" strokeDasharray={dash} />
        </svg>
    );
}

function PointsCurve({ progress, dash, ...props }: ComponentProps<typeof Curve> & { progress: number; dash?: string }) {
    const { visiblePoints } = revealPointsLine(props.points ?? [], progress);
    return <>
        {/* Keep Recharts' geometry reference full length so scale interpolation is independent of the reveal. */}
        <Curve {...props} className="points-tracker-geometry" strokeDasharray={dash} visibility="hidden" pointerEvents="none" aria-hidden />
        <Curve {...props} pathRef={undefined} points={visiblePoints} strokeDasharray={dash} />
    </>;
}

interface PointsDotProps {
    progress: number;
    color: string;
    isExporting: boolean;
    name?: string;
    cx?: number;
    cy?: number;
    index?: number;
    points?: readonly TrackerCoordinate[];
    payload?: ChampionshipProgressPoint;
}

function PointsDot({ progress, color, isExporting, name, cx, cy, index, points = [], payload }: PointsDotProps) {
    const activePoints = useActiveTooltipDataPoints<ChampionshipProgressPoint>();
    const { visibleIndexes, dotScale } = revealPointsLine(points, progress);
    if (index === undefined || !visibleIndexes.has(index) || cx === undefined || cy === undefined) return null;
    const active = !isExporting && activePoints?.some(point => point.round === payload?.round);
    return <circle
        className={`recharts-dot recharts-line-dot${active ? ' points-tracker-active-dot' : ''}`}
        name={name} data-point-index={index} cx={cx} cy={cy} r={(active ? 6 : 4) * dotScale}
        fill={color} stroke={active ? '#fff' : '#0a0a0b'} strokeWidth={2 * dotScale} strokeDasharray="none"
    />;
}

export function StandingsPointsTracker({
    season, mode, entries, points, selectedIds: selection,
    onSelectionChange, isExporting, error, onRetry,
}: StandingsPointsTrackerProps) {
    const [chartWidth, setChartWidth] = useState(0);
    const formatRound = useCallback((round: string) => {
        const point = points.find(point => point.round === round);
        return point ? raceLabel(point) : `R${round}`;
    }, [points]);
    const reducedMotion = useReducedMotion();
    const instant = isExporting || !!reducedMotion;
    const selectedIds = new Set(selection ?? entries.slice(0, 3).map(entry => entry.id));
    const selectedEntries = entries.filter(entry => selectedIds.has(entry.id));
    const series = usePointsTrackerSeries(selectedEntries.map(entry => entry.id), instant);
    const renderedSeries = series.flatMap(series => {
        const entry = entries.find(entry => entry.id === series.id);
        return entry ? [{ ...series, entry }] : [];
    });
    const singular = mode === 'drivers' ? 'driver' : 'constructor';
    const latestPoint = points.at(-1);
    const totalFor = (id: string) => latestPoint?.scores[id]?.totalPoints ?? 0;
    const leaders = [...selectedEntries].sort((a, b) => totalFor(b.id) - totalFor(a.id));
    const leader = leaders[0];
    const gap = leaders.length > 1 ? totalFor(leaders[0].id) - totalFor(leaders[1].id) : null;

    function toggleEntry(id: string) {
        const nextIds = new Set(selectedIds);
        if (nextIds.has(id)) nextIds.delete(id);
        else nextIds.add(id);
        onSelectionChange([...nextIds]);
    }

    const hasTimeline = entries.length > 0 && points.length > 0;
    const stats = [
        { label: 'Selected', value: String(selectedEntries.length), detail: mode.toUpperCase() },
        { label: 'Rounds', value: String(points.length), detail: latestPoint?.sprintOnly ? 'SPRINT UPDATE' : 'RACE WEEKENDS' },
        { label: 'Selected leader', value: leader?.label ?? '—', detail: leader ? `${pointsFormatter.format(totalFor(leader.id))} PTS` : 'NO SELECTION' },
        { label: 'Gap to 2nd', value: gap === null ? '—' : pointsFormatter.format(gap), detail: 'POINTS' },
    ];

    return (
        <section className="mt-12 min-w-0" aria-label="Championship points tracker">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-color)] pb-2">
                <div className="flex items-center gap-3">
                    <ChartNoAxesCombined size={18} className="text-[var(--accent-yellow)]" />
                    <h3 className="font-display text-xl md:text-2xl text-white uppercase tracking-wider">POINTS TRACKER</h3>
                </div>
                <span className="font-oxanium text-[10px] text-[var(--text-muted)] uppercase tracking-widest">
                    CUMULATIVE CHAMPIONSHIP POINTS
                </span>
            </div>

            <div className="relative overflow-hidden border border-[var(--border-color)] bg-[var(--bg-panel)] p-4 md:p-6 scanline">
                <div
                    className="absolute inset-0 pointer-events-none opacity-5"
                    style={{ backgroundImage: 'linear-gradient(var(--border-color) 1px, transparent 1px), linear-gradient(90deg, var(--border-color) 1px, transparent 1px)', backgroundSize: '20px 20px' }}
                />

                {error || !hasTimeline ? (
                    <div className="relative z-10 py-8" role="status">
                        <h4 className="font-display text-xl text-white uppercase mb-3">
                            {error ? 'POINTS TRACKER UNAVAILABLE' : 'NO POINTS DATA YET'}
                        </h4>
                        <p className="font-ui text-sm text-[var(--text-secondary)]">
                            {error ?? `The ${season} points timeline will appear once race or sprint results are available.`}
                        </p>
                        {error && (
                            <button type="button" onClick={onRetry} className="mt-4 px-4 py-2 border border-[var(--border-color)] text-white font-oxanium text-sm uppercase hover:border-[var(--accent-yellow)] transition-colors hide-on-export">
                                Retry points data
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="relative z-10 space-y-6">
                        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
                            <div className="min-w-0 space-y-3">
                                <div className="border-l-[6px] border-[var(--accent-yellow)] pl-3">
                                    <div className="font-oxanium text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-1">{season} SEASON</div>
                                    <h4 className="font-display text-xl md:text-3xl text-white uppercase tracking-tight leading-tight">
                                        CHAMPIONSHIP<br />PROGRESS
                                    </h4>
                                </div>
                                <p className="font-ui text-sm text-[var(--text-secondary)] max-w-lg">
                                    Compare how each {mode === 'drivers' ? "driver's" : "team's"} points build across the season. Select {mode} below to add or remove their lines.
                                </p>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-[0.8fr_0.8fr_1.4fr_1fr] gap-3 w-full xl:w-[560px] xl:shrink-0">
                                {stats.map(stat => (
                                    <div key={stat.label} className="min-w-0 border border-[var(--border-color)] bg-[var(--bg-darker)] px-3 py-3">
                                        <div className="font-oxanium text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-2">{stat.label}</div>
                                        <div className={`font-display text-white leading-none uppercase truncate ${stat.label === 'Selected leader' ? 'text-sm' : 'text-2xl'}`} title={stat.value}>
                                            {stat.value}
                                        </div>
                                        <div className="font-oxanium text-[9px] text-[var(--text-muted)] uppercase tracking-wider mt-2">{stat.detail}</div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="overflow-x-auto pb-2" role="group" aria-label={`Choose ${mode} to compare`}>
                            <div className="flex gap-2 min-w-max">
                                {entries.map(entry => {
                                    const selected = selectedIds.has(entry.id);
                                    return (
                                        <button
                                            key={entry.id}
                                            type="button"
                                            aria-label={`Compare ${entry.name}`}
                                            aria-pressed={selected}
                                            title={entry.description}
                                            onClick={() => toggleEntry(entry.id)}
                                            className={`min-w-[140px] border px-3 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-yellow)] ${selected ? 'border-white bg-[var(--bg-darker)]' : 'border-[var(--border-color)] bg-[var(--bg-panel-hover)] hover:border-white/40'}`}
                                        >
                                            <div className="flex items-center gap-2">
                                                <div className="w-1 h-8 shrink-0" style={{ backgroundColor: entry.color }} />
                                                <div>
                                                    <div className="font-display text-sm text-white uppercase leading-none">{entry.label}</div>
                                                    <div className="flex items-center justify-between gap-4 mt-2">
                                                        <span className="font-oxanium text-[10px] text-[var(--text-muted)]">{pointsFormatter.format(entry.points)} PTS</span>
                                                        <LineSwatch {...entry} />
                                                    </div>
                                                </div>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {renderedSeries.length === 0 ? (
                            <div className="h-[320px] md:h-[420px] flex flex-col items-center justify-center text-center gap-3" role="status">
                                <ChartNoAxesCombined size={32} className="text-[var(--text-muted)]" />
                                <p className="font-display text-lg text-white uppercase">SELECT {mode.toUpperCase()} TO COMPARE</p>
                                <p className="font-ui text-sm text-[var(--text-secondary)]">Choose one or more {mode} above to see their championship progress.</p>
                            </div>
                        ) : (
                            <>
                                <div className="flex flex-wrap gap-x-5 gap-y-2" aria-label={`Selected ${singular} lines`}>
                                    {renderedSeries.map(({ entry }) => (
                                        <div key={entry.id} className="flex items-center gap-2 font-oxanium text-[11px] text-[var(--text-secondary)] uppercase">
                                            <LineSwatch {...entry} />
                                            <span>{entry.label}</span>
                                            <span className="text-white">{pointsFormatter.format(totalFor(entry.id))}</span>
                                        </div>
                                    ))}
                                </div>
                                <div className="h-[320px] md:h-[420px] min-w-0" role="region" aria-label="Cumulative points by race">
                                    <ResponsiveContainer width="100%" height="100%" minWidth={0} onResize={setChartWidth}>
                                        <LineChart data={points} margin={CHART_MARGIN} accessibilityLayer>
                                            <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
                                            <XAxis
                                                dataKey="round"
                                                tickFormatter={formatRound}
                                                axisLine={false}
                                                tickLine={false}
                                                minTickGap={18}
                                                interval="preserveStartEnd"
                                                tick={AXIS_TICK}
                                            />
                                            <YAxis
                                                type="number"
                                                domain={POINTS_DOMAIN}
                                                width={44}
                                                axisLine={false}
                                                tickLine={false}
                                                tick={AXIS_TICK}
                                            />
                                            <Tooltip
                                                cursor={{ stroke: 'rgba(255,255,255,0.12)', strokeWidth: 1 }}
                                                wrapperClassName="hide-on-export"
                                                wrapperStyle={{ pointerEvents: 'auto' }}
                                                position={chartWidth < 400 ? { x: 0, y: 0 } : undefined}
                                                content={({ active, payload }) => {
                                                    const point = payload?.[0]?.payload as ChampionshipProgressPoint | undefined;
                                                    if (!active || !point || isExporting || selectedEntries.length === 0) return null;
                                                    const comparison = [...selectedEntries].sort((a, b) => point.scores[b.id].totalPoints - point.scores[a.id].totalPoints);
                                                    const leaderPoints = point.scores[comparison[0].id].totalPoints;
                                                    return (
                                                        <div className="bg-[#050608] border border-[var(--border-color)] p-3 md:p-4 shadow-2xl w-[260px] max-w-[calc(100vw-64px)] max-h-[300px] md:max-h-[380px] overflow-y-auto">
                                                            <div className="font-oxanium text-[10px] text-[var(--text-muted)] uppercase tracking-widest mb-1">ROUND {point.round}</div>
                                                            <div className="font-display text-sm text-white uppercase mb-3">{point.raceName.replace(' Grand Prix', '')}</div>
                                                            {point.sprintOnly && (
                                                                <p className="font-oxanium text-[10px] text-[var(--accent-yellow)] mb-3">SPRINT ONLY · GP RESULTS PENDING</p>
                                                            )}
                                                            <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 gap-y-2 font-oxanium text-xs">
                                                                <span className="text-[var(--text-muted)] text-[9px]">{mode === 'drivers' ? 'DRIVER' : 'TEAM'}</span>
                                                                <span className="text-[var(--text-muted)] text-[9px] text-right">TOTAL</span>
                                                                <span className="text-[var(--text-muted)] text-[9px] text-right">GAP</span>
                                                                {comparison.map(entry => {
                                                                    const score = point.scores[entry.id];
                                                                    const deficit = pointsFormatter.format(leaderPoints - score.totalPoints);
                                                                    return (
                                                                        <div key={entry.id} className="contents">
                                                                            <div className="flex items-center gap-2 text-white uppercase min-w-0">
                                                                                <LineSwatch {...entry} />
                                                                                <span className="truncate" title={entry.name}>{entry.label}</span>
                                                                            </div>
                                                                            <span className="text-white text-right tabular-nums">{pointsFormatter.format(score.totalPoints)}</span>
                                                                            <span className="text-[var(--accent-yellow)] text-right tabular-nums">{deficit === '0' ? 'LEADER' : `−${deficit}`}</span>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    );
                                                }}
                                            />
                                            {renderedSeries.map(({ entry, progress }) => (
                                                    <Line
                                                        key={entry.id}
                                                        name={entry.name}
                                                        type="linear"
                                                        dataKey={`scores.${entry.id}.totalPoints`}
                                                        stroke={entry.color}
                                                        strokeDasharray={entry.dash}
                                                        strokeWidth={3}
                                                        shape={<PointsCurve progress={progress} dash={entry.dash} />}
                                                        dot={<PointsDot progress={progress} color={entry.color} isExporting={isExporting} />}
                                                        activeDot={false}
                                                        isAnimationActive={!instant}
                                                        animationDuration={POINTS_RESCALE_MS}
                                                        animationEasing="ease"
                                                    />
                                            ))}
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>
                            </>
                        )}
                    </div>
                )}
            </div>
        </section>
    );
}

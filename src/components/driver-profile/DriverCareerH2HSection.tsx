import {
    Swords,
    Loader2,
    Timer,
    Flag,
    ChevronDown,
} from 'lucide-react';
import { getTeamColor } from '../../types';
import {
    formatShortRaceName,
    type CareerSeasonTeammateH2H,
} from '../../utils/driverProfile';
import { CountryFlag } from '../../utils/countryFlags';

export interface DriverCareerH2HSectionProps {
    driverName: string;
    entries: CareerSeasonTeammateH2H[];
    loading: boolean;
    progress: { loaded: number; total: number } | null;
    expandedQualiId: string | null;
    expandedRaceId: string | null;
    onToggleQuali: (id: string) => void;
    onToggleRace: (id: string) => void;
}

function h2hRaceResultLabel(position: number | null, status?: string): string {
    if (position !== null) return `P${position}`;
    const normalizedStatus = status?.trim().toLowerCase() ?? '';
    if (!normalizedStatus) return '—';
    if (/\b(disqualified|dsq|dq)\b/.test(normalizedStatus)) return 'DSQ';
    if (/\bexcluded\b/.test(normalizedStatus)) return 'EXC';
    if (/^(did not qualify|failed to qualify|not qualified|dnq|dnpq)\b/.test(normalizedStatus)) return 'DNQ';
    if (/^(withdrew|withdrawn|wdr|wd)\b/.test(normalizedStatus)) return 'WDR';
    if (/^(did not start|not started|dns)\b/.test(normalizedStatus)) return 'DNS';
    return 'DNF';
}

interface CareerTeammateH2HColumnProps {
    mode: 'qualifying' | 'race';
    driverName: string;
    entries: CareerSeasonTeammateH2H[];
    loading: boolean;
    expandedId: string | null;
    onToggleExpand: (id: string) => void;
}

function CareerTeammateH2HColumn({
    mode,
    driverName,
    entries,
    loading,
    expandedId,
    onToggleExpand,
}: CareerTeammateH2HColumnProps) {
    const isQuali = mode === 'qualifying';
    const totalWinsDriver = entries.reduce(
        (acc, item) => acc + (isQuali ? item.qualiWinsDriver : item.raceWinsDriver),
        0,
    );
    const totalWinsTeammate = entries.reduce(
        (acc, item) => acc + (isQuali ? item.qualiWinsTeammate : item.raceWinsTeammate),
        0,
    );

    return (
        <div
            data-testid={`career-h2h-column-${mode}`}
            className="border border-[var(--border-color)] bg-[var(--bg-panel)] overflow-hidden"
        >
            {/* Top accent line */}
            <div
                className="h-0.5 w-full"
                style={{ backgroundColor: isQuali ? 'var(--accent-yellow)' : 'var(--accent-red)' }}
            />

            {/* Column Header */}
            <div className="flex items-center justify-between gap-2 border-b border-[var(--border-color)] bg-[var(--bg-darker)] px-4 py-3">
                <div className="flex items-center gap-2">
                    {isQuali ? (
                        <Timer size={15} className="text-[var(--accent-yellow)]" />
                    ) : (
                        <Flag size={15} className="text-[var(--accent-red)]" />
                    )}
                    <span className="font-display text-base md:text-lg uppercase tracking-wider text-white">
                        {isQuali ? 'QUALIFYING H2H' : 'RACE H2H'}
                    </span>
                </div>
                {entries.length > 0 && (
                    <span className="font-oxanium text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                        CAREER:{' '}
                        <span className="font-bold text-white tabular-nums">
                            {totalWinsDriver} – {totalWinsTeammate}
                        </span>
                    </span>
                )}
            </div>

            {loading ? (
                <div className="flex items-center justify-center gap-2 p-8 text-[var(--text-muted)]">
                    <Loader2 size={16} className="animate-spin text-[var(--accent-red)]" />
                    <span className="font-oxanium text-xs uppercase tracking-wider">
                        Loading career {isQuali ? 'qualifying' : 'race'} H2H...
                    </span>
                </div>
            ) : entries.length === 0 ? (
                <div className="p-6 text-center font-oxanium text-xs uppercase tracking-wider text-[var(--text-muted)]">
                    No {isQuali ? 'qualifying' : 'race'} head-to-head records found.
                </div>
            ) : (
                <div className="divide-y divide-[var(--border-color)]">
                    {entries.map(entry => {
                        const winsDriver = isQuali ? entry.qualiWinsDriver : entry.raceWinsDriver;
                        const winsTeammate = isQuali ? entry.qualiWinsTeammate : entry.raceWinsTeammate;
                        const winPct = isQuali ? entry.qualiWinPctDriver : entry.raceWinPctDriver;
                        const rounds = isQuali ? entry.qualiRounds : entry.raceRounds;
                        const decidedTotal = winsDriver + winsTeammate;
                        const isWinner = winsDriver > winsTeammate;
                        const isLoser = winsTeammate > winsDriver;
                        const isTied = decidedTotal > 0 && winsDriver === winsTeammate;
                        const expanded = expandedId === entry.id;
                        const stintColor = getTeamColor(entry.constructorId);

                        const scoreColorClass = decidedTotal === 0
                            ? 'text-[var(--text-muted)]'
                            : isWinner
                                ? 'text-[#00FF88]'
                                : isLoser
                                    ? 'text-[var(--accent-red)]'
                                    : 'text-[var(--accent-yellow)]';

                        return (
                            <div key={`${mode}_${entry.id}`} className="bg-[var(--bg-panel)]">
                                <button
                                    type="button"
                                    aria-expanded={expanded}
                                    onClick={() => onToggleExpand(entry.id)}
                                    className="w-full px-4 py-3.5 text-left transition-colors hover:bg-[var(--bg-panel-hover)] cursor-pointer"
                                >
                                    {/* Top Row: Year · Teammate + Score */}
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span
                                                className="h-3.5 w-1 shrink-0"
                                                style={{ backgroundColor: stintColor }}
                                            />
                                            <span className="font-oxanium text-sm font-bold text-white tabular-nums">
                                                {entry.season}
                                            </span>
                                            <span className="text-[var(--text-muted)]">·</span>
                                            <span className="truncate font-display text-sm md:text-base uppercase text-white tracking-wide">
                                                {entry.teammateName}
                                            </span>
                                            <span className="hidden sm:inline font-oxanium text-[9px] uppercase tracking-wider text-[var(--text-muted)]">
                                                {entry.constructorName}
                                            </span>
                                        </div>

                                        <div className="flex items-center gap-2.5 shrink-0">
                                            <span className={`font-oxanium text-sm md:text-base font-bold tabular-nums ${scoreColorClass}`}>
                                                {winsDriver} – {winsTeammate}
                                            </span>
                                            <ChevronDown
                                                size={14}
                                                className={`text-[var(--text-muted)] transition-transform duration-200 ${
                                                    expanded ? 'rotate-180 text-[var(--accent-yellow)]' : ''
                                                }`}
                                            />
                                        </div>
                                    </div>

                                    {/* Middle Progress Bar */}
                                    <div className="mt-2.5 flex h-2 w-full overflow-hidden bg-[var(--bg-darker)] border border-white/5">
                                        {decidedTotal === 0 ? (
                                            <div className="h-full w-full bg-white/10" />
                                        ) : isTied ? (
                                            <div className="h-full w-full bg-[var(--accent-yellow)]" />
                                        ) : (
                                            <>
                                                <div
                                                    className="h-full transition-all duration-300"
                                                    style={{
                                                        width: `${winPct}%`,
                                                        backgroundColor: isWinner ? '#00FF88' : 'rgba(0, 255, 136, 0.35)',
                                                    }}
                                                />
                                                <div
                                                    className="h-full transition-all duration-300"
                                                    style={{
                                                        width: `${Math.max(0, 100 - winPct)}%`,
                                                        backgroundColor: isLoser ? 'var(--accent-red)' : 'rgba(225, 6, 0, 0.35)',
                                                    }}
                                                />
                                            </>
                                        )}
                                    </div>

                                    {/* Bottom Stats Row: X ahead | % | Y ahead */}
                                    <div className="mt-1.5 flex items-center justify-between font-oxanium text-[10px]">
                                        <span className="text-[var(--text-muted)] tabular-nums">
                                            {winsDriver} ahead
                                        </span>
                                        <span className="font-bold text-white tabular-nums">
                                            {decidedTotal > 0 ? `${winPct.toFixed(2)}%` : '0.00%'}
                                        </span>
                                        <span className="text-[var(--text-muted)] tabular-nums">
                                            {winsTeammate} ahead
                                        </span>
                                    </div>
                                </button>

                                {/* Expanded Vertical Race-by-Race Table */}
                                {expanded && (
                                    <div className="border-t border-[var(--border-color)] bg-[var(--bg-darker)]">
                                        <div className="grid grid-cols-[minmax(0,1.4fr)_1fr_1fr] items-center border-b border-[var(--border-color)] px-3 md:px-4 py-2 font-oxanium text-[9px] uppercase tracking-wider text-[var(--text-muted)]">
                                            <span>RACE</span>
                                            <span className="text-center truncate px-1">{driverName}</span>
                                            <span className="text-center truncate px-1">{entry.teammateName}</span>
                                        </div>

                                        <div className="divide-y divide-white/[0.04]">
                                            {rounds.map(roundItem => {
                                                const rowStyle = roundItem.winner === 'driver'
                                                    ? 'bg-[#00FF88]/[0.07] border-l-2 border-l-[#00FF88]'
                                                    : roundItem.winner === 'teammate'
                                                        ? 'bg-[var(--accent-red)]/[0.09] border-l-2 border-l-[var(--accent-red)]'
                                                        : 'bg-[var(--accent-yellow)]/[0.05] border-l-2 border-l-[var(--accent-yellow)]/50';

                                                const driverCellColor = roundItem.winner === 'driver'
                                                    ? 'font-bold text-[#00FF88]'
                                                    : roundItem.winner === 'teammate'
                                                        ? 'text-[var(--accent-red)]/80'
                                                        : 'text-[var(--text-secondary)]';

                                                const teammateCellColor = roundItem.winner === 'teammate'
                                                    ? 'font-bold text-white'
                                                    : 'text-[var(--text-secondary)]';

                                                return (
                                                    <div
                                                        key={roundItem.round}
                                                        className={`grid grid-cols-[minmax(0,1.4fr)_1fr_1fr] items-center px-3 md:px-4 py-2 transition-colors ${rowStyle}`}
                                                    >
                                                        <div className="flex items-center gap-2 min-w-0 pr-2">
                                                            {roundItem.countryCode !== 'XX' && (
                                                                <CountryFlag country={roundItem.countryCode} size="sm" />
                                                            )}
                                                            <span className="truncate font-ui text-xs text-white">
                                                                {formatShortRaceName(roundItem.raceName)} GP
                                                            </span>
                                                        </div>

                                                        <div
                                                            className={`text-center font-oxanium text-xs tabular-nums ${driverCellColor}`}
                                                            title={roundItem.driverStatus}
                                                        >
                                                            {h2hRaceResultLabel(roundItem.driverPosition, roundItem.driverStatus)}
                                                        </div>

                                                        <div
                                                            className={`text-center font-oxanium text-xs tabular-nums ${teammateCellColor}`}
                                                            title={roundItem.teammateStatus}
                                                        >
                                                            {h2hRaceResultLabel(roundItem.teammatePosition, roundItem.teammateStatus)}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

/** Multi-season expandable career teammate Qualifying & Race H2H comparison columns. */
export function DriverCareerH2HSection({
    driverName,
    entries,
    loading,
    progress,
    expandedQualiId,
    expandedRaceId,
    onToggleQuali,
    onToggleRace,
}: DriverCareerH2HSectionProps) {
    return (
        <div className="pt-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-color)] pb-2">
                <div className="flex items-center gap-3">
                    <Swords size={16} className="text-[var(--accent-yellow)]" />
                    <h4 className="font-display text-lg md:text-xl text-white uppercase tracking-wider">
                        CAREER TEAMMATE H2H • ALL SEASONS
                    </h4>
                </div>
                <div className="flex items-center gap-2">
                    {loading && (
                        <span className="inline-flex items-center gap-1.5 font-oxanium text-[10px] uppercase tracking-wider text-[var(--accent-yellow)]">
                            <Loader2 size={11} className="animate-spin" />
                            {progress && progress.total > 0
                                ? `LOADING CAREER SEASONS (${progress.loaded}/${progress.total})...`
                                : 'LOADING CAREER SEASONS...'}
                        </span>
                    )}
                    <span className="font-oxanium text-[10px] uppercase tracking-widest text-[var(--text-muted)]">
                        CLICK ANY SEASON TO EXPAND RACE-BY-RACE
                    </span>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                <CareerTeammateH2HColumn
                    mode="qualifying"
                    driverName={driverName}
                    entries={entries}
                    loading={loading && entries.length === 0}
                    expandedId={expandedQualiId}
                    onToggleExpand={onToggleQuali}
                />
                <CareerTeammateH2HColumn
                    mode="race"
                    driverName={driverName}
                    entries={entries}
                    loading={loading && entries.length === 0}
                    expandedId={expandedRaceId}
                    onToggleExpand={onToggleRace}
                />
            </div>
        </div>
    );
}

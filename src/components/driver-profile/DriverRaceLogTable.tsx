import { m } from 'framer-motion';
import { Table, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import { getTeamColor } from '../../types';
import {
    formatShortRaceName,
    type DriverRaceLogEntry,
    type RaceLogSortKey,
    type RaceLogSortState,
} from '../../utils/driverProfile';
import { getRatingColor } from '../../utils/ratingColor';
import { CountryFlag } from '../../utils/countryFlags';

export interface DriverRaceLogTableProps {
    season: string;
    raceLog: DriverRaceLogEntry[];
    sortedRaceLog: DriverRaceLogEntry[];
    raceLogSort: RaceLogSortState | null;
    onToggleSort: (key: RaceLogSortKey) => void;
    onSelectRace?: (round: string, raceName: string, date: string) => void;
}

/** Season race-by-race telemetry and ratings table for a driver profile. */
export function DriverRaceLogTable({
    season,
    raceLog,
    sortedRaceLog,
    raceLogSort,
    onToggleSort,
    onSelectRace,
}: DriverRaceLogTableProps) {
    return (
        <m.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="space-y-4"
        >
            <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-2">
                <div className="flex items-center gap-3">
                    <Table size={18} className="text-[var(--accent-red)]" />
                    <h3 className="font-display text-2xl text-white uppercase tracking-wider">
                        {season} RACE-BY-RACE TELEMETRY
                    </h3>
                </div>
                <span className="font-oxanium text-[10px] uppercase tracking-widest text-[var(--text-muted)]">
                    {raceLog.length} RACES
                </span>
            </div>

            {raceLog.length === 0 ? (
                <div className="border border-[var(--border-color)] bg-[var(--bg-panel)] p-8 text-center">
                    <p className="font-oxanium text-sm uppercase tracking-wider text-[var(--text-muted)]">
                        No race telemetry recorded for this season yet.
                    </p>
                </div>
            ) : (
                <div className="border border-[var(--border-color)] bg-[var(--bg-panel)] overflow-hidden">
                    <div className="overflow-x-auto">
                        <table aria-label="Driver season race log" className="w-full min-w-max">
                            <thead>
                                <tr className="border-b border-[var(--border-color)] bg-[var(--bg-darker)] font-oxanium text-[10px] uppercase text-[var(--text-muted)]">
                                    <th className="px-3 py-2.5 text-left">RND</th>
                                    <th className="px-3 py-2.5 text-left">GRAND PRIX</th>
                                    <th className="px-3 py-2.5 text-left">TEAM</th>
                                    <th className="px-3 py-2.5 text-center">GRD</th>
                                    <th className="px-3 py-2.5 text-center">FIN</th>
                                    <th className="px-3 py-2.5 text-center">PTS</th>
                                    <th
                                        aria-sort={
                                            raceLogSort?.key === 'myRating'
                                                ? (raceLogSort.direction === 'desc' ? 'descending' : 'ascending')
                                                : 'none'
                                        }
                                        className="px-3 py-2.5 text-center"
                                    >
                                        <button
                                            type="button"
                                            onClick={() => onToggleSort('myRating')}
                                            className={`inline-flex items-center justify-center gap-1 cursor-pointer select-none uppercase transition-colors hover:text-white ${
                                                raceLogSort?.key === 'myRating' ? 'text-[var(--accent-yellow)] font-bold' : 'text-[var(--text-muted)]'
                                            }`}
                                            title="Click to sort by My Rating (High → Low → Default)"
                                        >
                                            <span>MY RATING</span>
                                            {raceLogSort?.key === 'myRating' ? (
                                                raceLogSort.direction === 'desc' ? (
                                                    <ArrowDown size={11} />
                                                ) : (
                                                    <ArrowUp size={11} />
                                                )
                                            ) : (
                                                <ArrowUpDown size={11} className="opacity-50" />
                                            )}
                                        </button>
                                    </th>
                                    <th
                                        aria-sort={
                                            raceLogSort?.key === 'communityRating'
                                                ? (raceLogSort.direction === 'desc' ? 'descending' : 'ascending')
                                                : 'none'
                                        }
                                        className="px-3 py-2.5 text-center"
                                    >
                                        <button
                                            type="button"
                                            onClick={() => onToggleSort('communityRating')}
                                            className={`inline-flex items-center justify-center gap-1 cursor-pointer select-none uppercase transition-colors hover:text-white ${
                                                raceLogSort?.key === 'communityRating' ? 'text-[var(--accent-yellow)] font-bold' : 'text-[var(--text-muted)]'
                                            }`}
                                            title="Click to sort by Community Avg (High → Low → Default)"
                                        >
                                            <span>COMMUNITY AVG</span>
                                            {raceLogSort?.key === 'communityRating' ? (
                                                raceLogSort.direction === 'desc' ? (
                                                    <ArrowDown size={11} />
                                                ) : (
                                                    <ArrowUp size={11} />
                                                )
                                            ) : (
                                                <ArrowUpDown size={11} className="opacity-50" />
                                            )}
                                        </button>
                                    </th>
                                    <th className="px-3 py-2.5 text-center">DIFF</th>
                                    {onSelectRace && <th className="px-3 py-2.5 text-right">ACTION</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {sortedRaceLog.map(entry => {
                                    const entryColor = getTeamColor(entry.constructorId);
                                    return (
                                        <tr
                                            key={entry.round}
                                            className="border-b border-[var(--border-color)] hover:bg-[var(--bg-panel-hover)] transition-colors"
                                        >
                                            <td className="px-3 py-2.5 font-oxanium text-xs text-[var(--text-muted)]">
                                                R{entry.round}
                                            </td>
                                            <td className="px-3 py-2.5">
                                                <div className="flex items-center gap-2">
                                                    {entry.countryCode !== 'XX' && (
                                                        <CountryFlag country={entry.countryCode} size="sm" />
                                                    )}
                                                    <span className="font-display text-xs md:text-sm uppercase text-white">
                                                        {formatShortRaceName(entry.raceName)}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-3 py-2.5">
                                                <div className="flex items-center gap-2">
                                                    <span className="h-3 w-1" style={{ backgroundColor: entryColor }} />
                                                    <span className="font-oxanium text-xs uppercase text-[var(--text-secondary)]">
                                                        {entry.constructorName}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-3 py-2.5 text-center font-oxanium text-xs text-[var(--text-secondary)]">
                                                {entry.gridPosition !== null ? `P${entry.gridPosition}` : '—'}
                                            </td>
                                            <td className="px-3 py-2.5 text-center font-oxanium text-xs font-bold">
                                                {entry.finishPosition !== null ? (
                                                    <span className={
                                                        entry.finishPosition === 1
                                                            ? 'text-[var(--accent-yellow)]'
                                                            : entry.finishPosition <= 3
                                                                ? 'text-[#00FF88]'
                                                                : 'text-white'
                                                    }>
                                                        P{entry.finishPosition}
                                                    </span>
                                                ) : (
                                                    <span className="text-[var(--accent-red)]">{entry.status}</span>
                                                )}
                                            </td>
                                            <td className="px-3 py-2.5 text-center font-oxanium text-xs text-[var(--accent-yellow)] font-bold">
                                                {entry.points > 0 ? entry.points : '0'}
                                            </td>
                                            <td className="px-3 py-2.5 text-center font-oxanium text-sm font-bold tabular-nums">
                                                {entry.myRating !== null ? (
                                                    <span style={{ color: getRatingColor(entry.myRating) }}>
                                                        {entry.myRating.toFixed(1)}
                                                    </span>
                                                ) : (
                                                    <span className="text-[var(--text-muted)]">—</span>
                                                )}
                                            </td>
                                            <td className="px-3 py-2.5 text-center font-oxanium text-sm font-bold tabular-nums">
                                                {entry.communityRating !== null ? (
                                                    <span
                                                        style={{ color: getRatingColor(entry.communityRating) }}
                                                        title={`${entry.communityVotes} community votes`}
                                                    >
                                                        {entry.communityRating.toFixed(2)}
                                                    </span>
                                                ) : (
                                                    <span className="text-[var(--text-muted)]">—</span>
                                                )}
                                            </td>
                                            <td className="px-3 py-2.5 text-center font-oxanium text-xs tabular-nums">
                                                {entry.ratingDelta !== null ? (
                                                    <span className={
                                                        entry.ratingDelta > 0
                                                            ? 'text-[#00FF88]'
                                                            : entry.ratingDelta < 0
                                                                ? 'text-[var(--accent-red)]'
                                                                : 'text-[var(--text-muted)]'
                                                    }>
                                                        {entry.ratingDelta > 0 ? '+' : ''}{entry.ratingDelta.toFixed(2)}
                                                    </span>
                                                ) : (
                                                    <span className="text-[var(--text-muted)]">—</span>
                                                )}
                                            </td>
                                            {onSelectRace && (
                                                <td className="px-3 py-2.5 text-right">
                                                    <button
                                                        type="button"
                                                        onClick={() => onSelectRace(entry.round, entry.raceName, entry.date)}
                                                        className="border border-[var(--border-color)] bg-[var(--bg-darker)] px-2.5 py-1 font-oxanium text-[9px] font-bold uppercase tracking-wider text-white transition-colors hover:border-[var(--accent-red)]"
                                                    >
                                                        {entry.myRating !== null ? 'EDIT' : 'RATE'}
                                                    </button>
                                                </td>
                                            )}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </m.div>
    );
}

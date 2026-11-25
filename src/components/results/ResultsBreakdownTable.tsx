import type { RefObject } from 'react';
import { m } from 'framer-motion';
import { Table, Download } from 'lucide-react';
import { Tooltip as ShadcnTooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { getTeamColor } from '../../types';
import type { DriverRow, RaceColumn } from '../../utils/storage';
import type { CommunityStatus } from '../../utils/communityRatings';
import { CountryFlag } from '../../utils/countryFlags';
import { getDriverLabel, type BreakdownSource } from '../../utils/raceBreakdown';
import { getRatingColor } from '../../utils/ratingColor';
import { DriverProfileLink } from '../DriverProfileLink';

export interface ResultsBreakdownTableProps {
    season: string;
    tableRef: RefObject<HTMLDivElement | null>;
    breakdownRaces: RaceColumn[];
    breakdownDrivers: (DriverRow & { voteCounts?: Record<string, number> })[];
    breakdownSource: BreakdownSource;
    onChangeBreakdownSource: (source: BreakdownSource) => void;
    generatingTable: boolean;
    canDownloadBreakdown: boolean;
    onDownloadTable: () => void;
    showCommunityBreakdownStatus: boolean;
    communityStatus: CommunityStatus;
    onSelectDriver?: (driverId: string) => void;
}

/** Race-by-race personal and community ratings breakdown matrix with PNG export. */
export function ResultsBreakdownTable({
    season,
    tableRef,
    breakdownRaces,
    breakdownDrivers,
    breakdownSource,
    onChangeBreakdownSource,
    generatingTable,
    canDownloadBreakdown,
    onDownloadTable,
    showCommunityBreakdownStatus,
    communityStatus,
    onSelectDriver,
}: ResultsBreakdownTableProps) {
    return (
        <m.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="mt-12"
        >
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-color)] pb-2">
                <div className="flex items-center gap-3">
                    <Table size={16} className="text-[var(--accent-red)]" />
                    <h3 className="font-display text-2xl text-white uppercase tracking-wider">RACE-BY-RACE BREAKDOWN</h3>
                </div>
                <div className="flex items-center gap-4">
                    <span className="font-oxanium text-[10px] text-[var(--text-muted)] uppercase tracking-widest">
                        {breakdownRaces.length} RACES • {breakdownDrivers.length} DRIVERS
                    </span>
                    <ShadcnTooltip>
                        <TooltipTrigger asChild>
                            <button
                                aria-label="Download the race-by-race breakdown table as a PNG image"
                                onClick={onDownloadTable}
                                disabled={generatingTable || !canDownloadBreakdown}
                                className="group flex items-center gap-2 px-4 py-1.5 bg-[var(--bg-panel)] border border-[var(--border-color)] hover:border-white transition-all hover:bg-[var(--bg-panel-hover)] disabled:opacity-50"
                            >
                                {generatingTable ? (
                                    <div className="w-3 h-3 border-2 border-[var(--accent-red)] border-t-transparent rounded-full animate-spin" />
                                ) : (
                                    <Download size={12} className="text-[var(--text-muted)] group-hover:text-white" />
                                )}
                                <span className="font-ui font-bold text-[10px] text-white uppercase tracking-wider">
                                    {generatingTable ? 'GENERATING...' : 'DOWNLOAD PNG'}
                                </span>
                            </button>
                        </TooltipTrigger>
                        <TooltipContent
                            side="bottom"
                            sideOffset={8}
                            className="bg-[var(--bg-darker)] text-white border border-[var(--border-color)]"
                        >
                            Download the full race-by-race breakdown table as a PNG image
                        </TooltipContent>
                    </ShadcnTooltip>
                </div>
            </div>

            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div role="group" aria-label="Race breakdown rating source" className="inline-flex border border-[var(--border-color)] bg-[var(--bg-darker)] p-1">
                    <button
                        type="button"
                        aria-pressed={breakdownSource === 'personal'}
                        disabled={generatingTable}
                        onClick={() => onChangeBreakdownSource('personal')}
                        className={`px-3 py-2 font-ui text-[10px] font-bold uppercase tracking-wider transition-colors disabled:opacity-50 ${breakdownSource === 'personal'
                            ? 'bg-[var(--accent-red)] text-white'
                            : 'text-[var(--text-secondary)] hover:text-white'}`}
                    >
                        MY RATINGS
                    </button>
                    <button
                        type="button"
                        aria-pressed={breakdownSource === 'community'}
                        disabled={generatingTable}
                        onClick={() => onChangeBreakdownSource('community')}
                        className={`px-3 py-2 font-ui text-[10px] font-bold uppercase tracking-wider transition-colors disabled:opacity-50 ${breakdownSource === 'community'
                            ? 'bg-[var(--accent-yellow)] text-black'
                            : 'text-[var(--text-secondary)] hover:text-white'}`}
                    >
                        COMMUNITY AVG
                    </button>
                </div>
                <span className="font-oxanium text-[9px] uppercase tracking-wider text-[var(--text-muted)]">
                    {breakdownSource === 'community' ? 'Community vote average per race · AVG of races shown' : 'Your saved race ratings'}
                </span>
            </div>

            <div ref={tableRef} className="bg-[var(--bg-panel)] border border-[var(--border-color)] overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-color)] bg-[var(--bg-darker)] px-3 py-2 font-oxanium text-[9px] uppercase tracking-wider text-[var(--text-muted)]">
                    <span>{breakdownSource === 'community' ? 'COMMUNITY RACE AVERAGES' : 'MY RACE RATINGS'}</span>
                    <span>{season} SEASON</span>
                </div>
                {showCommunityBreakdownStatus && (
                    <div className="flex min-h-48 flex-col items-center justify-center gap-2 px-4 py-8 text-center" role="status">
                        <p className="font-display text-lg uppercase text-white">
                            {communityStatus === 'loading' ? 'LOADING COMMUNITY RATINGS'
                                : communityStatus === 'ready' ? 'NO COMMUNITY RATINGS YET'
                                    : 'COMMUNITY RATINGS UNAVAILABLE'}
                        </p>
                        <p className="font-ui text-sm text-[var(--text-secondary)]">
                            {communityStatus === 'ready'
                                ? 'No community race averages are available for this season.'
                                : communityStatus === 'loading'
                                    ? 'Fetching the community averages for this season.'
                                    : 'Community data could not be loaded right now.'}
                        </p>
                    </div>
                )}
                <div className={`overflow-x-auto h-scroll-table ${showCommunityBreakdownStatus ? 'hidden' : ''}`}>
                    <table aria-label="Race-by-race breakdown" className="w-full min-w-max">
                        {/* Header */}
                        <thead>
                            <tr className="border-b border-[var(--border-color)]">
                                <th className="sticky left-0 z-10 bg-[var(--bg-darker)] px-3 py-2 text-left w-12">
                                    <span className="font-oxanium text-[10px] text-[var(--text-muted)] uppercase">#</span>
                                </th>
                                <th className="sticky left-12 z-10 bg-[var(--bg-darker)] px-3 py-2 text-left min-w-[140px]">
                                    <span className="font-oxanium text-[10px] text-[var(--text-muted)] uppercase">DRIVER</span>
                                </th>
                                <th className="sticky left-[188px] z-10 bg-[var(--bg-darker)] px-3 py-2 text-center w-16 border-r border-[var(--border-color)]" title="Average of the scores shown in this row; each race counts equally">
                                    <span className="font-oxanium text-[10px] text-[var(--accent-yellow)] uppercase">AVG</span>
                                </th>
                                {breakdownRaces.map(race => (
                                    <th key={race.round} className="bg-[var(--bg-darker)] px-2 py-2 text-center min-w-[48px]" title={race.raceName}>
                                        <div className="flex flex-col items-center gap-1">
                                            {race.countryCode === 'XX'
                                                ? <span className="font-oxanium text-[10px] text-[var(--text-muted)]">R{race.round}</span>
                                                : <CountryFlag country={race.countryCode} size="sm" />}
                                        </div>
                                    </th>
                                ))}
                            </tr>
                        </thead>

                        {/* Body */}
                        <tbody>
                            {breakdownDrivers.map((driver, index) => (
                                <tr
                                    key={driver.driverId}
                                    className="border-b border-[var(--border-color)] hover:bg-[var(--bg-panel-hover)] transition-colors"
                                >
                                    {/* Position */}
                                    <td className="sticky left-0 z-10 bg-[var(--bg-panel)] px-3 py-2 text-center">
                                        <span className="font-oxanium text-sm text-[var(--text-muted)]">{index + 1}</span>
                                    </td>

                                    {/* Driver Name */}
                                    <td className="sticky left-12 z-10 bg-[var(--bg-panel)] px-3 py-2">
                                        {onSelectDriver ? (
                                            <DriverProfileLink
                                                season={season}
                                                driverId={driver.driverId}
                                                onNavigate={() => onSelectDriver(driver.driverId)}
                                                title={`View ${driver.driverName} profile`}
                                                className="group/drv flex items-center gap-2 text-left cursor-pointer"
                                            >
                                                <div className="w-1 h-6" style={{ backgroundColor: getTeamColor(driver.constructorId) }} />
                                                <div>
                                                    <div className="font-display text-sm text-white group-hover/drv:text-[var(--accent-yellow)] transition-colors uppercase leading-none">
                                                        {getDriverLabel(driver.driverName)}
                                                    </div>
                                                    <div className="font-oxanium text-[8px] text-[var(--text-muted)] uppercase">
                                                        {driver.constructorName}
                                                    </div>
                                                </div>
                                            </DriverProfileLink>
                                        ) : (
                                            <div className="flex items-center gap-2">
                                                <div className="w-1 h-6" style={{ backgroundColor: getTeamColor(driver.constructorId) }} />
                                                <div>
                                                    <div className="font-display text-sm text-white uppercase leading-none">
                                                        {getDriverLabel(driver.driverName)}
                                                    </div>
                                                    <div className="font-oxanium text-[8px] text-[var(--text-muted)] uppercase">
                                                        {driver.constructorName}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </td>

                                    {/* Average */}
                                    <td className="sticky left-[188px] z-10 px-3 py-2 text-center bg-[var(--bg-darker)] border-r border-[var(--border-color)]">
                                        <span className="font-oxanium text-sm font-bold text-[var(--accent-yellow)]">
                                            {Object.keys(driver.raceRatings).length === 0 ? '—'
                                                : breakdownSource === 'community' ? driver.totalAverage.toFixed(2) : driver.totalAverage.toFixed(1)}
                                        </span>
                                    </td>

                                    {/* Race Ratings */}
                                    {breakdownRaces.map(race => {
                                        const rating = driver.raceRatings[race.round];
                                        const hasRating = rating !== undefined && rating > 0;

                                        const voteCount = driver.voteCounts?.[race.round];

                                        return (
                                            <td key={race.round} className="px-2 py-2 text-center">
                                                <span
                                                    className="font-oxanium text-sm font-medium"
                                                    style={{ color: hasRating ? getRatingColor(rating) : 'var(--text-muted)' }}
                                                    title={voteCount ? `${voteCount} community ${voteCount === 1 ? 'vote' : 'votes'}` : undefined}
                                                >
                                                    {hasRating ? (breakdownSource === 'community' ? rating.toFixed(2)
                                                        : rating % 1 === 0 ? rating : rating.toFixed(1)) : '-'}
                                                </span>
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </m.div>
    );
}

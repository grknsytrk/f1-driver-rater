import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { TEAM_COLORS } from '../types';
import type { AverageRating } from '../types';
import { useCommunityRatingDistribution } from '../hooks/useCommunityRatings';
import type { CommunityComparison, CommunityStatus } from '../utils/communityRatings';
import { getRatingColor } from '../utils/ratingColor';
import { CommunityRatingDistribution } from './CommunityRatingDistribution';

export interface CommunityDriverRatingRow {
    driver: AverageRating;
    comparison: CommunityComparison;
}

interface CommunityRatingRowsProps {
    rows: CommunityDriverRatingRow[];
    season: string;
    source: 'race' | 'quick';
    communityStatus: CommunityStatus;
    communityVisible: boolean;
}

function getTeamColor(constructorId: string): string {
    return TEAM_COLORS[constructorId] || '#888888';
}

export function CommunityRatingRows({ rows, season, source, communityStatus, communityVisible }: CommunityRatingRowsProps) {
    const [expandedDriverId, setExpandedDriverId] = useState<string | null>(null);
    const expandedRow = rows.find(row => row.driver.driverId === expandedDriverId);
    const distributionDriverId = expandedRow && expandedRow.comparison.voteCount >= 5 ? expandedDriverId : null;
    const distributionState = useCommunityRatingDistribution(source, season, distributionDriverId);

    return (
        <div className="max-h-[400px] overflow-y-auto md:max-h-[600px]">
            {rows.map(({ driver, comparison }, index) => {
                const expanded = expandedDriverId === driver.driverId;
                const panelId = `community-distribution-${driver.driverId}`;
                const gridColumns = communityVisible
                    ? 'grid-cols-[minmax(0,1fr)_60px_104px] md:grid-cols-[minmax(0,1fr)_72px_112px_40px]'
                    : 'grid-cols-[minmax(0,1fr)_60px] md:grid-cols-[minmax(0,1fr)_72px]';
                return (
                    <div key={driver.driverId} className="border-b border-[var(--border-color)]">
                        <button
                            type="button"
                            data-testid={`community-rating-row-${driver.driverId}`}
                            aria-label={`${expanded ? 'Hide' : 'Show'} community distribution for ${driver.driverName}`}
                            aria-expanded={expanded}
                            aria-controls={expanded ? panelId : undefined}
                            disabled={!communityVisible}
                            onClick={() => setExpandedDriverId(current => current === driver.driverId ? null : driver.driverId)}
                            className={`grid w-full items-center gap-2 p-2 text-left transition-colors md:p-3 ${gridColumns} ${communityVisible ? 'cursor-pointer hover:bg-white/[0.03]' : 'cursor-default'}`}
                        >
                            <span className="flex min-w-0 items-center gap-2">
                                <span className="w-4 shrink-0 font-oxanium text-[10px] text-[var(--text-muted)]">{index + 1}</span>
                                <span className="flex min-w-0 flex-1 items-center justify-between gap-1 border-l-2 pl-2" style={{ borderColor: getTeamColor(driver.constructorId) }}>
                                    <span className="min-w-0">
                                        <span className="block break-words font-display-condensed text-sm uppercase leading-tight text-white md:text-lg" title={driver.driverName}>
                                            {driver.driverName}
                                        </span>
                                        <span className="block truncate font-ui text-[8px] uppercase text-[var(--text-muted)]">{driver.constructorName}</span>
                                    </span>
                                    {communityVisible && (
                                        <ChevronDown
                                            size={13}
                                            aria-hidden="true"
                                            className={`shrink-0 text-[var(--text-muted)] transition-transform ${expanded ? 'rotate-180 text-[var(--accent-yellow)]' : ''}`}
                                        />
                                    )}
                                </span>
                            </span>
                            <span className="flex min-h-[54px] w-full min-w-0 flex-col items-start justify-center text-left font-oxanium">
                                <span className="whitespace-nowrap text-sm font-normal leading-none tabular-nums md:text-lg" style={{ color: getRatingColor(communityVisible ? comparison.myAverage : driver.averageRating) }}>
                                    {(communityVisible ? comparison.myAverage : driver.averageRating).toFixed(2)}
                                </span>
                                {communityVisible && <span className="mt-1 h-[9px]" aria-hidden="true" />}
                            </span>
                            {communityVisible && <>
                                <span className="flex min-h-[54px] w-full min-w-0 flex-col items-center justify-center text-center font-oxanium">
                                    {comparison.communityAverage !== null ? (
                                        <span className="whitespace-nowrap text-sm font-normal leading-none tabular-nums md:text-lg" style={{ color: getRatingColor(comparison.communityAverage) }}>
                                            {comparison.communityAverage.toFixed(2)}
                                        </span>
                                    ) : (
                                        <span className="whitespace-nowrap text-[8px] leading-tight text-[var(--text-muted)]">NO COMMUNITY DATA</span>
                                    )}
                                    <span className="mt-1 h-[9px] text-[8px] leading-tight text-[var(--text-muted)]">
                                        {source === 'race' && comparison.raceCount > 0 && <span className="block">{comparison.raceCount} RACES</span>}
                                        {comparison.voteCount > 0 && <span className="block md:hidden">{comparison.voteCount} VOTES</span>}
                                    </span>
                                </span>
                                <span className="hidden w-full translate-x-1 items-center justify-center whitespace-nowrap text-center font-oxanium text-[10px] tabular-nums text-[var(--text-muted)] md:flex">
                                    {comparison.voteCount || '—'}
                                </span>
                            </>}
                        </button>
                        {expanded && (
                            <div id={panelId} role="region" aria-label={`${driver.driverName} community distribution details`} className="border-t border-[var(--border-color)] bg-[var(--bg-darker)] px-3 py-3 md:px-5">
                                <CommunityRatingDistribution
                                    driverName={driver.driverName}
                                    communityStatus={communityStatus}
                                    distributionStatus={distributionState.status}
                                    distribution={distributionState.distribution}
                                    voteCount={comparison.voteCount}
                                />
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

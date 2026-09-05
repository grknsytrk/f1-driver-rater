import { useCallback, useEffect, useState } from 'react';
import { Timer } from 'lucide-react';
import { TEAM_COLORS } from '../types';
import { getRaceRatingContext, type RaceRecap } from '../api/f1Api';
import { saveRaceDriverRating, getRaceRatings, markRaceRatingsCommunityEligible } from '../utils/storage';
import { fetchWithMinDelay } from '../utils/delay';
import { ModalShell } from './ModalShell';
import { RatingModalContentFallback } from './RouteFallbacks';
import type { RaceRouteSnapshot } from '../routes/modalRouteState';

import { useCommunityRatings, useRatingStorage } from '../hooks/useCommunityRatings';
import { initializeGuestSync } from '../utils/guestSync';
import { CommunityNotice, CommunityValue, PersonalRatingValue } from './CommunityRating';

const MIN_LOADING_TIME = 800;

interface RatingModalProps {
    race: RaceRouteSnapshot;
    season: string;
    metadataResolved?: boolean;
    onClose: () => void;
}

interface DriverWithRating {
    driverId: string;
    driverName: string;
    constructorId: string;
    constructorName: string;
    position: string;
    rating: number;
    gap?: string;
    laps?: string;
    status?: string;
    grid?: string;
}

const EMPTY_RECAP: RaceRecap = {
    winner: null,
    podium: [],
    pole: null,
    fastestLap: null,
    dnfCount: 0,
};

function getFinishNameClass(position: string): string {
    switch (position) {
        case '1':
            return 'text-[#F4C542]';
        case '2':
            return 'text-[#C6CCD5]';
        case '3':
            return 'text-[#C67A45]';
        default:
            return 'text-white';
    }
}

export function RatingModal({ race, season, metadataResolved = true, onClose }: RatingModalProps) {
    useRatingStorage();
    const community = useCommunityRatings('race', season, race.round);
    const savedRatings = getRaceRatings(season, race.round)?.ratings ?? [];
    const [drivers, setDrivers] = useState<DriverWithRating[]>([]);
    const [recap, setRecap] = useState<RaceRecap>(EMPTY_RECAP);
    const [loading, setLoading] = useState(true);
    const [hoveredRating, setHoveredRating] = useState<{ id: string, val: number } | null>(null);

    const loadDrivers = useCallback(async () => {
        setLoading(true);
        setDrivers([]);
        setRecap(EMPTY_RECAP);

        try {
            const raceContext = await fetchWithMinDelay(
                () => getRaceRatingContext(season, race.round),
                MIN_LOADING_TIME
            );
            const existingRatings = getRaceRatings(season, race.round);

            const driversWithRatings: DriverWithRating[] = raceContext.drivers.map((driver) => {
                const existing = existingRatings?.ratings.find((rating) => rating.driverId === driver.driver.driverId);
                return {
                    driverId: driver.driver.driverId,
                    driverName: `${driver.driver.givenName} ${driver.driver.familyName}`,
                    constructorId: driver.constructor.constructorId,
                    constructorName: driver.constructor.name,
                    position: driver.position,
                    rating: existing?.rating || 0,
                    gap: driver.gap,
                    laps: driver.laps,
                    status: driver.status,
                    grid: driver.grid,
                };
            });

            setDrivers(driversWithRatings);
            setRecap(raceContext.recap);
        } catch (error) {
            console.error('Error loading race context:', error);
        } finally {
            setLoading(false);
        }
    }, [race.round, season]);

    useEffect(() => {
        void loadDrivers();
    }, [loadDrivers]);

    function handleRatingChange(driverId: string, rating: number) {
        if (loading || !metadataResolved) return;
        const driver = drivers.find(driver => driver.driverId === driverId);
        if (!driver) return;
        saveRaceDriverRating(season, race.round, race.raceName, race.date, {
            driverId, driverName: driver.driverName,
            constructorId: driver.constructorId, constructorName: driver.constructorName,
            rating,
        });
    }

    function handleClose() {
        // Existing personal scores are opted into community in one explicit
        // action when leaving this race, instead of requiring every slider to
        // be selected again.
        markRaceRatingsCommunityEligible(season, race.round, race.raceName, race.date);
        void initializeGuestSync();
        onClose();
    }

    function getTeamColor(constructorId: string): string {
        return TEAM_COLORS[constructorId] || '#888888';
    }

    const formattedDate = race.date
        ? new Date(race.date).toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
        })
        : 'Loading calendar data';

    return (
        <ModalShell
            eyebrow={`Round ${race.round}`}
            eyebrowIcon={<div className="h-2 w-2 bg-[var(--accent-red)] animate-pulse" />}
            title={(race.raceName || `Race ${race.round}`).toUpperCase()}
            subtitle={formattedDate}
            onClose={handleClose}
            footer={(
                <div className="z-20 flex flex-col gap-2 border-t border-[var(--border-color)] bg-[var(--bg-panel)] p-4 md:flex-row md:items-center md:justify-between md:gap-0">
                    <span className="font-oxanium text-[10px] tracking-widest text-[var(--text-muted)] uppercase">
                        Auto-saved locally · cloud sync in background
                    </span>
                    <button
                        onClick={handleClose}
                        className="border border-[var(--border-color)] px-6 py-3 font-oxanium text-xs font-bold tracking-widest text-[var(--text-secondary)] uppercase transition-colors hover:border-[var(--accent-red)] hover:text-white md:py-2"
                    >
                        CLOSE
                    </button>
                </div>
            )}
        >
            {loading ? (
                <RatingModalContentFallback />
            ) : (
                <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 md:p-6 custom-scrollbar">
                    <CommunityNotice status={community.status} legacy={savedRatings.some(rating => !rating.communityEligible)} />
                    <div className="grid grid-cols-1 gap-px border border-[var(--border-color)] bg-[var(--border-color)]">
                        {drivers.map((driver) => {
                            const teamColor = getTeamColor(driver.constructorId);
                            const currentRating = savedRatings.find(rating => rating.driverId === driver.driverId)?.rating ?? 0;
                            const isHovered = hoveredRating?.id === driver.driverId;
                            const displayRating = isHovered ? hoveredRating.val : currentRating;
                            const isFastestLapDriver = recap.fastestLap?.driverId === driver.driverId;

                            return (
                                <div
                                    key={driver.driverId}
                                    className="group relative flex flex-col gap-2 overflow-hidden bg-[var(--bg-panel)] p-2 transition-colors hover:bg-[var(--bg-panel-hover)] md:gap-3 md:p-3"
                                >
                                    <div className="flex items-center gap-0">
                                        <div className="h-10 w-10 flex-shrink-0 border border-[var(--border-color)] bg-[var(--bg-darker)] text-[var(--text-secondary)] md:h-12 md:w-14">
                                            <div className="flex h-full flex-col items-center justify-center">
                                                <span className="mb-0.5 hidden font-oxanium text-[8px] leading-none md:block md:text-[10px]">POS</span>
                                                <span className="font-display text-base leading-none text-white md:text-xl">{driver.position}</span>
                                            </div>
                                        </div>

                                        <div className="hidden h-12 w-10 flex-shrink-0 flex-col items-center justify-center border-y border-r border-[var(--border-color)] bg-[var(--bg-darker)] text-[var(--text-muted)] md:flex">
                                            <span className="mb-0.5 font-oxanium text-[8px] leading-none">GRD</span>
                                            <span className="font-oxanium text-sm leading-none">{driver.grid || '-'}</span>
                                        </div>

                                        <div className="flex h-10 min-w-0 flex-1 items-center md:h-12">
                                            <div className="h-full w-1 flex-shrink-0" style={{ backgroundColor: teamColor }} />
                                            <div className="min-w-0 flex-1 pl-2 md:pl-3">
                                                <div className="flex min-w-0 items-center gap-2">
                                                    <h3 className={`truncate font-display text-sm leading-none uppercase md:text-lg ${getFinishNameClass(driver.position)}`}>
                                                        {driver.driverName}
                                                    </h3>
                                                    {isFastestLapDriver && (
                                                        <Timer size={15} className="shrink-0 text-[#FF00FF]" />
                                                    )}
                                                </div>
                                                <p className="mt-0.5 truncate font-oxanium text-[9px] uppercase tracking-wide text-[var(--text-muted)] md:mt-1 md:text-[10px]">
                                                    {driver.constructorName}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="ml-auto hidden h-12 min-w-[100px] flex-shrink-0 flex-col items-end justify-center pr-4 md:flex">
                                            <span className="mb-0.5 font-oxanium text-[8px] leading-none text-[var(--text-muted)]">
                                                {parseInt(driver.position, 10) === 1 ? 'TIME' : 'GAP'}
                                            </span>
                                            <span
                                                className={`font-oxanium text-sm leading-none ${
                                                    parseInt(driver.position, 10) === 1
                                                        ? 'text-[#00FF88]'
                                                        : driver.gap?.includes('Lap')
                                                            ? 'text-[var(--accent-orange)]'
                                                            : (driver.status !== 'Finished' && !driver.gap?.startsWith('+'))
                                                                ? 'text-[var(--accent-red)]'
                                                                : 'text-white'
                                                }`}
                                            >
                                                {driver.gap || driver.status || '-'}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="flex w-full items-center gap-2 overflow-hidden md:gap-3">
                                        <div className="w-12 flex-shrink-0 md:w-14">
                                            <PersonalRatingValue value={displayRating} />
                                        </div>
                                        <div className="min-w-0 flex-1 overflow-x-auto scrollbar-hide md:overflow-visible">
                                            <div className="flex w-max gap-[2px] py-1" onMouseLeave={() => setHoveredRating(null)}>
                                                {[...Array(20)].map((_, index) => {
                                                    const val = (index + 1) * 0.5;
                                                    const isFilled = val <= displayRating;

                                                    let segmentColor = 'rgba(255,255,255,0.08)';
                                                    if (isFilled) {
                                                        const t = index / 19;
                                                        if (t < 0.4) {
                                                            const localT = t / 0.4;
                                                            segmentColor = `rgb(225, ${Math.round(6 + localT * 101)}, 0)`;
                                                        } else if (t < 0.7) {
                                                            const localT = (t - 0.4) / 0.3;
                                                            const r = Math.round(225 + localT * 17);
                                                            const g = Math.round(107 + localT * 102);
                                                            const b = Math.round(localT * 61);
                                                            segmentColor = `rgb(${r}, ${g}, ${b})`;
                                                        } else {
                                                            const localT = (t - 0.7) / 0.3;
                                                            const r = Math.round(242 - localT * 242);
                                                            const g = Math.round(209 + localT * 46);
                                                            const b = Math.round(61 + localT * 75);
                                                            segmentColor = `rgb(${r}, ${g}, ${b})`;
                                                        }
                                                    }

                                                    return (
                                                        <button
                                                            key={index}
                                                            aria-label={`${driver.driverName}: ${val.toFixed(1)} out of 10`}
                                                            aria-pressed={currentRating === val}
                                                            onFocus={() => setHoveredRating({ id: driver.driverId, val })}
                                                            onBlur={() => setHoveredRating(null)}
                                                            onMouseEnter={() => setHoveredRating({ id: driver.driverId, val })}
                                                            onClick={() => handleRatingChange(driver.driverId, val)}
                                                            className="relative h-7 w-4 flex-shrink-0 cursor-pointer touch-manipulation focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2 md:h-10 md:w-5"
                                                        >
                                                            <div
                                                                className="h-full w-full rounded-sm"
                                                                style={{
                                                                    backgroundColor: segmentColor,
                                                                    transform: isFilled ? 'scaleY(1)' : 'scaleY(0.65)',
                                                                    opacity: isFilled ? 1 : 0.4,
                                                                }}
                                                            />
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                        <CommunityValue
                                            rating={community.ratings.find(rating => rating.driverId === driver.driverId)}
                                            status={community.status}
                                            label="COMMUNITY AVG"
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </ModalShell>
    );
}

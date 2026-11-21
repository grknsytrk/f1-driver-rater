import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Timer, Undo2 } from 'lucide-react';
import { getTeamColor } from '../types';
import { getRaceRatingContext, type RaceRecap } from '../api/f1Api';
import { saveRaceDriverRating, removeRaceDriverRating, getRaceRatings, markRaceRatingsCommunityEligible } from '../utils/storage';
import type { CommunityRating, CommunityStatus } from '../utils/communityRatings';
import { fetchWithMinDelay } from '../utils/delay';
import { ModalShell } from './ModalShell';
import { RatingModalContentFallback } from './RouteFallbacks';
import { RatingSegments } from './RatingSegments';
import { RatingShortcutBar } from './RatingShortcutBar';
import type { RaceRouteSnapshot } from '../routes/modalRouteState';

import { useCommunityRatings, useRatingStorage } from '../hooks/useCommunityRatings';
import { useRatingKeyboard } from '../hooks/useRatingKeyboard';
import { useSitePolicyConsent } from '../hooks/useSitePolicyConsent';
import { hasCurrentSitePolicyAcceptance } from '../utils/sitePolicy';
import { initializeGuestSync } from '../utils/guestSync';
import { CommunityNotice, CommunityValue, PersonalRatingValue } from './CommunityRating';
import { DriverProfileLink } from './DriverProfileLink';

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

interface RatingDriverRowProps {
    season: string;
    driver: DriverWithRating;
    currentRating: number;
    isFastestLapDriver: boolean;
    communityRating?: CommunityRating;
    communityStatus: CommunityStatus;
    isKeyboardActive: boolean;
    onRate: (driver: DriverWithRating, rating: number, options?: { fromScrub?: boolean }) => void;
}

const RatingDriverRow = memo(function RatingDriverRow({
    season,
    driver,
    currentRating,
    isFastestLapDriver,
    communityRating,
    communityStatus,
    isKeyboardActive,
    onRate,
}: RatingDriverRowProps) {
    const [hoveredVal, setHoveredVal] = useState<number | null>(null);
    const teamColor = getTeamColor(driver.constructorId);
    const displayRating = hoveredVal ?? currentRating;

    const handleSelect = useCallback((val: number, options?: { fromScrub?: boolean }) => {
        if (!options?.fromScrub && currentRating === val) {
            setHoveredVal(null);
        }
        onRate(driver, val, options);
    }, [currentRating, driver, onRate]);

    return (
        <div
            data-driver-id={driver.driverId}
            data-keyboard-active={isKeyboardActive ? 'true' : undefined}
            className={`group relative flex flex-col gap-2 overflow-hidden p-2 transition-colors md:gap-3 md:p-3 ${
                isKeyboardActive
                    ? 'bg-[var(--bg-panel-hover)] ring-1 ring-inset ring-[var(--accent-yellow)]'
                    : 'bg-[var(--bg-panel)] hover:bg-[var(--bg-panel-hover)]'
            }`}
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
                                <DriverProfileLink
                                    season={season}
                                    driverId={driver.driverId}
                                    title={`View ${driver.driverName} profile`}
                                    className="hover:text-[var(--accent-yellow)] transition-colors"
                                >
                                    {driver.driverName}
                                </DriverProfileLink>
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

                <div className="ml-auto hidden h-12 w-32 flex-shrink-0 flex-col items-end justify-center md:flex">
                    <span className="mb-1 w-full text-right font-oxanium text-[10px] leading-none tracking-wide text-[var(--text-muted)]">
                        {parseInt(driver.position, 10) === 1 ? 'TIME' : 'GAP'}
                    </span>
                    <span
                        className={`w-full whitespace-nowrap text-right font-oxanium text-sm leading-none tabular-nums ${
                            parseInt(driver.position, 10) === 1
                                ? 'text-[#00FF88]'
                                : driver.gap?.includes('Lap')
                                    ? 'text-[var(--accent-orange)]'
                                    : (driver.status !== 'Finished' && !driver.gap?.startsWith('+'))
                                        ? 'text-[var(--accent-red)]'
                                        : 'text-white'
                        }`}
                    >
                        {(driver.gap || driver.status || '-').trim()}
                    </span>
                </div>
            </div>

            <div className="flex w-full items-center gap-3 overflow-hidden md:gap-4">
                <div className="w-16 flex-shrink-0 md:w-20">
                    <PersonalRatingValue value={displayRating} />
                </div>
                <RatingSegments
                    driverName={driver.driverName}
                    currentRating={currentRating}
                    displayRating={displayRating}
                    onHoverChange={setHoveredVal}
                    onSelect={handleSelect}
                />
                <CommunityValue
                    rating={communityRating}
                    status={communityStatus}
                    label="COMMUNITY AVG"
                />
            </div>
        </div>
    );
});

export function RatingModal({ race, season, metadataResolved = true, onClose }: RatingModalProps) {
    const storageSnapshot = useRatingStorage();
    const policyConsent = useSitePolicyConsent();
    const requestAcceptance = policyConsent.requestAcceptance;
    const community = useCommunityRatings('race', season, race.round);
    const savedRatings = useMemo(() => {
        void storageSnapshot;
        return getRaceRatings(season, race.round)?.ratings ?? [];
    }, [race.round, season, storageSnapshot]);
    const savedRatingByDriverId = useMemo(
        () => new Map(savedRatings.map(rating => [rating.driverId, rating.rating])),
        [savedRatings],
    );
    const communityByDriverId = useMemo(
        () => new Map(community.ratings.map(rating => [rating.driverId, rating])),
        [community.ratings],
    );
    const [drivers, setDrivers] = useState<DriverWithRating[]>([]);
    const [recap, setRecap] = useState<RaceRecap>(EMPTY_RECAP);
    const [loading, setLoading] = useState(true);
    const listRef = useRef<HTMLDivElement>(null);

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

    const getRaceDriverScore = useCallback(
        (driverId: string) =>
            getRaceRatings(season, race.round)?.ratings.find(r => r.driverId === driverId)?.rating ?? 0,
        [race.round, season],
    );

    const applyRaceRating = useCallback((
        driver: DriverWithRating,
        rating: number,
        onCommitted?: (previousRating: number) => void,
    ) => {
        if (loading || !metadataResolved) return;
        requestAcceptance(() => {
            const previousRating = getRaceDriverScore(driver.driverId);
            saveRaceDriverRating(season, race.round, race.raceName, race.date, {
                driverId: driver.driverId,
                driverName: driver.driverName,
                constructorId: driver.constructorId,
                constructorName: driver.constructorName,
                rating,
            });
            onCommitted?.(previousRating);
        });
    }, [getRaceDriverScore, loading, metadataResolved, race.date, race.raceName, race.round, requestAcceptance, season]);

    const removeRaceRating = useCallback((
        driver: DriverWithRating,
        onCommitted?: (previousRating: number) => void,
    ) => {
        if (loading || !metadataResolved) return;
        const previousRating = getRaceDriverScore(driver.driverId);
        removeRaceDriverRating(season, race.round, race.raceName, race.date, driver.driverId);
        onCommitted?.(previousRating);
    }, [getRaceDriverScore, loading, metadataResolved, race.date, race.raceName, race.round, season]);

    const restoreRaceRating = useCallback((driver: DriverWithRating, rating: number) => {
        if (loading || !metadataResolved) return;
        if (rating > 0) {
            saveRaceDriverRating(season, race.round, race.raceName, race.date, {
                driverId: driver.driverId,
                driverName: driver.driverName,
                constructorId: driver.constructorId,
                constructorName: driver.constructorName,
                rating,
            });
            return;
        }
        removeRaceDriverRating(season, race.round, race.raceName, race.date, driver.driverId);
    }, [loading, metadataResolved, race.date, race.raceName, race.round, season]);

    const handleClose = useCallback(() => {
        // Existing personal scores are opted into community in one explicit
        // action when leaving this race, but only after accepting the policy.
        // Declining must leave previously saved scores and eligibility intact.
        void hasCurrentSitePolicyAcceptance()
            .then(accepted => {
                if (accepted) {
                    markRaceRatingsCommunityEligible(season, race.round, race.raceName, race.date);
                }
            })
            .catch(() => undefined);
        void initializeGuestSync();
        onClose();
    }, [onClose, race.date, race.raceName, race.round, season]);

    const {
        activeDriverId,
        canUndo,
        lastUndoLabel,
        pushUndo,
        undo,
        clearKeyboardFocus,
    } = useRatingKeyboard<DriverWithRating>({
        drivers,
        enabled: !loading && metadataResolved && !policyConsent.isOpen && drivers.length > 0,
        listRef,
        getCurrentRating: getRaceDriverScore,
        onSetRating: applyRaceRating,
        onRemoveRating: removeRaceRating,
        onRestoreRating: restoreRaceRating,
        onClose: handleClose,
    });

    const handleRatingChange = useCallback((
        driver: DriverWithRating,
        rating: number,
        options?: { fromScrub?: boolean },
    ) => {
        if (loading || !metadataResolved) return;
        clearKeyboardFocus();
        const current = getRaceDriverScore(driver.driverId);

        if (!options?.fromScrub && current === rating) {
            removeRaceRating(driver, (previousRating) => {
                if (previousRating > 0) {
                    pushUndo({
                        label: `Cleared ${driver.driverName}`,
                        changes: [{ driver, previousRating }],
                    });
                }
            });
            return;
        }

        if (options?.fromScrub && current === rating) {
            return;
        }

        applyRaceRating(driver, rating, (previousRating) => {
            if (previousRating !== rating) {
                pushUndo({
                    label: `${driver.driverName} -> ${rating.toFixed(1)}`,
                    changes: [{ driver, previousRating }],
                });
            }
        });
    }, [applyRaceRating, clearKeyboardFocus, getRaceDriverScore, loading, metadataResolved, pushUndo, removeRaceRating]);

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
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={undo}
                            disabled={!canUndo}
                            aria-label="Undo last rating change"
                            title={lastUndoLabel ? `Undo: ${lastUndoLabel} (Ctrl+Z)` : 'Undo (Ctrl+Z)'}
                            className="flex flex-1 items-center justify-center gap-1.5 border border-[var(--border-color)] px-4 py-3 font-oxanium text-xs font-bold tracking-widest text-[var(--text-secondary)] uppercase transition-colors hover:border-white hover:text-white disabled:cursor-not-allowed disabled:opacity-35 md:flex-initial md:py-2"
                        >
                            <Undo2 size={14} />
                            UNDO
                        </button>
                        <button
                            onClick={handleClose}
                            className="flex-1 border border-[var(--border-color)] px-6 py-3 font-oxanium text-xs font-bold tracking-widest text-[var(--text-secondary)] uppercase transition-colors hover:border-[var(--accent-red)] hover:text-white md:flex-initial md:py-2"
                        >
                            CLOSE
                        </button>
                    </div>
                </div>
            )}
        >
            <>
                {loading ? (
                    <RatingModalContentFallback />
                ) : (
                    <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 md:p-6 custom-scrollbar">
                    <CommunityNotice status={community.status} legacy={savedRatings.some(rating => !rating.communityEligible)} />
                    <RatingShortcutBar />
                    <div ref={listRef} className="grid grid-cols-1 gap-px border border-[var(--border-color)] bg-[var(--border-color)]">
                        {drivers.map((driver) => (
                            <RatingDriverRow
                                key={driver.driverId}
                                season={season}
                                driver={driver}
                                currentRating={savedRatingByDriverId.get(driver.driverId) ?? 0}
                                isFastestLapDriver={recap.fastestLap?.driverId === driver.driverId}
                                communityRating={communityByDriverId.get(driver.driverId)}
                                communityStatus={community.status}
                                isKeyboardActive={activeDriverId === driver.driverId}
                                onRate={handleRatingChange}
                            />
                        ))}
                    </div>
                    </div>
                )}
                {policyConsent.overlays}
            </>
        </ModalShell>
    );
}

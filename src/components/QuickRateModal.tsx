import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RotateCcw, Undo2, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { getTeamColor } from '../types';
import { getDriverSeasonStats } from '../api/f1Api';
import { clearQuickRatings, saveQuickDriverRating, removeQuickDriverRating, getQuickRatings, markQuickRatingsCommunityEligible } from '../utils/storage';
import type { CommunityRating, CommunityStatus } from '../utils/communityRatings';
import { fetchWithMinDelay } from '../utils/delay';
import { ModalShell } from './ModalShell';
import { QuickRateModalContentFallback } from './RouteFallbacks';
import { RatingSegments } from './RatingSegments';
import { RatingShortcutBar } from './RatingShortcutBar';

import { useCommunityRatings, useRatingStorage } from '../hooks/useCommunityRatings';
import { useRatingKeyboard } from '../hooks/useRatingKeyboard';
import { useSitePolicyConsent } from '../hooks/useSitePolicyConsent';
import { hasCurrentSitePolicyAcceptance } from '../utils/sitePolicy';
import { initializeGuestSync } from '../utils/guestSync';
import { CommunityNotice, CommunityValue, PersonalRatingValue } from './CommunityRating';
import { DriverProfileLink } from './DriverProfileLink';

const MIN_LOADING_TIME = 1500;

interface QuickRateModalProps {
    season: string;
    onClose: () => void;
}

interface DriverWithRating {
    driverId: string;
    driverName: string;
    constructorId: string;
    constructorName: string;
    rating: number;
    position: string;
    points: string;
    wins: number;
    poles: number;
    podiums: number;
}

interface QuickRateDriverRowProps {
    season: string;
    driver: DriverWithRating;
    currentRating: number;
    communityRating?: CommunityRating;
    communityStatus: CommunityStatus;
    isKeyboardActive: boolean;
    onRate: (driver: DriverWithRating, rating: number, options?: { fromScrub?: boolean }) => void;
}

const QuickRateDriverRow = memo(function QuickRateDriverRow({
    season,
    driver,
    currentRating,
    communityRating,
    communityStatus,
    isKeyboardActive,
    onRate,
}: QuickRateDriverRowProps) {
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
            className={`group relative flex flex-col gap-1 p-2 transition-colors md:gap-3 md:p-3 ${
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

                <div className="flex h-10 min-w-0 flex-1 items-center md:h-12">
                    <div className="h-full w-1 flex-shrink-0" style={{ backgroundColor: teamColor }} />
                    <div className="min-w-0 flex-1 pl-2 md:pl-3">
                        <h3 className="truncate font-display text-sm leading-none text-white uppercase md:text-lg">
                            <DriverProfileLink
                                season={season}
                                driverId={driver.driverId}
                                title={`View ${driver.driverName} profile`}
                                className="hover:text-[var(--accent-yellow)] transition-colors"
                            >
                                {driver.driverName}
                            </DriverProfileLink>
                        </h3>
                        <p className="mt-0.5 truncate font-oxanium text-[9px] uppercase tracking-wide text-[var(--text-muted)] md:mt-1 md:text-[10px]">
                            {driver.constructorName}
                        </p>
                    </div>
                </div>

                <div className="ml-auto flex flex-shrink-0 items-center gap-2 pr-2 md:gap-4">
                    <div className="flex h-10 min-w-[40px] flex-col items-center justify-center md:h-12 md:min-w-[50px]">
                        <span className="mb-0.5 font-oxanium text-[7px] leading-none text-[var(--text-muted)] md:text-[9px]">
                            PTS
                        </span>
                        <span className="font-oxanium text-sm font-bold leading-none text-[var(--accent-yellow)] md:text-lg">
                            {driver.points}
                        </span>
                    </div>

                    <div className="flex h-10 min-w-[28px] flex-col items-center justify-center md:h-12 md:min-w-[36px]">
                        <span className="mb-0.5 font-oxanium text-[7px] leading-none text-[var(--text-muted)] md:text-[9px]">
                            WIN
                        </span>
                        <span className={`font-oxanium text-sm font-bold leading-none md:text-lg ${driver.wins > 0 ? 'text-[#00FF88]' : 'text-[var(--text-muted)]'}`}>
                            {driver.wins}
                        </span>
                    </div>

                    <div className="flex h-10 min-w-[28px] flex-col items-center justify-center md:h-12 md:min-w-[36px]">
                        <span className="mb-0.5 font-oxanium text-[7px] leading-none text-[var(--text-muted)] md:text-[9px]">
                            PP
                        </span>
                        <span className={`font-oxanium text-sm font-bold leading-none md:text-lg ${driver.poles > 0 ? 'text-[#FF00FF]' : 'text-[var(--text-muted)]'}`}>
                            {driver.poles}
                        </span>
                    </div>

                    <div className="flex h-10 min-w-[28px] flex-col items-center justify-center md:h-12 md:min-w-[36px]">
                        <span className="mb-0.5 font-oxanium text-[7px] leading-none text-[var(--text-muted)] md:text-[9px]">
                            POD
                        </span>
                        <span className={`font-oxanium text-sm font-bold leading-none md:text-lg ${driver.podiums > 0 ? 'text-[var(--accent-orange)]' : 'text-[var(--text-muted)]'}`}>
                            {driver.podiums}
                        </span>
                    </div>
                </div>
            </div>

            <div className="flex w-full items-center gap-3 overflow-hidden md:gap-4">
                <div className="w-20 flex-shrink-0 md:w-24">
                    <PersonalRatingValue value={displayRating} season />
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
                    label="COMMUNITY SEASON AVG"
                />
            </div>
        </div>
    );
});

export function QuickRateModal({ season, onClose }: QuickRateModalProps) {
    const storageSnapshot = useRatingStorage();
    const policyConsent = useSitePolicyConsent();
    const requestAcceptance = policyConsent.requestAcceptance;
    const community = useCommunityRatings('quick', season);
    const savedRatings = useMemo(() => {
        void storageSnapshot;
        return getQuickRatings(season) ?? [];
    }, [season, storageSnapshot]);
    const savedRatingByDriverId = useMemo(
        () => new Map(savedRatings.map(rating => [rating.driverId, rating.rating])),
        [savedRatings],
    );
    const communityByDriverId = useMemo(
        () => new Map(community.ratings.map(rating => [rating.driverId, rating])),
        [community.ratings],
    );
    const [drivers, setDrivers] = useState<DriverWithRating[]>([]);
    const [loading, setLoading] = useState(true);
    const listRef = useRef<HTMLDivElement>(null);

    const loadDrivers = useCallback(async () => {
        setLoading(true);
        try {
            const stats = await fetchWithMinDelay(
                () => getDriverSeasonStats(season),
                MIN_LOADING_TIME
            );
            const existingRatings = getQuickRatings(season);

            const driversWithRatings: DriverWithRating[] = stats.map((driver) => {
                const existing = existingRatings?.find((rating) => rating.driverId === driver.driverId);
                return {
                    driverId: driver.driverId,
                    driverName: driver.driverName,
                    constructorId: driver.constructorId,
                    constructorName: driver.constructorName,
                    rating: existing?.rating || 0,
                    position: driver.position,
                    points: driver.points,
                    wins: driver.wins,
                    poles: driver.poles,
                    podiums: driver.podiums,
                };
            });

            setDrivers(driversWithRatings);
        } catch (error) {
            console.error('Error loading drivers:', error);
        } finally {
            setLoading(false);
        }
    }, [season]);

    useEffect(() => {
        void loadDrivers();
    }, [loadDrivers]);

    const getQuickDriverScore = useCallback(
        (driverId: string) =>
            getQuickRatings(season)?.find(r => r.driverId === driverId)?.rating ?? 0,
        [season],
    );

    const applyQuickRating = useCallback((
        driver: DriverWithRating,
        rating: number,
        onCommitted?: (previousRating: number) => void,
    ) => {
        if (loading) return;
        requestAcceptance(() => {
            const previousRating = getQuickDriverScore(driver.driverId);
            saveQuickDriverRating(season, {
                driverId: driver.driverId,
                driverName: driver.driverName,
                constructorId: driver.constructorId,
                constructorName: driver.constructorName,
                rating,
            });
            onCommitted?.(previousRating);
        });
    }, [getQuickDriverScore, loading, requestAcceptance, season]);

    const removeQuickRating = useCallback((
        driver: DriverWithRating,
        onCommitted?: (previousRating: number) => void,
    ) => {
        if (loading) return;
        const previousRating = getQuickDriverScore(driver.driverId);
        removeQuickDriverRating(season, driver.driverId);
        onCommitted?.(previousRating);
    }, [getQuickDriverScore, loading, season]);

    const restoreQuickRating = useCallback((driver: DriverWithRating, rating: number) => {
        if (loading) return;
        if (rating > 0) {
            saveQuickDriverRating(season, {
                driverId: driver.driverId,
                driverName: driver.driverName,
                constructorId: driver.constructorId,
                constructorName: driver.constructorName,
                rating,
            });
            return;
        }
        removeQuickDriverRating(season, driver.driverId);
    }, [loading, season]);

    const handleClose = useCallback(() => {
        // Opt existing scores into community only after accepting the policy.
        // Declining must leave previously saved scores and eligibility intact.
        void hasCurrentSitePolicyAcceptance()
            .then(accepted => {
                if (accepted) markQuickRatingsCommunityEligible(season);
            })
            .catch(() => undefined);
        void initializeGuestSync();
        onClose();
    }, [onClose, season]);

    const {
        activeDriverId,
        canUndo,
        lastUndoLabel,
        pushUndo,
        undo,
        clearKeyboardFocus,
    } = useRatingKeyboard<DriverWithRating>({
        drivers,
        enabled: !loading && !policyConsent.isOpen && drivers.length > 0,
        listRef,
        getCurrentRating: getQuickDriverScore,
        onSetRating: applyQuickRating,
        onRemoveRating: removeQuickRating,
        onRestoreRating: restoreQuickRating,
        onClose: handleClose,
    });

    const handleRatingChange = useCallback((
        driver: DriverWithRating,
        rating: number,
        options?: { fromScrub?: boolean },
    ) => {
        if (loading) return;
        clearKeyboardFocus();
        const current = getQuickDriverScore(driver.driverId);

        if (!options?.fromScrub && current === rating) {
            removeQuickRating(driver, (previousRating) => {
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

        applyQuickRating(driver, rating, (previousRating) => {
            if (previousRating !== rating) {
                pushUndo({
                    label: `${driver.driverName} -> ${rating.toFixed(1)}`,
                    changes: [{ driver, previousRating }],
                });
            }
        });
    }, [applyQuickRating, clearKeyboardFocus, getQuickDriverScore, loading, pushUndo, removeQuickRating]);

    function handleClearAll() {
        const previousEntries = getQuickRatings(season) ?? [];
        if (previousEntries.length > 0) {
            const byDriverId = new Map(drivers.map(d => [d.driverId, d]));
            const changes = previousEntries.map(saved => ({
                driver: byDriverId.get(saved.driverId) ?? {
                    driverId: saved.driverId,
                    driverName: saved.driverName,
                    constructorId: saved.constructorId,
                    constructorName: saved.constructorName,
                    rating: saved.rating,
                    position: '-',
                    points: '0',
                    wins: 0,
                    poles: 0,
                    podiums: 0,
                },
                previousRating: saved.rating,
            }));
            pushUndo({ label: 'Clear all ratings', changes });
        }
        clearQuickRatings(season);
        setDrivers((previousDrivers) => previousDrivers.map((driver) => ({ ...driver, rating: 0 })));
        toast.success('Quick ratings cleared');
    }

    return (
        <ModalShell
            eyebrow="Quick Rate Mode"
            eyebrowIcon={<Zap size={14} className="text-[var(--accent-yellow)]" />}
            eyebrowTextClassName="text-[var(--accent-yellow)]"
            title={`${season} SEASON RATINGS`}
            subtitle="Rate all drivers based on season performance"
            onClose={handleClose}
            footer={(
                <div className="z-20 flex flex-col gap-3 border-t border-[var(--border-color)] bg-[var(--bg-panel)] p-4 md:flex-row md:items-center md:justify-between md:gap-0">
                    <button
                        onClick={handleClearAll}
                        disabled={loading}
                        className="flex items-center justify-center gap-2 border border-[var(--border-color)] px-4 py-3 font-oxanium text-xs font-bold tracking-widest text-[var(--text-muted)] uppercase transition-all hover:border-[var(--accent-red)] hover:bg-[var(--accent-red)]/10 hover:text-[var(--accent-red)] disabled:opacity-50 md:py-2"
                    >
                        <RotateCcw size={14} />
                        CLEAR ALL
                    </button>

                    <div className="flex flex-col-reverse items-stretch gap-2 md:flex-row md:items-center md:gap-4">
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
                                className="flex-1 border border-[var(--border-color)] px-6 py-3 font-oxanium text-xs font-bold tracking-widest text-[var(--text-secondary)] uppercase transition-colors hover:border-[var(--accent-yellow)] hover:text-white md:flex-initial md:py-2"
                            >
                                CLOSE
                            </button>
                        </div>
                    </div>
                </div>
            )}
        >
            <>
                {loading ? (
                    <QuickRateModalContentFallback />
                ) : (
                    <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 md:p-6 custom-scrollbar">
                    <CommunityNotice status={community.status} legacy={savedRatings.some(rating => !rating.communityEligible)} />
                    <RatingShortcutBar />
                    <div ref={listRef} className="grid grid-cols-1 gap-px border border-[var(--border-color)] bg-[var(--border-color)]">
                        {drivers.map((driver) => (
                            <QuickRateDriverRow
                                key={driver.driverId}
                                season={season}
                                driver={driver}
                                currentRating={savedRatingByDriverId.get(driver.driverId) ?? 0}
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

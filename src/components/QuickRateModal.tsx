import { useCallback, useEffect, useState } from 'react';
import { RotateCcw, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { TEAM_COLORS } from '../types';
import { getDriverSeasonStats } from '../api/f1Api';
import { clearQuickRatings, saveQuickDriverRating, getQuickRatings, markQuickRatingsCommunityEligible } from '../utils/storage';
import { fetchWithMinDelay } from '../utils/delay';
import { ModalShell } from './ModalShell';
import { QuickRateModalContentFallback } from './RouteFallbacks';

import { useCommunityRatings, useRatingStorage } from '../hooks/useCommunityRatings';
import { initializeGuestSync } from '../utils/guestSync';
import { CommunityNotice, CommunityValue, PersonalRatingValue } from './CommunityRating';

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

export function QuickRateModal({ season, onClose }: QuickRateModalProps) {
    useRatingStorage();
    const community = useCommunityRatings('quick', season);
    const savedRatings = getQuickRatings(season) ?? [];
    const [drivers, setDrivers] = useState<DriverWithRating[]>([]);
    const [loading, setLoading] = useState(true);
    const [hoveredRating, setHoveredRating] = useState<{ id: string, val: number } | null>(null);

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

    function handleRatingChange(driverId: string, rating: number) {
        if (loading) return;
        const driver = drivers.find(driver => driver.driverId === driverId);
        if (!driver) return;
        saveQuickDriverRating(season, {
            driverId, driverName: driver.driverName,
            constructorId: driver.constructorId, constructorName: driver.constructorName,
            rating,
        });
    }

    function handleClearAll() {
        clearQuickRatings(season);
        setDrivers((previousDrivers) => previousDrivers.map((driver) => ({ ...driver, rating: 0 })));
        toast.success('Quick ratings cleared');
    }

    function handleClose() {
        // Opt all existing season scores into community in one explicit action
        // while keeping their personal values unchanged.
        markQuickRatingsCommunityEligible(season);
        void initializeGuestSync();
        onClose();
    }

    function getTeamColor(constructorId: string): string {
        return TEAM_COLORS[constructorId] || '#888888';
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
                        <button
                            onClick={handleClose}
                            className="border border-[var(--border-color)] px-6 py-3 font-oxanium text-xs font-bold tracking-widest text-[var(--text-secondary)] uppercase transition-colors hover:border-[var(--accent-yellow)] hover:text-white md:py-2"
                        >
                            CLOSE
                        </button>
                    </div>
                </div>
            )}
        >
            {loading ? (
                <QuickRateModalContentFallback />
            ) : (
                <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 md:p-6 custom-scrollbar">
                    <CommunityNotice status={community.status} legacy={savedRatings.some(rating => !rating.communityEligible)} />
                    <div className="grid grid-cols-1 gap-px border border-[var(--border-color)] bg-[var(--border-color)]">
                        {drivers.map((driver) => {
                            const teamColor = getTeamColor(driver.constructorId);
                            const currentRating = savedRatings.find(rating => rating.driverId === driver.driverId)?.rating ?? 0;
                            const isHovered = hoveredRating?.id === driver.driverId;
                            const displayRating = isHovered ? hoveredRating.val : currentRating;

                            return (
                                <div
                                    key={driver.driverId}
                                    className="group relative flex flex-col gap-1 bg-[var(--bg-panel)] p-2 transition-colors hover:bg-[var(--bg-panel-hover)] md:gap-3 md:p-3"
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
                                                    {driver.driverName}
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
                                            label="COMMUNITY SEASON AVG"
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

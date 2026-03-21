import { useEffect, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import type { DriverRating } from '../types';
import { TEAM_COLORS } from '../types';
import { getRaceDrivers } from '../api/f1Api';
import { saveRaceRatings, getRaceRatings } from '../utils/storage';
import { fetchWithMinDelay } from '../utils/delay';
import { ModalShell } from './ModalShell';
import { RatingModalContentFallback } from './RouteFallbacks';
import type { RaceRouteSnapshot } from '../routes/modalRouteState';

const MIN_LOADING_TIME = 800;

interface RatingModalProps {
    race: RaceRouteSnapshot;
    season: string;
    metadataResolved?: boolean;
    onClose: () => void;
    onSave: () => void;
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

export function RatingModal({ race, season, metadataResolved = true, onClose, onSave }: RatingModalProps) {
    const [drivers, setDrivers] = useState<DriverWithRating[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [hoveredRating, setHoveredRating] = useState<{ id: string, val: number } | null>(null);

    useEffect(() => {
        void loadDrivers();
    }, [race.round, season]);

    async function loadDrivers() {
        setLoading(true);
        try {
            const raceDrivers = await fetchWithMinDelay(
                () => getRaceDrivers(season, race.round),
                MIN_LOADING_TIME
            );
            const existingRatings = getRaceRatings(season, race.round);

            const driversWithRatings: DriverWithRating[] = raceDrivers.map((driver) => {
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
        } catch (error) {
            console.error('Error loading drivers:', error);
        } finally {
            setLoading(false);
        }
    }

    function handleRatingChange(driverId: string, rating: number) {
        setDrivers((previousDrivers) => previousDrivers.map((driver) =>
            driver.driverId === driverId ? { ...driver, rating } : driver
        ));
    }

    async function handleSave() {
        setSaving(true);
        try {
            const ratings: DriverRating[] = drivers.map((driver) => ({
                driverId: driver.driverId,
                driverName: driver.driverName,
                constructorId: driver.constructorId,
                constructorName: driver.constructorName,
                rating: driver.rating || 5,
            }));

            saveRaceRatings(season, race.round, race.raceName, race.date, ratings);
            toast.success('Ratings Saved', {
                description: `${race.raceName} • ${drivers.length} drivers rated`,
            });
            onSave();
        } catch (error) {
            console.error('Error saving ratings:', error);
            toast.error('Failed to save', {
                description: 'Please try again',
            });
        } finally {
            setSaving(false);
        }
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
            onClose={onClose}
            footer={(
                <div className="z-20 flex flex-col gap-2 border-t border-[var(--border-color)] bg-[var(--bg-panel)] p-4 md:flex-row md:items-center md:justify-end md:gap-0">
                    <div className="flex w-full flex-col-reverse items-stretch gap-2 md:w-auto md:flex-row md:items-center md:gap-4">
                        <button
                            onClick={onClose}
                            className="border border-[var(--border-color)] px-6 py-3 font-oxanium text-xs font-bold tracking-widest text-[var(--text-secondary)] uppercase transition-colors hover:text-white md:border-0 md:py-2"
                        >
                            DISCARD
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={saving || loading || !metadataResolved}
                            className="flex items-center justify-center bg-[var(--accent-red)] px-8 py-3 font-display text-lg tracking-widest text-white uppercase transition-colors hover:bg-[#ff0000] disabled:opacity-50 md:py-2"
                        >
                            {saving ? (
                                <Loader2 size={16} className="mr-2 animate-spin" />
                            ) : (
                                <Save size={16} className="mr-2" />
                            )}
                            SAVE DATA
                        </button>
                    </div>
                </div>
            )}
        >
            {loading ? (
                <RatingModalContentFallback />
            ) : (
                <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 md:p-6 custom-scrollbar">
                    <div className="grid grid-cols-1 gap-px border border-[var(--border-color)] bg-[var(--border-color)]">
                        {drivers.map((driver) => {
                            const teamColor = getTeamColor(driver.constructorId);
                            const currentRating = driver.rating;
                            const isHovered = hoveredRating?.id === driver.driverId;
                            const displayRating = isHovered ? hoveredRating.val : currentRating;

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
                                                <h3 className="truncate font-display text-sm leading-none text-white uppercase md:text-lg">
                                                    {driver.driverName}
                                                </h3>
                                                <p className="mt-0.5 truncate font-oxanium text-[9px] uppercase tracking-wide text-[var(--text-muted)] md:mt-1 md:text-[10px]">
                                                    {driver.constructorName}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="ml-auto hidden h-12 min-w-[100px] flex-shrink-0 flex-col items-end justify-center pr-4 md:flex">
                                            <span className="mb-0.5 font-oxanium text-[8px] leading-none text-[var(--text-muted)]">
                                                {parseInt(driver.position) === 1 ? 'TIME' : 'GAP'}
                                            </span>
                                            <span
                                                className={`font-oxanium text-sm leading-none ${
                                                    parseInt(driver.position) === 1
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

                                    <div className="flex w-full items-center gap-1 overflow-hidden md:gap-2">
                                        <div className="flex w-8 flex-shrink-0 items-center justify-center md:w-14">
                                            <div
                                                className="font-oxanium text-base font-bold leading-none tabular-nums md:text-2xl"
                                                style={{
                                                    color: (() => {
                                                        if (displayRating === 0) return 'var(--text-muted)';
                                                        const t = (displayRating - 0.5) / 9.5;
                                                        if (t < 0.4) {
                                                            const localT = t / 0.4;
                                                            return `rgb(225, ${Math.round(6 + localT * 101)}, 0)`;
                                                        }
                                                        if (t < 0.7) {
                                                            const localT = (t - 0.4) / 0.3;
                                                            return `rgb(${Math.round(225 + localT * 17)}, ${Math.round(107 + localT * 102)}, ${Math.round(localT * 61)})`;
                                                        }
                                                        const localT = (t - 0.7) / 0.3;
                                                        return `rgb(${Math.round(242 - localT * 242)}, ${Math.round(209 + localT * 46)}, ${Math.round(61 + localT * 75)})`;
                                                    })(),
                                                }}
                                            >
                                                {displayRating % 1 === 0 ? displayRating : displayRating.toFixed(1)}
                                            </div>
                                        </div>

                                        <div className="flex-1 overflow-x-auto scrollbar-hide md:overflow-visible">
                                            <div className="flex gap-[2px]" style={{ minWidth: 'max-content' }} onMouseLeave={() => setHoveredRating(null)}>
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
                                                            onMouseEnter={() => setHoveredRating({ id: driver.driverId, val })}
                                                            onClick={() => handleRatingChange(driver.driverId, val)}
                                                            className="relative h-7 w-4 flex-shrink-0 cursor-pointer touch-manipulation focus:outline-none md:h-10 md:w-5"
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

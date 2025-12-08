import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Save, Loader2 } from 'lucide-react';
import type { Race, DriverRating } from '../types';
import { TEAM_COLORS } from '../types';
import { getRaceDrivers } from '../api/f1Api';
import { saveRaceRatings, getRaceRatings } from '../utils/storage';

interface RatingModalProps {
    race: Race;
    season: string;
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

export function RatingModal({ race, season, onClose, onSave }: RatingModalProps) {
    const [drivers, setDrivers] = useState<DriverWithRating[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [hoveredRating, setHoveredRating] = useState<{ id: string, val: number } | null>(null);

    useEffect(() => {
        loadDrivers();
    }, [race, season]);

    async function loadDrivers() {
        setLoading(true);
        try {
            const raceDrivers = await getRaceDrivers(season, race.round);
            const existingRatings = getRaceRatings(season, race.round);

            const driversWithRatings: DriverWithRating[] = raceDrivers.map(d => {
                const existing = existingRatings?.ratings.find(r => r.driverId === d.driver.driverId);
                return {
                    driverId: d.driver.driverId,
                    driverName: `${d.driver.givenName} ${d.driver.familyName}`,
                    constructorId: d.constructor.constructorId,
                    constructorName: d.constructor.name,
                    position: d.position,
                    rating: existing?.rating || 0,
                    gap: d.gap,
                    laps: d.laps,
                    status: d.status,
                    grid: d.grid,
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
        setDrivers(prev => prev.map(d =>
            d.driverId === driverId ? { ...d, rating } : d
        ));
    }

    async function handleSave() {
        setSaving(true);
        try {
            const ratings: DriverRating[] = drivers.map(d => ({
                driverId: d.driverId,
                driverName: d.driverName,
                constructorId: d.constructorId,
                constructorName: d.constructorName,
                rating: d.rating || 5, // Fallback if 0
            }));

            saveRaceRatings(season, race.round, race.raceName, race.date, ratings);
            onSave();
            onClose();
        } catch (error) {
            console.error('Error saving ratings:', error);
        } finally {
            setSaving(false);
        }
    }

    function getTeamColor(constructorId: string): string {
        return TEAM_COLORS[constructorId] || '#888888';
    }

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center p-0 md:p-4"
                onClick={onClose}
            >
                <div className="absolute inset-0 bg-[#000]/95" />

                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                    onClick={e => e.stopPropagation()}
                    className="relative w-full max-w-5xl h-[100dvh] md:h-auto md:max-h-[90vh] bg-[var(--bg-main)] border-0 md:border border-[var(--border-color)] rounded-none overflow-hidden flex flex-col shadow-2xl"
                    style={{
                        boxShadow: '0 0 100px rgba(0,0,0,0.8)'
                    }}
                >
                    {/* Header */}
                    <div className="relative p-4 md:p-6 border-b border-[var(--border-color)] bg-[var(--bg-panel)]">
                        {/* Technical Overlay */}
                        <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                            <div className="w-32 h-32 border-2 border-white rounded-full flex items-center justify-center">
                                <div className="w-24 h-24 border border-white" />
                            </div>
                        </div>

                        <div className="relative flex items-center justify-between z-10">
                            <div>
                                <div className="flex items-center gap-2 mb-2">
                                    <div className="w-2 h-2 bg-[var(--accent-red)] animate-pulse" />
                                    <span className="text-[var(--text-muted)] text-[10px] font-oxanium uppercase tracking-[0.2em]">
                                        Round {race.round}
                                    </span>
                                </div>
                                <h2 className="font-display-condensed font-bold text-2xl md:text-5xl text-white uppercase tracking-tight leading-tight mb-1 pb-1">
                                    {race.raceName.toUpperCase()}
                                </h2>
                                <p className="font-oxanium text-sm text-[var(--text-secondary)] uppercase tracking-wider mt-1">
                                    {new Date(race.date).toLocaleDateString('en-GB', {
                                        day: 'numeric',
                                        month: 'long',
                                        year: 'numeric'
                                    })}
                                </p>
                            </div>

                            <button
                                onClick={onClose}
                                className="w-12 h-12 flex items-center justify-center border border-[var(--border-color)] hover:bg-[var(--accent-red)] hover:border-[var(--accent-red)] transition-all group"
                            >
                                <X size={24} className="text-[var(--text-muted)] group-hover:text-white" />
                            </button>
                        </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 md:p-6 custom-scrollbar">
                        {loading ? (
                            <div className="flex flex-col items-center justify-center py-20 gap-4">
                                <Loader2 size={40} className="animate-spin text-[var(--accent-red)]" />
                                <span className="font-oxanium text-sm text-[var(--text-muted)] animate-pulse uppercase tracking-[0.2em]">Loading drivers...</span>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 gap-px bg-[var(--border-color)] border border-[var(--border-color)]">
                                {drivers.map((driver) => {
                                    const teamColor = getTeamColor(driver.constructorId);
                                    const currentRating = driver.rating;
                                    const isHovered = hoveredRating?.id === driver.driverId;
                                    const displayRating = isHovered ? hoveredRating.val : currentRating;

                                    return (
                                        <div
                                            key={driver.driverId}
                                            className="group relative bg-[var(--bg-panel)] p-2 md:p-3 hover:bg-[var(--bg-panel-hover)] transition-colors flex flex-col gap-2 md:gap-3 overflow-hidden"
                                        >
                                            {/* Driver Info Row */}
                                            <div className="flex items-center gap-0">
                                                {/* Fixed-width Position Box */}
                                                <div className="w-10 md:w-14 h-10 md:h-12 flex flex-col items-center justify-center bg-[var(--bg-darker)] border border-[var(--border-color)] text-[var(--text-secondary)] flex-shrink-0">
                                                    <span className="font-oxanium text-[8px] md:text-[10px] leading-none mb-0.5 hidden md:block">POS</span>
                                                    <span className="font-display text-base md:text-xl leading-none text-white">{driver.position}</span>
                                                </div>

                                                {/* Grid Position - hide on mobile */}
                                                <div className="hidden md:flex w-10 h-12 flex-col items-center justify-center bg-[var(--bg-darker)] border-y border-r border-[var(--border-color)] text-[var(--text-muted)] flex-shrink-0">
                                                    <span className="font-oxanium text-[8px] leading-none mb-0.5">GRD</span>
                                                    <span className="font-oxanium text-sm leading-none">{driver.grid || '-'}</span>
                                                </div>

                                                {/* Team Color Stripe + Name */}
                                                <div className="flex items-center h-10 md:h-12 min-w-0 flex-1">
                                                    <div className="w-1 h-full flex-shrink-0" style={{ backgroundColor: teamColor }} />
                                                    <div className="min-w-0 pl-2 md:pl-3 flex-1">
                                                        <h3 className="font-display text-sm md:text-lg text-white truncate leading-none uppercase">
                                                            {driver.driverName}
                                                        </h3>
                                                        <p className="font-oxanium text-[9px] md:text-[10px] text-[var(--text-muted)] uppercase truncate tracking-wide mt-0.5 md:mt-1">
                                                            {driver.constructorName}
                                                        </p>
                                                    </div>
                                                </div>

                                                {/* Gap / Time */}
                                                <div className="hidden md:flex flex-col items-end justify-center h-12 ml-auto pr-4 flex-shrink-0 min-w-[100px]">
                                                    <span className="font-oxanium text-[8px] text-[var(--text-muted)] leading-none mb-0.5">
                                                        {parseInt(driver.position) === 1 ? 'TIME' : 'GAP'}
                                                    </span>
                                                    <span className={`font-oxanium text-sm leading-none ${
                                                        // Winner - green
                                                        parseInt(driver.position) === 1
                                                            ? 'text-[#00FF88]'
                                                            // Lapped drivers - orange
                                                            : driver.gap?.includes('Lap')
                                                                ? 'text-[var(--accent-orange)]'
                                                                // DNF - red
                                                                : (driver.status !== 'Finished' && !driver.gap?.startsWith('+'))
                                                                    ? 'text-[var(--accent-red)]'
                                                                    // Normal gap - white
                                                                    : 'text-white'
                                                        }`}>
                                                        {driver.gap || driver.status || '-'}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Rating Section - Full width on mobile, overflow hidden */}
                                            <div className="flex items-center gap-1 md:gap-2 w-full overflow-hidden">
                                                {/* Rating Number - Fixed width for alignment */}
                                                <div className="w-8 md:w-14 flex items-center justify-center flex-shrink-0">
                                                    <div
                                                        className="text-base md:text-2xl font-bold leading-none tabular-nums font-oxanium"
                                                        style={{
                                                            color: (() => {
                                                                if (displayRating === 0) return 'var(--text-muted)';
                                                                const t = (displayRating - 0.5) / 9.5;
                                                                if (t < 0.4) {
                                                                    const localT = t / 0.4;
                                                                    return `rgb(225, ${Math.round(6 + localT * 101)}, 0)`;
                                                                } else if (t < 0.7) {
                                                                    const localT = (t - 0.4) / 0.3;
                                                                    return `rgb(${Math.round(225 + localT * 17)}, ${Math.round(107 + localT * 102)}, ${Math.round(localT * 61)})`;
                                                                } else {
                                                                    const localT = (t - 0.7) / 0.3;
                                                                    return `rgb(${Math.round(242 - localT * 242)}, ${Math.round(209 + localT * 46)}, ${Math.round(61 + localT * 75)})`;
                                                                }
                                                            })(),
                                                        }}>
                                                        {displayRating % 1 === 0 ? displayRating : displayRating.toFixed(1)}
                                                    </div>
                                                </div>

                                                {/* Rating Bar - Horizontal scroll on mobile */}
                                                <div className="flex-1 overflow-x-auto md:overflow-visible scrollbar-hide">
                                                    <div className="flex gap-[2px]" style={{ minWidth: 'max-content' }} onMouseLeave={() => setHoveredRating(null)}>
                                                        {[...Array(20)].map((_, i) => {
                                                            const val = (i + 1) * 0.5; // 0.5, 1.0, 1.5, ..., 10.0
                                                            const isFilled = val <= displayRating;

                                                            // Color Logic - smooth gradient from red → orange → yellow → green
                                                            let segmentColor = 'rgba(255,255,255,0.08)';
                                                            if (isFilled) {
                                                                // Interpolate color based on segment position (1-20)
                                                                const t = i / 19; // 0 to 1
                                                                if (t < 0.4) {
                                                                    // Red to Orange (segments 1-8)
                                                                    const localT = t / 0.4;
                                                                    const r = 225;
                                                                    const g = Math.round(6 + localT * 101); // 6 → 107
                                                                    const b = 0;
                                                                    segmentColor = `rgb(${r}, ${g}, ${b})`;
                                                                } else if (t < 0.7) {
                                                                    // Orange to Yellow (segments 9-14)
                                                                    const localT = (t - 0.4) / 0.3;
                                                                    const r = Math.round(225 + localT * 17); // 225 → 242
                                                                    const g = Math.round(107 + localT * 102); // 107 → 209
                                                                    const b = Math.round(localT * 61); // 0 → 61
                                                                    segmentColor = `rgb(${r}, ${g}, ${b})`;
                                                                } else {
                                                                    // Yellow to Green (segments 15-20)
                                                                    const localT = (t - 0.7) / 0.3;
                                                                    const r = Math.round(242 - localT * 242); // 242 → 0
                                                                    const g = Math.round(209 + localT * 46); // 209 → 255
                                                                    const b = Math.round(61 + localT * 75); // 61 → 136
                                                                    segmentColor = `rgb(${r}, ${g}, ${b})`;
                                                                }
                                                            }

                                                            return (
                                                                <button
                                                                    key={i}
                                                                    onMouseEnter={() => setHoveredRating({ id: driver.driverId, val })}
                                                                    onClick={() => handleRatingChange(driver.driverId, val)}
                                                                    className="w-4 md:w-5 h-7 md:h-10 relative focus:outline-none cursor-pointer touch-manipulation flex-shrink-0"
                                                                >
                                                                    <div
                                                                        className="w-full h-full rounded-sm"
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
                        )}
                    </div>

                    {/* Footer */}
                    <div className="p-4 border-t border-[var(--border-color)] bg-[var(--bg-panel)] flex flex-col md:flex-row justify-end items-stretch md:items-center gap-2 md:gap-0 z-20">
                        <div className="flex flex-col-reverse md:flex-row items-stretch md:items-center gap-2 md:gap-4 w-full md:w-auto">
                            <button
                                onClick={onClose}
                                className="px-6 py-3 md:py-2 font-oxanium text-xs font-bold tracking-widest text-[var(--text-secondary)] hover:text-white transition-colors uppercase border border-[var(--border-color)] md:border-0"
                            >
                                DISCARD
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={saving || loading}
                                className="flex items-center justify-center px-8 py-3 md:py-2 bg-[var(--accent-red)] hover:bg-[#ff0000] text-white font-display text-lg tracking-widest uppercase transition-colors disabled:opacity-50"
                            >
                                {saving ? (
                                    <Loader2 size={16} className="animate-spin mr-2" />
                                ) : (
                                    <Save size={16} className="mr-2" />
                                )}
                                SAVE DATA
                            </button>
                        </div>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}

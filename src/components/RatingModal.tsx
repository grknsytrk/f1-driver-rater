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
                className="fixed inset-0 z-50 flex items-center justify-center p-4"
                onClick={onClose}
            >
                <div className="absolute inset-0 bg-[#000]/95" />

                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                    onClick={e => e.stopPropagation()}
                    className="relative w-full max-w-5xl max-h-[90vh] bg-[var(--bg-main)] border border-[var(--border-color)] rounded-none overflow-hidden flex flex-col shadow-2xl"
                    style={{
                        boxShadow: '0 0 100px rgba(0,0,0,0.8)'
                    }}
                >
                    {/* Header */}
                    <div className="relative p-6 border-b border-[var(--border-color)] bg-[var(--bg-panel)]">
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
                                <h2 className="font-display-condensed font-bold text-5xl text-white uppercase tracking-tight leading-tight mb-1 pb-1">
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
                    <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
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
                                            className="group relative bg-[var(--bg-panel)] p-3 hover:bg-[var(--bg-panel-hover)] transition-colors grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4 items-center"
                                        >
                                            {/* Driver Info */}
                                            <div className="flex items-center gap-0">
                                                {/* Fixed-width Position Box */}
                                                <div className="w-14 h-12 flex flex-col items-center justify-center bg-[var(--bg-darker)] border border-[var(--border-color)] text-[var(--text-secondary)] flex-shrink-0">
                                                    <span className="font-oxanium text-[10px] leading-none mb-0.5">POS</span>
                                                    <span className="font-display text-xl leading-none text-white">{driver.position}</span>
                                                </div>

                                                {/* Grid Position */}
                                                <div className="w-10 h-12 flex flex-col items-center justify-center bg-[var(--bg-darker)] border-y border-r border-[var(--border-color)] text-[var(--text-muted)] flex-shrink-0">
                                                    <span className="font-oxanium text-[8px] leading-none mb-0.5">GRD</span>
                                                    <span className="font-oxanium text-sm leading-none">{driver.grid || '-'}</span>
                                                </div>

                                                {/* Team Color Stripe + Name */}
                                                <div className="flex items-center h-12 flex-shrink-0">
                                                    <div className="w-1 h-full flex-shrink-0" style={{ backgroundColor: teamColor }} />
                                                    <div className="min-w-0 pl-3">
                                                        <h3 className="font-display text-lg text-white truncate leading-none uppercase">
                                                            {driver.driverName}
                                                        </h3>
                                                        <p className="font-oxanium text-[10px] text-[var(--text-muted)] uppercase truncate tracking-wide mt-1">
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

                                            {/* Input Section */}
                                            <div className="flex items-center justify-end gap-6">
                                                {/* Segmented Bar - 20 equal segments, 0.5 increments */}
                                                <div className="flex gap-[2px]" onMouseLeave={() => setHoveredRating(null)}>
                                                    {[...Array(20)].map((_, i) => {
                                                        const val = (i + 1) * 0.5; // 0.5, 1.0, 1.5, ..., 10.0
                                                        const isFilled = val <= displayRating;

                                                        // Color Logic based on value
                                                        let segmentColor = 'rgba(255,255,255,0.08)';
                                                        if (isFilled) {
                                                            if (val <= 5) segmentColor = 'var(--accent-red)';
                                                            else if (val <= 8) segmentColor = 'var(--accent-yellow)';
                                                            else segmentColor = '#00FF88';
                                                        }

                                                        return (
                                                            <button
                                                                key={i}
                                                                onMouseEnter={() => setHoveredRating({ id: driver.driverId, val })}
                                                                onClick={() => handleRatingChange(driver.driverId, val)}
                                                                className="w-3 sm:w-4 h-8 relative focus:outline-none cursor-pointer"
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

                                                {/* Number Display */}
                                                <div className="w-16 text-right font-oxanium">
                                                    <div
                                                        className="text-3xl font-bold leading-none tabular-nums transition-colors duration-75"
                                                        style={{
                                                            color: displayRating > 8 ? '#00FF88' : displayRating > 5 ? 'var(--accent-yellow)' : displayRating > 0 ? 'var(--accent-red)' : 'var(--text-muted)',
                                                        }}>
                                                        {displayRating % 1 === 0 ? displayRating : displayRating.toFixed(1)}
                                                    </div>
                                                    <div className="text-[10px] text-[var(--text-muted)] mt-1">RATING</div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="p-4 border-t border-[var(--border-color)] bg-[var(--bg-panel)] flex justify-end items-center z-20">
                        <div className="flex items-center gap-4">
                            <button
                                onClick={onClose}
                                className="px-6 py-2 font-oxanium text-xs font-bold tracking-widest text-[var(--text-secondary)] hover:text-white transition-colors uppercase"
                            >
                                DISCARD
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={saving || loading}
                                className="flex items-center px-8 py-2 bg-[var(--accent-red)] hover:bg-[#ff0000] text-white font-display text-lg tracking-widest uppercase transition-colors disabled:opacity-50"
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

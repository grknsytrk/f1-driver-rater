import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Save, Loader2, Zap, RotateCcw } from 'lucide-react';
import type { DriverRating } from '../types';
import { TEAM_COLORS } from '../types';
import { getSeasonDrivers } from '../api/f1Api';
import { saveQuickRatings, getQuickRatings } from '../utils/storage';

interface QuickRateModalProps {
    season: string;
    onClose: () => void;
    onSave: () => void;
}

interface DriverWithRating {
    driverId: string;
    driverName: string;
    constructorId: string;
    constructorName: string;
    rating: number;
}

export function QuickRateModal({ season, onClose, onSave }: QuickRateModalProps) {
    const [drivers, setDrivers] = useState<DriverWithRating[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [hoveredRating, setHoveredRating] = useState<{ id: string, val: number } | null>(null);

    useEffect(() => {
        loadDrivers();
    }, [season]);

    async function loadDrivers() {
        setLoading(true);
        try {
            const seasonDrivers = await getSeasonDrivers(season);
            const existingRatings = getQuickRatings(season);

            const driversWithRatings: DriverWithRating[] = seasonDrivers.map(d => {
                const existing = existingRatings?.find(r => r.driverId === d.driverId);
                return {
                    driverId: d.driverId,
                    driverName: `${d.givenName} ${d.familyName}`,
                    constructorId: d.constructorId,
                    constructorName: d.constructorName,
                    rating: existing?.rating || 0,
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
                rating: d.rating || 5,
            }));

            saveQuickRatings(season, ratings);
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
                <div className="absolute inset-0 bg-black/90 backdrop-blur-md" />

                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                    onClick={e => e.stopPropagation()}
                    className="relative w-full max-w-4xl h-[100dvh] md:h-auto md:max-h-[90vh] bg-[var(--bg-main)] border-0 md:border border-[var(--border-color)] rounded-none overflow-hidden flex flex-col shadow-2xl"
                    style={{
                        boxShadow: '0 0 100px rgba(0,0,0,0.8)'
                    }}
                >
                    {/* Header */}
                    <div className="relative p-4 md:p-6 border-b border-[var(--border-color)] bg-[var(--bg-panel)]">
                        <div className="relative flex items-center justify-between z-10">
                            <div>
                                <div className="flex items-center gap-2 mb-2">
                                    <Zap size={16} className="text-[var(--accent-yellow)]" />
                                    <span className="text-[var(--accent-yellow)] text-[10px] font-oxanium uppercase tracking-[0.2em]">
                                        Quick Rate Mode
                                    </span>
                                </div>
                                <h2 className="font-display-condensed font-bold text-4xl text-white uppercase tracking-tight leading-tight mb-1">
                                    SEASON {season} RATINGS
                                </h2>
                                <p className="font-oxanium text-sm text-[var(--text-secondary)] uppercase tracking-wider mt-1">
                                    Rate all drivers at once for the entire season
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
                                <Loader2 size={40} className="animate-spin text-[var(--accent-yellow)]" />
                                <span className="font-oxanium text-sm text-[var(--text-muted)] animate-pulse uppercase tracking-[0.2em]">Loading drivers...</span>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {drivers.map((driver, index) => {
                                    const teamColor = getTeamColor(driver.constructorId);
                                    const currentRating = driver.rating;
                                    const isHovered = hoveredRating?.id === driver.driverId;
                                    const displayRating = isHovered ? hoveredRating.val : currentRating;

                                    return (
                                        <motion.div
                                            key={driver.driverId}
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: index * 0.02 }}
                                            className="group relative bg-[var(--bg-panel)] border border-[var(--border-color)] p-4 hover:bg-[var(--bg-panel-hover)] transition-colors"
                                            style={{ borderLeftWidth: '3px', borderLeftColor: teamColor }}
                                        >
                                            {/* Driver Info */}
                                            <div className="flex items-start justify-between mb-3">
                                                <div>
                                                    <h3 className="font-display text-lg text-white truncate leading-none uppercase">
                                                        {driver.driverName}
                                                    </h3>
                                                    <p className="font-oxanium text-[10px] text-[var(--text-muted)] uppercase tracking-wide mt-1">
                                                        {driver.constructorName}
                                                    </p>
                                                </div>

                                                {/* Rating Number */}
                                                <motion.div
                                                    key={displayRating}
                                                    initial={{ scale: 0.8, opacity: 0.5 }}
                                                    animate={{ scale: 1, opacity: 1 }}
                                                    transition={{ duration: 0.1, ease: 'easeOut' }}
                                                    className="text-2xl font-bold font-oxanium tabular-nums leading-none"
                                                    style={{
                                                        color: displayRating > 8 ? '#00FF88' : displayRating > 5 ? 'var(--accent-yellow)' : displayRating > 0 ? 'var(--accent-red)' : 'var(--text-muted)',
                                                    }}>
                                                    {displayRating % 1 === 0 ? displayRating : displayRating.toFixed(1)}
                                                </motion.div>
                                            </div>

                                            {/* Rating Bar */}
                                            <div className="flex gap-[2px]" onMouseLeave={() => setHoveredRating(null)}>
                                                {[...Array(20)].map((_, i) => {
                                                    const val = (i + 1) * 0.5;
                                                    const isFilled = val <= displayRating;

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
                                                            className="flex-1 h-6 relative focus:outline-none cursor-pointer"
                                                        >
                                                            <div
                                                                className="w-full h-full rounded-sm"
                                                                style={{
                                                                    backgroundColor: segmentColor,
                                                                    transform: isFilled ? 'scaleY(1)' : 'scaleY(0.65)',
                                                                    opacity: isFilled ? 1 : 0.4,
                                                                    transition: 'all 50ms cubic-bezier(0.2, 0, 0, 1)',
                                                                }}
                                                            />
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </motion.div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="p-4 border-t border-[var(--border-color)] bg-[var(--bg-panel)] flex flex-col md:flex-row justify-between items-stretch md:items-center gap-3 md:gap-0 z-20">
                        {/* Clear All Button */}
                        <button
                            onClick={() => setDrivers(prev => prev.map(d => ({ ...d, rating: 0 })))}
                            disabled={loading}
                            className="flex items-center justify-center gap-2 px-4 py-3 md:py-2 border border-[var(--border-color)] hover:border-[var(--accent-red)] hover:bg-[var(--accent-red)]/10 text-[var(--text-muted)] hover:text-[var(--accent-red)] font-oxanium text-xs font-bold tracking-widest uppercase transition-all disabled:opacity-50"
                        >
                            <RotateCcw size={14} />
                            CLEAR ALL
                        </button>

                        <div className="flex flex-col-reverse md:flex-row items-stretch md:items-center gap-2 md:gap-4">
                            <button
                                onClick={onClose}
                                className="px-6 py-3 md:py-2 font-oxanium text-xs font-bold tracking-widest text-[var(--text-secondary)] hover:text-white transition-colors uppercase border border-[var(--border-color)] md:border-0"
                            >
                                CANCEL
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={saving || loading}
                                className="flex items-center justify-center px-8 py-3 md:py-2 bg-[var(--accent-yellow)] hover:bg-[#FFD700] text-black font-display text-lg tracking-widest uppercase transition-colors disabled:opacity-50"
                            >
                                {saving ? (
                                    <Loader2 size={16} className="animate-spin mr-2" />
                                ) : (
                                    <Save size={16} className="mr-2" />
                                )}
                                SAVE RATINGS
                            </button>
                        </div>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}

import { motion } from 'framer-motion';
import { Calendar, Trophy, ChevronRight } from 'lucide-react';
import type { Season } from '../types';
import { getRatedRacesCount } from '../utils/storage';

interface SeasonCardProps {
    season: Season;
    index: number;
    onClick: () => void;
}

// Technical Season Panel
export function SeasonCard({ season, index, onClick }: SeasonCardProps) {
    const ratedCount = getRatedRacesCount(season.season);
    const isCurrentSeason = season.season === '2025';

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
                duration: 0.3,
                delay: index * 0.1,
                ease: "circOut",
            }}
            onClick={onClick}
            className="group relative h-40 bg-[var(--bg-panel)] border border-[var(--border-color)] border-l-4 border-l-transparent hover:border-l-[var(--accent-red)] cursor-pointer overflow-hidden transition-all duration-300"
        >
            {/* Background Tech Pattern */}
            <div className="absolute inset-0 opacity-20 pointer-events-none transition-opacity group-hover:opacity-30"
                style={{
                    backgroundImage: 'linear-gradient(45deg, var(--border-color) 25%, transparent 25%, transparent 75%, var(--border-color) 75%, var(--border-color))',
                    backgroundSize: '4px 4px'
                }}
            />

            {/* Hover Glare */}
            <div className="absolute inset-0 bg-gradient-to-r from-[var(--accent-red)]/0 via-[var(--accent-red)]/0 to-[var(--accent-red)]/0 group-hover:from-[var(--accent-red)]/10 group-hover:via-transparent group-hover:to-transparent transition-all duration-500" />

            <div className="relative z-10 p-6 flex flex-col justify-between h-full">
                <div className="flex justify-between items-start">
                    <div>
                        <span className="font-oxanium text-[10px] text-[var(--accent-red)] uppercase tracking-[0.2em] mb-1 block">
                            FIA WORLD CHAMPIONSHIP
                        </span>
                        <div className="font-display text-4xl text-white leading-none tracking-tight group-hover:translate-x-2 transition-transform duration-300">
                            {season.season}
                        </div>
                    </div>

                    {isCurrentSeason && (
                        <div className="flex items-center gap-2 animate-pulse">
                            <div className="w-2 h-2 rounded-full bg-[var(--f1-red)]" />
                            <span className="font-oxanium text-[10px] text-[var(--f1-red)] font-bold tracking-widest uppercase">
                                CURRENT SEASON
                            </span>
                        </div>
                    )}
                </div>

                <div className="flex items-end justify-between border-t border-[var(--border-color)] pt-3 mt-2">
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                            <Calendar size={12} />
                            <span className="font-ui text-xs uppercase tracking-wide">OFFICIAL</span>
                        </div>
                        <div className={`flex items-center gap-2 ${ratedCount > 0 ? 'text-[var(--accent-yellow)]' : 'text-[var(--text-muted)]'}`}>
                            <Trophy size={12} />
                            <span className="font-oxanium text-xs font-bold uppercase tracking-wide">
                                {ratedCount} RACES LOGGED
                            </span>
                        </div>
                    </div>

                    <ChevronRight size={16} className="text-[var(--text-muted)] group-hover:text-[var(--accent-red)] group-hover:translate-x-1 transition-all" />
                </div>
            </div>

            {/* Corner Markers */}
            <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-[var(--text-muted)] opacity-50" />
            <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-[var(--text-muted)] opacity-50" />
        </motion.div>
    );
}

interface SeasonSelectorProps {
    seasons: Season[];
    onSelect: (season: string) => void;
    loading?: boolean;
}

export function SeasonSelector({ seasons, onSelect, loading }: SeasonSelectorProps) {
    if (loading) {
        return (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {[...Array(6)].map((_, i) => (
                    <div key={i} className="h-40 bg-[var(--bg-panel)] border border-[var(--border-color)] animate-pulse relative overflow-hidden opacity-50">
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[rgba(255,255,255,0.02)] to-transparent animate-[shimmer_2s_infinite]" />
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {seasons.map((season, index) => (
                <SeasonCard
                    key={season.season}
                    season={season}
                    index={index}
                    onClick={() => onSelect(season.season)}
                />
            ))}
        </div>
    );
}

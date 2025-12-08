import { motion } from 'framer-motion';
import { MapPin, Lock, ChevronRight, Hash, Flag } from 'lucide-react';
import type { Race } from '../types';
import { CountryFlag } from '../utils/countryFlags';
import { isRaceRated } from '../utils/storage';
import { isRaceCompleted } from '../api/f1Api';

interface RaceCardProps {
    race: Race;
    season: string;
    index: number;
    onClick: () => void;
}

function RaceCard({ race, season, index, onClick }: RaceCardProps) {
    const completed = isRaceCompleted(race.date);
    const rated = isRaceRated(season, race.round);
    const country = race.Circuit.Location.country;

    // Determine status
    let status: 'rated' | 'pending' | 'locked' = 'locked';
    if (rated) status = 'rated';
    else if (completed) status = 'pending';

    const statusConfig = {
        rated: {
            color: 'var(--accent-yellow)',
            text: 'DATA LOGGED',
            border: 'var(--accent-yellow)',
            bg: 'rgba(242, 209, 61, 0.1)',
        },
        pending: {
            color: 'var(--text-primary)',
            text: 'READY FOR INPUT',
            border: 'var(--text-muted)',
            bg: 'transparent',
        },
        locked: {
            color: 'var(--text-muted)',
            text: 'LOCKED',
            border: 'var(--text-muted)',
            bg: 'transparent',
        },
    };

    const config = statusConfig[status];
    const isClickable = status !== 'locked';

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
                duration: 0.2,
                delay: index * 0.03,
                ease: "circOut",
            }}
            whileHover={isClickable ? { x: 4, backgroundColor: 'var(--bg-panel-hover)' } : {}}
            onClick={isClickable ? onClick : undefined}
            className={`
                group relative border-b border-[var(--border-color)] p-3 md:p-4 bg-[var(--bg-panel)]
                ${isClickable ? 'cursor-pointer hover:bg-[var(--bg-panel-hover)]' : 'opacity-50 cursor-not-allowed bg-[var(--bg-darker)]'}
                transition-all duration-200
                flex flex-col md:grid gap-2 md:gap-4
            `}
            style={{
                gridTemplateColumns: '60px 1fr 90px 100px 160px 24px',
                alignItems: 'center',
                borderLeft: isClickable ? '4px solid transparent' : '1px solid var(--border-color)'
            }}
        >
            {isClickable && <div className="absolute left-[-4px] top-0 bottom-0 w-1 bg-[var(--accent-red)] opacity-0 group-hover:opacity-100 transition-opacity" />}

            {/* Mobile: Top Row with Round + Race Info */}
            <div className="flex items-start gap-3 md:contents">
                {/* Round Number - Fixed width on mobile, better centered */}
                <div className="w-8 md:w-auto pt-1 md:pt-0 flex flex-col items-center justify-start md:justify-center md:border-r border-[var(--border-color)] md:pr-4 md:h-full flex-shrink-0">
                    <span className="font-oxanium text-[10px] text-[var(--text-muted)] tracking-wider hidden md:block">RND</span>
                    <span className="font-display text-lg md:text-3xl text-white leading-none text-center block w-full">{race.round.padStart(2, '0')}</span>
                </div>

                {/* Race Name & Circuit */}
                <div className="flex flex-col gap-2 min-w-0 flex-1">
                    <div className="flex items-center gap-2 md:gap-4">
                        <CountryFlag country={country} size="md" />
                        <div className="min-w-0 flex-1">
                            <h3 className="font-display text-sm md:text-2xl text-white truncate leading-none uppercase tracking-tight group-hover:text-[var(--accent-red)] transition-colors">
                                {race.raceName.replace(' Grand Prix', ' GP')}
                            </h3>
                            <div className="flex items-center gap-1 md:gap-2 text-[10px] md:text-xs font-oxanium text-[var(--text-secondary)] uppercase tracking-wide mt-1">
                                <MapPin size={8} className="flex-shrink-0 md:w-[10px] md:h-[10px]" />
                                <span className="truncate">{race.Circuit.circuitName}</span>
                            </div>
                        </div>
                    </div>

                    {/* Mobile: Bottom Row with Date + Status - INSIDE the flex item to align with content */}
                    <div className="flex md:hidden items-center justify-between gap-2 text-xs border-t border-[var(--border-color)]/30 pt-2 mt-1">
                        <span className="font-oxanium text-[var(--text-secondary)] uppercase text-[10px] tracking-wide">
                            {new Date(race.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }).toUpperCase()}
                        </span>
                        <div
                            className="flex items-center gap-1.5 px-2 py-0.5 border font-oxanium text-[9px] uppercase tracking-wider rounded-sm"
                            style={{
                                borderColor: config.border,
                                backgroundColor: config.bg,
                                color: config.color,
                            }}
                        >
                            {status === 'rated' ? (
                                <div className="w-1.5 h-1.5 bg-[var(--accent-yellow)] rounded-full" />
                            ) : status === 'pending' ? (
                                <Flag size={8} className="text-[var(--accent-yellow)]" />
                            ) : (
                                <Lock size={8} />
                            )}
                            <span>{status === 'rated' ? 'RATED' : status === 'pending' ? 'READY' : 'LOCKED'}</span>
                        </div>
                    </div>
                </div>

                {/* Mobile chevron */}
                <div className="flex md:hidden items-center justify-center flex-shrink-0 self-center">
                    {isClickable ? (
                        <ChevronRight
                            size={18}
                            className="text-[var(--text-muted)] group-hover:text-[var(--accent-red)] transition-colors"
                        />
                    ) : (
                        <Lock size={14} className="text-[var(--text-muted)]" />
                    )}
                </div>
            </div>

            {/* DATE - Fixed width column */}
            <div className="hidden md:flex flex-col">
                <span className="text-[10px] text-[var(--text-muted)] font-oxanium uppercase">DATE</span>
                <span className="text-sm text-white font-oxanium uppercase whitespace-nowrap">
                    {new Date(race.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }).toUpperCase()}
                </span>
            </div>

            {/* TIME - Fixed width column */}
            <div className="hidden md:flex flex-col">
                <span className="text-[10px] text-[var(--text-muted)] font-oxanium uppercase">TIME</span>
                <span className="text-sm text-white font-oxanium uppercase whitespace-nowrap">
                    {race.time?.substring(0, 5) || '--:--'} UTC
                </span>
            </div>

            {/* Telemetry Status - Fixed width cell */}
            <div className={`
                hidden sm:flex items-center justify-center gap-2 px-3 py-1 border w-full
                font-oxanium text-[10px] uppercase tracking-widest
            `}
                style={{
                    borderColor: config.border,
                    backgroundColor: config.bg,
                    color: config.color,
                }}
            >
                {status === 'rated' ? (
                    <div className="w-1.5 h-1.5 bg-[var(--accent-yellow)] rounded-full flex-shrink-0" />
                ) : status === 'pending' ? (
                    <Flag size={10} className="text-[var(--accent-yellow)] flex-shrink-0" />
                ) : (
                    <Lock size={10} className="flex-shrink-0" />
                )}
                <span className="whitespace-nowrap">{config.text}</span>
            </div>

            {/* Chevron - Fixed width cell (Desktop only) */}
            <div className="hidden md:flex items-center justify-center">
                {isClickable ? (
                    <ChevronRight
                        size={20}
                        className="text-[var(--text-muted)] group-hover:text-[var(--accent-red)] transition-colors"
                    />
                ) : (
                    <div className="w-5" />
                )}
            </div>
        </motion.div>
    );
}

interface RaceListProps {
    races: Race[];
    season: string;
    onSelectRace: (race: Race) => void;
    loading?: boolean;
}

export function RaceList({ races, season, onSelectRace, loading }: RaceListProps) {
    if (loading) {
        return (
            <div className="space-y-1">
                {[...Array(10)].map((_, i) => (
                    <div key={i} className="h-20 border-b border-[var(--border-color)] bg-[var(--bg-panel)] opacity-50 flex items-center p-4 gap-4">
                        <div className="w-12 h-12 bg-[var(--bg-darker)] animate-pulse" />
                        <div className="flex-1 space-y-2">
                            <div className="h-4 w-1/3 bg-[var(--bg-darker)] animate-pulse" />
                            <div className="h-3 w-1/4 bg-[var(--bg-darker)] animate-pulse" />
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    // Calculate progress
    const ratedCount = races.filter(r => isRaceRated(season, r.round)).length;
    const completedCount = races.filter(r => isRaceCompleted(r.date)).length;

    return (
        <div className="border border-[var(--border-color)] bg-[var(--bg-main)]">
            {/* Header */}
            <div className="p-3 bg-[var(--bg-panel)] border-b border-[var(--border-color)] flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Hash size={14} className="text-[var(--accent-red)]" />
                    <span className="font-oxanium text-xs font-bold uppercase tracking-widest text-white">{season} Season</span>
                </div>

                {/* Progress */}
                <div className="hidden sm:flex items-center gap-4">
                    <span className="font-oxanium text-[10px] text-[var(--text-muted)]">Rated: <span className="text-white">{ratedCount}/{completedCount}</span></span>
                    <div className="w-32 h-1 bg-[var(--bg-darker)] relative">
                        <div
                            className="absolute top-0 left-0 h-full bg-[var(--accent-red)]"
                            style={{ width: `${(ratedCount / (completedCount || 1)) * 100}%` }}
                        />
                    </div>
                </div>
            </div>

            {/* List */}
            <div className="divide-y divide-[var(--border-color)]">
                {races.map((race, index) => (
                    <RaceCard
                        key={race.round}
                        race={race}
                        season={season}
                        index={index}
                        onClick={() => onSelectRace(race)}
                    />
                ))}
            </div>
        </div>
    );
}

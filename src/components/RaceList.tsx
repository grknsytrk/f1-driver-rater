import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, Lock, ChevronRight, Hash, Flag, ChevronsUp } from 'lucide-react';
import type { Race } from '../types';
import { CountryFlag } from '../utils/countryFlags';
import { isRaceRated } from '../utils/storage';
import { isRaceCompleted } from '../api/f1Api';
import { RaceListSkeleton } from './Skeleton';

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

    // Format date for display
    const raceDate = new Date(race.date);
    const dateStr = raceDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }).toUpperCase();

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
                group relative border-b border-[var(--border-color)] p-3 sm:p-4 bg-[var(--bg-panel)]
                ${isClickable ? 'cursor-pointer hover:bg-[var(--bg-panel-hover)]' : 'opacity-50 cursor-not-allowed bg-[var(--bg-darker)]'}
                transition-all duration-200
            `}
        >
            {isClickable && <div className="absolute left-0 top-0 bottom-0 w-1 bg-[var(--accent-red)] opacity-0 group-hover:opacity-100 transition-opacity" />}

            {/* Mobile Layout */}
            <div className="flex sm:hidden items-center gap-3">
                {/* Round Number */}
                <div className="flex flex-col items-center justify-center border-r border-[var(--border-color)] pr-3 min-w-[50px]">
                    <span className="font-oxanium text-[9px] text-[var(--text-muted)] tracking-wider">RND</span>
                    <span className="font-display text-2xl text-white leading-none">{race.round.padStart(2, '0')}</span>
                </div>

                {/* Flag */}
                <CountryFlag country={country} size="sm" />

                {/* Race Info */}
                <div className="flex-1 min-w-0">
                    <h3 className="font-display text-base text-white truncate leading-tight uppercase tracking-tight">
                        {race.raceName.replace(' Grand Prix', ' GP')}
                    </h3>
                    <div className="flex items-center gap-2 text-[10px] font-oxanium text-[var(--text-secondary)] uppercase">
                        <span className="truncate">{dateStr}</span>
                        <span className="text-[var(--text-muted)]">•</span>
                        <span
                            className="truncate"
                            style={{ color: config.color }}
                        >
                            {status === 'rated' ? '✓ RATED' : status === 'pending' ? 'READY' : 'LOCKED'}
                        </span>
                    </div>
                </div>

                {/* Chevron */}
                {isClickable && (
                    <ChevronRight
                        size={18}
                        className="text-[var(--text-muted)] group-hover:text-[var(--accent-red)] transition-colors flex-shrink-0"
                    />
                )}
            </div>

            {/* Desktop Layout */}
            <div
                className="hidden sm:grid items-center gap-4"
                style={{
                    gridTemplateColumns: '60px 1fr 90px 100px 160px 24px',
                }}
            >
                {/* Round Number */}
                <div className="flex flex-col items-center justify-center border-r border-[var(--border-color)] pr-4 h-full">
                    <span className="font-oxanium text-[10px] text-[var(--text-muted)] tracking-wider">RND</span>
                    <span className="font-display text-3xl text-white leading-none">{race.round.padStart(2, '0')}</span>
                </div>

                {/* Race Name & Circuit */}
                <div className="flex items-center gap-4 min-w-0">
                    <CountryFlag country={country} size="md" />
                    <div className="min-w-0">
                        <h3 className="font-display text-2xl text-white truncate leading-none uppercase tracking-tight group-hover:text-[var(--accent-red)] transition-colors">
                            {race.raceName.replace(' Grand Prix', ' GP')}
                        </h3>
                        <div className="flex items-center gap-2 text-xs font-oxanium text-[var(--text-secondary)] uppercase tracking-wide">
                            <MapPin size={10} />
                            <span className="truncate">{race.Circuit.circuitName}</span>
                        </div>
                    </div>
                </div>

                {/* DATE - Fixed width column */}
                <div className="hidden md:flex flex-col">
                    <span className="text-[10px] text-[var(--text-muted)] font-oxanium uppercase">DATE</span>
                    <span className="text-sm text-white font-oxanium uppercase whitespace-nowrap">
                        {dateStr}
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
                    flex items-center justify-center gap-2 px-3 py-1 border w-full
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

                {/* Chevron - Fixed width cell */}
                <div className="flex items-center justify-center">
                    {isClickable ? (
                        <ChevronRight
                            size={20}
                            className="text-[var(--text-muted)] group-hover:text-[var(--accent-red)] transition-colors"
                        />
                    ) : (
                        <div className="w-5" />
                    )}
                </div>
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
        return <RaceListSkeleton count={10} />;
    }

    // Calculate progress
    const ratedCount = races.filter(r => isRaceRated(season, r.round)).length;
    const completedCount = races.filter(r => isRaceCompleted(r.date)).length;

    const [showScrollTop, setShowScrollTop] = useState(false);
    const isScrollingToTop = useRef(false);

    // Track scroll position to show/hide "Top" button
    useEffect(() => {
        const handleScroll = () => {
            const scrolledDistance = window.scrollY;
            const threshold = 500;

            // If we are programmatically scrolling to top, don't show the button
            // untill we reach the top (reset logic handled below)
            if (isScrollingToTop.current) {
                if (scrolledDistance < 50) {
                    isScrollingToTop.current = false;
                }
                return;
            }

            // Show if scrolled down significantly
            setShowScrollTop(scrolledDistance > threshold);
        };

        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

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

            {/* F1 Style Scroll to Top Button */}
            <AnimatePresence>
                {showScrollTop && (
                    <motion.button
                        initial={{ opacity: 0, y: 50, x: 20 }}
                        animate={{ opacity: 1, y: 0, x: 0 }}
                        exit={{ opacity: 0, y: 50, x: 20 }}
                        whileHover={{ scale: 1.1, x: -5 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={() => {
                            isScrollingToTop.current = true; // Prevent button from reappearing while scrolling up
                            setShowScrollTop(false);
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                        className="fixed bottom-8 right-8 z-50 group flex items-center justify-center w-12 h-12 bg-[var(--accent-red)] border border-white/20 shadow-[0_4px_20px_rgba(225,6,0,0.4)] backdrop-blur-sm -skew-x-12 hover:bg-[#ff0000] transition-colors"
                    >
                        <div className="skew-x-12">
                            <ChevronsUp size={28} className="text-white animate-bounce-custom" />
                        </div>

                        {/* Decorative corner accent */}
                        <div className="absolute -top-1 -right-1 w-2 h-2 bg-white skew-x-12 opacity-50" />
                        <div className="absolute -bottom-1 -left-1 w-2 h-2 bg-[var(--bg-darker)] skew-x-12 opacity-50" />
                    </motion.button>
                )}
            </AnimatePresence>
        </div>
    );
}

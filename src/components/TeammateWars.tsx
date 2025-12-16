import { useState, useEffect } from 'react';
import { motion, AnimatePresence, useAnimation } from 'framer-motion';
import { Swords, RotateCcw, Flag, Timer, Loader2 } from 'lucide-react';
import { calculateAverages } from '../utils/storage';
import { getAllSeasonResults, getAllSeasonQualifying, getConstructorStandings, getDriverStandings } from '../api/f1Api';
import type { SeasonRaceResult, SeasonQualifyingResult, ConstructorStanding } from '../api/f1Api';
import { RateLimitError } from '../api/f1Api';
import { TEAM_COLORS } from '../types';

interface TeammateWarsProps {
    season: string;
    onBack: () => void;
}

interface H2HStats {
    raceWinsA: number;
    raceWinsB: number;
    qualiWinsA: number;
    qualiWinsB: number;
    totalRaces: number;
    totalQualis: number;
}

// Unified driver entry - rating is optional (null if unrated)
interface TeamDriver {
    driverId: string;
    driverName: string;
    constructorId: string;
    constructorName: string;
    averageRating: number | null;
    totalRaces: number;
}

export function TeammateWars({ season }: TeammateWarsProps) {
    const averages = calculateAverages(season);

    const [selections, setSelections] = useState<Record<string, [number, number]>>({});
    const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null);

    // API data
    const [raceResults, setRaceResults] = useState<SeasonRaceResult[]>([]);
    const [qualiResults, setQualiResults] = useState<SeasonQualifyingResult[]>([]);
    const [constructorStandings, setConstructorStandings] = useState<ConstructorStanding[]>([]);
    const [driverStandings, setDriverStandings] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [dataLoaded, setDataLoaded] = useState(false);
    const [raceStatus, setRaceStatus] = useState<'idle' | 'ok' | 'rate_limited' | 'error'>('idle');
    const [qualiStatus, setQualiStatus] = useState<'idle' | 'ok' | 'rate_limited' | 'error'>('idle');
    const [, setWccStatus] = useState<'idle' | 'ok' | 'rate_limited' | 'error'>('idle');
    const [, setWdcStatus] = useState<'idle' | 'ok' | 'rate_limited' | 'error'>('idle');

    // Fetch race and qualifying results when component mounts
    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            setRaceStatus('idle');
            setQualiStatus('idle');
            setWccStatus('idle');
            setWdcStatus('idle');
            try {
                const [raceRes, qualiRes, wccRes, wdcRes] = await Promise.allSettled([
                    getAllSeasonResults(season),
                    getAllSeasonQualifying(season),
                    getConstructorStandings(season),
                    getDriverStandings(season),
                ]);

                if (raceRes.status === 'fulfilled') {
                    setRaceResults(raceRes.value);
                    setRaceStatus('ok');
                } else {
                    setRaceResults([]);
                    setRaceStatus(raceRes.reason instanceof RateLimitError ? 'rate_limited' : 'error');
                }

                if (qualiRes.status === 'fulfilled') {
                    setQualiResults(qualiRes.value);
                    setQualiStatus('ok');
                } else {
                    setQualiResults([]);
                    setQualiStatus(qualiRes.reason instanceof RateLimitError ? 'rate_limited' : 'error');
                }

                if (wccRes.status === 'fulfilled') {
                    setConstructorStandings(wccRes.value);
                    setWccStatus('ok');
                } else {
                    setConstructorStandings([]);
                    setWccStatus(wccRes.reason instanceof RateLimitError ? 'rate_limited' : 'error');
                }

                if (wdcRes.status === 'fulfilled') {
                    setDriverStandings(wdcRes.value);
                    setWdcStatus('ok');
                } else {
                    setDriverStandings([]);
                    setWdcStatus(wdcRes.reason instanceof RateLimitError ? 'rate_limited' : 'error');
                }

                // Consider "loaded" if either dataset is available (so the panel can render placeholders)
                setDataLoaded(true);
            } catch (error) {
                console.error('Error fetching H2H data:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [season]);

    // Calculate H2H stats for two drivers
    const calculateH2H = (driverAId: string, driverBId: string, constructorId: string): H2HStats => {
        let raceWinsA = 0, raceWinsB = 0;
        let qualiWinsA = 0, qualiWinsB = 0;
        let totalRaces = 0, totalQualis = 0;

        // Get unique rounds where both drivers competed for this team
        const rounds = new Set<string>();
        raceResults.forEach(r => {
            if (r.constructorId === constructorId && (r.driverId === driverAId || r.driverId === driverBId)) {
                rounds.add(r.round);
            }
        });

        rounds.forEach(round => {
            // Race H2H - only count when BOTH finished (not DNF/DSQ)
            const raceA = raceResults.find(r => r.round === round && r.driverId === driverAId && r.constructorId === constructorId);
            const raceB = raceResults.find(r => r.round === round && r.driverId === driverBId && r.constructorId === constructorId);

            if (raceA?.position && raceB?.position) {
                totalRaces++;
                if (raceA.position < raceB.position) raceWinsA++;
                else if (raceB.position < raceA.position) raceWinsB++;
            }

            // Quali H2H
            const qualiA = qualiResults.find(q => q.round === round && q.driverId === driverAId && q.constructorId === constructorId);
            const qualiB = qualiResults.find(q => q.round === round && q.driverId === driverBId && q.constructorId === constructorId);

            if (qualiA && qualiB) {
                totalQualis++;
                if (qualiA.position < qualiB.position) qualiWinsA++;
                else if (qualiB.position < qualiA.position) qualiWinsB++;
            }
        });

        return { raceWinsA, raceWinsB, qualiWinsA, qualiWinsB, totalRaces, totalQualis };
    };

    // Build roster from API results (includes all drivers who participated in the season)
    // Then merge with averages for scores
    const teams: Record<string, TeamDriver[]> = {};

    // Step 1: Build roster from race results (primary source for all season drivers)
    const rosterFromApi = new Map<string, TeamDriver>(); // key: driverId_constructorId
    
    raceResults.forEach(r => {
        const key = `${r.driverId}_${r.constructorId}`;
        if (!rosterFromApi.has(key)) {
            rosterFromApi.set(key, {
                driverId: r.driverId,
                driverName: r.driverName,
                constructorId: r.constructorId,
                constructorName: r.constructorName,
                averageRating: null, // Will be filled from averages
                totalRaces: 0,
            });
        }
        // Count races for sorting
        const entry = rosterFromApi.get(key)!;
        entry.totalRaces++;
    });

    // Fallback: also include drivers from qualifying if race data is empty
    if (rosterFromApi.size === 0) {
        qualiResults.forEach(q => {
            const key = `${q.driverId}_${q.constructorId}`;
            if (!rosterFromApi.has(key)) {
                rosterFromApi.set(key, {
                    driverId: q.driverId,
                    driverName: q.driverName,
                    constructorId: q.constructorId,
                    constructorName: q.constructorName,
                    averageRating: null,
                    totalRaces: 0,
                });
            }
        });
    }

    // Step 2: Merge with averages to add scores for rated drivers
    const averagesMap = new Map<string, number>(); // key: driverId_constructorId -> averageRating
    averages.forEach(avg => {
        const key = `${avg.driverId}_${avg.constructorId}`;
        averagesMap.set(key, avg.averageRating);
    });

    rosterFromApi.forEach((driver, key) => {
        const score = averagesMap.get(key);
        if (score !== undefined) {
            driver.averageRating = score;
        }
    });

    // Step 3: Group into teams
    rosterFromApi.forEach(driver => {
        if (!teams[driver.constructorId]) {
            teams[driver.constructorId] = [];
        }
        teams[driver.constructorId].push(driver);
    });

    // Fallback: If no API data, use averages only (original behavior)
    if (rosterFromApi.size === 0) {
        averages.forEach(driver => {
            if (!teams[driver.constructorId]) {
                teams[driver.constructorId] = [];
            }
            teams[driver.constructorId].push({
                driverId: driver.driverId,
                driverName: driver.driverName,
                constructorId: driver.constructorId,
                constructorName: driver.constructorName,
                averageRating: driver.averageRating,
                totalRaces: driver.totalRaces,
            });
        });
    }

    const cycleDriver = (teamId: string, slot: 0 | 1, totalDrivers: number) => {
        setSelections(prev => {
            const current = prev[teamId] || [0, 1];
            const otherSlot = slot === 0 ? 1 : 0;
            const otherIndex = current[otherSlot];
            let nextIndex = (current[slot] + 1) % totalDrivers;
            if (nextIndex === otherIndex) {
                nextIndex = (nextIndex + 1) % totalDrivers;
            }
            const newSelection = [...current] as [number, number];
            newSelection[slot] = nextIndex;
            return { ...prev, [teamId]: newSelection };
        });
    };

    const standingsByConstructorId = constructorStandings.reduce<Record<string, ConstructorStanding>>((acc, s) => {
        acc[s.constructorId] = s;
        return acc;
    }, {});

    const standingsByDriverId = driverStandings.reduce<Record<string, any>>((acc, s) => {
        acc[s.Driver.driverId] = s;
        return acc;
    }, {});

    const sortedTeamIds = Object.keys(teams)
        .filter(id => teams[id].length >= 2)
        .sort((a, b) => {
            // Primary: WCC position (lower is better). If WCC data is missing, fall back.
            const posA = standingsByConstructorId[a]?.position ?? Number.POSITIVE_INFINITY;
            const posB = standingsByConstructorId[b]?.position ?? Number.POSITIVE_INFINITY;
            if (posA !== posB) return posA - posB;

            // Secondary: WCC points (higher is better)
            const ptsA = standingsByConstructorId[a]?.points ?? Number.NEGATIVE_INFINITY;
            const ptsB = standingsByConstructorId[b]?.points ?? Number.NEGATIVE_INFINITY;
            if (ptsA !== ptsB) return ptsB - ptsA;

            // Fallback: previous behavior (max rating, treating null as -Infinity)
            const maxA = Math.max(...teams[a].map(d => d.averageRating ?? -Infinity));
            const maxB = Math.max(...teams[b].map(d => d.averageRating ?? -Infinity));
            if (maxA !== maxB) return maxB - maxA;

            // Last resort: stable-ish tie-breaker
            return a.localeCompare(b);
        });

    // Show loading state while fetching data
    if (loading && sortedTeamIds.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[50vh] text-center p-8">
                <Loader2 size={48} className="text-[var(--accent-red)] mb-4 animate-spin" />
                <h3 className="font-display text-2xl text-white uppercase mb-2">LOADING BATTLES</h3>
                <p className="font-oxanium text-[var(--text-secondary)]">
                    Fetching season data...
                </p>
            </div>
        );
    }

    if (sortedTeamIds.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[50vh] text-center p-8">
                <Swords size={48} className="text-[var(--text-muted)] mb-4 opacity-50" />
                <h3 className="font-display text-2xl text-white uppercase mb-2">NO BATTLES YET</h3>
                <p className="font-oxanium text-[var(--text-secondary)]">
                    No team data available for this season.
                </p>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto px-4 py-8">
            {/* Header */}
            <div className="mb-12 text-center">
                <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="inline-flex items-center justify-center gap-3 mb-4"
                >
                    <Swords size={32} className="text-[var(--accent-red)]" />
                    <h2 className="font-display text-4xl md:text-6xl text-white uppercase tracking-tight">
                        TEAMMATE <span className="text-[var(--accent-red)]">WARS</span>
                    </h2>
                    <Swords size={32} className="text-[var(--accent-red)] scale-x-[-1]" />
                </motion.div>
                <div className="h-1 w-24 bg-[var(--accent-red)] mx-auto" />
                {loading && (
                    <div className="mt-4 flex items-center justify-center gap-2 text-[var(--text-muted)]">
                        <Loader2 size={14} className="animate-spin" />
                        <span className="font-oxanium text-xs uppercase">Loading H2H data...</span>
                    </div>
                )}
            </div>

            {/* Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {sortedTeamIds.map((teamId) => {
                    const allTeamDrivers = teams[teamId]
                        .sort((a, b) => {
                            // Prioritize drivers with more races, then by rating (null = lowest)
                            if (Math.abs(b.totalRaces - a.totalRaces) > 3) return b.totalRaces - a.totalRaces;
                            const ratingA = a.averageRating ?? -Infinity;
                            const ratingB = b.averageRating ?? -Infinity;
                            return ratingB - ratingA;
                        });

                    const [indexA, indexB] = selections[teamId] || [0, 1];
                    const driverA = allTeamDrivers[indexA];
                    const driverB = allTeamDrivers[indexB];

                    const teamColor = TEAM_COLORS[teamId] || '#666';
                    const teamName = driverA.constructorName;
                    const hasMoreDrivers = allTeamDrivers.length > 2;
                    const wccStats = standingsByConstructorId[teamId];

                    // Handle null ratings for display
                    const scoreA = driverA.averageRating;
                    const scoreB = driverB.averageRating;
                    const bothHaveScores = scoreA !== null && scoreB !== null;
                    const diff = bothHaveScores ? Math.abs(scoreA - scoreB) : null;

                    // Calculate real H2H
                    const h2h = dataLoaded ? calculateH2H(driverA.driverId, driverB.driverId, teamId) : null;
                    const showRaceH2H = raceStatus === 'ok' && (h2h?.totalRaces ?? 0) > 0;
                    const showQualiH2H = qualiStatus === 'ok' && (h2h?.totalQualis ?? 0) > 0;

                    const qualiFooter =
                        qualiStatus === 'rate_limited'
                            ? 'Qualifying data unavailable (API limit 429)'
                            : qualiStatus === 'error'
                                ? 'Qualifying data unavailable'
                                : 'No qualifying data';

                    const raceFooter =
                        raceStatus === 'rate_limited'
                            ? 'Race data unavailable (API limit 429)'
                            : raceStatus === 'error'
                                ? 'Race data unavailable'
                                : 'No race data';

                    return (
                        <motion.div
                            key={teamId}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            whileHover={{
                                scale: expandedTeamId === teamId ? 1 : 1.02,
                                boxShadow: `0 0 20px ${teamColor}33`,
                                borderColor: teamColor
                            }}
                            transition={{ duration: 0.3 }}
                            onClick={() => setExpandedTeamId(expandedTeamId === teamId ? null : teamId)}
                            className="bg-[var(--bg-panel)] border border-[var(--border-color)] overflow-visible group transition-all cursor-pointer relative"
                        >
                            {/* Team Header */}
                            <div className="h-1 w-full" style={{ backgroundColor: teamColor }} />
                            <div className="px-3 md:px-4 py-2 border-b border-[var(--border-color)] flex justify-between items-center gap-2 bg-[var(--bg-darker)] relative">
                                {/* HUD Background Mesh */}
                                <div className="absolute inset-0 opacity-10 pointer-events-none" 
                                    style={{ backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 2px, #fff 2px, #fff 3px)' }} 
                                />
                                
                                <div className="flex items-center gap-2 z-10 min-w-0">
                                    <span className="font-display text-sm md:text-lg text-white uppercase tracking-wider truncate">{teamName}</span>
                                    {hasMoreDrivers && (
                                        <div className="flex items-center gap-1 group/tooltip relative cursor-help flex-shrink-0">
                                            <span className="flex h-2 w-2 relative">
                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--accent-yellow)] opacity-75"></span>
                                                <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--accent-yellow)]"></span>
                                            </span>
                                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 opacity-0 group-hover/tooltip:opacity-100 transition-all duration-200 pointer-events-none z-[100] translate-y-2 group-hover/tooltip:translate-y-0">
                                                <div className="bg-[var(--bg-darker)] border border-[var(--accent-yellow)] px-3 py-2 whitespace-nowrap shadow-lg shadow-black/50">
                                                    <div className="flex items-center gap-2">
                                                        <RotateCcw size={10} className="text-[var(--accent-yellow)]" />
                                                        <span className="font-oxanium text-[10px] text-white uppercase tracking-wider">
                                                            Multi-Driver Team
                                                        </span>
                                                    </div>
                                                    <p className="font-oxanium text-[9px] text-[var(--text-muted)] mt-1">
                                                        Click arrows to swap drivers
                                                    </p>
                                                </div>
                                                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-[var(--bg-darker)] border-r border-b border-[var(--accent-yellow)] rotate-45"></div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                                
                                <div className="flex items-center gap-2 md:gap-3 z-10 flex-shrink-0">
                                    {/* WCC HUD Badge - Desktop */}
                                    {wccStats && (
                                        <div className="hidden md:flex items-center -skew-x-12 border border-[var(--border-color)] bg-black/40 backdrop-blur-sm whitespace-nowrap">
                                            {/* POS */}
                                            <div className="px-2 py-0.5 bg-[var(--bg-panel)] border-r border-[var(--border-color)] flex items-center justify-center">
                                                <span className="font-oxanium text-[9px] text-[var(--text-muted)] uppercase skew-x-12">POS</span>
                                            </div>
                                            <div className="px-2 py-0.5 flex items-center justify-center">
                                                <span className="font-display-condensed text-sm text-white leading-none skew-x-12 whitespace-nowrap">
                                                    {wccStats.position}
                                                </span>
                                            </div>
                                            
                                            {/* PTS */}
                                            <div className="px-2 py-0.5 bg-[var(--bg-panel)] border-l border-r border-[var(--border-color)] flex items-center justify-center">
                                                <span className="font-oxanium text-[9px] text-[var(--text-muted)] uppercase skew-x-12">PTS</span>
                                            </div>
                                            <div className="px-2 py-0.5 flex items-center justify-center" style={{ boxShadow: `inset 0 -2px 0 ${teamColor}` }}>
                                                <span className="font-display-condensed text-sm text-white leading-none skew-x-12 whitespace-nowrap">
                                                    {wccStats.points}
                                                </span>
                                            </div>
                                        </div>
                                    )}

                                    {/* WCC Badge - Mobile (single line) */}
                                    {wccStats && (
                                        <div 
                                            className="md:hidden flex items-center gap-1.5 px-2 py-0.5 bg-black/40 border-l-2 whitespace-nowrap"
                                            style={{ borderLeftColor: teamColor }}
                                        >
                                            <span className="font-oxanium text-[10px] text-[var(--text-muted)] uppercase">P{wccStats.position}</span>
                                            <span className="font-oxanium text-[10px] text-[var(--text-muted)]">•</span>
                                            <span className="font-display-condensed text-xs text-white">{wccStats.points}</span>
                                        </div>
                                    )}

                                    <span className="font-oxanium text-[10px] md:text-xs text-[var(--text-muted)] uppercase whitespace-nowrap">
                                        {diff !== null ? `+${diff.toFixed(2)}` : '—'}
                                    </span>
                                </div>
                            </div>

                            {/* Battle Arena */}
                            <div className="p-6 flex items-center justify-between gap-4 relative">
                                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[100px] font-display text-white/[0.02] pointer-events-none select-none">VS</div>

                                {/* Driver A */}
                                <div className="flex-1 flex flex-col items-center text-center relative">
                                    {hasMoreDrivers && (
                                        <SwapButton
                                            onClick={(e) => { e.stopPropagation(); cycleDriver(teamId, 0, allTeamDrivers.length); }}
                                            className="absolute -top-3 -left-3 p-2 rounded-full bg-[var(--bg-darker)] border border-[var(--border-color)] hover:border-[var(--accent-yellow)] hover:bg-[var(--accent-yellow)]/10 text-[var(--text-muted)] hover:text-[var(--accent-yellow)] transition-colors z-20 shadow-lg"
                                        />
                                    )}
                                    <div className="mb-2 min-h-[40px] flex items-end justify-center">
                                        <AnimatePresence mode="wait">
                                            <motion.span
                                                key={driverA.driverId}
                                                initial={{ opacity: 0, y: -10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, y: 10 }}
                                                className={`font-oxanium text-2xl md:text-4xl font-bold inline-block ${
                                                    scoreA === null ? 'text-[var(--text-muted)]' :
                                                    bothHaveScores && scoreA > scoreB! ? 'text-white' : 'text-[var(--text-muted)]'
                                                }`}
                                            >
                                                {scoreA !== null ? scoreA.toFixed(2) : '—'}
                                            </motion.span>
                                        </AnimatePresence>
                                    </div>
                                    <div className={`font-display text-xl leading-none uppercase mb-1 ${
                                        standingsByDriverId[driverA.driverId]?.position === "1"
                                            ? 'text-[var(--accent-yellow)] opacity-75'
                                            : ''
                                    }`}>
                                        {driverA.driverName.split(' ')[1]}
                                    </div>
                                    <div className="font-oxanium text-[10px] text-[var(--text-muted)] uppercase">{driverA.driverName.split(' ')[0]}</div>
                                </div>

                                {/* Progress Bar */}
                                <div className="h-16 w-1 bg-[var(--border-color)] relative rounded-full overflow-hidden">
                                    <motion.div
                                        initial={{ height: '50%' }}
                                        animate={{ 
                                            height: bothHaveScores 
                                                ? `${(scoreA! / (scoreA! + scoreB!)) * 100}%` 
                                                : '50%' 
                                        }}
                                        className="w-full absolute top-0 bg-white"
                                    />
                                </div>

                                {/* Driver B */}
                                <div className="flex-1 flex flex-col items-center text-center relative">
                                    {hasMoreDrivers && (
                                        <SwapButton
                                            onClick={(e) => { e.stopPropagation(); cycleDriver(teamId, 1, allTeamDrivers.length); }}
                                            className="absolute -top-3 -right-3 p-2 rounded-full bg-[var(--bg-darker)] border border-[var(--border-color)] hover:border-[var(--accent-yellow)] hover:bg-[var(--accent-yellow)]/10 text-[var(--text-muted)] hover:text-[var(--accent-yellow)] transition-colors z-20 shadow-lg"
                                        />
                                    )}
                                    <div className="mb-2 min-h-[40px] flex items-end justify-center">
                                        <AnimatePresence mode="wait">
                                            <motion.span
                                                key={driverB.driverId}
                                                initial={{ opacity: 0, y: -10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, y: 10 }}
                                                className={`font-oxanium text-2xl md:text-4xl font-bold inline-block ${
                                                    scoreB === null ? 'text-[var(--text-muted)]' :
                                                    bothHaveScores && scoreB > scoreA! ? 'text-white' : 'text-[var(--text-muted)]'
                                                }`}
                                            >
                                                {scoreB !== null ? scoreB.toFixed(2) : '—'}
                                            </motion.span>
                                        </AnimatePresence>
                                    </div>
                                    <div className={`font-display text-xl leading-none uppercase mb-1 ${
                                        standingsByDriverId[driverB.driverId]?.position === "1"
                                            ? 'text-[var(--accent-yellow)] opacity-75'
                                            : ''
                                    }`}>
                                        {driverB.driverName.split(' ')[1]}
                                    </div>
                                    <div className="font-oxanium text-[10px] text-[var(--text-muted)] uppercase">{driverB.driverName.split(' ')[0]}</div>
                                </div>
                            </div>

                            {/* Expanded H2H Stats */}
                            <AnimatePresence>
                                {expandedTeamId === teamId && (
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: 'auto', opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        className="overflow-hidden border-t border-[var(--border-color)] bg-[var(--bg-darker)]"
                                    >
                                        {h2h ? (
                                            <div className="p-4 grid grid-cols-2 gap-4">
                                                {/* Race H2H */}
                                                <div className="flex flex-col items-center p-3 bg-black/20 rounded">
                                                    <div className="flex items-center gap-2 mb-3">
                                                        <Flag size={12} className="text-[var(--text-muted)]" />
                                                        <span className="font-oxanium text-[10px] text-[var(--text-muted)] uppercase tracking-widest">Race H2H</span>
                                                    </div>
                                                    <div className="flex items-center gap-4">
                                                        <span className={`font-display text-3xl ${showRaceH2H && h2h.raceWinsA > h2h.raceWinsB ? 'text-[var(--accent-yellow)]' : showRaceH2H ? 'text-white' : 'text-[var(--text-muted)]'}`}>
                                                            {showRaceH2H ? h2h.raceWinsA : '—'}
                                                        </span>
                                                        <span className="font-oxanium text-xs text-[var(--text-muted)]">-</span>
                                                        <span className={`font-display text-3xl ${showRaceH2H && h2h.raceWinsB > h2h.raceWinsA ? 'text-[var(--accent-yellow)]' : showRaceH2H ? 'text-white' : 'text-[var(--text-muted)]'}`}>
                                                            {showRaceH2H ? h2h.raceWinsB : '—'}
                                                        </span>
                                                    </div>
                                                    <p className="font-oxanium text-[9px] text-[var(--text-muted)] mt-2">
                                                        {showRaceH2H ? `${h2h.totalRaces} races (DNF excluded)` : raceFooter}
                                                    </p>
                                                </div>

                                                {/* Quali H2H */}
                                                <div className="flex flex-col items-center p-3 bg-black/20 rounded">
                                                    <div className="flex items-center gap-2 mb-3">
                                                        <Timer size={12} className="text-[var(--text-muted)]" />
                                                        <span className="font-oxanium text-[10px] text-[var(--text-muted)] uppercase tracking-widest">Quali H2H</span>
                                                    </div>
                                                    <div className="flex items-center gap-4">
                                                        <span className={`font-display text-3xl ${showQualiH2H && h2h.qualiWinsA > h2h.qualiWinsB ? 'text-[var(--accent-yellow)]' : showQualiH2H ? 'text-white' : 'text-[var(--text-muted)]'}`}>
                                                            {showQualiH2H ? h2h.qualiWinsA : '—'}
                                                        </span>
                                                        <span className="font-oxanium text-xs text-[var(--text-muted)]">-</span>
                                                        <span className={`font-display text-3xl ${showQualiH2H && h2h.qualiWinsB > h2h.qualiWinsA ? 'text-[var(--accent-yellow)]' : showQualiH2H ? 'text-white' : 'text-[var(--text-muted)]'}`}>
                                                            {showQualiH2H ? h2h.qualiWinsB : '—'}
                                                        </span>
                                                    </div>
                                                    <p className="font-oxanium text-[9px] text-[var(--text-muted)] mt-2">
                                                        {showQualiH2H ? `${h2h.totalQualis} qualifying sessions` : qualiFooter}
                                                    </p>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="p-4 flex items-center justify-center gap-2 text-[var(--text-muted)]">
                                                <Loader2 size={14} className="animate-spin" />
                                                <span className="font-oxanium text-xs">Loading stats...</span>
                                            </div>
                                        )}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </motion.div>
                    );
                })}
            </div>
        </div>
    );
}

// Reusable animated swap button
function SwapButton({ onClick, className }: { onClick: (e: React.MouseEvent) => void, className: string }) {
    const controls = useAnimation();

    const handleClick = (e: React.MouseEvent) => {
        onClick(e);
        controls.start({
            rotate: -360,
            transition: { duration: 0.6, ease: "easeInOut" }
        }).then(() => {
            controls.set({ rotate: 0 });
        });
    };

    return (
        <motion.button
            onClick={handleClick}
            className={className}
            title="Switch Driver"
            whileHover={{ scale: 1.15 }}
            whileTap={{ scale: 0.9 }}
            animate={controls}
            initial={{ rotate: 0 }}
        >
            <RotateCcw size={14} />
        </motion.button>
    );
}

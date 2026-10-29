import { useState, useEffect, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import {
    Trophy,
    Swords,
    Flag,
    Timer,
    Star,
    BarChart3,
    Table,
    User,
    Users,
    Loader2,
    ArrowUpRight,
    ArrowUp,
    ArrowDown,
    ArrowUpDown,
    ChevronDown,
    History,
    TrendingUp,
    TrendingDown,
} from 'lucide-react';
import {
    getDriverProfileSeasonQualifying,
    getDriverProfileSeasonResults,
    getAllSeasonSprints,
    getConstructorSeasonH2HRaw,
    getDriverCareerStints,
    getDriverSeasonStats,
    getRaces,
    getSeasonDrivers,
    getSeasons,
    hasConstructorSeasonH2HCache,
    type DriverSeasonStats,
    type SeasonQualifyingResult,
    type SeasonRaceResult,
    type SeasonSprintResult,
} from '../api/f1Api';
import { TEAM_COLORS, type Race, type Season } from '../types';

type SeasonDriver = Awaited<ReturnType<typeof getSeasonDrivers>>[number];
import {
    useCommunityRatingDistribution,
    useCommunityRatings,
    useRatingStorage,
} from '../hooks/useCommunityRatings';
import { calculateAverages, getQuickRatings, getSeasonRatings } from '../utils/storage';
import { validRatings } from '../utils/ratingData';
import { compareCommunity } from '../utils/communityRatings';
import { COMMUNITY_DISTRIBUTION_MIN_VOTES } from '../utils/communityRatingDistribution';
import {
    buildDriverCareerRatedSeasons,
    buildDriverSeasonRaceLog,
    buildDriverTeammateComparisons,
    buildSeasonTeammateH2HEntries,
    nextRaceLogSortState,
    sortDriverRaceLog,
    summarizeDriverBestWorstRaces,
    type CareerSeasonTeammateH2H,
    type RaceLogSortState,
} from '../utils/driverProfile';
import { getDriverPortrait } from '../utils/driverPortraits';
import { getRatingColor } from '../utils/ratingColor';
import { CountryFlag } from '../utils/countryFlags';
import { PodiumFlagBackdrop } from './PodiumFlagBackdrop';
import { DriverBattlePortrait } from './DriverBattlePortrait';
import { CommunityRatingDistribution } from './CommunityRatingDistribution';

interface DriverProfilePageProps {
    season: string;
    driverId: string;
    onSelectDriver?: (driverId: string) => void;
    onSelectSeason?: (season: string) => void;
    onSelectRace?: (round: string, raceName: string, date: string) => void;
}

type ProfileRatingMode = 'personal' | 'community';

function getTeamColor(constructorId: string): string {
    return TEAM_COLORS[constructorId] || '#888888';
}

function getFamilyCode(driverName: string): string {
    const parts = driverName.trim().split(/\s+/);
    const last = parts[parts.length - 1] || driverName;
    return last.slice(0, 3).toUpperCase();
}

function formatShortRaceName(raceName: string | null | undefined): string {
    if (!raceName) return 'N/A';
    return raceName.replace(' Grand Prix', '').replace(' GP', '');
}

export function DriverProfilePage({
    season,
    driverId,
    onSelectDriver,
    onSelectSeason,
    onSelectRace,
}: DriverProfilePageProps) {
    useRatingStorage();

    const averages = calculateAverages(season);
    const personalRaces = getSeasonRatings(season);
    const hasPersonalRaceRatings = Boolean(
        personalRaces?.races.some(race => race.completed && validRatings(race.ratings).length > 0),
    );
    const hasPersonalQuickRatings = !hasPersonalRaceRatings && (getQuickRatings(season)?.length ?? 0) > 0;
    const communitySource: 'race' | 'quick' = hasPersonalQuickRatings ? 'quick' : 'race';
    const community = useCommunityRatings(communitySource, season);

    const [userSelectedMode, setUserSelectedMode] = useState<ProfileRatingMode | null>(null);
    const personalDriverAvg = averages.find(d => d.driverId === driverId) ?? null;
    const activeMode: ProfileRatingMode = userSelectedMode ?? (personalDriverAvg ? 'personal' : 'community');

    const [loading, setLoading] = useState(true);
    const [seasonDrivers, setSeasonDrivers] = useState<SeasonDriver[]>([]);
    const [driverStats, setDriverStats] = useState<DriverSeasonStats[]>([]);
    const [raceResults, setRaceResults] = useState<SeasonRaceResult[]>([]);
    const [qualiResults, setQualiResults] = useState<SeasonQualifyingResult[]>([]);
    const [sprintResults, setSprintResults] = useState<SeasonSprintResult[]>([]);
    const [calendar, setCalendar] = useState<Race[]>([]);
    const [availableSeasons, setAvailableSeasons] = useState<Season[]>([]);

    useEffect(() => {
        let active = true;

        async function fetchAll() {
            setLoading(true);
            try {
                const [driversRes, statsRes, racesRes, qualisRes, sprintsRes, calRes, seasonsRes] = await Promise.allSettled([
                    getSeasonDrivers(season),
                    getDriverSeasonStats(season),
                    getDriverProfileSeasonResults(season),
                    getDriverProfileSeasonQualifying(season),
                    getAllSeasonSprints(season),
                    getRaces(season),
                    getSeasons(),
                ]);

                if (!active) return;

                setSeasonDrivers(driversRes.status === 'fulfilled' ? driversRes.value : []);
                setDriverStats(statsRes.status === 'fulfilled' ? statsRes.value : []);
                setRaceResults(racesRes.status === 'fulfilled' ? racesRes.value : []);
                setQualiResults(qualisRes.status === 'fulfilled' ? qualisRes.value : []);
                setSprintResults(sprintsRes.status === 'fulfilled' ? sprintsRes.value : []);
                setCalendar(calRes.status === 'fulfilled' ? calRes.value : []);
                setAvailableSeasons(seasonsRes.status === 'fulfilled' ? seasonsRes.value : []);
            } finally {
                if (active) setLoading(false);
            }
        }

        void fetchAll();
        return () => {
            active = false;
        };
    }, [season]);

    // Resolve driver identity & latest constructor in this season
    const driverIdentity = useMemo(() => {
        const fromStats = driverStats.find(d => d.driverId === driverId);
        const fromSeasonDrivers = seasonDrivers.find(d => d.driverId === driverId);
        const driverRaceResults = raceResults
            .filter(r => r.driverId === driverId)
            .sort((a, b) => Number.parseInt(a.round, 10) - Number.parseInt(b.round, 10));
        const latestRaceEntry = driverRaceResults[driverRaceResults.length - 1];

        const driverName = latestRaceEntry?.driverName
            || fromStats?.driverName
            || (fromSeasonDrivers ? `${fromSeasonDrivers.givenName} ${fromSeasonDrivers.familyName}` : null)
            || personalDriverAvg?.driverName
            || driverId.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

        const constructorId = latestRaceEntry?.constructorId
            || fromStats?.constructorId
            || fromSeasonDrivers?.constructorId
            || personalDriverAvg?.constructorId
            || '';

        const constructorName = latestRaceEntry?.constructorName
            || fromStats?.constructorName
            || fromSeasonDrivers?.constructorName
            || personalDriverAvg?.constructorName
            || 'F1 Team';

        const nationality = fromSeasonDrivers?.nationality;

        return {
            driverId,
            driverName,
            constructorId,
            constructorName,
            nationality,
            stats: fromStats ?? null,
        };
    }, [driverId, driverStats, seasonDrivers, raceResults, personalDriverAvg]);

    // All selectable drivers in this season for the top switcher
    const allDriversInSeason = useMemo(() => {
        const map = new Map<string, { driverId: string; driverName: string; constructorName: string }>();
        for (const s of driverStats) {
            map.set(s.driverId, { driverId: s.driverId, driverName: s.driverName, constructorName: s.constructorName });
        }
        for (const d of seasonDrivers) {
            if (!map.has(d.driverId)) {
                map.set(d.driverId, {
                    driverId: d.driverId,
                    driverName: `${d.givenName} ${d.familyName}`,
                    constructorName: d.constructorName,
                });
            }
        }
        for (const avg of averages) {
            if (!map.has(avg.driverId)) {
                map.set(avg.driverId, {
                    driverId: avg.driverId,
                    driverName: avg.driverName,
                    constructorName: avg.constructorName,
                });
            }
        }
        if (!map.has(driverId)) {
            map.set(driverId, {
                driverId,
                driverName: driverIdentity.driverName,
                constructorName: driverIdentity.constructorName,
            });
        }
        return [...map.values()];
    }, [driverStats, seasonDrivers, averages, driverId, driverIdentity]);

    // Community comparison for this driver
    const communityComparison = useMemo(() => {
        const target = personalDriverAvg ?? {
            driverId,
            driverName: driverIdentity.driverName,
            constructorId: driverIdentity.constructorId,
            constructorName: driverIdentity.constructorName,
            averageRating: 0,
            totalRaces: 0,
            ratings: [],
        };
        return compareCommunity(target, personalRaces, community.ratings, communitySource, 'season');
    }, [personalDriverAvg, driverId, driverIdentity, personalRaces, community.ratings, communitySource]);

    const distributionSectionRef = useRef<HTMLDivElement | null>(null);
    const [isDistributionInView, setIsDistributionInView] = useState(
        () => typeof IntersectionObserver === 'undefined',
    );

    useEffect(() => {
        if (isDistributionInView || typeof IntersectionObserver === 'undefined') return;
        const node = distributionSectionRef.current;
        if (!node) return;
        const observer = new IntersectionObserver(
            entries => {
                if (entries.some(entry => entry.isIntersecting)) {
                    setIsDistributionInView(true);
                    observer.disconnect();
                }
            },
            { rootMargin: '250px' },
        );
        observer.observe(node);
        return () => observer.disconnect();
    }, [isDistributionInView, loading]);

    const shouldLoadDistribution =
        isDistributionInView && communityComparison.voteCount >= COMMUNITY_DISTRIBUTION_MIN_VOTES;
    const distributionState = useCommunityRatingDistribution(
        communitySource,
        season,
        shouldLoadDistribution ? driverId : null,
    );

    // Teammate battles in this season
    const teammateBattles = useMemo(() => buildDriverTeammateComparisons(
        driverId,
        raceResults,
        qualiResults,
        personalRaces,
        community.ratings,
        communitySource,
    ), [driverId, raceResults, qualiResults, personalRaces, community.ratings, communitySource]);

    // Career-wide Qualifying H2H & Race H2H across all seasons
    const [careerH2HList, setCareerH2HList] = useState<CareerSeasonTeammateH2H[]>([]);
    const [careerH2HLoading, setCareerH2HLoading] = useState(false);
    const [careerH2HProgress, setCareerH2HProgress] = useState<{ loaded: number; total: number } | null>(null);
    const [expandedQualiId, setExpandedQualiId] = useState<string | null>(null);
    const [expandedRaceId, setExpandedRaceId] = useState<string | null>(null);

    const currentSeasonDataRef = useRef({
        raceResults,
        qualiResults,
        constructorId: driverIdentity.constructorId,
        constructorName: driverIdentity.constructorName,
    });
    currentSeasonDataRef.current = {
        raceResults,
        qualiResults,
        constructorId: driverIdentity.constructorId,
        constructorName: driverIdentity.constructorName,
    };

    const currentSeasonH2HEntries = useMemo(() => {
        if (!driverIdentity.constructorId) return [];
        const driverTeams = new Map<string, string>();
        for (const r of raceResults) {
            if (r.driverId === driverId) driverTeams.set(r.constructorId, r.constructorName);
        }
        for (const q of qualiResults) {
            if (q.driverId === driverId && !driverTeams.has(q.constructorId)) {
                driverTeams.set(q.constructorId, q.constructorName);
            }
        }
        if (driverTeams.size === 0 && driverIdentity.constructorId) {
            driverTeams.set(driverIdentity.constructorId, driverIdentity.constructorName);
        }
        const entries: CareerSeasonTeammateH2H[] = [];
        driverTeams.forEach((cName, cId) => {
            entries.push(
                ...buildSeasonTeammateH2HEntries(season, cId, cName, driverId, raceResults, qualiResults),
            );
        });
        return entries;
    }, [season, driverId, driverIdentity.constructorId, driverIdentity.constructorName, raceResults, qualiResults]);

    useEffect(() => {
        // Wait for the primary season load to finish so we don't compete for Jolpica rate-limit tokens
        // or restart the career loop mid-flight when raceResults/qualiResults resolve.
        if (loading) return;

        let active = true;

        async function resolveStintEntries(
            stint: { season: string; constructorId: string; constructorName: string },
            throwOnError = false,
        ): Promise<CareerSeasonTeammateH2H[]> {
            const currentData = currentSeasonDataRef.current;
            if (
                stint.season === season
                && (currentData.raceResults.length > 0 || currentData.qualiResults.length > 0)
            ) {
                return buildSeasonTeammateH2HEntries(
                    stint.season,
                    stint.constructorId,
                    stint.constructorName,
                    driverId,
                    currentData.raceResults,
                    currentData.qualiResults,
                );
            }
            const raw = await getConstructorSeasonH2HRaw(
                stint.season,
                stint.constructorId,
                stint.constructorName,
                { throwOnError },
            );
            return buildSeasonTeammateH2HEntries(
                stint.season,
                stint.constructorId,
                raw.constructorName,
                driverId,
                raw.raceResults,
                raw.qualiResults,
            );
        }

        function flattenStintMap(
            byStint: Map<string, CareerSeasonTeammateH2H[]>,
            orderedKeys: string[],
        ): CareerSeasonTeammateH2H[] {
            const result: CareerSeasonTeammateH2H[] = [];
            for (const key of orderedKeys) {
                const items = byStint.get(key);
                if (items && items.length > 0) {
                    result.push(...items);
                }
            }
            return result;
        }

        async function loadCareerH2H() {
            setCareerH2HList([]);
            setCareerH2HLoading(true);
            setCareerH2HProgress(null);
            try {
                const stints = await getDriverCareerStints(driverId);
                if (!active) return;

                const currentData = currentSeasonDataRef.current;
                const stintMap = new Map<string, { season: string; constructorId: string; constructorName: string }>();
                for (const s of stints) {
                    stintMap.set(`${s.season}::${s.constructorId}`, s);
                }
                const currentSeasonConstructors = new Map<string, string>();
                for (const result of currentData.raceResults) {
                    if (result.driverId === driverId) {
                        currentSeasonConstructors.set(result.constructorId, result.constructorName);
                    }
                }
                for (const result of currentData.qualiResults) {
                    if (result.driverId === driverId && !currentSeasonConstructors.has(result.constructorId)) {
                        currentSeasonConstructors.set(result.constructorId, result.constructorName);
                    }
                }
                if (currentSeasonConstructors.size === 0 && currentData.constructorId) {
                    currentSeasonConstructors.set(currentData.constructorId, currentData.constructorName);
                }
                currentSeasonConstructors.forEach((constructorName, constructorId) => {
                    const currentKey = `${season}::${constructorId}`;
                    if (!stintMap.has(currentKey)) {
                        stintMap.set(currentKey, { season, constructorId, constructorName });
                    }
                });

                const orderedStints = [...stintMap.values()].sort(
                    (a, b) => (parseInt(a.season, 10) || 0) - (parseInt(b.season, 10) || 0),
                );
                const orderedKeys = orderedStints.map(s => `${s.season}::${s.constructorId}`);
                const entriesByStint = new Map<string, CareerSeasonTeammateH2H[]>();
                const totalStints = orderedStints.length;
                let completedCount = 0;

                setCareerH2HProgress({ loaded: 0, total: totalStints });

                // 1. Immediately resolve all warm/cached stints in parallel (0ms network wait)
                const warmStints: typeof orderedStints = [];
                const coldStints: typeof orderedStints = [];

                for (const stint of orderedStints) {
                    const isWarm =
                        (stint.season === season
                            && (currentData.raceResults.length > 0 || currentData.qualiResults.length > 0))
                        || hasConstructorSeasonH2HCache(stint.season, stint.constructorId);
                    if (isWarm) {
                        warmStints.push(stint);
                    } else {
                        coldStints.push(stint);
                    }
                }

                if (warmStints.length > 0) {
                    await Promise.all(
                        warmStints.map(async stint => {
                            const items = await resolveStintEntries(stint, false);
                            entriesByStint.set(`${stint.season}::${stint.constructorId}`, items);
                            completedCount += 1;
                        }),
                    );
                    if (!active) return;
                    setCareerH2HList(flattenStintMap(entriesByStint, orderedKeys));
                    setCareerH2HProgress({ loaded: completedCount, total: totalStints });
                }

                // 2. Fetch uncached stints sequentially; the shared API queue also spaces every Jolpica request.
                const retryQueue: typeof orderedStints = [];
                for (let idx = 0; idx < coldStints.length; idx += 1) {
                    if (!active) return;
                    const stint = coldStints[idx];
                    const key = `${stint.season}::${stint.constructorId}`;

                    try {
                        const items = await resolveStintEntries(stint, true);
                        if (!active) return;
                        if (items.length === 0) {
                            retryQueue.push(stint);
                        } else {
                            entriesByStint.set(key, items);
                        }
                    } catch {
                        retryQueue.push(stint);
                    }

                    completedCount += 1;
                    setCareerH2HList(flattenStintMap(entriesByStint, orderedKeys));
                    setCareerH2HProgress({ loaded: completedCount, total: totalStints });

                }

                // 3. Recovery pass for any stint that hit a transient error or empty response
                if (retryQueue.length > 0 && active) {
                    await new Promise(resolve => setTimeout(resolve, 1200));
                    for (const stint of retryQueue) {
                        if (!active) return;
                        const key = `${stint.season}::${stint.constructorId}`;
                        const items = await resolveStintEntries(stint, false);
                        if (!active) return;
                        if (items.length > 0) {
                            entriesByStint.set(key, items);
                            setCareerH2HList(flattenStintMap(entriesByStint, orderedKeys));
                        }
                        await new Promise(resolve => setTimeout(resolve, 400));
                    }
                }
            } finally {
                if (active) {
                    setCareerH2HLoading(false);
                    setCareerH2HProgress(null);
                }
            }
        }

        void loadCareerH2H();
        return () => {
            active = false;
        };
    }, [driverId, season, loading]);

    const displayedCareerH2H = careerH2HList.length > 0 ? careerH2HList : currentSeasonH2HEntries;

    // Chronological race log
    const [raceLogSort, setRaceLogSort] = useState<RaceLogSortState | null>(null);
    const raceLog = useMemo(() => buildDriverSeasonRaceLog(
        driverId,
        calendar,
        raceResults,
        qualiResults,
        sprintResults,
        personalRaces,
        community.ratings,
        { constructorId: driverIdentity.constructorId, constructorName: driverIdentity.constructorName },
    ), [driverId, calendar, raceResults, qualiResults, sprintResults, personalRaces, community.ratings, driverIdentity]);

    const sortedRaceLog = useMemo(
        () => sortDriverRaceLog(raceLog, raceLogSort),
        [raceLog, raceLogSort],
    );

    const bestWorst = useMemo(
        () => summarizeDriverBestWorstRaces(raceLog, activeMode),
        [raceLog, activeMode],
    );

    const careerSeasons = useMemo(
        () => buildDriverCareerRatedSeasons(driverId),
        [driverId],
    );

    const dnfCount = useMemo(
        () => raceResults.filter(r => r.driverId === driverId && r.position === null).length,
        [raceResults, driverId],
    );

    const teamColor = getTeamColor(driverIdentity.constructorId);
    const portrait = getDriverPortrait(season, driverId, driverIdentity.constructorId);
    const myAvg = personalDriverAvg ? personalDriverAvg.averageRating : null;
    const commAvg = communityComparison.communityAverage;
    const myVsCommDelta = myAvg !== null && commAvg !== null
        ? parseFloat((myAvg - commAvg).toFixed(2))
        : null;

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[50vh] text-center p-8">
                <Loader2 size={48} className="text-[var(--accent-red)] mb-4 animate-spin" />
                <h3 className="font-display text-2xl text-white uppercase mb-2">LOADING DRIVER PROFILE</h3>
                <p className="font-oxanium text-[var(--text-secondary)]">
                    Fetching {season} telemetry &amp; head-to-head records...
                </p>
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto px-3 md:px-6 py-4 md:py-8 space-y-8 md:space-y-12">
            {/* TOP CONTROLS BAR: Driver Switcher, Season Switcher & Mode Toggle */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-[var(--border-color)] pb-4">
                <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-2 bg-[var(--bg-panel)] border border-[var(--border-color)] px-3 py-1.5">
                        <span className="font-oxanium text-[10px] uppercase tracking-wider text-[var(--text-muted)]">DRIVER</span>
                        <select
                            aria-label="Select driver"
                            value={driverId}
                            onChange={e => onSelectDriver?.(e.target.value)}
                            className="bg-transparent font-display text-xs md:text-sm uppercase text-white focus:outline-none cursor-pointer"
                        >
                            {allDriversInSeason.map(d => (
                                <option key={d.driverId} value={d.driverId} className="bg-[#0a0a0b] text-white">
                                    {d.driverName.toUpperCase()} ({d.constructorName})
                                </option>
                            ))}
                        </select>
                    </div>

                    {availableSeasons.length > 0 && (
                        <div className="flex items-center gap-2 bg-[var(--bg-panel)] border border-[var(--border-color)] px-3 py-1.5">
                            <span className="font-oxanium text-[10px] uppercase tracking-wider text-[var(--text-muted)]">SEASON</span>
                            <select
                                aria-label="Select season"
                                value={season}
                                onChange={e => onSelectSeason?.(e.target.value)}
                                className="bg-transparent font-display text-xs md:text-sm uppercase text-white focus:outline-none cursor-pointer"
                            >
                                {availableSeasons.map(s => (
                                    <option key={s.season} value={s.season} className="bg-[#0a0a0b] text-white">
                                        {s.season}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}
                </div>

                <div
                    role="group"
                    aria-label="Driver profile rating source"
                    className="inline-grid grid-cols-2 gap-1 self-start md:self-auto border border-[var(--border-color)] bg-[var(--bg-darker)] p-1"
                >
                    <button
                        type="button"
                        aria-pressed={activeMode === 'personal'}
                        onClick={() => setUserSelectedMode('personal')}
                        className={`flex items-center justify-center gap-1.5 px-3 md:px-4 py-1.5 font-display text-[10px] md:text-xs uppercase tracking-wider transition-colors ${
                            activeMode === 'personal'
                                ? 'bg-[var(--accent-red)] text-white'
                                : 'text-[var(--text-secondary)] hover:text-white'
                        }`}
                    >
                        <User size={13} className="hidden md:inline-block" />
                        <span>MY RATINGS</span>
                    </button>
                    <button
                        type="button"
                        aria-pressed={activeMode === 'community'}
                        onClick={() => setUserSelectedMode('community')}
                        className={`flex items-center justify-center gap-1.5 px-3 md:px-4 py-1.5 font-display text-[10px] md:text-xs uppercase tracking-wider transition-colors ${
                            activeMode === 'community'
                                ? 'bg-[var(--accent-yellow)] text-black'
                                : 'text-[var(--text-secondary)] hover:text-white'
                        }`}
                    >
                        <Users size={13} className="hidden md:inline-block" />
                        <span>COMMUNITY</span>
                    </button>
                </div>
            </div>

            {/* 1. HERO SECTION: DRIVER IDENTITY & SEASON OVERVIEW */}
            <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                className="relative isolate overflow-hidden border border-[var(--border-color)] bg-[var(--bg-panel)]"
            >
                <div className="h-1.5 w-full" style={{ backgroundColor: teamColor }} />
                {driverIdentity.nationality && (
                    <PodiumFlagBackdrop key={driverIdentity.nationality} nationality={driverIdentity.nationality} />
                )}
                {portrait && <DriverBattlePortrait key={portrait} src={portrait} side="right" />}

                <div className="relative z-10 p-5 md:p-8 space-y-6">
                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                        <div className="border-l-4 pl-4 md:pl-6" style={{ borderLeftColor: teamColor }}>
                            <div className="flex flex-wrap items-center gap-2 mb-2">
                                <span
                                    className="px-2 py-0.5 font-oxanium text-[10px] font-bold uppercase tracking-widest text-white"
                                    style={{ backgroundColor: teamColor }}
                                >
                                    {driverIdentity.constructorName}
                                </span>
                                <span className="font-oxanium text-xs uppercase tracking-widest text-[var(--text-muted)]">
                                    {season} SEASON PROFILE
                                </span>
                                {driverIdentity.nationality && (
                                    <span className="font-oxanium text-xs uppercase tracking-widest text-[var(--text-secondary)]">
                                        • {driverIdentity.nationality}
                                    </span>
                                )}
                            </div>
                            <h2 className="font-display text-3xl md:text-6xl text-white uppercase tracking-tight leading-none">
                                {driverIdentity.driverName}
                            </h2>
                        </div>

                        {/* Official Championship Stats Pill Bar */}
                        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 bg-[var(--bg-darker)]/90 border border-[var(--border-color)] p-3 backdrop-blur-sm">
                            <div className="px-2 text-center">
                                <div className="font-oxanium text-[9px] uppercase tracking-wider text-[var(--text-muted)]">WDC</div>
                                <div className="font-display text-lg md:text-2xl text-[var(--accent-yellow)]">
                                    {driverIdentity.stats?.position ? `P${driverIdentity.stats.position}` : '—'}
                                </div>
                            </div>
                            <div className="px-2 text-center border-l border-[var(--border-color)]">
                                <div className="font-oxanium text-[9px] uppercase tracking-wider text-[var(--text-muted)]">PTS</div>
                                <div className="font-display text-lg md:text-2xl text-white">
                                    {driverIdentity.stats?.points ?? '0'}
                                </div>
                            </div>
                            <div className="px-2 text-center border-l border-[var(--border-color)]">
                                <div className="font-oxanium text-[9px] uppercase tracking-wider text-[var(--text-muted)]">WINS</div>
                                <div className="font-display text-lg md:text-2xl text-[#00FF88]">
                                    {driverIdentity.stats?.wins ?? 0}
                                </div>
                            </div>
                            <div className="px-2 text-center border-l border-[var(--border-color)]">
                                <div className="font-oxanium text-[9px] uppercase tracking-wider text-[var(--text-muted)]">POLES</div>
                                <div className="font-display text-lg md:text-2xl text-[#FF00FF]">
                                    {driverIdentity.stats?.poles ?? 0}
                                </div>
                            </div>
                            <div className="px-2 text-center border-l border-[var(--border-color)]">
                                <div className="font-oxanium text-[9px] uppercase tracking-wider text-[var(--text-muted)]">PODIUMS</div>
                                <div className="font-display text-lg md:text-2xl text-[var(--accent-orange)]">
                                    {driverIdentity.stats?.podiums ?? 0}
                                </div>
                            </div>
                            <div className="px-2 text-center border-l border-[var(--border-color)]">
                                <div className="font-oxanium text-[9px] uppercase tracking-wider text-[var(--text-muted)]">DNFs</div>
                                <div className="font-display text-lg md:text-2xl text-[var(--accent-red)]">
                                    {dnfCount}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Rating Telemetry Summary Cards */}
                    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                        <div className="border border-[var(--border-color)] bg-[var(--bg-darker)]/90 p-3.5">
                            <div className="font-oxanium text-[9px] uppercase tracking-widest text-[var(--text-muted)]">
                                MY SEASON AVG
                            </div>
                            <div
                                className="mt-1 font-oxanium text-2xl md:text-3xl font-bold tabular-nums"
                                style={{ color: myAvg !== null ? getRatingColor(myAvg) : 'var(--text-muted)' }}
                            >
                                {myAvg !== null ? myAvg.toFixed(2) : '—'}
                            </div>
                            <div className="mt-1 font-oxanium text-[9px] uppercase text-[var(--text-muted)]">
                                {personalDriverAvg ? `${personalDriverAvg.totalRaces} RACES RATED` : 'NOT RATED YET'}
                            </div>
                        </div>

                        <div className="border border-[var(--border-color)] bg-[var(--bg-darker)]/90 p-3.5">
                            <div className="font-oxanium text-[9px] uppercase tracking-widest text-[var(--text-muted)]">
                                COMMUNITY AVG
                            </div>
                            <div
                                className="mt-1 font-oxanium text-2xl md:text-3xl font-bold tabular-nums"
                                style={{ color: commAvg !== null ? getRatingColor(commAvg) : 'var(--text-muted)' }}
                            >
                                {commAvg !== null ? commAvg.toFixed(2) : '—'}
                            </div>
                            <div className="mt-1 font-oxanium text-[9px] uppercase text-[var(--text-muted)]">
                                {communityComparison.voteCount > 0
                                    ? `${communityComparison.voteCount} VOTES • ${communityComparison.raceCount} RACES`
                                    : 'NO COMMUNITY VOTES'}
                            </div>
                        </div>

                        <div className="border border-[var(--border-color)] bg-[var(--bg-darker)]/90 p-3.5">
                            <div className="font-oxanium text-[9px] uppercase tracking-widest text-[var(--text-muted)]">
                                MY VS COMMUNITY
                            </div>
                            <div
                                className={`mt-1 font-oxanium text-2xl md:text-3xl font-bold tabular-nums ${
                                    myVsCommDelta === null
                                        ? 'text-[var(--text-muted)]'
                                        : myVsCommDelta > 0
                                            ? 'text-[#00FF88]'
                                            : myVsCommDelta < 0
                                                ? 'text-[var(--accent-red)]'
                                                : 'text-white'
                                }`}
                            >
                                {myVsCommDelta === null
                                    ? '—'
                                    : `${myVsCommDelta > 0 ? '+' : ''}${myVsCommDelta.toFixed(2)}`}
                            </div>
                            <div className="mt-1 font-oxanium text-[9px] uppercase text-[var(--text-muted)]">
                                {myVsCommDelta === null
                                    ? 'RATE TO COMPARE'
                                    : myVsCommDelta > 0
                                        ? 'HIGHER THAN CROWD'
                                        : myVsCommDelta < 0
                                            ? 'LOWER THAN CROWD'
                                            : 'MATCHES CROWD'}
                            </div>
                        </div>

                        <div className="border border-[var(--border-color)] bg-[var(--bg-darker)]/90 p-3.5">
                            <div className="flex items-center justify-between">
                                <span className="font-oxanium text-[9px] uppercase tracking-widest text-[var(--text-muted)]">
                                    BEST RACE ({activeMode === 'community' ? 'COMM' : 'MY'})
                                </span>
                                <TrendingUp size={12} className="text-[#00FF88]" />
                            </div>
                            <div className="mt-1 font-oxanium text-2xl md:text-3xl font-bold text-[#00FF88] tabular-nums">
                                {bestWorst.best
                                    ? bestWorst.best.rating.toFixed(activeMode === 'community' ? 2 : 1)
                                    : '—'}
                            </div>
                            <div className="mt-1 truncate font-oxanium text-[9px] uppercase text-[var(--text-muted)]">
                                {bestWorst.best
                                    ? `R${bestWorst.best.round} • ${formatShortRaceName(bestWorst.best.raceName)}`
                                    : 'NO RACE DATA'}
                            </div>
                        </div>

                        <div className="col-span-2 lg:col-span-1 border border-[var(--border-color)] bg-[var(--bg-darker)]/90 p-3.5">
                            <div className="flex items-center justify-between">
                                <span className="font-oxanium text-[9px] uppercase tracking-widest text-[var(--text-muted)]">
                                    WORST RACE ({activeMode === 'community' ? 'COMM' : 'MY'})
                                </span>
                                <TrendingDown size={12} className="text-[var(--accent-red)]" />
                            </div>
                            <div className="mt-1 font-oxanium text-2xl md:text-3xl font-bold text-[var(--accent-red)] tabular-nums">
                                {bestWorst.worst
                                    ? bestWorst.worst.rating.toFixed(activeMode === 'community' ? 2 : 1)
                                    : '—'}
                            </div>
                            <div className="mt-1 truncate font-oxanium text-[9px] uppercase text-[var(--text-muted)]">
                                {bestWorst.worst
                                    ? `R${bestWorst.worst.round} • ${formatShortRaceName(bestWorst.worst.raceName)}`
                                    : 'NO RACE DATA'}
                            </div>
                        </div>
                    </div>
                </div>
            </motion.div>

            {/* 2. SECTION: TEAMMATE H2H BATTLES */}
            <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="space-y-4"
            >
                <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-2">
                    <div className="flex items-center gap-3">
                        <Swords size={18} className="text-[var(--accent-red)]" />
                        <h3 className="font-display text-2xl text-white uppercase tracking-wider">
                            TEAMMATE H2H BATTLES
                        </h3>
                    </div>
                    <span className="font-oxanium text-[10px] uppercase tracking-widest text-[var(--text-muted)]">
                        {teammateBattles.length} {teammateBattles.length === 1 ? 'TEAMMATE' : 'TEAMMATES'} IN {season}
                    </span>
                </div>

                {teammateBattles.length === 0 ? (
                    <div className="border border-[var(--border-color)] bg-[var(--bg-panel)] p-8 text-center">
                        <p className="font-oxanium text-sm uppercase tracking-wider text-[var(--text-muted)]">
                            No teammate head-to-head data available for {driverIdentity.driverName} in {season}.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-6">
                        {teammateBattles.map(battle => {
                            const stintColor = getTeamColor(battle.constructorId);
                            const activeRatingH2H = activeMode === 'community'
                                ? battle.communityRatingH2H
                                : battle.personalRatingH2H;
                            const driverScore = activeMode === 'community'
                                ? battle.driverCommunityAvg
                                : battle.driverPersonalAvg;
                            const teammateScore = activeMode === 'community'
                                ? battle.teammateCommunityAvg
                                : battle.teammatePersonalAvg;
                            const bothScored = driverScore !== null && teammateScore !== null;
                            const driverCode = getFamilyCode(driverIdentity.driverName);
                            const teammateCode = getFamilyCode(battle.teammateName);

                            return (
                                <div
                                    key={`${battle.constructorId}_${battle.teammateId}`}
                                    data-testid={`teammate-battle-${battle.teammateId}`}
                                    className="border border-[var(--border-color)] bg-[var(--bg-panel)] overflow-hidden"
                                >
                                    <div className="h-1 w-full" style={{ backgroundColor: stintColor }} />

                                    {/* Teammate Card Header */}
                                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-color)] bg-[var(--bg-darker)] px-4 py-3">
                                        <div className="flex items-center gap-3">
                                            <div className="h-5 w-1" style={{ backgroundColor: stintColor }} />
                                            <div>
                                                <div className="font-oxanium text-[9px] uppercase tracking-widest text-[var(--text-muted)]">
                                                    {battle.constructorName} • {battle.sharedRacesCount} SHARED WEEKENDS
                                                </div>
                                                <div className="font-display text-lg md:text-xl uppercase text-white">
                                                    {driverIdentity.driverName}{' '}
                                                    <span className="text-[var(--accent-red)]">VS</span>{' '}
                                                    {battle.teammateName}
                                                </div>
                                            </div>
                                        </div>

                                        {onSelectDriver && (
                                            <button
                                                type="button"
                                                onClick={() => onSelectDriver(battle.teammateId)}
                                                className="inline-flex items-center gap-1.5 border border-[var(--border-color)] bg-[var(--bg-panel)] px-3 py-1.5 font-oxanium text-[10px] font-bold uppercase tracking-wider text-white transition-colors hover:border-[var(--accent-yellow)] hover:text-[var(--accent-yellow)]"
                                            >
                                                <span>{battle.teammateName} PROFILE</span>
                                                <ArrowUpRight size={12} />
                                            </button>
                                        )}
                                    </div>

                                    <div className="p-4 md:p-6 space-y-5">
                                        {/* Season Average Comparison Bar */}
                                        <div className="border border-[var(--border-color)] bg-[var(--bg-darker)] p-4">
                                            <div className="flex items-center justify-between text-xs font-oxanium uppercase tracking-wider text-[var(--text-muted)] mb-2">
                                                <span>{driverIdentity.driverName} ({activeMode === 'community' ? 'COMMUNITY AVG' : 'MY AVG'})</span>
                                                <span>{battle.teammateName} ({activeMode === 'community' ? 'COMMUNITY AVG' : 'MY AVG'})</span>
                                            </div>
                                            <div className="flex items-center justify-between gap-4">
                                                <span className={`font-oxanium text-2xl md:text-3xl font-bold tabular-nums ${
                                                    bothScored && driverScore > teammateScore ? 'text-[var(--accent-yellow)]' : 'text-white'
                                                }`}>
                                                    {driverScore !== null ? driverScore.toFixed(2) : '—'}
                                                </span>
                                                <div className="h-2 flex-1 bg-[var(--border-color)] overflow-hidden flex">
                                                    <div
                                                        className="h-full transition-all duration-300"
                                                        style={{
                                                            width: bothScored && (driverScore + teammateScore) > 0
                                                                ? `${(driverScore / (driverScore + teammateScore)) * 100}%`
                                                                : '50%',
                                                            backgroundColor: stintColor,
                                                        }}
                                                    />
                                                </div>
                                                <span className={`font-oxanium text-2xl md:text-3xl font-bold tabular-nums ${
                                                    bothScored && teammateScore > driverScore ? 'text-[var(--accent-yellow)]' : 'text-white'
                                                }`}>
                                                    {teammateScore !== null ? teammateScore.toFixed(2) : '—'}
                                                </span>
                                            </div>
                                        </div>

                                        {/* 4 H2H Boxes: Race H2H, Quali H2H, My Rating H2H, Community Rating H2H */}
                                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                                            <div className="flex flex-col items-center border border-[var(--border-color)] bg-[var(--bg-darker)] p-3">
                                                <div className="flex items-center gap-1.5 mb-2">
                                                    <Flag size={12} className="text-[var(--text-muted)]" />
                                                    <span className="font-oxanium text-[10px] uppercase tracking-widest text-[var(--text-muted)]">
                                                        RACE H2H
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <span className={`font-display text-2xl md:text-3xl ${
                                                        battle.totalClassifiedSharedRaces > 0 && battle.raceWinsDriver > battle.raceWinsTeammate
                                                            ? 'text-[var(--accent-yellow)]'
                                                            : 'text-white'
                                                    }`}>
                                                        {battle.totalClassifiedSharedRaces > 0 ? battle.raceWinsDriver : '—'}
                                                    </span>
                                                    <span className="font-oxanium text-xs text-[var(--text-muted)]">-</span>
                                                    <span className={`font-display text-2xl md:text-3xl ${
                                                        battle.totalClassifiedSharedRaces > 0 && battle.raceWinsTeammate > battle.raceWinsDriver
                                                            ? 'text-[var(--accent-yellow)]'
                                                            : 'text-white'
                                                    }`}>
                                                        {battle.totalClassifiedSharedRaces > 0 ? battle.raceWinsTeammate : '—'}
                                                    </span>
                                                </div>
                                                <span className="mt-1.5 font-oxanium text-[9px] text-[var(--text-muted)]">
                                                    {battle.totalClassifiedSharedRaces} classified races
                                                </span>
                                            </div>

                                            <div className="flex flex-col items-center border border-[var(--border-color)] bg-[var(--bg-darker)] p-3">
                                                <div className="flex items-center gap-1.5 mb-2">
                                                    <Timer size={12} className="text-[var(--text-muted)]" />
                                                    <span className="font-oxanium text-[10px] uppercase tracking-widest text-[var(--text-muted)]">
                                                        QUALI H2H
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <span className={`font-display text-2xl md:text-3xl ${
                                                        battle.totalSharedQualis > 0 && battle.qualiWinsDriver > battle.qualiWinsTeammate
                                                            ? 'text-[var(--accent-yellow)]'
                                                            : 'text-white'
                                                    }`}>
                                                        {battle.totalSharedQualis > 0 ? battle.qualiWinsDriver : '—'}
                                                    </span>
                                                    <span className="font-oxanium text-xs text-[var(--text-muted)]">-</span>
                                                    <span className={`font-display text-2xl md:text-3xl ${
                                                        battle.totalSharedQualis > 0 && battle.qualiWinsTeammate > battle.qualiWinsDriver
                                                            ? 'text-[var(--accent-yellow)]'
                                                            : 'text-white'
                                                    }`}>
                                                        {battle.totalSharedQualis > 0 ? battle.qualiWinsTeammate : '—'}
                                                    </span>
                                                </div>
                                                <span className="mt-1.5 font-oxanium text-[9px] text-[var(--text-muted)]">
                                                    {battle.totalSharedQualis} qualifying sessions
                                                </span>
                                            </div>

                                            <div className="flex flex-col items-center border border-[var(--border-color)] bg-[var(--bg-darker)] p-3">
                                                <div className="flex items-center gap-1.5 mb-2">
                                                    <Star size={12} className="text-[var(--accent-red)]" />
                                                    <span className="font-oxanium text-[10px] uppercase tracking-widest text-[var(--text-muted)]">
                                                        MY RATING H2H
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <span className={`font-display text-2xl md:text-3xl ${
                                                        battle.personalRatingH2H.totalSharedRaces > 0 && battle.personalRatingH2H.winsA > battle.personalRatingH2H.winsB
                                                            ? 'text-[var(--accent-yellow)]'
                                                            : 'text-white'
                                                    }`}>
                                                        {battle.personalRatingH2H.totalSharedRaces > 0 ? battle.personalRatingH2H.winsA : '—'}
                                                    </span>
                                                    <span className="font-oxanium text-xs text-[var(--text-muted)]">-</span>
                                                    <span className={`font-display text-2xl md:text-3xl ${
                                                        battle.personalRatingH2H.totalSharedRaces > 0 && battle.personalRatingH2H.winsB > battle.personalRatingH2H.winsA
                                                            ? 'text-[var(--accent-yellow)]'
                                                            : 'text-white'
                                                    }`}>
                                                        {battle.personalRatingH2H.totalSharedRaces > 0 ? battle.personalRatingH2H.winsB : '—'}
                                                    </span>
                                                </div>
                                                <span className="mt-1.5 font-oxanium text-[9px] text-[var(--text-muted)]">
                                                    {battle.personalRatingH2H.totalSharedRaces > 0
                                                        ? `${battle.personalRatingH2H.totalSharedRaces} shared (${battle.personalRatingH2H.ties} tied)`
                                                        : 'No shared personal ratings'}
                                                </span>
                                            </div>

                                            <div className="flex flex-col items-center border border-[var(--border-color)] bg-[var(--bg-darker)] p-3">
                                                <div className="flex items-center gap-1.5 mb-2">
                                                    <Users size={12} className="text-[var(--accent-yellow)]" />
                                                    <span className="font-oxanium text-[10px] uppercase tracking-widest text-[var(--text-muted)]">
                                                        COMMUNITY H2H
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <span className={`font-display text-2xl md:text-3xl ${
                                                        battle.communityRatingH2H.totalSharedRaces > 0 && battle.communityRatingH2H.winsA > battle.communityRatingH2H.winsB
                                                            ? 'text-[var(--accent-yellow)]'
                                                            : 'text-white'
                                                    }`}>
                                                        {battle.communityRatingH2H.totalSharedRaces > 0 ? battle.communityRatingH2H.winsA : '—'}
                                                    </span>
                                                    <span className="font-oxanium text-xs text-[var(--text-muted)]">-</span>
                                                    <span className={`font-display text-2xl md:text-3xl ${
                                                        battle.communityRatingH2H.totalSharedRaces > 0 && battle.communityRatingH2H.winsB > battle.communityRatingH2H.winsA
                                                            ? 'text-[var(--accent-yellow)]'
                                                            : 'text-white'
                                                    }`}>
                                                        {battle.communityRatingH2H.totalSharedRaces > 0 ? battle.communityRatingH2H.winsB : '—'}
                                                    </span>
                                                </div>
                                                <span className="mt-1.5 font-oxanium text-[9px] text-[var(--text-muted)]">
                                                    {battle.communityRatingH2H.totalSharedRaces > 0
                                                        ? `${battle.communityRatingH2H.totalSharedRaces} shared (${battle.communityRatingH2H.ties} tied)`
                                                        : 'No shared community ratings'}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Race-by-Race Rating Duel Strip */}
                                        {activeRatingH2H.rounds.length > 0 && (
                                            <div className="border-t border-[var(--border-color)] pt-3">
                                                <div className="mb-2 flex items-center justify-between">
                                                    <span className="font-oxanium text-[9px] uppercase tracking-widest text-[var(--text-muted)]">
                                                        RACE-BY-RACE RATING DUELS ({activeMode === 'community' ? 'COMMUNITY AVG' : 'MY RATINGS'})
                                                    </span>
                                                    <span className="font-oxanium text-[9px] uppercase tracking-wider text-[var(--text-muted)]">
                                                        {driverCode} vs {teammateCode}
                                                    </span>
                                                </div>
                                                <div className="flex gap-2 overflow-x-auto pb-1.5 custom-scrollbar">
                                                    {activeRatingH2H.rounds.map(roundDuel => {
                                                        const decimals = activeMode === 'community' ? 2 : 1;
                                                        const absDiff = Math.abs(roundDuel.diff).toFixed(decimals);
                                                        return (
                                                            <div
                                                                key={roundDuel.round}
                                                                className="min-w-[118px] shrink-0 border border-[var(--border-color)] bg-[var(--bg-darker)] p-2"
                                                                style={{
                                                                    borderTopWidth: '2px',
                                                                    borderTopColor: roundDuel.winner === 'tie' ? 'var(--border-color)' : stintColor,
                                                                }}
                                                            >
                                                                <div className="flex items-center justify-between gap-1.5 border-b border-white/10 pb-1.5 mb-1.5">
                                                                    <div className="flex items-center gap-1.5 min-w-0">
                                                                        {roundDuel.countryCode !== 'XX' && (
                                                                            <CountryFlag country={roundDuel.countryCode} size="sm" />
                                                                        )}
                                                                        <span className="truncate font-ui text-[9px] font-bold uppercase text-white">
                                                                            {formatShortRaceName(roundDuel.raceName)}
                                                                        </span>
                                                                    </div>
                                                                    <span className="font-oxanium text-[8px] text-[var(--text-muted)]">
                                                                        R{roundDuel.round}
                                                                    </span>
                                                                </div>

                                                                <div className="space-y-1 font-oxanium text-[10px]">
                                                                    <div className="flex items-center justify-between">
                                                                        <span className={roundDuel.winner === 'a' ? 'font-bold text-white' : 'text-[var(--text-muted)]'}>
                                                                            {driverCode}
                                                                        </span>
                                                                        <span className={`tabular-nums ${roundDuel.winner === 'a' ? 'font-bold text-[var(--accent-yellow)]' : 'text-[var(--text-secondary)]'}`}>
                                                                            {roundDuel.ratingA.toFixed(decimals)}
                                                                        </span>
                                                                    </div>
                                                                    <div className="flex items-center justify-between">
                                                                        <span className={roundDuel.winner === 'b' ? 'font-bold text-white' : 'text-[var(--text-muted)]'}>
                                                                            {teammateCode}
                                                                        </span>
                                                                        <span className={`tabular-nums ${roundDuel.winner === 'b' ? 'font-bold text-[var(--accent-yellow)]' : 'text-[var(--text-secondary)]'}`}>
                                                                            {roundDuel.ratingB.toFixed(decimals)}
                                                                        </span>
                                                                    </div>
                                                                </div>

                                                                <div className="mt-1.5 border-t border-white/10 pt-1 text-center font-oxanium text-[9px] uppercase">
                                                                    {roundDuel.winner === 'a' ? (
                                                                        <span className="font-bold text-[#00FF88]">
                                                                            {driverCode} +{absDiff}
                                                                        </span>
                                                                    ) : roundDuel.winner === 'b' ? (
                                                                        <span className="font-bold text-[var(--accent-red)]">
                                                                            {teammateCode} +{absDiff}
                                                                        </span>
                                                                    ) : (
                                                                        <span className="text-[var(--text-muted)]">TIED</span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* CAREER QUALIFYING H2H & RACE H2H (VERTICAL MULTI-SEASON EXPANDABLE) */}
                <div className="pt-4 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-color)] pb-2">
                        <div className="flex items-center gap-3">
                            <Swords size={16} className="text-[var(--accent-yellow)]" />
                            <h4 className="font-display text-lg md:text-xl text-white uppercase tracking-wider">
                                CAREER TEAMMATE H2H • ALL SEASONS
                            </h4>
                        </div>
                        <div className="flex items-center gap-2">
                            {careerH2HLoading && (
                                <span className="inline-flex items-center gap-1.5 font-oxanium text-[10px] uppercase tracking-wider text-[var(--accent-yellow)]">
                                    <Loader2 size={11} className="animate-spin" />
                                    {careerH2HProgress && careerH2HProgress.total > 0
                                        ? `LOADING CAREER SEASONS (${careerH2HProgress.loaded}/${careerH2HProgress.total})...`
                                        : 'LOADING CAREER SEASONS...'}
                                </span>
                            )}
                            <span className="font-oxanium text-[10px] uppercase tracking-widest text-[var(--text-muted)]">
                                CLICK ANY SEASON TO EXPAND RACE-BY-RACE
                            </span>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                        <CareerTeammateH2HColumn
                            mode="qualifying"
                            driverName={driverIdentity.driverName}
                            entries={displayedCareerH2H}
                            loading={careerH2HLoading && displayedCareerH2H.length === 0}
                            expandedId={expandedQualiId}
                            onToggleExpand={id => setExpandedQualiId(current => (current === id ? null : id))}
                        />
                        <CareerTeammateH2HColumn
                            mode="race"
                            driverName={driverIdentity.driverName}
                            entries={displayedCareerH2H}
                            loading={careerH2HLoading && displayedCareerH2H.length === 0}
                            expandedId={expandedRaceId}
                            onToggleExpand={id => setExpandedRaceId(current => (current === id ? null : id))}
                        />
                    </div>
                </div>
            </motion.div>

            {/* 3. SECTION: COMMUNITY VOTE DISTRIBUTION */}
            <motion.div
                ref={distributionSectionRef}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="space-y-4"
            >
                <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-2">
                    <div className="flex items-center gap-3">
                        <BarChart3 size={18} className="text-[var(--accent-yellow)]" />
                        <h3 className="font-display text-2xl text-white uppercase tracking-wider">
                            COMMUNITY RATING DISTRIBUTION
                        </h3>
                    </div>
                    <span className="font-oxanium text-[10px] uppercase tracking-widest text-[var(--text-muted)]">
                        0.5 – 10.0 SCORE HISTOGRAM
                    </span>
                </div>

                <div className="border border-[var(--border-color)] bg-[var(--bg-panel)] p-4 md:p-6">
                    <CommunityRatingDistribution
                        driverName={driverIdentity.driverName}
                        communityStatus={community.status}
                        distributionStatus={distributionState.status}
                        distribution={distributionState.distribution}
                        voteCount={communityComparison.voteCount}
                    />
                </div>
            </motion.div>

            {/* 4. SECTION: SEASON RACE-BY-RACE TELEMETRY LOG */}
            <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="space-y-4"
            >
                <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-2">
                    <div className="flex items-center gap-3">
                        <Table size={18} className="text-[var(--accent-red)]" />
                        <h3 className="font-display text-2xl text-white uppercase tracking-wider">
                            {season} RACE-BY-RACE TELEMETRY
                        </h3>
                    </div>
                    <span className="font-oxanium text-[10px] uppercase tracking-widest text-[var(--text-muted)]">
                        {raceLog.length} RACES
                    </span>
                </div>

                {raceLog.length === 0 ? (
                    <div className="border border-[var(--border-color)] bg-[var(--bg-panel)] p-8 text-center">
                        <p className="font-oxanium text-sm uppercase tracking-wider text-[var(--text-muted)]">
                            No race telemetry recorded for this season yet.
                        </p>
                    </div>
                ) : (
                    <div className="border border-[var(--border-color)] bg-[var(--bg-panel)] overflow-hidden">
                        <div className="overflow-x-auto">
                            <table aria-label="Driver season race log" className="w-full min-w-max">
                                <thead>
                                    <tr className="border-b border-[var(--border-color)] bg-[var(--bg-darker)] font-oxanium text-[10px] uppercase text-[var(--text-muted)]">
                                        <th className="px-3 py-2.5 text-left">RND</th>
                                        <th className="px-3 py-2.5 text-left">GRAND PRIX</th>
                                        <th className="px-3 py-2.5 text-left">TEAM</th>
                                        <th className="px-3 py-2.5 text-center">GRD</th>
                                        <th className="px-3 py-2.5 text-center">FIN</th>
                                        <th className="px-3 py-2.5 text-center">PTS</th>
                                        <th
                                            aria-sort={
                                                raceLogSort?.key === 'myRating'
                                                    ? (raceLogSort.direction === 'desc' ? 'descending' : 'ascending')
                                                    : 'none'
                                            }
                                            className="px-3 py-2.5 text-center"
                                        >
                                            <button
                                                type="button"
                                                onClick={() => setRaceLogSort(current => nextRaceLogSortState(current, 'myRating'))}
                                                className={`inline-flex items-center justify-center gap-1 cursor-pointer select-none uppercase transition-colors hover:text-white ${
                                                    raceLogSort?.key === 'myRating' ? 'text-[var(--accent-yellow)] font-bold' : 'text-[var(--text-muted)]'
                                                }`}
                                                title="Click to sort by My Rating (High → Low → Default)"
                                            >
                                                <span>MY RATING</span>
                                                {raceLogSort?.key === 'myRating' ? (
                                                    raceLogSort.direction === 'desc' ? (
                                                        <ArrowDown size={11} />
                                                    ) : (
                                                        <ArrowUp size={11} />
                                                    )
                                                ) : (
                                                    <ArrowUpDown size={11} className="opacity-50" />
                                                )}
                                            </button>
                                        </th>
                                        <th
                                            aria-sort={
                                                raceLogSort?.key === 'communityRating'
                                                    ? (raceLogSort.direction === 'desc' ? 'descending' : 'ascending')
                                                    : 'none'
                                            }
                                            className="px-3 py-2.5 text-center"
                                        >
                                            <button
                                                type="button"
                                                onClick={() => setRaceLogSort(current => nextRaceLogSortState(current, 'communityRating'))}
                                                className={`inline-flex items-center justify-center gap-1 cursor-pointer select-none uppercase transition-colors hover:text-white ${
                                                    raceLogSort?.key === 'communityRating' ? 'text-[var(--accent-yellow)] font-bold' : 'text-[var(--text-muted)]'
                                                }`}
                                                title="Click to sort by Community Avg (High → Low → Default)"
                                            >
                                                <span>COMMUNITY AVG</span>
                                                {raceLogSort?.key === 'communityRating' ? (
                                                    raceLogSort.direction === 'desc' ? (
                                                        <ArrowDown size={11} />
                                                    ) : (
                                                        <ArrowUp size={11} />
                                                    )
                                                ) : (
                                                    <ArrowUpDown size={11} className="opacity-50" />
                                                )}
                                            </button>
                                        </th>
                                        <th className="px-3 py-2.5 text-center">DIFF</th>
                                        {onSelectRace && <th className="px-3 py-2.5 text-right">ACTION</th>}
                                    </tr>
                                </thead>
                                <tbody>
                                    {sortedRaceLog.map(entry => {
                                        const entryColor = getTeamColor(entry.constructorId);
                                        return (
                                            <tr
                                                key={entry.round}
                                                className="border-b border-[var(--border-color)] hover:bg-[var(--bg-panel-hover)] transition-colors"
                                            >
                                                <td className="px-3 py-2.5 font-oxanium text-xs text-[var(--text-muted)]">
                                                    R{entry.round}
                                                </td>
                                                <td className="px-3 py-2.5">
                                                    <div className="flex items-center gap-2">
                                                        {entry.countryCode !== 'XX' && (
                                                            <CountryFlag country={entry.countryCode} size="sm" />
                                                        )}
                                                        <span className="font-display text-xs md:text-sm uppercase text-white">
                                                            {formatShortRaceName(entry.raceName)}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-3 py-2.5">
                                                    <div className="flex items-center gap-2">
                                                        <span className="h-3 w-1" style={{ backgroundColor: entryColor }} />
                                                        <span className="font-oxanium text-xs uppercase text-[var(--text-secondary)]">
                                                            {entry.constructorName}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-3 py-2.5 text-center font-oxanium text-xs text-[var(--text-secondary)]">
                                                    {entry.gridPosition !== null ? `P${entry.gridPosition}` : '—'}
                                                </td>
                                                <td className="px-3 py-2.5 text-center font-oxanium text-xs font-bold">
                                                    {entry.finishPosition !== null ? (
                                                        <span className={
                                                            entry.finishPosition === 1
                                                                ? 'text-[var(--accent-yellow)]'
                                                                : entry.finishPosition <= 3
                                                                    ? 'text-[#00FF88]'
                                                                    : 'text-white'
                                                        }>
                                                            P{entry.finishPosition}
                                                        </span>
                                                    ) : (
                                                        <span className="text-[var(--accent-red)]">{entry.status}</span>
                                                    )}
                                                </td>
                                                <td className="px-3 py-2.5 text-center font-oxanium text-xs text-[var(--accent-yellow)] font-bold">
                                                    {entry.points > 0 ? entry.points : '0'}
                                                </td>
                                                <td className="px-3 py-2.5 text-center font-oxanium text-sm font-bold tabular-nums">
                                                    {entry.myRating !== null ? (
                                                        <span style={{ color: getRatingColor(entry.myRating) }}>
                                                            {entry.myRating.toFixed(1)}
                                                        </span>
                                                    ) : (
                                                        <span className="text-[var(--text-muted)]">—</span>
                                                    )}
                                                </td>
                                                <td className="px-3 py-2.5 text-center font-oxanium text-sm font-bold tabular-nums">
                                                    {entry.communityRating !== null ? (
                                                        <span
                                                            style={{ color: getRatingColor(entry.communityRating) }}
                                                            title={`${entry.communityVotes} community votes`}
                                                        >
                                                            {entry.communityRating.toFixed(2)}
                                                        </span>
                                                    ) : (
                                                        <span className="text-[var(--text-muted)]">—</span>
                                                    )}
                                                </td>
                                                <td className="px-3 py-2.5 text-center font-oxanium text-xs tabular-nums">
                                                    {entry.ratingDelta !== null ? (
                                                        <span className={
                                                            entry.ratingDelta > 0
                                                                ? 'text-[#00FF88]'
                                                                : entry.ratingDelta < 0
                                                                    ? 'text-[var(--accent-red)]'
                                                                    : 'text-[var(--text-muted)]'
                                                        }>
                                                            {entry.ratingDelta > 0 ? '+' : ''}{entry.ratingDelta.toFixed(2)}
                                                        </span>
                                                    ) : (
                                                        <span className="text-[var(--text-muted)]">—</span>
                                                    )}
                                                </td>
                                                {onSelectRace && (
                                                    <td className="px-3 py-2.5 text-right">
                                                        <button
                                                            type="button"
                                                            onClick={() => onSelectRace(entry.round, entry.raceName, entry.date)}
                                                            className="border border-[var(--border-color)] bg-[var(--bg-darker)] px-2.5 py-1 font-oxanium text-[9px] font-bold uppercase tracking-wider text-white transition-colors hover:border-[var(--accent-red)]"
                                                        >
                                                            {entry.myRating !== null ? 'EDIT' : 'RATE'}
                                                        </button>
                                                    </td>
                                                )}
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </motion.div>

            {/* 5. SECTION: CAREER / MULTI-SEASON PERSONAL RATINGS HISTORY */}
            <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
                className="space-y-4"
            >
                <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-2">
                    <div className="flex items-center gap-3">
                        <History size={18} className="text-[var(--accent-yellow)]" />
                        <h3 className="font-display text-2xl text-white uppercase tracking-wider">
                            MY RATED SEASONS HISTORY
                        </h3>
                    </div>
                    <span className="font-oxanium text-[10px] uppercase tracking-widest text-[var(--text-muted)]">
                        {careerSeasons.length} {careerSeasons.length === 1 ? 'SEASON' : 'SEASONS'} RATED
                    </span>
                </div>

                {careerSeasons.length === 0 ? (
                    <div className="border border-[var(--border-color)] bg-[var(--bg-panel)] p-6 text-center">
                        <Trophy size={24} className="mx-auto mb-2 text-[var(--text-muted)] opacity-50" />
                        <p className="font-oxanium text-xs uppercase tracking-wider text-[var(--text-secondary)]">
                            You haven&apos;t rated {driverIdentity.driverName} in any season yet.
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {careerSeasons.map(summary => {
                            const isCurrentSeason = summary.season === season;
                            const sColor = getTeamColor(summary.constructorId);
                            return (
                                <button
                                    key={summary.season}
                                    type="button"
                                    onClick={() => onSelectSeason?.(summary.season)}
                                    className={`text-left border p-4 bg-[var(--bg-panel)] transition-all hover:border-white ${
                                        isCurrentSeason ? 'border-[var(--accent-yellow)]' : 'border-[var(--border-color)]'
                                    }`}
                                >
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="font-display text-2xl text-white">
                                            {summary.season} SEASON
                                        </span>
                                        <span
                                            className="font-oxanium text-2xl font-bold tabular-nums"
                                            style={{ color: getRatingColor(summary.averageRating) }}
                                        >
                                            {summary.averageRating.toFixed(2)}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2 mb-3">
                                        <span className="h-3 w-1" style={{ backgroundColor: sColor }} />
                                        <span className="font-oxanium text-xs uppercase text-[var(--text-secondary)]">
                                            {summary.constructorName}
                                        </span>
                                        <span className="ml-auto font-oxanium text-[9px] uppercase text-[var(--text-muted)]">
                                            {summary.source === 'race' ? `${summary.ratedRaces} RACES` : 'QUICK RATE'}
                                        </span>
                                    </div>
                                    {summary.bestRaceName && summary.bestRating !== null && (
                                        <div className="border-t border-[var(--border-color)] pt-2 flex justify-between font-oxanium text-[10px] text-[var(--text-muted)]">
                                            <span>BEST: {formatShortRaceName(summary.bestRaceName)}</span>
                                            <span className="text-[#00FF88] font-bold">{summary.bestRating.toFixed(1)}</span>
                                        </div>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                )}
            </motion.div>
        </div>
    );
}

function h2hRaceResultLabel(position: number | null, status?: string): string {
    if (position !== null) return `P${position}`;
    const normalizedStatus = status?.trim().toLowerCase() ?? '';
    if (!normalizedStatus) return '—';
    if (/\b(disqualified|dsq|dq)\b/.test(normalizedStatus)) return 'DSQ';
    if (/\bexcluded\b/.test(normalizedStatus)) return 'EXC';
    if (/^(did not qualify|failed to qualify|not qualified|dnq|dnpq)\b/.test(normalizedStatus)) return 'DNQ';
    if (/^(withdrew|withdrawn|wdr|wd)\b/.test(normalizedStatus)) return 'WDR';
    if (/^(did not start|not started|dns)\b/.test(normalizedStatus)) return 'DNS';
    return 'DNF';
}

interface CareerTeammateH2HColumnProps {
    mode: 'qualifying' | 'race';
    driverName: string;
    entries: CareerSeasonTeammateH2H[];
    loading: boolean;
    expandedId: string | null;
    onToggleExpand: (id: string) => void;
}

function CareerTeammateH2HColumn({
    mode,
    driverName,
    entries,
    loading,
    expandedId,
    onToggleExpand,
}: CareerTeammateH2HColumnProps) {
    const isQuali = mode === 'qualifying';
    const totalWinsDriver = entries.reduce(
        (acc, item) => acc + (isQuali ? item.qualiWinsDriver : item.raceWinsDriver),
        0,
    );
    const totalWinsTeammate = entries.reduce(
        (acc, item) => acc + (isQuali ? item.qualiWinsTeammate : item.raceWinsTeammate),
        0,
    );

    return (
        <div
            data-testid={`career-h2h-column-${mode}`}
            className="border border-[var(--border-color)] bg-[var(--bg-panel)] overflow-hidden"
        >
            {/* Top accent line */}
            <div
                className="h-0.5 w-full"
                style={{ backgroundColor: isQuali ? 'var(--accent-yellow)' : 'var(--accent-red)' }}
            />

            {/* Column Header */}
            <div className="flex items-center justify-between gap-2 border-b border-[var(--border-color)] bg-[var(--bg-darker)] px-4 py-3">
                <div className="flex items-center gap-2">
                    {isQuali ? (
                        <Timer size={15} className="text-[var(--accent-yellow)]" />
                    ) : (
                        <Flag size={15} className="text-[var(--accent-red)]" />
                    )}
                    <span className="font-display text-base md:text-lg uppercase tracking-wider text-white">
                        {isQuali ? 'QUALIFYING H2H' : 'RACE H2H'}
                    </span>
                </div>
                {entries.length > 0 && (
                    <span className="font-oxanium text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                        CAREER:{' '}
                        <span className="font-bold text-white tabular-nums">
                            {totalWinsDriver} – {totalWinsTeammate}
                        </span>
                    </span>
                )}
            </div>

            {loading ? (
                <div className="flex items-center justify-center gap-2 p-8 text-[var(--text-muted)]">
                    <Loader2 size={16} className="animate-spin text-[var(--accent-red)]" />
                    <span className="font-oxanium text-xs uppercase tracking-wider">
                        Loading career {isQuali ? 'qualifying' : 'race'} H2H...
                    </span>
                </div>
            ) : entries.length === 0 ? (
                <div className="p-6 text-center font-oxanium text-xs uppercase tracking-wider text-[var(--text-muted)]">
                    No {isQuali ? 'qualifying' : 'race'} head-to-head records found.
                </div>
            ) : (
                <div className="divide-y divide-[var(--border-color)]">
                    {entries.map(entry => {
                        const winsDriver = isQuali ? entry.qualiWinsDriver : entry.raceWinsDriver;
                        const winsTeammate = isQuali ? entry.qualiWinsTeammate : entry.raceWinsTeammate;
                        const winPct = isQuali ? entry.qualiWinPctDriver : entry.raceWinPctDriver;
                        const rounds = isQuali ? entry.qualiRounds : entry.raceRounds;
                        const decidedTotal = winsDriver + winsTeammate;
                        const isWinner = winsDriver > winsTeammate;
                        const isLoser = winsTeammate > winsDriver;
                        const isTied = decidedTotal > 0 && winsDriver === winsTeammate;
                        const expanded = expandedId === entry.id;
                        const stintColor = getTeamColor(entry.constructorId);

                        const scoreColorClass = decidedTotal === 0
                            ? 'text-[var(--text-muted)]'
                            : isWinner
                                ? 'text-[#00FF88]'
                                : isLoser
                                    ? 'text-[var(--accent-red)]'
                                    : 'text-[var(--accent-yellow)]';

                        return (
                            <div key={`${mode}_${entry.id}`} className="bg-[var(--bg-panel)]">
                                <button
                                    type="button"
                                    aria-expanded={expanded}
                                    onClick={() => onToggleExpand(entry.id)}
                                    className="w-full px-4 py-3.5 text-left transition-colors hover:bg-[var(--bg-panel-hover)] cursor-pointer"
                                >
                                    {/* Top Row: Year · Teammate + Score */}
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span
                                                className="h-3.5 w-1 shrink-0"
                                                style={{ backgroundColor: stintColor }}
                                            />
                                            <span className="font-oxanium text-sm font-bold text-white tabular-nums">
                                                {entry.season}
                                            </span>
                                            <span className="text-[var(--text-muted)]">·</span>
                                            <span className="truncate font-display text-sm md:text-base uppercase text-white tracking-wide">
                                                {entry.teammateName}
                                            </span>
                                            <span className="hidden sm:inline font-oxanium text-[9px] uppercase tracking-wider text-[var(--text-muted)]">
                                                {entry.constructorName}
                                            </span>
                                        </div>

                                        <div className="flex items-center gap-2.5 shrink-0">
                                            <span className={`font-oxanium text-sm md:text-base font-bold tabular-nums ${scoreColorClass}`}>
                                                {winsDriver} – {winsTeammate}
                                            </span>
                                            <ChevronDown
                                                size={14}
                                                className={`text-[var(--text-muted)] transition-transform duration-200 ${
                                                    expanded ? 'rotate-180 text-[var(--accent-yellow)]' : ''
                                                }`}
                                            />
                                        </div>
                                    </div>

                                    {/* Middle Progress Bar */}
                                    <div className="mt-2.5 flex h-2 w-full overflow-hidden bg-[var(--bg-darker)] border border-white/5">
                                        {decidedTotal === 0 ? (
                                            <div className="h-full w-full bg-white/10" />
                                        ) : isTied ? (
                                            <div className="h-full w-full bg-[var(--accent-yellow)]" />
                                        ) : (
                                            <>
                                                <div
                                                    className="h-full transition-all duration-300"
                                                    style={{
                                                        width: `${winPct}%`,
                                                        backgroundColor: isWinner ? '#00FF88' : 'rgba(0, 255, 136, 0.35)',
                                                    }}
                                                />
                                                <div
                                                    className="h-full transition-all duration-300"
                                                    style={{
                                                        width: `${Math.max(0, 100 - winPct)}%`,
                                                        backgroundColor: isLoser ? 'var(--accent-red)' : 'rgba(225, 6, 0, 0.35)',
                                                    }}
                                                />
                                            </>
                                        )}
                                    </div>

                                    {/* Bottom Stats Row: X ahead | % | Y ahead */}
                                    <div className="mt-1.5 flex items-center justify-between font-oxanium text-[10px]">
                                        <span className="text-[var(--text-muted)] tabular-nums">
                                            {winsDriver} ahead
                                        </span>
                                        <span className="font-bold text-white tabular-nums">
                                            {decidedTotal > 0 ? `${winPct.toFixed(2)}%` : '0.00%'}
                                        </span>
                                        <span className="text-[var(--text-muted)] tabular-nums">
                                            {winsTeammate} ahead
                                        </span>
                                    </div>
                                </button>

                                {/* Expanded Vertical Race-by-Race Table */}
                                {expanded && (
                                    <div className="border-t border-[var(--border-color)] bg-[var(--bg-darker)]">
                                        <div className="grid grid-cols-[minmax(0,1.4fr)_1fr_1fr] items-center border-b border-[var(--border-color)] px-3 md:px-4 py-2 font-oxanium text-[9px] uppercase tracking-wider text-[var(--text-muted)]">
                                            <span>RACE</span>
                                            <span className="text-center truncate px-1">{driverName}</span>
                                            <span className="text-center truncate px-1">{entry.teammateName}</span>
                                        </div>

                                        <div className="divide-y divide-white/[0.04]">
                                            {rounds.map(roundItem => {
                                                const rowStyle = roundItem.winner === 'driver'
                                                    ? 'bg-[#00FF88]/[0.07] border-l-2 border-l-[#00FF88]'
                                                    : roundItem.winner === 'teammate'
                                                        ? 'bg-[var(--accent-red)]/[0.09] border-l-2 border-l-[var(--accent-red)]'
                                                        : 'bg-[var(--accent-yellow)]/[0.05] border-l-2 border-l-[var(--accent-yellow)]/50';

                                                const driverCellColor = roundItem.winner === 'driver'
                                                    ? 'font-bold text-[#00FF88]'
                                                    : roundItem.winner === 'teammate'
                                                        ? 'text-[var(--accent-red)]/80'
                                                        : 'text-[var(--text-secondary)]';

                                                const teammateCellColor = roundItem.winner === 'teammate'
                                                    ? 'font-bold text-white'
                                                    : 'text-[var(--text-secondary)]';

                                                return (
                                                    <div
                                                        key={roundItem.round}
                                                        className={`grid grid-cols-[minmax(0,1.4fr)_1fr_1fr] items-center px-3 md:px-4 py-2 transition-colors ${rowStyle}`}
                                                    >
                                                        <div className="flex items-center gap-2 min-w-0 pr-2">
                                                            {roundItem.countryCode !== 'XX' && (
                                                                <CountryFlag country={roundItem.countryCode} size="sm" />
                                                            )}
                                                            <span className="truncate font-ui text-xs text-white">
                                                                {formatShortRaceName(roundItem.raceName)} GP
                                                            </span>
                                                        </div>

                                                        <div
                                                            className={`text-center font-oxanium text-xs tabular-nums ${driverCellColor}`}
                                                            title={roundItem.driverStatus}
                                                        >
                                                            {h2hRaceResultLabel(roundItem.driverPosition, roundItem.driverStatus)}
                                                        </div>

                                                        <div
                                                            className={`text-center font-oxanium text-xs tabular-nums ${teammateCellColor}`}
                                                            title={roundItem.teammateStatus}
                                                        >
                                                            {h2hRaceResultLabel(roundItem.teammatePosition, roundItem.teammateStatus)}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

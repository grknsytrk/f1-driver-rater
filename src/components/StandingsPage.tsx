import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Medal, Users, Loader2, AlertTriangle } from 'lucide-react';
import { getDriverSeasonStats, getConstructorStandings, getAllSeasonResults, getAllSeasonSprints, getRaces, RateLimitError } from '../api/f1Api';
import type { DriverSeasonStats, ConstructorStanding, SeasonRaceResult, SeasonSprintResult } from '../api/f1Api';
import type { Race } from '../types';
import { TEAM_COLORS } from '../types';
import { getCountryCode } from '../utils/storage';
import { CountryFlag } from '../utils/countryFlags';

interface StandingsPageProps {
    season: string;
    onBack: () => void;
}

type TabType = 'wdc' | 'wcc';

interface RaceColumn {
    round: string;
    raceName: string;
    countryCode: string;
}

export function StandingsPage({ season }: StandingsPageProps) {
    const [activeTab, setActiveTab] = useState<TabType>('wdc');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    
    // WDC data
    const [driverStats, setDriverStats] = useState<DriverSeasonStats[]>([]);
    
    // WCC data
    const [constructorStandings, setConstructorStandings] = useState<ConstructorStanding[]>([]);
    
    // Race-by-race data
    const [raceResults, setRaceResults] = useState<SeasonRaceResult[]>([]);
    const [sprintResults, setSprintResults] = useState<SeasonSprintResult[]>([]);
    const [races, setRaces] = useState<RaceColumn[]>([]);

    useEffect(() => {
        loadData();
    }, [season]);

    async function loadData() {
        setLoading(true);
        setError(null);
        
        try {
            const [driverRes, constructorRes, resultsRes, sprintRes, racesRes] = await Promise.allSettled([
                getDriverSeasonStats(season),
                getConstructorStandings(season),
                getAllSeasonResults(season),
                getAllSeasonSprints(season),
                getRaces(season),
            ]);

            if (driverRes.status === 'fulfilled') {
                setDriverStats(driverRes.value);
            } else if (driverRes.reason instanceof RateLimitError) {
                setError('API rate limit reached. Please try again shortly.');
            }

            if (constructorRes.status === 'fulfilled') {
                setConstructorStandings(constructorRes.value);
            }

            if (resultsRes.status === 'fulfilled') {
                setRaceResults(resultsRes.value);
            }

            if (sprintRes.status === 'fulfilled') {
                setSprintResults(sprintRes.value);
            }

            if (racesRes.status === 'fulfilled') {
                // Build race columns from races data
                const raceColumns: RaceColumn[] = racesRes.value
                    .filter((race: Race) => {
                        // Only include races that have happened (have results)
                        const raceDate = new Date(race.date);
                        return raceDate < new Date();
                    })
                    .map((race: Race) => ({
                        round: race.round,
                        raceName: race.raceName.replace(' Grand Prix', '').replace(' GP', ''),
                        countryCode: getCountryCode(race.raceName),
                    }));
                setRaces(raceColumns);
            }
        } catch (err) {
            console.error('Error loading standings:', err);
            setError('Failed to load standings data.');
        } finally {
            setLoading(false);
        }
    }

    function getTeamColor(constructorId: string): string {
        return TEAM_COLORS[constructorId] || '#888888';
    }

    // Build WDC race-by-race map: driverId -> { round -> { position, points } }
    const wdcRaceMap = new Map<string, Map<string, { position: number | null | undefined; points: number }>>();
    raceResults.forEach(result => {
        if (!wdcRaceMap.has(result.driverId)) {
            wdcRaceMap.set(result.driverId, new Map());
        }
        wdcRaceMap.get(result.driverId)!.set(result.round, {
            position: result.position,
            points: result.points,
        });
    });

    // Merge sprint points into WDC map (weekend points = GP + Sprint)
    sprintResults.forEach(result => {
        if (!wdcRaceMap.has(result.driverId)) {
            wdcRaceMap.set(result.driverId, new Map());
        }
        const driverRounds = wdcRaceMap.get(result.driverId)!;
        const prev = driverRounds.get(result.round);
        if (prev) {
            driverRounds.set(result.round, { ...prev, points: prev.points + result.points });
        } else {
            // If we have sprint but no GP result, keep position undefined (not DNF)
            driverRounds.set(result.round, { position: undefined, points: result.points });
        }
    });

    // Build WCC race-by-race map: constructorId -> { round -> totalPoints }
    const wccRaceMap = new Map<string, Map<string, number>>();
    // Calculate podiums per constructor
    const constructorPodiums = new Map<string, number>();
    // Calculate poles per constructor (from driver stats)
    const constructorPoles = new Map<string, number>();
    
    // Sum up poles from all drivers per constructor
    driverStats.forEach(driver => {
        const currentPoles = constructorPoles.get(driver.constructorId) || 0;
        constructorPoles.set(driver.constructorId, currentPoles + driver.poles);
    });
    
    raceResults.forEach(result => {
        if (!wccRaceMap.has(result.constructorId)) {
            wccRaceMap.set(result.constructorId, new Map());
        }
        const constructorRaces = wccRaceMap.get(result.constructorId)!;
        const currentPoints = constructorRaces.get(result.round) || 0;
        constructorRaces.set(result.round, currentPoints + result.points);
        
        // Count podiums (position 1, 2, or 3)
        if (result.position !== null && result.position <= 3) {
            const currentPodiums = constructorPodiums.get(result.constructorId) || 0;
            constructorPodiums.set(result.constructorId, currentPodiums + 1);
        }
    });

    // Merge sprint points into WCC map (weekend points = GP + Sprint)
    sprintResults.forEach(result => {
        if (!wccRaceMap.has(result.constructorId)) {
            wccRaceMap.set(result.constructorId, new Map());
        }
        const constructorRounds = wccRaceMap.get(result.constructorId)!;
        const currentPoints = constructorRounds.get(result.round) || 0;
        constructorRounds.set(result.round, currentPoints + result.points);
    });

    // Build latest team map: driverId -> { constructorId, constructorName } from highest round
    // This ensures mid-season team changes show the end-of-season (or latest completed race) team
    const latestTeamByDriverId = new Map<string, { constructorId: string; constructorName: string }>();
    const driverMaxRound = new Map<string, number>(); // track highest round per driver
    
    raceResults.forEach(result => {
        const roundNum = parseInt(result.round);
        const currentMax = driverMaxRound.get(result.driverId) || 0;
        
        if (roundNum > currentMax) {
            driverMaxRound.set(result.driverId, roundNum);
            latestTeamByDriverId.set(result.driverId, {
                constructorId: result.constructorId,
                constructorName: result.constructorName,
            });
        }
    });

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[50vh] text-center p-8">
                <Loader2 size={48} className="text-[var(--accent-red)] mb-4 animate-spin" />
                <h3 className="font-display text-2xl text-white uppercase mb-2">LOADING STANDINGS</h3>
                <p className="font-oxanium text-[var(--text-secondary)]">
                    Fetching {season} season data...
                </p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[50vh] text-center p-8">
                <AlertTriangle size={48} className="text-[var(--accent-orange)] mb-4" />
                <h3 className="font-display text-2xl text-white uppercase mb-2">ERROR</h3>
                <p className="font-oxanium text-[var(--text-secondary)]">{error}</p>
                <button
                    onClick={loadData}
                    className="mt-4 px-4 py-2 bg-[var(--bg-panel)] border border-[var(--border-color)] hover:border-[var(--accent-red)] text-white font-oxanium text-sm uppercase tracking-wider transition-colors"
                >
                    Retry
                </button>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto px-4 py-8">
            {/* Header */}
            <div className="mb-8">
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col items-start border-l-4 border-[var(--accent-yellow)] pl-4 md:pl-6"
                >
                    <h2 className="font-display text-3xl md:text-5xl text-white uppercase tracking-tight leading-none">
                        {season} <span className="text-[var(--accent-yellow)]">STANDINGS</span>
                    </h2>
                    <div className="h-px w-16 md:w-32 bg-[var(--accent-yellow)] mt-2" />
                </motion.div>
            </div>

            {/* Tabs */}
            <div className="mb-6 flex gap-2">
                <button
                    onClick={() => setActiveTab('wdc')}
                    className={`flex items-center gap-2 px-4 py-2 border transition-all ${
                        activeTab === 'wdc'
                            ? 'bg-[var(--accent-yellow)]/10 border-[var(--accent-yellow)] text-[var(--accent-yellow)]'
                            : 'bg-[var(--bg-panel)] border-[var(--border-color)] text-[var(--text-muted)] hover:border-white hover:text-white'
                    }`}
                >
                    <Medal size={16} />
                    <span className="font-display text-sm uppercase tracking-wider">Drivers</span>
                </button>
                <button
                    onClick={() => setActiveTab('wcc')}
                    className={`flex items-center gap-2 px-4 py-2 border transition-all ${
                        activeTab === 'wcc'
                            ? 'bg-[var(--accent-yellow)]/10 border-[var(--accent-yellow)] text-[var(--accent-yellow)]'
                            : 'bg-[var(--bg-panel)] border-[var(--border-color)] text-[var(--text-muted)] hover:border-white hover:text-white'
                    }`}
                >
                    <Users size={16} />
                    <span className="font-display text-sm uppercase tracking-wider">Constructors</span>
                </button>
            </div>

            {/* Content */}
            {activeTab === 'wdc' ? (
                <WDCTable
                    drivers={driverStats}
                    races={races}
                    raceMap={wdcRaceMap}
                    latestTeamMap={latestTeamByDriverId}
                    getTeamColor={getTeamColor}
                />
            ) : (
                <WCCTable
                    constructors={constructorStandings}
                    races={races}
                    raceMap={wccRaceMap}
                    polesMap={constructorPoles}
                    podiumsMap={constructorPodiums}
                    getTeamColor={getTeamColor}
                />
            )}
        </div>
    );
}

// WDC Table Component
interface WDCTableProps {
    drivers: DriverSeasonStats[];
    races: RaceColumn[];
    raceMap: Map<string, Map<string, { position: number | null | undefined; points: number }>>;
    latestTeamMap: Map<string, { constructorId: string; constructorName: string }>;
    getTeamColor: (constructorId: string) => string;
}

function WDCTable({ drivers, races, raceMap, latestTeamMap, getTeamColor }: WDCTableProps) {
    if (drivers.length === 0) {
        return (
            <div className="text-center py-12 text-[var(--text-muted)]">
                <p className="font-oxanium">No driver standings data available.</p>
            </div>
        );
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-[var(--bg-panel)] border border-[var(--border-color)] overflow-hidden"
        >
            <div className="overflow-x-auto">
                <table className="w-full min-w-max">
                    {/* Header */}
                    <thead>
                        <tr className="border-b border-[var(--border-color)]">
                            <th className="sticky left-0 z-10 bg-[var(--bg-darker)] px-3 py-2 text-left w-12">
                                <span className="font-oxanium text-[10px] text-[var(--text-muted)] uppercase">#</span>
                            </th>
                            <th className="sticky left-12 z-10 bg-[var(--bg-darker)] px-3 py-2 text-left min-w-[140px]">
                                <span className="font-oxanium text-[10px] text-[var(--text-muted)] uppercase">DRIVER</span>
                            </th>
                            <th className="sticky left-[188px] z-10 bg-[var(--bg-darker)] px-3 py-2 text-center w-16">
                                <span className="font-oxanium text-[10px] text-[var(--accent-yellow)] uppercase">PTS</span>
                            </th>
                            <th className="sticky left-[252px] z-10 bg-[var(--bg-darker)] px-2 py-2 text-center w-12">
                                <span className="font-oxanium text-[10px] text-[#00FF88] uppercase">WIN</span>
                            </th>
                            <th className="sticky left-[300px] z-10 bg-[var(--bg-darker)] px-2 py-2 text-center w-12">
                                <span className="font-oxanium text-[10px] text-[#FF00FF] uppercase">PP</span>
                            </th>
                            <th className="sticky left-[348px] z-10 bg-[var(--bg-darker)] px-2 py-2 text-center w-12 border-r border-[var(--border-color)]">
                                <span className="font-oxanium text-[10px] text-[var(--accent-orange)] uppercase">POD</span>
                            </th>
                            {races.map(race => (
                                <th key={race.round} className="bg-[var(--bg-darker)] px-2 py-2 text-center min-w-[56px]" title={race.raceName}>
                                    <div className="flex flex-col items-center gap-1">
                                        <CountryFlag country={race.countryCode} size="sm" />
                                    </div>
                                </th>
                            ))}
                        </tr>
                    </thead>

                    {/* Body */}
                    <tbody>
                        {drivers.map((driver, index) => {
                            const driverRaces = raceMap.get(driver.driverId);
                            // Use latest team from race results (end-of-season team), fallback to standings data
                            const latestTeam = latestTeamMap.get(driver.driverId);
                            const displayConstructorId = latestTeam?.constructorId ?? driver.constructorId;
                            const displayConstructorName = latestTeam?.constructorName ?? driver.constructorName;
                            
                            return (
                                <tr
                                    key={driver.driverId}
                                    className="border-b border-[var(--border-color)] hover:bg-[var(--bg-panel-hover)] transition-colors"
                                >
                                    {/* Position */}
                                    <td className="sticky left-0 z-10 bg-[var(--bg-panel)] px-3 py-2 text-center">
                                        <span className={`font-oxanium text-sm ${index < 3 ? 'text-[var(--accent-yellow)] font-bold' : 'text-[var(--text-muted)]'}`}>
                                            {driver.position}
                                        </span>
                                    </td>

                                    {/* Driver Name */}
                                    <td className="sticky left-12 z-10 bg-[var(--bg-panel)] px-3 py-2">
                                        <div className="flex items-center gap-2">
                                            <div className="w-1 h-6" style={{ backgroundColor: getTeamColor(displayConstructorId) }} />
                                            <div>
                                                <div className="font-display text-sm text-white uppercase leading-none">
                                                    {driver.driverName.split(' ')[1] || driver.driverName}
                                                </div>
                                                <div className="font-oxanium text-[8px] text-[var(--text-muted)] uppercase">
                                                    {displayConstructorName}
                                                </div>
                                            </div>
                                        </div>
                                    </td>

                                    {/* Points */}
                                    <td className="sticky left-[188px] z-10 px-3 py-2 text-center bg-[var(--bg-panel)]">
                                        <span className="font-oxanium text-sm font-bold text-[var(--accent-yellow)]">
                                            {driver.points}
                                        </span>
                                    </td>

                                    {/* Wins */}
                                    <td className="sticky left-[252px] z-10 px-2 py-2 text-center bg-[var(--bg-panel)]">
                                        <span className={`font-oxanium text-sm font-bold ${driver.wins > 0 ? 'text-[#00FF88]' : 'text-[var(--text-muted)]'}`}>
                                            {driver.wins}
                                        </span>
                                    </td>

                                    {/* Poles */}
                                    <td className="sticky left-[300px] z-10 px-2 py-2 text-center bg-[var(--bg-panel)]">
                                        <span className={`font-oxanium text-sm font-bold ${driver.poles > 0 ? 'text-[#FF00FF]' : 'text-[var(--text-muted)]'}`}>
                                            {driver.poles}
                                        </span>
                                    </td>

                                    {/* Podiums */}
                                    <td className="sticky left-[348px] z-10 px-2 py-2 text-center border-r border-[var(--border-color)] bg-[var(--bg-panel)]">
                                        <span className={`font-oxanium text-sm font-bold ${driver.podiums > 0 ? 'text-[var(--accent-orange)]' : 'text-[var(--text-muted)]'}`}>
                                            {driver.podiums}
                                        </span>
                                    </td>

                                    {/* Race Results - pts/pos format (e.g., 25/1) */}
                                    {races.map(race => {
                                        const raceData = driverRaces?.get(race.round);
                                        const hasData = raceData !== undefined;
                                        const position = raceData?.position;
                                        const points = raceData?.points || 0;

                                        return (
                                            <td key={race.round} className="px-2 py-2 text-center">
                                                {hasData ? (
                                                    <span className="font-oxanium text-sm font-medium whitespace-nowrap">
                                                        {position === null ? (
                                                            <span className="text-[var(--text-muted)]">DNF</span>
                                                        ) : (
                                                            <>
                                                                <span className={`${
                                                                    position === 1 ? 'text-[var(--accent-yellow)]' :
                                                                    position && position <= 3 ? 'text-white' :
                                                                    points > 0 ? 'text-white' : 'text-[var(--text-muted)]'
                                                                }`}>
                                                                    {points}
                                                                </span>
                                                                {position !== undefined && (
                                                                    <span className="text-[10px] text-[var(--text-muted)]">
                                                                        /{position}
                                                                    </span>
                                                                )}
                                                            </>
                                                        )}
                                                    </span>
                                                ) : (
                                                    <span className="text-[var(--text-muted)]">—</span>
                                                )}
                                            </td>
                                        );
                                    })}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </motion.div>
    );
}

// WCC Table Component
interface WCCTableProps {
    constructors: ConstructorStanding[];
    races: RaceColumn[];
    raceMap: Map<string, Map<string, number>>;
    polesMap: Map<string, number>;
    podiumsMap: Map<string, number>;
    getTeamColor: (constructorId: string) => string;
}

function WCCTable({ constructors, races, raceMap, polesMap, podiumsMap, getTeamColor }: WCCTableProps) {
    if (constructors.length === 0) {
        return (
            <div className="text-center py-12 text-[var(--text-muted)]">
                <p className="font-oxanium">No constructor standings data available.</p>
            </div>
        );
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-[var(--bg-panel)] border border-[var(--border-color)] overflow-hidden"
        >
            <div className="overflow-x-auto">
                <table className="w-full min-w-max">
                    {/* Header */}
                    <thead>
                        <tr className="border-b border-[var(--border-color)]">
                            <th className="sticky left-0 z-10 bg-[var(--bg-darker)] px-3 py-2 text-left w-12">
                                <span className="font-oxanium text-[10px] text-[var(--text-muted)] uppercase">#</span>
                            </th>
                            <th className="sticky left-12 z-10 bg-[var(--bg-darker)] px-3 py-2 text-left min-w-[160px]">
                                <span className="font-oxanium text-[10px] text-[var(--text-muted)] uppercase">CONSTRUCTOR</span>
                            </th>
                            <th className="sticky left-[208px] z-10 bg-[var(--bg-darker)] px-3 py-2 text-center w-16">
                                <span className="font-oxanium text-[10px] text-[var(--accent-yellow)] uppercase">PTS</span>
                            </th>
                            <th className="sticky left-[272px] z-10 bg-[var(--bg-darker)] px-2 py-2 text-center w-12">
                                <span className="font-oxanium text-[10px] text-[#00FF88] uppercase">WIN</span>
                            </th>
                            <th className="sticky left-[320px] z-10 bg-[var(--bg-darker)] px-2 py-2 text-center w-12">
                                <span className="font-oxanium text-[10px] text-[#FF00FF] uppercase">PP</span>
                            </th>
                            <th className="sticky left-[368px] z-10 bg-[var(--bg-darker)] px-2 py-2 text-center w-12 border-r border-[var(--border-color)]">
                                <span className="font-oxanium text-[10px] text-[var(--accent-orange)] uppercase">POD</span>
                            </th>
                            {races.map(race => (
                                <th key={race.round} className="bg-[var(--bg-darker)] px-2 py-2 text-center min-w-[48px]" title={race.raceName}>
                                    <div className="flex flex-col items-center gap-1">
                                        <CountryFlag country={race.countryCode} size="sm" />
                                    </div>
                                </th>
                            ))}
                        </tr>
                    </thead>

                    {/* Body */}
                    <tbody>
                        {constructors.map((constructor) => {
                            const constructorRaces = raceMap.get(constructor.constructorId);
                            
                            return (
                                <tr
                                    key={constructor.constructorId}
                                    className="border-b border-[var(--border-color)] hover:bg-[var(--bg-panel-hover)] transition-colors"
                                >
                                    {/* Position */}
                                    <td className="sticky left-0 z-10 bg-[var(--bg-panel)] px-3 py-2 text-center">
                                        <span className={`font-oxanium text-sm ${constructor.position <= 3 ? 'text-[var(--accent-yellow)] font-bold' : 'text-[var(--text-muted)]'}`}>
                                            {constructor.position}
                                        </span>
                                    </td>

                                    {/* Constructor Name */}
                                    <td className="sticky left-12 z-10 bg-[var(--bg-panel)] px-3 py-2">
                                        <div className="flex items-center gap-2">
                                            <div className="w-1 h-6" style={{ backgroundColor: getTeamColor(constructor.constructorId) }} />
                                            <div className="font-display text-sm text-white uppercase leading-none">
                                                {constructor.constructorName}
                                            </div>
                                        </div>
                                    </td>

                                    {/* Points */}
                                    <td className="sticky left-[208px] z-10 px-3 py-2 text-center bg-[var(--bg-panel)]">
                                        <span className="font-oxanium text-sm font-bold text-[var(--accent-yellow)]">
                                            {constructor.points}
                                        </span>
                                    </td>

                                    {/* Wins */}
                                    <td className="sticky left-[272px] z-10 px-2 py-2 text-center bg-[var(--bg-panel)]">
                                        <span className={`font-oxanium text-sm font-bold ${constructor.wins > 0 ? 'text-[#00FF88]' : 'text-[var(--text-muted)]'}`}>
                                            {constructor.wins}
                                        </span>
                                    </td>

                                    {/* Poles */}
                                    <td className="sticky left-[320px] z-10 px-2 py-2 text-center bg-[var(--bg-panel)]">
                                        <span className={`font-oxanium text-sm font-bold ${(polesMap.get(constructor.constructorId) || 0) > 0 ? 'text-[#FF00FF]' : 'text-[var(--text-muted)]'}`}>
                                            {polesMap.get(constructor.constructorId) || 0}
                                        </span>
                                    </td>

                                    {/* Podiums */}
                                    <td className="sticky left-[368px] z-10 px-2 py-2 text-center border-r border-[var(--border-color)] bg-[var(--bg-panel)]">
                                        <span className={`font-oxanium text-sm font-bold ${(podiumsMap.get(constructor.constructorId) || 0) > 0 ? 'text-[var(--accent-orange)]' : 'text-[var(--text-muted)]'}`}>
                                            {podiumsMap.get(constructor.constructorId) || 0}
                                        </span>
                                    </td>

                                    {/* Race Results - just points */}
                                    {races.map(race => {
                                        const points = constructorRaces?.get(race.round);
                                        const hasData = points !== undefined;

                                        return (
                                            <td key={race.round} className="px-2 py-2 text-center">
                                                <span className={`font-oxanium text-sm font-medium ${
                                                    hasData && points > 0 ? 'text-white' : 'text-[var(--text-muted)]'
                                                }`}>
                                                    {hasData ? points : '—'}
                                                </span>
                                            </td>
                                        );
                                    })}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </motion.div>
    );
}


import type { Race, RaceResult, Driver, Constructor } from '../types';
import { parseF1TimeSeconds } from '../utils/f1Time';
import { extractHistoricalSeasonData, loadHistoricalH2HPayload } from '../utils/historicalH2H';
import { applyCanonicalRounds, getRaces, normalizeRaceCalendar } from './calendar';
import {
    dedupeInFlight,
    getCache,
    getCacheEntry,
    getEndpointSeason,
    getGranularTtl,
    getStaleCache,
    IS_TEST_ENV,
    markCacheHit,
    setCache,
    swrFetch,
} from './jolpicaCache';
import {
    getRateLimitBackoffMs,
    isRateLimitError,
    jolpicaClient,
    RateLimitError,
    sleep,
    type ApiRequestOptions,
} from './jolpicaClient';
import { jolpicaQueue, type RequestPriority } from './jolpicaQueue';
import {
    detectNewlyCompletedRounds,
    getStaticRoundQualifying,
    getStaticRoundQualifyingSync,
    getStaticRoundResults,
    getStaticRoundResultsSync,
    getStaticSeasonBundle,
    isFetchMockedOrAvailable,
    isRoundFinished,
    mapQualifyingResultsToSeasonQualifying,
    mapRaceResultsToSeasonResults,
    mergeSeasonQualifying,
    mergeSeasonResults,
    mergeSeasonSprints,
    updateStaticSeasonBundleInMemory,
} from './staticSeasonData';

export interface RaceQualifyingResult {
    position: string;
    Driver: Driver;
    Constructor: Constructor;
    Q1?: string;
    Q2?: string;
    Q3?: string;
}

export interface DriverStanding {
    position: string;
    positionText: string;
    points: string;
    wins: string;
    Driver: Driver;
    Constructors?: Constructor[];
}

interface ConstructorStandingApi {
    position: string;
    positionText: string;
    points: string;
    wins: string;
    Constructor: Constructor;
}

interface SprintResult {
    position: string;
    positionText: string;
    points: string;
    status: string;
    Driver: Driver;
    Constructor: Constructor;
}

export interface JolpicaRaceRecord extends Partial<Race> {
    round: string;
    date: string;
    Results?: RaceResult[];
    SprintResults?: SprintResult[];
    QualifyingResults?: RaceQualifyingResult[];
}

interface PaginatedRaceResponse {
    MRData: {
        RaceTable: {
            Races: JolpicaRaceRecord[];
        };
        total: string;
    };
}

interface StandingsResponse {
    MRData: {
        StandingsTable: {
            StandingsLists: Array<{
                season?: string;
                round?: string;
                DriverStandings?: DriverStanding[];
                ConstructorStandings?: ConstructorStandingApi[];
            }>;
        };
    };
}

export interface RaceDriverCard {
    driver: Driver;
    constructor: Constructor;
    carNumber?: string;
    position: string;
    time?: string;
    gap?: string;
    laps: string;
    status: string;
    grid: string;
}

export interface RaceRecapEntry {
    driverId: string;
    driverName: string;
    constructorId: string;
    constructorName: string;
}

export interface RaceRecap {
    winner: RaceRecapEntry | null;
    podium: RaceRecapEntry[];
    pole: RaceRecapEntry | null;
    fastestLap: (RaceRecapEntry & { lapTime: string | null }) | null;
    dnfCount: number;
}

export interface RaceRatingContext {
    drivers: RaceDriverCard[];
    recap: RaceRecap;
}

export interface DriverSeasonStats {
    driverId: string;
    driverName: string;
    code?: string;
    constructorId: string;
    constructorName: string;
    position: string;
    points: string;
    wins: number;
    poles: number;
    podiums: number;
}

export interface ConstructorStanding {
    constructorId: string;
    constructorName: string;
    position: number;
    points: number;
    wins: number;
}

export interface SeasonRaceResult {
    round: string;
    raceName: string;
    date: string;
    driverId: string;
    driverName: string;
    constructorId: string;
    constructorName: string;
    /** Official starting-grid position; 0 can represent a pit-lane start. */
    gridPosition?: number | null;
    /** Numeric official classification when present; null means no numeric place. Use status to distinguish DNS/DSQ/DNF. */
    position: number | null;
    /** Jolpica's compact classification marker (for example R, D, E, W, F, or N). */
    positionText?: string;
    points: number;
    status: string;
    started?: boolean;
    /** Official time gap to the race winner, when the API publishes a numeric gap. */
    raceTimeGapSeconds?: number | null;
}

export interface SeasonSprintResult {
    round: string;
    driverId: string;
    driverName: string;
    constructorId: string;
    constructorName: string;
    /** Numeric official classification when present; null means no numeric place. Use status to distinguish DNS/DSQ/DNF. */
    position: number | null;
    /** Jolpica's compact classification marker (for example R, D, E, W, F, or N). */
    positionText?: string;
    points: number;
    status: string;
}

export interface SeasonQualifyingResult {
    round: string;
    raceName?: string;
    date?: string;
    driverId: string;
    driverName: string;
    constructorId: string;
    constructorName: string;
    position: number;
    bestTimeSeconds?: number | null;
}

const UNCLASSIFIED_POSITION_TEXT = new Set(['R', 'D', 'E', 'W', 'F', 'N']);

function createRaceRecapEntry(driver: Driver, constructor: Constructor): RaceRecapEntry {
    return {
        driverId: driver.driverId,
        driverName: `${driver.givenName} ${driver.familyName}`,
        constructorId: constructor.constructorId,
        constructorName: constructor.name,
    };
}

export function isClassifiedRaceResult(result: RaceResult): boolean {
    const positionText = result.positionText?.trim().toUpperCase();
    const status = result.status?.trim();
    const hasClassifiedStatus = !status || /^(finished|lapped|\+\s*\d+\s*lap(?:s)?)$/i.test(status);

    return !UNCLASSIFIED_POSITION_TEXT.has(positionText ?? '')
        && hasClassifiedStatus
        && Number.isFinite(Number.parseInt(result.position, 10));
}

export function didStartRace(result: RaceResult): boolean {
    return !/^(did not start|did not qualify|not started|withdrawn|dns)\b/i.test(result.status.trim());
}

function getWinnerElapsedSeconds(results: RaceResult[]): number | null {
    const winner = results.find(result => Number.parseInt(result.position, 10) === 1);
    if (!winner) return null;
    const millis = winner.Time?.millis ? Number(winner.Time.millis) : Number.NaN;
    if (Number.isFinite(millis) && millis >= 0) return millis / 1000;
    return parseF1TimeSeconds(winner.Time?.time);
}

function getRaceTimeGapSeconds(result: RaceResult, winnerElapsedSeconds: number | null): number | null {
    const ownMillis = result.Time?.millis ? Number(result.Time.millis) : Number.NaN;
    if (Number.isFinite(ownMillis) && ownMillis >= 0 && winnerElapsedSeconds !== null) {
        return Math.max(0, ownMillis / 1000 - winnerElapsedSeconds);
    }

    if (Number.parseInt(result.position, 10) === 1) return 0;

    const officialTime = result.Time?.time?.trim();
    if (!officialTime) return null;
    if (officialTime.startsWith('+')) return parseF1TimeSeconds(officialTime.slice(1));

    const ownElapsedSeconds = parseF1TimeSeconds(officialTime);
    if (ownElapsedSeconds === null || winnerElapsedSeconds === null) return null;
    return Math.max(0, ownElapsedSeconds - winnerElapsedSeconds);
}

function mapRaceResultToDriverCard(result: RaceResult, index: number): RaceDriverCard {
    let gap: string | undefined;

    if (result.status && result.status.includes('Lap')) {
        gap = result.status;
    } else if (result.status && result.status !== 'Finished' && !result.Time?.time) {
        gap = result.status;
    } else if (index === 0) {
        gap = result.Time?.time;
    } else if (result.Time?.time) {
        gap = result.Time.time;
    }

    return {
        driver: result.Driver,
        constructor: result.Constructor,
        carNumber: result.number || result.Driver.permanentNumber,
        position: result.position,
        time: result.Time?.time,
        gap,
        laps: result.laps,
        status: result.status,
        grid: result.grid,
    };
}

// Fetch race results with drivers
export async function getRaceResults(season: string, round: string, options?: ApiRequestOptions): Promise<RaceResult[]> {
    const cacheKey = `jolpica:race-results:${season}:${round}`;

    // Fast-path 1: In-memory static bundle if already resolved (synchronous 0ms)
    const inMemoryResults = getStaticRoundResultsSync(season, round);
    if (inMemoryResults && inMemoryResults.length > 0) {
        markCacheHit();
        const ttl = getGranularTtl(season, round);
        setCache(cacheKey, inMemoryResults, ttl, { memoryOnly: true });
        return inMemoryResults;
    }

    // Fast-path 2: Static season bundle if available and fetch is usable
    if (isFetchMockedOrAvailable()) {
        try {
            const staticResults = await getStaticRoundResults(season, round);
            if (staticResults && staticResults.length > 0) {
                markCacheHit();
                const ttl = getGranularTtl(season, round);
                setCache(cacheKey, staticResults, ttl, { memoryOnly: true });
                return staticResults;
            }
        } catch {
            // Fall back gracefully
        }
    }

    // Fast-path: Sliced from cached full season if individual round cache does not exist yet
    const cachedEntry = getCacheEntry<RaceResult[]>(cacheKey);
    if (!cachedEntry) {
        const cachedSeasonRaces = getCache<JolpicaRaceRecord[]>(`jolpica:paginated:/${season}/results.json`);
        if (cachedSeasonRaces) {
            const matchedRace = cachedSeasonRaces.find(race => race.round === round);
            if (matchedRace?.Results && matchedRace.Results.length > 0) {
                markCacheHit();
                const ttl = getGranularTtl(season, round, matchedRace);
                setCache(cacheKey, matchedRace.Results, ttl, { memoryOnly: true });
                return matchedRace.Results;
            }
        }
    }

    return swrFetch<RaceResult[]>(
        cacheKey,
        async (ctx) => {
            const response = await jolpicaClient.get<{ MRData?: { RaceTable?: { Races?: Race[] } } }>(
                `/${season}/${round}/results.json`,
                {
                    priority: ctx?.priority ?? options?.priority,
                    isBackground: ctx?.isBackground,
                    queueKey: cacheKey,
                    signal: options?.signal,
                },
            );
            const races = normalizeRaceCalendar((response.data?.MRData?.RaceTable?.Races ?? []) as Race[]);
            if (races.length > 0 && races[0].Results) {
                const results = races[0].Results;
                try {
                    const bundle = await getStaticSeasonBundle(season);
                    if (bundle) {
                        updateStaticSeasonBundleInMemory(season, {
                            roundResults: { ...(bundle.roundResults ?? {}), [round]: results },
                        });
                    }
                } catch {
                    // Ignore bundle update error on raw round fetch
                }
                return results;
            }
            return [];
        },
        () => getGranularTtl(season, round),
        {
            priority: options?.priority,
            signal: options?.signal,
            throwOnError: options?.throwOnError,
            fallback: [],
            isValid: data => Array.isArray(data) && data.length > 0,
        },
    );
}

export async function getRaceQualifyingResults(season: string, round: string, options?: ApiRequestOptions): Promise<RaceQualifyingResult[]> {
    const cacheKey = `jolpica:race-qualifying:${season}:${round}`;

    // Fast-path 1: In-memory static bundle if already resolved (synchronous 0ms)
    const inMemoryQuali = getStaticRoundQualifyingSync(season, round);
    if (inMemoryQuali && inMemoryQuali.length > 0) {
        markCacheHit();
        const ttl = getGranularTtl(season, round);
        setCache(cacheKey, inMemoryQuali, ttl, { memoryOnly: true });
        return inMemoryQuali;
    }

    // Fast-path 2: Static season bundle if available and fetch is usable
    if (isFetchMockedOrAvailable()) {
        try {
            const staticQuali = await getStaticRoundQualifying(season, round);
            if (staticQuali && staticQuali.length > 0) {
                markCacheHit();
                const ttl = getGranularTtl(season, round);
                setCache(cacheKey, staticQuali, ttl, { memoryOnly: true });
                return staticQuali;
            }
        } catch {
            // Fall back gracefully
        }
    }

    // Fast-path: Sliced from cached full season if individual round cache does not exist yet
    const cachedEntry = getCacheEntry<RaceQualifyingResult[]>(cacheKey);
    if (!cachedEntry) {
        const cachedSeasonQuali = getCache<JolpicaRaceRecord[]>(`jolpica:paginated:/${season}/qualifying.json`);
        if (cachedSeasonQuali) {
            const matchedRace = cachedSeasonQuali.find(race => race.round === round);
            if (matchedRace?.QualifyingResults && matchedRace.QualifyingResults.length > 0) {
                markCacheHit();
                const ttl = getGranularTtl(season, round, matchedRace);
                setCache(cacheKey, matchedRace.QualifyingResults, ttl, { memoryOnly: true });
                return matchedRace.QualifyingResults;
            }
        }
    }

    return swrFetch<RaceQualifyingResult[]>(
        cacheKey,
        async (ctx) => {
            const response = await jolpicaClient.get<{ MRData?: { RaceTable?: { Races?: Array<{ QualifyingResults?: RaceQualifyingResult[] }> } } }>(
                `/${season}/${round}/qualifying.json`,
                {
                    priority: ctx?.priority ?? options?.priority,
                    isBackground: ctx?.isBackground,
                    queueKey: cacheKey,
                    signal: options?.signal,
                },
            );
            const races = response.data?.MRData?.RaceTable?.Races ?? [];
            const qualiResults = races[0]?.QualifyingResults || [];
            if (qualiResults.length > 0) {
                try {
                    const bundle = await getStaticSeasonBundle(season);
                    if (bundle) {
                        updateStaticSeasonBundleInMemory(season, {
                            roundQualifying: { ...(bundle.roundQualifying ?? {}), [round]: qualiResults },
                        });
                    }
                } catch {
                    // Ignore bundle update error on raw round fetch
                }
            }
            return qualiResults;
        },
        () => getGranularTtl(season, round),
        {
            priority: options?.priority,
            signal: options?.signal,
            throwOnError: options?.throwOnError,
            fallback: [],
            isValid: data => Array.isArray(data) && data.length > 0,
        },
    );
}

export function buildRaceRecap(results: RaceResult[], qualifyingResults: RaceQualifyingResult[]): RaceRecap {
    const winnerResult = results.find(result => result.position === '1') || null;
    const podiumResults = [...results]
        .filter(result => {
            const position = parseInt(result.position, 10);
            return Number.isFinite(position) && position >= 1 && position <= 3;
        })
        .sort((a, b) => parseInt(a.position, 10) - parseInt(b.position, 10))
        .slice(0, 3);
    const poleResult = qualifyingResults.find(result => result.position === '1') || null;
    const fastestLapResult = results.find(result => result.FastestLap?.rank === '1') || null;

    return {
        winner: winnerResult ? createRaceRecapEntry(winnerResult.Driver, winnerResult.Constructor) : null,
        podium: podiumResults.map(result => createRaceRecapEntry(result.Driver, result.Constructor)),
        pole: poleResult ? createRaceRecapEntry(poleResult.Driver, poleResult.Constructor) : null,
        fastestLap: fastestLapResult ? {
            ...createRaceRecapEntry(fastestLapResult.Driver, fastestLapResult.Constructor),
            lapTime: fastestLapResult.FastestLap?.Time?.time || null,
        } : null,
        dnfCount: results.filter(result => !isClassifiedRaceResult(result)).length,
    };
}

export async function getRaceRatingContext(
    season: string,
    round: string,
    options?: ApiRequestOptions,
): Promise<RaceRatingContext> {
    const [results, qualifyingResults] = await Promise.all([
        getRaceResults(season, round, options),
        getRaceQualifyingResults(season, round, options),
    ]);

    return {
        drivers: results.map((result, index) => mapRaceResultToDriverCard(result, index)),
        recap: buildRaceRecap(results, qualifyingResults),
    };
}

// Fetch all drivers for a season
export async function getDrivers(season: string): Promise<Driver[]> {
    try {
        const response = await jolpicaClient.get<{ MRData: { DriverTable: { Drivers: Driver[] } } }>(`/${season}/drivers.json`);
        return response.data.MRData.DriverTable.Drivers;
    } catch (error) {
        console.error(`Error fetching drivers for ${season}:`, error);
        return [];
    }
}

// Fetch all constructors for a season
export async function getConstructors(season: string): Promise<Constructor[]> {
    try {
        const response = await jolpicaClient.get<{ MRData: { ConstructorTable: { Constructors: Constructor[] } } }>(`/${season}/constructors.json`);
        return response.data.MRData.ConstructorTable.Constructors;
    } catch (error) {
        console.error(`Error fetching constructors for ${season}:`, error);
        return [];
    }
}

// Fetch driver standings
export async function getDriverStandings(season: string, options?: ApiRequestOptions): Promise<DriverStanding[]> {
    try {
        const bundle = await getStaticSeasonBundle(season);
        if (bundle && bundle.driverStandings && bundle.driverStandings.length > 0) {
            const cachedCalendar = getCache<Race[]>(`jolpica:races:${season}`) ?? bundle.races;
            if (bundle.isArchived || detectNewlyCompletedRounds(bundle, cachedCalendar, undefined, 'driverStandings').length === 0) {
                markCacheHit();
                return bundle.driverStandings;
            }
        }
    } catch (err) {
        if (!IS_TEST_ENV && typeof import.meta !== 'undefined' && import.meta.env?.DEV) {
            console.debug(`[StaticSeason] Fallback for driver standings ${season}:`, err);
        }
    }

    const cacheKey = `jolpica:driver-standings:${season}`;
    return swrFetch<DriverStanding[]>(
        cacheKey,
        async (ctx) => {
            const response = await jolpicaClient.get<StandingsResponse>(`/${season}/driverStandings.json`, {
                priority: ctx?.priority ?? options?.priority,
                isBackground: ctx?.isBackground,
                queueKey: cacheKey,
                signal: options?.signal,
            });
            const standingsList = response.data?.MRData?.StandingsTable?.StandingsLists[0];
            const standings = standingsList?.DriverStandings ?? [];
            if (Array.isArray(standings) && standings.length > 0) {
                const bundle = await getStaticSeasonBundle(season);
                if (bundle) {
                    const apiRound = Number.parseInt(standingsList?.round ?? '', 10);
                    let resolvedRound: number;
                    if (Number.isFinite(apiRound) && apiRound > 0) {
                        resolvedRound = apiRound;
                    } else {
                        const cachedCalendar = getCache<Race[]>(`jolpica:races:${season}`) ?? bundle.races;
                        const finishedRounds = (cachedCalendar ?? []).filter(r => isRoundFinished(r));
                        resolvedRound = finishedRounds.length > 0
                            ? Math.max(...finishedRounds.map(r => Number.parseInt(r.round, 10)))
                            : (bundle.lastCompletedRound ?? 0);
                    }
                    updateStaticSeasonBundleInMemory(season, {
                        driverStandings: standings,
                        lastDriverStandingsRound: resolvedRound,
                    });
                }
            }
            return standings;
        },
        () => getGranularTtl(season),
        {
            priority: options?.priority,
            signal: options?.signal,
            throwOnError: options?.throwOnError,
            fallback: [],
            isValid: data => Array.isArray(data) && data.length > 0,
        },
    );
}

// Get drivers who participated in a specific race
export async function getRaceDrivers(season: string, round: string): Promise<RaceDriverCard[]> {
    const results = await getRaceResults(season, round);
    return results.map((result, index) => mapRaceResultToDriverCard(result, index));
}

// Get all drivers for a season with their constructor (for Quick Rate)
export async function getSeasonDrivers(season: string): Promise<Array<{
    driverId: string;
    givenName: string;
    familyName: string;
    nationality?: string;
    constructorId: string;
    constructorName: string;
}>> {
    try {
        const standings = await getDriverStandings(season);

        return standings.map((standing: DriverStanding) => ({
            driverId: standing.Driver.driverId,
            givenName: standing.Driver.givenName,
            familyName: standing.Driver.familyName,
            nationality: standing.Driver.nationality,
            constructorId: standing.Constructors?.[0]?.constructorId || 'unknown',
            constructorName: standing.Constructors?.[0]?.name || 'Unknown',
        }));
    } catch (error) {
        console.error(`Error fetching season drivers for ${season}:`, error);
        return [];
    }
}

// Helper function to fetch all paginated results from Jolpica API
// The API has a max limit of 100 per request, so we need pagination
export async function fetchAllPaginated(
    endpoint: string,
    options?: { cacheRaw?: boolean; throwOnError?: boolean; priority?: RequestPriority; signal?: AbortSignal },
): Promise<JolpicaRaceRecord[]> {
    const cacheKey = `jolpica:paginated:${endpoint}`;
    const endpointSeason = getEndpointSeason(endpoint);
    const ttlResolver = () => (endpointSeason ? getGranularTtl(endpointSeason) : 10 * 60 * 1000);

    return swrFetch<JolpicaRaceRecord[]>(
        cacheKey,
        async (ctx) => {
            const allRaces: JolpicaRaceRecord[] = [];
            let offset = 0;
            const limit = 100; // API max limit
            let hasMore = true;

            while (hasMore) {
                const url = `${endpoint}?limit=${limit}&offset=${offset}`;
                let response: { data: PaginatedRaceResponse } | null = null;
                try {
                    // Retry up to 6 times on 429 with shared cooldown + exponential backoff so multi-season career loads never drop seasons.
                    const maxRetries = 6;
                    for (let attempt = 0; attempt <= maxRetries; attempt++) {
                        try {
                            response = await jolpicaClient.get<PaginatedRaceResponse>(url, {
                                priority: ctx?.priority ?? options?.priority,
                                isBackground: ctx?.isBackground,
                                queueKey: cacheKey,
                                signal: options?.signal,
                            });
                            break;
                        } catch (err) {
                            if (!isRateLimitError(err) || attempt === maxRetries) throw err;
                            const backoffMs = getRateLimitBackoffMs(err, attempt);
                            jolpicaQueue.handleRateLimit(backoffMs);
                            await sleep(backoffMs);
                        }
                    }

                    if (!response) {
                        throw new Error('Jolpica API returned no response');
                    }

                    const races = response.data?.MRData?.RaceTable?.Races ?? [];
                    const total = parseInt(response.data?.MRData?.total ?? '0', 10) || 0;

                    allRaces.push(...races);
                    offset += limit;

                    // Check if we've fetched all available data
                    hasMore = offset < total && races.length > 0;
                } catch (error) {
                    // If we get rate-limited, try cache (fresh, then stale) and otherwise surface a typed error.
                    if (isRateLimitError(error)) {
                        const fallback = getCache<JolpicaRaceRecord[]>(cacheKey) ?? getStaleCache<JolpicaRaceRecord[]>(cacheKey);
                        if (fallback) return fallback;
                        throw new RateLimitError('API rate limit reached (429). Please try again shortly.');
                    }
                    throw error;
                }
            }

            return allRaces;
        },
        ttlResolver,
        {
            priority: options?.priority,
            signal: options?.signal,
            memoryOnly: options?.cacheRaw === false,
            throwOnError: true,
            isValid: () => true,
        },
    );
}

export async function getConstructorStandings(season: string, options?: ApiRequestOptions): Promise<ConstructorStanding[]> {
    try {
        const bundle = await getStaticSeasonBundle(season);
        if (bundle && bundle.constructorStandings && bundle.constructorStandings.length > 0) {
            const cachedCalendar = getCache<Race[]>(`jolpica:races:${season}`) ?? getCache<Race[]>(`jolpica:calendar:${season}`);
            if (bundle.isArchived || detectNewlyCompletedRounds(bundle, cachedCalendar ?? undefined, undefined, 'constructorStandings').length === 0) {
                markCacheHit();
                return bundle.constructorStandings;
            }
        }
    } catch (err) {
        if (!IS_TEST_ENV && typeof import.meta !== 'undefined' && import.meta.env?.DEV) {
            console.debug(`[StaticSeason] Fallback for constructor standings ${season}:`, err);
        }
    }

    const endpoint = `/${season}/constructorStandings.json`;
    const cacheKey = `jolpica:constructor-standings:${season}`;

    return swrFetch<ConstructorStanding[]>(
        cacheKey,
        async (ctx) => {
            const maxRetries = 2;
            let response: { data: StandingsResponse } | null = null;
            for (let attempt = 0; attempt <= maxRetries; attempt++) {
                try {
                    response = await jolpicaClient.get<StandingsResponse>(endpoint, {
                        priority: ctx?.priority ?? options?.priority,
                        isBackground: ctx?.isBackground,
                        queueKey: cacheKey,
                        signal: options?.signal,
                    });
                    break;
                } catch (err) {
                    if (!isRateLimitError(err) || attempt === maxRetries) throw err;
                    const backoffMs = 500 * Math.pow(2, attempt) + Math.floor(Math.random() * 250);
                    await sleep(backoffMs);
                }
            }

            if (!response) {
                throw new Error('Jolpica API returned no response');
            }

            const constrList = response.data?.MRData?.StandingsTable?.StandingsLists[0];
            const rawStandings = constrList?.ConstructorStandings ?? [];

            const standings = rawStandings.map((s: ConstructorStandingApi) => ({
                constructorId: s.Constructor?.constructorId ?? 'unknown',
                constructorName: s.Constructor?.name ?? 'Unknown',
                position: parseInt(s.position, 10) || 0,
                points: parseFloat(s.points) || 0,
                wins: parseInt(s.wins, 10) || 0,
            }));

            if (Array.isArray(standings) && standings.length > 0) {
                const bundle = await getStaticSeasonBundle(season);
                if (bundle) {
                    const apiRound = Number.parseInt(constrList?.round ?? '', 10);
                    let resolvedRound: number;
                    if (Number.isFinite(apiRound) && apiRound > 0) {
                        resolvedRound = apiRound;
                    } else {
                        const cachedCalendar = getCache<Race[]>(`jolpica:races:${season}`) ?? bundle.races;
                        const finishedRounds = (cachedCalendar ?? []).filter(r => isRoundFinished(r));
                        resolvedRound = finishedRounds.length > 0
                            ? Math.max(...finishedRounds.map(r => Number.parseInt(r.round, 10)))
                            : (bundle.lastCompletedRound ?? 0);
                    }
                    updateStaticSeasonBundleInMemory(season, {
                        constructorStandings: standings,
                        lastConstructorStandingsRound: resolvedRound,
                    });
                }
            }

            return standings;
        },
        () => getGranularTtl(season),
        {
            priority: options?.priority,
            signal: options?.signal,
            throwOnError: options?.throwOnError,
            fallback: [],
            isValid: data => Array.isArray(data) && data.length > 0,
        },
    );
}

export async function getDriverSeasonStats(season: string, options?: ApiRequestOptions): Promise<DriverSeasonStats[]> {
    try {
        const seasonNum = Number.parseInt(season, 10);
        const [standings, bundle] = await Promise.all([
            getDriverStandings(season, options),
            getStaticSeasonBundle(season).catch(() => null),
        ]);

        let seasonResultsFromBundle: SeasonRaceResult[] | null = null;
        let seasonQualiFromBundle: SeasonQualifyingResult[] | null = null;

        if (bundle && bundle.results && bundle.results.length > 0 && bundle.qualifying && bundle.qualifying.length > 0) {
            [seasonResultsFromBundle, seasonQualiFromBundle] = await Promise.all([
                getAllSeasonResults(season, options),
                getAllSeasonQualifying(season, options),
            ]);
        }

        const historical = (!seasonResultsFromBundle && (!Number.isFinite(seasonNum) || seasonNum <= 2025))
            ? await loadHistoricalH2HPayload()
            : null;
        const historicalSeason = historical ? extractHistoricalSeasonData(historical, season) : null;
        let allRaces: JolpicaRaceRecord[] = [];
        let allQualifying: JolpicaRaceRecord[] = [];

        if (!seasonResultsFromBundle && !historicalSeason) {
            [allRaces, allQualifying] = await Promise.all([
                fetchAllPaginated(`/${season}/results.json`, options),
                fetchAllPaginated(`/${season}/qualifying.json`, options),
            ]);
        }

        // Map to store calculated stats
        const driverStats: Map<string, { poles: number; podiums: number }> = new Map();

        // Initialize map for all drivers in standings
        standings.forEach((standing: DriverStanding) => {
            driverStats.set(standing.Driver.driverId, { poles: 0, podiums: 0 });
        });

        const addStat = (driverId: string, key: 'poles' | 'podiums') => {
            const stats = driverStats.get(driverId);
            if (stats) {
                stats[key] += 1;
                driverStats.set(driverId, stats);
            }
        };

        const resolvedSeasonData = seasonResultsFromBundle && seasonQualiFromBundle
            ? { raceResults: seasonResultsFromBundle, qualiResults: seasonQualiFromBundle }
            : historicalSeason;

        if (resolvedSeasonData) {
            // Static season bundle or archived historical data contains the race and qualifying
            // positions needed for these totals, avoiding downloading both paginated feeds.
            resolvedSeasonData.raceResults.forEach(result => {
                if (result.position !== null && result.position >= 1 && result.position <= 3) {
                    addStat(result.driverId, 'podiums');
                }
            });

            const countedPoleRounds = new Set<string>();
            resolvedSeasonData.qualiResults.forEach(result => {
                if (result.position === 1 && !countedPoleRounds.has(result.round)) {
                    countedPoleRounds.add(result.round);
                    addStat(result.driverId, 'poles');
                }
            });
        } else {
            // Calculate Podiums (Position 1, 2, 3)
            allRaces.forEach((race: JolpicaRaceRecord) => {
                (race.Results || []).forEach((result: RaceResult) => {
                    const pos = parseInt(result.position);
                    if (pos >= 1 && pos <= 3) addStat(result.Driver.driverId, 'podiums');
                });
            });

            // Calculate Poles (Qualifying Position 1)
            allQualifying.forEach((race: JolpicaRaceRecord) => {
                const poleDriver = (race.QualifyingResults || []).find((r: RaceQualifyingResult) => r.position === '1');
                if (poleDriver) addStat(poleDriver.Driver.driverId, 'poles');
            });
        }

        // Merge reliable standings data with calculated stats
        return standings.map((standing: DriverStanding) => {
            const driverId = standing.Driver.driverId;
            const stats = driverStats.get(driverId) || { poles: 0, podiums: 0 };

            return {
                driverId,
                driverName: `${standing.Driver.givenName} ${standing.Driver.familyName}`,
                code: standing.Driver.code,
                constructorId: standing.Constructors?.[0]?.constructorId || 'unknown',
                constructorName: standing.Constructors?.[0]?.name || 'Unknown',
                position: standing.position,
                points: standing.points,
                wins: parseInt(standing.wins) || 0, // Trust the API for wins
                poles: stats.poles,
                podiums: stats.podiums,
            };
        });

    } catch (error) {
        console.error(`Error calculating driver stats for ${season}:`, error);
        return [];
    }
}

export async function getAllSeasonResults(season: string, options: ApiRequestOptions = {}): Promise<SeasonRaceResult[]> {
    try {
        const bundle = await getStaticSeasonBundle(season);
        if (bundle && bundle.results && bundle.results.length > 0) {
            if (bundle.isArchived) {
                markCacheHit();
                return bundle.results;
            }

            // Active season incremental check:
            const cachedCalendar = getCache<Race[]>(`jolpica:races:${season}`) ?? getCache<Race[]>(`jolpica:calendar:${season}`);
            const calendar = cachedCalendar ?? (bundle.races && bundle.races.length > 0 ? bundle.races : await getRaces(season, options));
            const newRounds = detectNewlyCompletedRounds(bundle, calendar, undefined, 'results');

            if (newRounds.length === 0) {
                markCacheHit();
                return bundle.results;
            }

            const maxNewRound = Math.max(...newRounds.map(r => Number.parseInt(r.round, 10)));
            return await dedupeInFlight(
                `jolpica:static-diff:results:${season}:${maxNewRound}`,
                async () => {
                    const diffResults: SeasonRaceResult[] = [];
                    const updatedRoundResults = { ...(bundle.roundResults ?? {}) };
                    for (const race of newRounds) {
                        const rawResults = await getRaceResults(season, race.round, options);
                        if (rawResults && rawResults.length > 0) {
                            updatedRoundResults[race.round] = rawResults;
                            const mapped = mapRaceResultsToSeasonResults(race.round, race.raceName, race.date, rawResults);
                            diffResults.push(...mapped);
                        }
                    }
                    if (diffResults.length === 0) {
                        return bundle.results;
                    }
                    const merged = mergeSeasonResults(bundle.results, diffResults);
                    updateStaticSeasonBundleInMemory(season, {
                        results: merged,
                        roundResults: updatedRoundResults,
                        lastResultsRound: Math.max(bundle.lastResultsRound ?? bundle.lastCompletedRound ?? 0, maxNewRound),
                    });
                    return merged;
                },
                options?.priority ?? 'high',
            );
        }
    } catch (err) {
        if (!IS_TEST_ENV && typeof import.meta !== 'undefined' && import.meta.env?.DEV) {
            console.debug(`[StaticSeason] Fallback to live API for results ${season}:`, err);
        }
    }

    try {
        const [allRaces, calendar] = await Promise.all([
            fetchAllPaginated(`/${season}/results.json`, options),
            getRaces(season, options),
        ]);
        const results: SeasonRaceResult[] = [];
        const normalizedRaces = applyCanonicalRounds(allRaces, calendar);

        normalizedRaces.forEach((race: JolpicaRaceRecord) => {
            const raceEntries = race.Results ?? [];
            const winnerElapsedSeconds = getWinnerElapsedSeconds(raceEntries);
            raceEntries.forEach((result: RaceResult) => {
                const isClassified = isClassifiedRaceResult(result);
                const parsedPosition = Number.parseInt(result.position, 10);
                const parsedGridPosition = Number.parseInt(result.grid, 10);

                results.push({
                    round: race.round,
                    raceName: race.raceName ?? `Round ${race.round}`,
                    date: race.date,
                    driverId: result.Driver.driverId,
                    driverName: `${result.Driver.givenName} ${result.Driver.familyName}`,
                    constructorId: result.Constructor.constructorId,
                    constructorName: result.Constructor.name,
                    gridPosition: Number.isFinite(parsedGridPosition) ? parsedGridPosition : null,
                    position: isClassified && Number.isFinite(parsedPosition) ? parsedPosition : null,
                    positionText: result.positionText,
                    points: parseFloat(result.points) || 0,
                    status: result.status,
                    started: didStartRace(result),
                    raceTimeGapSeconds: getRaceTimeGapSeconds(result, winnerElapsedSeconds),
                });
            });
        });

        return results;
    } catch (error) {
        if (options.throwOnError || error instanceof RateLimitError) {
            // Let the UI decide how to render "unavailable" vs "0 results"
            throw error;
        }
        console.error(`Error fetching season results for ${season}:`, error);
        return [];
    }
}

export async function getAllSeasonSprints(season: string, options: ApiRequestOptions = {}): Promise<SeasonSprintResult[]> {
    try {
        const bundle = await getStaticSeasonBundle(season);
        if (bundle && bundle.sprints !== undefined) {
            if (bundle.isArchived) {
                markCacheHit();
                return bundle.sprints;
            }

            const cachedCalendar = getCache<Race[]>(`jolpica:races:${season}`) ?? getCache<Race[]>(`jolpica:calendar:${season}`);
            const calendar = cachedCalendar ?? (bundle.races && bundle.races.length > 0 ? bundle.races : await getRaces(season, options));
            const newRounds = detectNewlyCompletedRounds(bundle, calendar, undefined, 'sprints');
            const newSprintRounds = newRounds.filter(r => (r as unknown as { Sprint?: unknown }).Sprint !== undefined);

            if (newSprintRounds.length === 0) {
                markCacheHit();
                return bundle.sprints;
            }

            const maxNewSprintRound = Math.max(...newSprintRounds.map(r => Number.parseInt(r.round, 10)));
            return await dedupeInFlight(
                `jolpica:static-diff:sprints:${season}:${maxNewSprintRound}`,
                async () => {
                    const diffSprints: SeasonSprintResult[] = [];
                    for (const race of newSprintRounds) {
                        try {
                            const response = await jolpicaClient.get<{ MRData?: { RaceTable?: { Races?: JolpicaRaceRecord[] } } }>(
                                `/${season}/${race.round}/sprint.json`,
                                {
                                    priority: options?.priority,
                                    signal: options?.signal,
                                },
                            );
                            const sprintRaces = response.data?.MRData?.RaceTable?.Races ?? [];
                            sprintRaces.forEach((sRace: JolpicaRaceRecord) => {
                                const sprintResults = sRace.SprintResults || [];
                                sprintResults.forEach((result: SprintResult) => {
                                    const positionText = result.positionText;
                                    const isClassified = !['R', 'D', 'E', 'W', 'F', 'N'].includes(positionText);

                                    diffSprints.push({
                                        round: sRace.round,
                                        driverId: result.Driver.driverId,
                                        driverName: `${result.Driver.givenName} ${result.Driver.familyName}`,
                                        constructorId: result.Constructor.constructorId,
                                        constructorName: result.Constructor.name,
                                        position: isClassified ? parseInt(result.position) : null,
                                        positionText: result.positionText,
                                        points: parseFloat(result.points) || 0,
                                        status: result.status,
                                    });
                                });
                            });
                        } catch {
                            // Fall back gracefully
                        }
                    }

                    if (diffSprints.length === 0) {
                        return bundle.sprints;
                    }

                    const merged = mergeSeasonSprints(bundle.sprints, diffSprints);
                    updateStaticSeasonBundleInMemory(season, {
                        sprints: merged,
                        lastSprintsRound: Math.max(bundle.lastSprintsRound ?? bundle.lastCompletedRound ?? 0, maxNewSprintRound),
                    });
                    return merged;
                },
                options?.priority ?? 'high',
            );
        }
    } catch (err) {
        if (!IS_TEST_ENV && typeof import.meta !== 'undefined' && import.meta.env?.DEV) {
            console.debug(`[StaticSeason] Fallback to live API for sprints ${season}:`, err);
        }
    }

    try {
        const [allSprints, calendar] = await Promise.all([
            fetchAllPaginated(`/${season}/sprint.json`, options),
            getRaces(season, options),
        ]);
        const results: SeasonSprintResult[] = [];
        const normalizedSprints = applyCanonicalRounds(allSprints, calendar);

        normalizedSprints.forEach((race: JolpicaRaceRecord) => {
            const sprintResults = race.SprintResults || [];
            sprintResults.forEach((result: SprintResult) => {
                const positionText = result.positionText;
                const isClassified = !['R', 'D', 'E', 'W', 'F', 'N'].includes(positionText);

                results.push({
                    round: race.round,
                    driverId: result.Driver.driverId,
                    driverName: `${result.Driver.givenName} ${result.Driver.familyName}`,
                    constructorId: result.Constructor.constructorId,
                    constructorName: result.Constructor.name,
                    position: isClassified ? parseInt(result.position) : null,
                    positionText: result.positionText,
                    points: parseFloat(result.points) || 0,
                    status: result.status,
                });
            });
        });

        return results;
    } catch (error) {
        if (options.throwOnError || error instanceof RateLimitError) {
            throw error;
        }
        console.error(`Error fetching season sprints for ${season}:`, error);
        return [];
    }
}

export async function getAllSeasonQualifying(
    season: string, options: ApiRequestOptions = {},
): Promise<SeasonQualifyingResult[]> {
    try {
        const bundle = await getStaticSeasonBundle(season);
        if (bundle && bundle.qualifying && bundle.qualifying.length > 0) {
            if (bundle.isArchived) {
                markCacheHit();
                return bundle.qualifying;
            }

            const cachedCalendar = getCache<Race[]>(`jolpica:races:${season}`) ?? getCache<Race[]>(`jolpica:calendar:${season}`);
            const calendar = cachedCalendar ?? (bundle.races && bundle.races.length > 0 ? bundle.races : await getRaces(season, options));
            const newRounds = detectNewlyCompletedRounds(bundle, calendar, undefined, 'qualifying');

            if (newRounds.length === 0) {
                markCacheHit();
                return bundle.qualifying;
            }

            const maxNewRound = Math.max(...newRounds.map(r => Number.parseInt(r.round, 10)));
            return await dedupeInFlight(
                `jolpica:static-diff:qualifying:${season}:${maxNewRound}`,
                async () => {
                    const diffQualifying: SeasonQualifyingResult[] = [];
                    const updatedRoundQualifying = { ...(bundle.roundQualifying ?? {}) };
                    for (const race of newRounds) {
                        const rawQuali = await getRaceQualifyingResults(season, race.round, options);
                        if (rawQuali && rawQuali.length > 0) {
                            updatedRoundQualifying[race.round] = rawQuali;
                            const mapped = mapQualifyingResultsToSeasonQualifying(race.round, race.raceName, race.date, rawQuali);
                            diffQualifying.push(...mapped);
                        }
                    }

                    if (diffQualifying.length === 0) {
                        return bundle.qualifying;
                    }

                    const merged = mergeSeasonQualifying(bundle.qualifying, diffQualifying);
                    updateStaticSeasonBundleInMemory(season, {
                        qualifying: merged,
                        roundQualifying: updatedRoundQualifying,
                        lastQualifyingRound: Math.max(bundle.lastQualifyingRound ?? bundle.lastCompletedRound ?? 0, maxNewRound),
                    });
                    return merged;
                },
                options?.priority ?? 'high',
            );
        }
    } catch (err) {
        if (!IS_TEST_ENV && typeof import.meta !== 'undefined' && import.meta.env?.DEV) {
            console.debug(`[StaticSeason] Fallback to live API for qualifying ${season}:`, err);
        }
    }

    try {
        const [allQualifying, calendar] = await Promise.all([
            fetchAllPaginated(`/${season}/qualifying.json`, options),
            getRaces(season, options),
        ]);
        const results: SeasonQualifyingResult[] = [];
        const normalizedQualifying = applyCanonicalRounds(allQualifying, calendar);

        normalizedQualifying.forEach((race: JolpicaRaceRecord) => {
            race.QualifyingResults?.forEach((result: RaceQualifyingResult) => {
                results.push({
                    round: race.round,
                    raceName: race.raceName ?? `Round ${race.round}`,
                    date: race.date,
                    driverId: result.Driver.driverId,
                    driverName: `${result.Driver.givenName} ${result.Driver.familyName}`,
                    constructorId: result.Constructor.constructorId,
                    constructorName: result.Constructor.name,
                    position: parseInt(result.position),
                    bestTimeSeconds: [result.Q1, result.Q2, result.Q3]
                        .map(time => parseF1TimeSeconds(time))
                        .filter((time): time is number => time !== null)
                        .reduce<number | null>((best, time) => best === null || time < best ? time : best, null),
                });
            });
        });

        return results;
    } catch (error) {
        if (options.throwOnError || error instanceof RateLimitError) {
            // Let the UI decide how to render "unavailable" vs "0 sessions"
            throw error;
        }
        console.error(`Error fetching season qualifying for ${season}:`, error);
        return [];
    }
}

/**
 * Profile race logs only need positions and race metadata, all of which are in
 * the static historical archive. Keep the richer API-backed result helper for
 * views that also need official race time gaps.
 */
export async function getDriverProfileSeasonResults(season: string): Promise<SeasonRaceResult[]> {
    const seasonNum = Number.parseInt(season, 10);
    if (Number.isFinite(seasonNum) && seasonNum >= 2018 && seasonNum <= 2026) {
        const bundle = await getStaticSeasonBundle(season).catch(() => null);
        if (bundle && bundle.results && bundle.results.length > 0) {
            return getAllSeasonResults(season);
        }
    }
    if (!Number.isFinite(seasonNum) || seasonNum <= 2025) {
        const historical = await loadHistoricalH2HPayload();
        const archived = historical ? extractHistoricalSeasonData(historical, season) : null;
        if (archived) return archived.raceResults;
    }
    return getAllSeasonResults(season);
}

/** Profile qualifying rows need position only; awards pages still use the API-backed helper for lap times. */
export async function getDriverProfileSeasonQualifying(season: string): Promise<SeasonQualifyingResult[]> {
    const seasonNum = Number.parseInt(season, 10);
    if (Number.isFinite(seasonNum) && seasonNum >= 2018 && seasonNum <= 2026) {
        const bundle = await getStaticSeasonBundle(season).catch(() => null);
        if (bundle && bundle.qualifying && bundle.qualifying.length > 0) {
            return getAllSeasonQualifying(season);
        }
    }
    if (!Number.isFinite(seasonNum) || seasonNum <= 2025) {
        const historical = await loadHistoricalH2HPayload();
        const archived = historical ? extractHistoricalSeasonData(historical, season) : null;
        if (archived) return archived.qualiResults;
    }
    return getAllSeasonQualifying(season);
}

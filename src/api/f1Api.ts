import axios from 'axios';
import type { Season, Race, RaceResult, Driver, Constructor } from '../types';
import { parseF1TimeSeconds } from '../utils/f1Time';

// Jolpica API - Ergast successor
const API_BASE = 'https://api.jolpi.ca/ergast/f1';

const api = axios.create({
    baseURL: API_BASE,
    timeout: 15000,
});

export class RateLimitError extends Error {
    status = 429 as const;
    constructor(message = 'Too Many Requests') {
        super(message);
        this.name = 'RateLimitError';
    }
}

function isRateLimitAxiosError(error: unknown): boolean {
    return axios.isAxiosError(error) && error.response?.status === 429;
}

function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function getSeasonCacheTtlMs(season: string | number, opts?: { currentMs?: number; pastMs?: number }) {
    const currentMs = opts?.currentMs ?? 2 * 60 * 1000; // 2 minutes
    const pastMs = opts?.pastMs ?? 24 * 60 * 60 * 1000; // 24 hours

    const seasonNum = typeof season === 'number' ? season : parseInt(season, 10);
    const currentYear = new Date().getFullYear();

    // If season is invalid/unknown, keep a conservative TTL.
    if (!Number.isFinite(seasonNum)) return 10 * 60 * 1000; // 10 minutes

    // Current (or future) season: short TTL. Past seasons: long TTL.
    return seasonNum >= currentYear ? currentMs : pastMs;
}

function getEndpointSeason(endpoint: string): string | null {
    const match = endpoint.match(/^\/(\d{4})\//);
    return match?.[1] ?? null;
}

type CacheRecord<T> = { expiresAt: number; data: T };
type RaceLike = Pick<Race, 'round' | 'date'> & Partial<Pick<Race, 'time' | 'raceName' | 'Circuit'>>;

const inFlightRequests = new Map<string, Promise<unknown>>();
const MAX_MEMORY_CACHE_ENTRIES = 60;
const MEMORY_EPOCH_KEY = 'jolpica:__epoch';
const memoryCache = new Map<string, CacheRecord<unknown>>();
let currentMemoryEpoch = `epoch-${Date.now()}`;

function syncMemoryCacheWithStorage(): void {
    try {
        const storedEpoch = localStorage.getItem(MEMORY_EPOCH_KEY);
        if (storedEpoch !== currentMemoryEpoch) {
            memoryCache.clear();
            localStorage.setItem(MEMORY_EPOCH_KEY, currentMemoryEpoch);
        }
    } catch {
        // ignore storage errors
    }
}

function setMemoryCacheRecord<T>(key: string, record: CacheRecord<T>): void {
    syncMemoryCacheWithStorage();
    if (memoryCache.has(key)) {
        memoryCache.delete(key);
    } else if (memoryCache.size >= MAX_MEMORY_CACHE_ENTRIES) {
        const oldestKey = memoryCache.keys().next().value;
        if (oldestKey !== undefined) {
            memoryCache.delete(oldestKey);
        }
    }
    memoryCache.set(key, record as CacheRecord<unknown>);
}

function pruneJolpicaStorageCache(now = Date.now()): void {
    try {
        const jolpicaKeys: Array<{ key: string; expiresAt: number; isRawPaginated: boolean }> = [];
        for (let i = 0; i < localStorage.length; i += 1) {
            const key = localStorage.key(i);
            if (!key || !key.startsWith('jolpica:') || key === MEMORY_EPOCH_KEY) continue;
            const raw = localStorage.getItem(key);
            if (!raw) continue;
            try {
                const parsed = JSON.parse(raw) as CacheRecord<unknown>;
                const expiresAt = typeof parsed?.expiresAt === 'number' ? parsed.expiresAt : 0;
                jolpicaKeys.push({
                    key,
                    expiresAt,
                    isRawPaginated: key.startsWith('jolpica:paginated:'),
                });
            } catch {
                jolpicaKeys.push({ key, expiresAt: 0, isRawPaginated: true });
            }
        }

        // 1. Remove all expired Jolpica entries first
        const expired = jolpicaKeys.filter(entry => entry.expiresAt <= now);
        expired.forEach(entry => {
            localStorage.removeItem(entry.key);
            memoryCache.delete(entry.key);
        });

        if (expired.length > 0) return;

        // 2. If none were expired, evict the oldest raw paginated blobs first, then oldest entries overall
        const remaining = jolpicaKeys.sort((a, b) => {
            if (a.isRawPaginated !== b.isRawPaginated) {
                return a.isRawPaginated ? -1 : 1;
            }
            return a.expiresAt - b.expiresAt;
        });

        const toEvict = remaining.slice(0, Math.max(1, Math.ceil(remaining.length * 0.25)));
        toEvict.forEach(entry => {
            localStorage.removeItem(entry.key);
            memoryCache.delete(entry.key);
        });
    } catch {
        // ignore storage errors
    }
}

function dedupeInFlight<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
    const existing = inFlightRequests.get(key) as Promise<T> | undefined;
    if (existing) return existing;

    const request = fetcher().finally(() => {
        if (inFlightRequests.get(key) === request) {
            inFlightRequests.delete(key);
        }
    });

    inFlightRequests.set(key, request);
    return request;
}

function getCache<T>(key: string): T | null {
    const now = Date.now();
    try {
        if (localStorage.getItem(MEMORY_EPOCH_KEY) === currentMemoryEpoch) {
            const memRecord = memoryCache.get(key) as CacheRecord<T> | undefined;
            if (memRecord) {
                if (now <= memRecord.expiresAt) {
                    // Refresh LRU position
                    memoryCache.delete(key);
                    memoryCache.set(key, memRecord as CacheRecord<unknown>);
                    return memRecord.data ?? null;
                }
                memoryCache.delete(key);
            }
        } else {
            memoryCache.clear();
        }

        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as CacheRecord<T>;
        if (!parsed || typeof parsed.expiresAt !== 'number') return null;
        if (now > parsed.expiresAt) {
            localStorage.removeItem(key);
            return null;
        }
        setMemoryCacheRecord(key, parsed);
        return parsed.data ?? null;
    } catch {
        return null;
    }
}

function getStaleCache<T>(key: string): T | null {
    try {
        if (localStorage.getItem(MEMORY_EPOCH_KEY) === currentMemoryEpoch) {
            const memRecord = memoryCache.get(key) as CacheRecord<T> | undefined;
            if (memRecord?.data !== undefined) {
                return memRecord.data;
            }
        }
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as CacheRecord<T>;
        return parsed?.data ?? null;
    } catch {
        return null;
    }
}

function setCache<T>(key: string, data: T, ttlMs: number, options?: { memoryOnly?: boolean }) {
    const record: CacheRecord<T> = { expiresAt: Date.now() + ttlMs, data };
    setMemoryCacheRecord(key, record);
    if (options?.memoryOnly) return;

    const serialized = JSON.stringify(record);
    try {
        localStorage.setItem(key, serialized);
    } catch {
        // Evict expired / largest raw paginated Jolpica entries and retry once
        pruneJolpicaStorageCache();
        try {
            localStorage.setItem(key, serialized);
        } catch {
            // ignore storage failures (private mode, hard quota, etc.)
        }
    }
}

function getRaceStartMs<T extends RaceLike>(race: T): number {
    const isoDateTime = `${race.date}T${race.time ?? '00:00:00Z'}`;
    const timestamp = new Date(isoDateTime).getTime();
    return Number.isFinite(timestamp) ? timestamp : 0;
}

function getRaceIdentityKeys<T extends RaceLike>(race: T): string[] {
    const keys = new Set<string>();

    if (race.date && race.raceName) {
        keys.add(`date-name:${race.date}::${race.raceName}`);
    }

    if (race.Circuit?.circuitId) {
        keys.add(`circuit:${race.Circuit.circuitId}`);
    }

    if (race.date) {
        keys.add(`date:${race.date}`);
    }

    if (race.raceName) {
        keys.add(`name:${race.raceName}`);
    }

    return [...keys];
}

function hasBrokenRoundSequence<T extends RaceLike>(races: T[]): boolean {
    const seen = new Set<string>();

    return races.some((race, index) => {
        const round = parseInt(race.round, 10);
        const roundKey = Number.isFinite(round) ? String(round) : '';

        if (!roundKey || seen.has(roundKey) || round !== index + 1) {
            return true;
        }

        seen.add(roundKey);
        return false;
    });
}

export function normalizeRaceCalendar<T extends RaceLike>(races: T[]): T[] {
    const chronologicallySorted = [...races].sort((a, b) => getRaceStartMs(a) - getRaceStartMs(b));

    if (!hasBrokenRoundSequence(chronologicallySorted)) {
        return chronologicallySorted;
    }

    console.warn('Detected broken round data in season calendar. Re-numbering races by date order.');

    return chronologicallySorted.map((race, index) => ({
        ...race,
        round: String(index + 1),
    }));
}

function createCanonicalRoundLookup(races: Race[]): Map<string, string> {
    const lookup = new Map<string, string>();

    normalizeRaceCalendar(races).forEach(race => {
        getRaceIdentityKeys(race).forEach(key => lookup.set(key, race.round));
    });

    return lookup;
}

export function applyCanonicalRounds<T extends RaceLike>(races: T[], calendar: Race[]): T[] {
    if (races.length === 0 || calendar.length === 0) {
        return [...races];
    }

    const canonicalRoundLookup = createCanonicalRoundLookup(calendar);

    return [...races]
        .map(race => {
            const canonicalRound = getRaceIdentityKeys(race)
                .map(key => canonicalRoundLookup.get(key))
                .find((round): round is string => typeof round === 'string' && round.length > 0);

            if (!canonicalRound || canonicalRound === race.round) {
                return race;
            }

            return {
                ...race,
                round: canonicalRound,
            };
        })
        .sort((a, b) => getRaceStartMs(a) - getRaceStartMs(b));
}

// Fetch available seasons (2020-current)
export async function getSeasons(): Promise<Season[]> {
    const cacheKey = 'jolpica:seasons';
    const cached = getCache<Season[]>(cacheKey);
    if (cached) return cached;

    try {
        return await dedupeInFlight(cacheKey, async () => {
            const response = await api.get('/seasons.json?limit=10&offset=70');
            const seasons = response.data.MRData.SeasonTable.Seasons as Season[];
            // Filter to recent seasons and reverse for newest first
            const filtered = seasons.filter(s => parseInt(s.season) >= 2020).reverse();
            if (filtered.length > 0) {
                setCache(cacheKey, filtered, 24 * 60 * 60 * 1000);
            }
            return filtered;
        });
    } catch (error) {
        console.error('Error fetching seasons:', error);
        // Return fallback seasons
        return [
            { season: '2026', url: '' },
            { season: '2025', url: '' },
            { season: '2024', url: '' },
            { season: '2023', url: '' },
            { season: '2022', url: '' },
            { season: '2021', url: '' },
            { season: '2020', url: '' },
        ];
    }
}

// Fetch all races for a season
export async function getRaces(season: string): Promise<Race[]> {
    const cacheKey = `jolpica:races:${season}`;
    const cached = getCache<Race[]>(cacheKey);
    if (cached) return cached;

    try {
        return await dedupeInFlight(cacheKey, async () => {
            const response = await api.get(`/${season}.json?limit=100`);
            const races = response.data.MRData.RaceTable.Races as Race[];
            const normalized = normalizeRaceCalendar(races);
            if (normalized.length > 0) {
                setCache(cacheKey, normalized, getSeasonCacheTtlMs(season));
            }
            return normalized;
        });
    } catch (error) {
        if (isRateLimitAxiosError(error)) {
            const stale = getStaleCache<Race[]>(cacheKey);
            if (stale) return stale;
        }
        console.error(`Error fetching races for ${season}:`, error);
        return [];
    }
}

// Fetch race results with drivers
export async function getRaceResults(season: string, round: string): Promise<RaceResult[]> {
    const cacheKey = `jolpica:race-results:${season}:${round}`;
    const cached = getCache<RaceResult[]>(cacheKey);
    if (cached) return cached;

    // If full-season paginated results are already cached, slice this round without a network call
    const cachedSeasonRaces = getCache<JolpicaRaceRecord[]>(`jolpica:paginated:/${season}/results.json`);
    if (cachedSeasonRaces) {
        const matchedRace = cachedSeasonRaces.find(race => race.round === round);
        if (matchedRace?.Results && matchedRace.Results.length > 0) {
            setCache(cacheKey, matchedRace.Results, getSeasonCacheTtlMs(season), { memoryOnly: true });
            return matchedRace.Results;
        }
    }

    try {
        return await dedupeInFlight(cacheKey, async () => {
            const response = await api.get(`/${season}/${round}/results.json`);
            const races = normalizeRaceCalendar(response.data.MRData.RaceTable.Races as Race[]);
            if (races.length > 0 && races[0].Results) {
                setCache(cacheKey, races[0].Results, getSeasonCacheTtlMs(season));
                return races[0].Results;
            }
            return [];
        });
    } catch (error) {
        const stale = getStaleCache<RaceResult[]>(cacheKey);
        if (stale) return stale;
        console.error(`Error fetching results for ${season} round ${round}:`, error);
        return [];
    }
}

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

interface JolpicaRaceRecord extends Partial<Race> {
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
                DriverStandings?: DriverStanding[];
                ConstructorStandings?: ConstructorStandingApi[];
            }>;
        };
    };
}

export interface RaceDriverCard {
    driver: Driver;
    constructor: Constructor;
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

const UNCLASSIFIED_POSITION_TEXT = new Set(['R', 'D', 'E', 'W', 'F', 'N']);

function createRaceRecapEntry(driver: Driver, constructor: Constructor): RaceRecapEntry {
    return {
        driverId: driver.driverId,
        driverName: `${driver.givenName} ${driver.familyName}`,
        constructorId: constructor.constructorId,
        constructorName: constructor.name,
    };
}

function isClassifiedRaceResult(result: RaceResult): boolean {
    return !UNCLASSIFIED_POSITION_TEXT.has(result.positionText)
        && Number.isFinite(Number.parseInt(result.position, 10));
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
        position: result.position,
        time: result.Time?.time,
        gap,
        laps: result.laps,
        status: result.status,
        grid: result.grid,
    };
}

export async function getRaceQualifyingResults(season: string, round: string): Promise<RaceQualifyingResult[]> {
    const cacheKey = `jolpica:race-qualifying:${season}:${round}`;
    const cached = getCache<RaceQualifyingResult[]>(cacheKey);
    if (cached) return cached;

    // If full-season paginated qualifying is already cached, slice this round without a network call
    const cachedSeasonQuali = getCache<JolpicaRaceRecord[]>(`jolpica:paginated:/${season}/qualifying.json`);
    if (cachedSeasonQuali) {
        const matchedRace = cachedSeasonQuali.find(race => race.round === round);
        if (matchedRace?.QualifyingResults && matchedRace.QualifyingResults.length > 0) {
            setCache(cacheKey, matchedRace.QualifyingResults, getSeasonCacheTtlMs(season), { memoryOnly: true });
            return matchedRace.QualifyingResults;
        }
    }

    try {
        return await dedupeInFlight(cacheKey, async () => {
            const response = await api.get(`/${season}/${round}/qualifying.json`);
            const races = response.data.MRData.RaceTable.Races as Array<{ QualifyingResults?: RaceQualifyingResult[] }>;
            const qualiResults = races[0]?.QualifyingResults || [];
            if (qualiResults.length > 0) {
                setCache(cacheKey, qualiResults, getSeasonCacheTtlMs(season));
            }
            return qualiResults;
        });
    } catch (error) {
        const stale = getStaleCache<RaceQualifyingResult[]>(cacheKey);
        if (stale) return stale;
        console.error(`Error fetching qualifying for ${season} round ${round}:`, error);
        return [];
    }
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

export async function getRaceRatingContext(season: string, round: string): Promise<RaceRatingContext> {
    const [results, qualifyingResults] = await Promise.all([
        getRaceResults(season, round),
        getRaceQualifyingResults(season, round),
    ]);

    return {
        drivers: results.map((result, index) => mapRaceResultToDriverCard(result, index)),
        recap: buildRaceRecap(results, qualifyingResults),
    };
}

// Fetch all drivers for a season
export async function getDrivers(season: string): Promise<Driver[]> {
    try {
        const response = await api.get(`/${season}/drivers.json`);
        return response.data.MRData.DriverTable.Drivers as Driver[];
    } catch (error) {
        console.error(`Error fetching drivers for ${season}:`, error);
        return [];
    }
}

// Fetch all constructors for a season
export async function getConstructors(season: string): Promise<Constructor[]> {
    try {
        const response = await api.get(`/${season}/constructors.json`);
        return response.data.MRData.ConstructorTable.Constructors as Constructor[];
    } catch (error) {
        console.error(`Error fetching constructors for ${season}:`, error);
        return [];
    }
}

// Fetch driver standings
export async function getDriverStandings(season: string): Promise<DriverStanding[]> {
    const cacheKey = `jolpica:driver-standings:${season}`;
    const cached = getCache<DriverStanding[]>(cacheKey);
    if (cached) return cached;

    try {
        return await dedupeInFlight(cacheKey, async () => {
            const response = await api.get<StandingsResponse>(`/${season}/driverStandings.json`);
            const standings = response.data.MRData.StandingsTable.StandingsLists[0]?.DriverStandings ?? [];
            if (standings.length > 0) {
                setCache(cacheKey, standings, getSeasonCacheTtlMs(season));
            }
            return standings;
        });
    } catch (error) {
        if (isRateLimitAxiosError(error)) {
            const stale = getStaleCache<DriverStanding[]>(cacheKey);
            if (stale) return stale;
        }
        console.error(`Error fetching standings for ${season}:`, error);
        return [];
    }
}

// Check if a race has been completed (date is in the past)
export function isRaceCompleted(raceDate: string): boolean {
    const today = new Date();
    const race = new Date(raceDate);
    return race < today;
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

// Get driver statistics for a season (wins, poles, podiums)
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

// Helper function to fetch all paginated results from Jolpica API
// The API has a max limit of 100 per request, so we need pagination
async function fetchAllPaginated(
    endpoint: string,
    options?: { cacheRaw?: boolean },
): Promise<JolpicaRaceRecord[]> {
    const cacheKey = `jolpica:paginated:${endpoint}`;
    const cached = getCache<JolpicaRaceRecord[]>(cacheKey);
    if (cached) return cached;

    return dedupeInFlight(cacheKey, async () => {
        const allRaces: JolpicaRaceRecord[] = [];
        let offset = 0;
        const limit = 100; // API max limit
        let hasMore = true;

        // Season-aware TTL: current season refreshes frequently; past seasons are stable.
        const endpointSeason = getEndpointSeason(endpoint);
        const ttlMs = endpointSeason ? getSeasonCacheTtlMs(endpointSeason) : 10 * 60 * 1000; // fallback 10 minutes

        while (hasMore) {
            const url = `${endpoint}?limit=${limit}&offset=${offset}`;
            let response: { data: PaginatedRaceResponse } | null = null;
            try {
                // Retry a couple of times on 429 with exponential backoff (best-effort).
                const maxRetries = 2;
                for (let attempt = 0; attempt <= maxRetries; attempt++) {
                    try {
                        response = await api.get<PaginatedRaceResponse>(url);
                        break;
                    } catch (err) {
                        if (!isRateLimitAxiosError(err) || attempt === maxRetries) throw err;
                        const backoffMs = 500 * Math.pow(2, attempt) + Math.floor(Math.random() * 250);
                        await sleep(backoffMs);
                    }
                }

                if (!response) {
                    throw new Error('Jolpica API returned no response');
                }

                const races = response.data.MRData.RaceTable?.Races ?? [];
                const total = parseInt(response.data.MRData.total) || 0;

                allRaces.push(...races);
                offset += limit;

                // Check if we've fetched all available data
                hasMore = offset < total && races.length > 0;
            } catch (error) {
                // If we get rate-limited, try cache (fresh, then stale) and otherwise surface a typed error.
                if (isRateLimitAxiosError(error)) {
                    const fallback = getCache<JolpicaRaceRecord[]>(cacheKey) ?? getStaleCache<JolpicaRaceRecord[]>(cacheKey);
                    if (fallback) return fallback;
                    throw new RateLimitError('API rate limit reached (429). Please try again shortly.');
                }
                throw error;
            }
        }

        // Cache the combined dataset for a short time to prevent repeated heavy pagination calls.
        setCache(cacheKey, allRaces, ttlMs, { memoryOnly: options?.cacheRaw === false });
        return allRaces;
    });
}

export interface ConstructorStanding {
    constructorId: string;
    constructorName: string;
    position: number;
    points: number;
    wins: number;
}

export async function getConstructorStandings(season: string): Promise<ConstructorStanding[]> {
    const endpoint = `/${season}/constructorStandings.json`;
    const cacheKey = `jolpica:constructor-standings:${season}`;
    const ttlMs = getSeasonCacheTtlMs(season);

    const cached = getCache<ConstructorStanding[]>(cacheKey);
    if (cached) return cached;

    try {
        return await dedupeInFlight(cacheKey, async () => {
            const maxRetries = 2;
            let response: { data: StandingsResponse } | null = null;
            for (let attempt = 0; attempt <= maxRetries; attempt++) {
                try {
                    response = await api.get<StandingsResponse>(endpoint);
                    break;
                } catch (err) {
                    if (!isRateLimitAxiosError(err) || attempt === maxRetries) throw err;
                    const backoffMs = 500 * Math.pow(2, attempt) + Math.floor(Math.random() * 250);
                    await sleep(backoffMs);
                }
            }

            if (!response) {
                throw new Error('Jolpica API returned no response');
            }

            const standings = response.data.MRData.StandingsTable.StandingsLists[0]?.ConstructorStandings ?? [];

            const normalized: ConstructorStanding[] = standings.map((s: ConstructorStandingApi) => ({
                constructorId: s.Constructor?.constructorId ?? 'unknown',
                constructorName: s.Constructor?.name ?? 'Unknown',
                position: parseInt(s.position) || 0,
                points: parseFloat(s.points) || 0,
                wins: parseInt(s.wins) || 0,
            }));

            setCache(cacheKey, normalized, ttlMs);
            return normalized;
        });
    } catch (error) {
        if (isRateLimitAxiosError(error)) {
            const stale = getStaleCache<ConstructorStanding[]>(cacheKey);
            if (stale) return stale;
            throw new RateLimitError('API rate limit reached (429). Please try again shortly.');
        }
        console.error(`Error fetching constructor standings for ${season}:`, error);
        return [];
    }
}

export async function getDriverSeasonStats(season: string): Promise<DriverSeasonStats[]> {
    try {
        // Fetch standings, race results (for podiums), and qualifying results (for poles) concurrently
        const [standings, allRaces, allQualifying] = await Promise.all([
            getDriverStandings(season),
            fetchAllPaginated(`/${season}/results.json`),
            fetchAllPaginated(`/${season}/qualifying.json`),
        ]);

        // Map to store calculated stats
        const driverStats: Map<string, { poles: number; podiums: number }> = new Map();

        // Initialize map for all drivers in standings
        standings.forEach((standing: DriverStanding) => {
            driverStats.set(standing.Driver.driverId, { poles: 0, podiums: 0 });
        });

        // Calculate Podiums (Position 1, 2, 3)
        allRaces.forEach((race: JolpicaRaceRecord) => {
            const results = race.Results || [];
            results.forEach((result: RaceResult) => {
                const pos = parseInt(result.position);
                if (pos >= 1 && pos <= 3) {
                    const driverId = result.Driver.driverId;
                    const stats = driverStats.get(driverId);
                    if (stats) {
                        stats.podiums += 1;
                        driverStats.set(driverId, stats);
                    }
                }
            });
        });

        // Calculate Poles (Qualifying Position 1)
        allQualifying.forEach((race: JolpicaRaceRecord) => {
            const qualifyingResults = race.QualifyingResults || [];
            const poleDriver = qualifyingResults.find((r: RaceQualifyingResult) => r.position === '1');

            if (poleDriver) {
                const driverId = poleDriver.Driver.driverId;
                const stats = driverStats.get(driverId);
                if (stats) {
                    stats.poles += 1;
                    driverStats.set(driverId, stats);
                }
            }
        });

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

// Get all race results for a season (for H2H calculations and standings race-by-race)
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
    position: number | null; // null = DNF/DSQ
    points: number;
    status: string;
    started?: boolean;
    /** Official time gap to the race winner, when the API publishes a numeric gap. */
    raceTimeGapSeconds?: number | null;
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

function didStartRace(result: RaceResult): boolean {
    return !/^(did not start|did not qualify|not started|withdrawn|dns)\b/i.test(result.status.trim());
}

export async function getAllSeasonResults(season: string, options: { throwOnError?: boolean } = {}): Promise<SeasonRaceResult[]> {
    try {
        const [allRaces, calendar] = await Promise.all([
            fetchAllPaginated(`/${season}/results.json`),
            getRaces(season),
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

// Get all sprint results for a season (for standings race-by-race points)
export interface SeasonSprintResult {
    round: string;
    driverId: string;
    driverName: string;
    constructorId: string;
    constructorName: string;
    position: number | null; // null = DNF/DSQ
    points: number;
    status: string;
}

export async function getAllSeasonSprints(season: string, options: { throwOnError?: boolean } = {}): Promise<SeasonSprintResult[]> {
    try {
        const [allSprints, calendar] = await Promise.all([
            fetchAllPaginated(`/${season}/sprint.json`),
            getRaces(season),
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

// Get all qualifying results for a season (for H2H calculations)
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

export async function getAllSeasonQualifying(
    season: string, options: { throwOnError?: boolean } = {},
): Promise<SeasonQualifyingResult[]> {
    try {
        const [allQualifying, calendar] = await Promise.all([
            fetchAllPaginated(`/${season}/qualifying.json`),
            getRaces(season),
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

export interface DriverCareerStint {
    season: string;
    constructorId: string;
    constructorName: string;
}

export interface ConstructorSeasonH2HRaw {
    season: string;
    constructorId: string;
    constructorName: string;
    raceResults: SeasonRaceResult[];
    qualiResults: SeasonQualifyingResult[];
}

export async function getDriverCareerStints(driverId: string): Promise<DriverCareerStint[]> {
    const cacheKey = `jolpica:driver-career-stints:${driverId}:v1`;
    const cached = getCache<DriverCareerStint[]>(cacheKey);
    if (cached) return cached;

    try {
        // Keep raw driver career results in memory only; the compact stints array is persisted to localStorage
        const allDriverRaces = await fetchAllPaginated(`/drivers/${driverId}/results.json`, { cacheRaw: false });
        const seen = new Set<string>();
        const stints: DriverCareerStint[] = [];

        const sortedRaces = [...allDriverRaces].sort((a, b) => {
            const seasonDiff = (parseInt(a.season ?? '0', 10) || 0) - (parseInt(b.season ?? '0', 10) || 0);
            if (seasonDiff !== 0) return seasonDiff;
            return (parseInt(a.round, 10) || 0) - (parseInt(b.round, 10) || 0);
        });

        sortedRaces.forEach(race => {
            const season = race.season;
            if (!season) return;
            race.Results?.forEach(res => {
                if (res.Driver.driverId !== driverId) return;
                const constructorId = res.Constructor.constructorId;
                const constructorName = res.Constructor.name;
                const key = `${season}::${constructorId}`;
                if (!seen.has(key)) {
                    seen.add(key);
                    stints.push({ season, constructorId, constructorName });
                }
            });
        });

        if (stints.length > 0) {
            setCache(cacheKey, stints, 6 * 60 * 60 * 1000);
        }
        return stints;
    } catch (error) {
        const stale = getStaleCache<DriverCareerStint[]>(cacheKey);
        if (stale) return stale;
        console.error(`Error fetching career stints for ${driverId}:`, error);
        return [];
    }
}

export async function getConstructorSeasonH2HRaw(
    season: string,
    constructorId: string,
    constructorNameFallback = constructorId,
): Promise<ConstructorSeasonH2HRaw> {
    const cacheKey = `jolpica:constructor-h2h:${season}:${constructorId}:v1`;
    const cached = getCache<ConstructorSeasonH2HRaw>(cacheKey);
    if (cached) return cached;

    try {
        const cachedFullSeasonRaces = getCache<JolpicaRaceRecord[]>(`jolpica:paginated:/${season}/results.json`);
        const cachedFullSeasonQuali = getCache<JolpicaRaceRecord[]>(`jolpica:paginated:/${season}/qualifying.json`);

        const [rawRaces, rawQualifying] = await Promise.all([
            cachedFullSeasonRaces
                ? Promise.resolve(cachedFullSeasonRaces)
                : fetchAllPaginated(`/${season}/constructors/${constructorId}/results.json`, { cacheRaw: false }),
            cachedFullSeasonQuali
                ? Promise.resolve(cachedFullSeasonQuali)
                : fetchAllPaginated(`/${season}/constructors/${constructorId}/qualifying.json`, { cacheRaw: false }),
        ]);

        const raceResults: SeasonRaceResult[] = [];
        let resolvedConstructorName = constructorNameFallback;

        rawRaces.forEach(race => {
            const raceEntries = race.Results ?? [];
            raceEntries.forEach(result => {
                if (result.Constructor?.constructorId !== constructorId) return;
                const isClassified = isClassifiedRaceResult(result);
                const parsedPosition = Number.parseInt(result.position, 10);
                const parsedGridPosition = Number.parseInt(result.grid, 10);
                resolvedConstructorName = result.Constructor?.name || resolvedConstructorName;

                raceResults.push({
                    round: race.round,
                    raceName: race.raceName ?? `Round ${race.round}`,
                    date: race.date,
                    driverId: result.Driver.driverId,
                    driverName: `${result.Driver.givenName} ${result.Driver.familyName}`,
                    constructorId: result.Constructor.constructorId,
                    constructorName: result.Constructor.name,
                    gridPosition: Number.isFinite(parsedGridPosition) ? parsedGridPosition : null,
                    position: isClassified && Number.isFinite(parsedPosition) ? parsedPosition : null,
                    points: parseFloat(result.points) || 0,
                    status: result.status,
                    started: didStartRace(result),
                });
            });
        });

        const qualiResults: SeasonQualifyingResult[] = [];
        rawQualifying.forEach(race => {
            race.QualifyingResults?.forEach(result => {
                if (result.Constructor?.constructorId !== constructorId) return;
                resolvedConstructorName = result.Constructor?.name || resolvedConstructorName;
                qualiResults.push({
                    round: race.round,
                    raceName: race.raceName ?? `Round ${race.round}`,
                    date: race.date,
                    driverId: result.Driver.driverId,
                    driverName: `${result.Driver.givenName} ${result.Driver.familyName}`,
                    constructorId: result.Constructor.constructorId,
                    constructorName: result.Constructor.name,
                    position: parseInt(result.position, 10),
                });
            });
        });

        const payload: ConstructorSeasonH2HRaw = {
            season,
            constructorId,
            constructorName: resolvedConstructorName,
            raceResults,
            qualiResults,
        };

        setCache(cacheKey, payload, getSeasonCacheTtlMs(season));
        return payload;
    } catch (error) {
        const stale = getStaleCache<ConstructorSeasonH2HRaw>(cacheKey);
        if (stale) return stale;
        console.error(`Error fetching constructor H2H for ${season} ${constructorId}:`, error);
        return {
            season,
            constructorId,
            constructorName: constructorNameFallback,
            raceResults: [],
            qualiResults: [],
        };
    }
}

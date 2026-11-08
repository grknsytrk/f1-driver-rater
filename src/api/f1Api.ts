import axios from 'axios';
import type { Season, Race, RaceResult, Driver, Constructor } from '../types';
import { parseF1TimeSeconds } from '../utils/f1Time';
import {
    extractHistoricalConstructorSeasonH2H,
    extractHistoricalDriverStints,
    extractHistoricalSeasonData,
    hasCachedHistoricalConstructorSeasonH2H,
    loadHistoricalH2HPayload,
} from '../utils/historicalH2H';
import {
    detectNewlyCompletedRounds,
    getDatasetBaselineRound,
    getStaticConstructorStandings,
    getStaticDriverStandings,
    getStaticRaces,
    getStaticRacesSync,
    getStaticRoundQualifying,
    getStaticRoundQualifyingSync,
    getStaticRoundResults,
    getStaticRoundResultsSync,
    getStaticSeasonBundle,
    getStaticSeasonQualifying,
    getStaticSeasonResults,
    getStaticSeasonSprints,
    isFetchMockedOrAvailable,
    isRoundFinished,
    isRoundInStaticBundle,
    mapQualifyingResultsToSeasonQualifying,
    mapRaceResultsToSeasonResults,
    mergeSeasonQualifying,
    mergeSeasonResults,
    mergeSeasonSprints,
    type SeasonDataset,
    updateStaticSeasonBundleInMemory,
} from './staticSeasonData';

export {
    detectNewlyCompletedRounds,
    getDatasetBaselineRound,
    getStaticConstructorStandings,
    getStaticDriverStandings,
    getStaticRaces,
    getStaticRoundQualifying,
    getStaticRoundResults,
    getStaticSeasonBundle,
    getStaticSeasonQualifying,
    getStaticSeasonResults,
    getStaticSeasonSprints,
    isRoundFinished,
    isRoundInStaticBundle,
    mapQualifyingResultsToSeasonQualifying,
    mapRaceResultsToSeasonResults,
    mergeSeasonQualifying,
    mergeSeasonResults,
    mergeSeasonSprints,
    type SeasonDataset,
};

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

import {
    jolpicaQueue,
    type RequestPriority,
    QueueEvictionError,
    RateLimitFlushError,
} from './jolpicaQueue';

export {
    QueueEvictionError,
    RateLimitFlushError,
};

declare module 'axios' {
    export interface AxiosRequestConfig {
        priority?: RequestPriority;
        queueKey?: string;
        isBackground?: boolean;
    }
}

export interface ApiRequestOptions {
    priority?: RequestPriority;
    signal?: AbortSignal;
    throwOnError?: boolean;
}

let rateLimitCooldownUntil = 0;
const IS_TEST_ENV = typeof import.meta !== 'undefined' && import.meta.env?.MODE === 'test';

function getRateLimitBackoffMs(error: unknown, attempt: number): number {
    if (axios.isAxiosError(error)) {
        const retryAfterHeader = error.response?.headers?.['retry-after'];
        const headerValue = typeof retryAfterHeader === 'string' || typeof retryAfterHeader === 'number'
            ? String(retryAfterHeader)
            : '';
        const parsedSeconds = Number.parseFloat(headerValue);
        if (Number.isFinite(parsedSeconds) && parsedSeconds > 0) {
            return Math.ceil(parsedSeconds * 1000) + 500;
        }
        const retryAt = Date.parse(headerValue);
        if (Number.isFinite(retryAt) && retryAt > Date.now()) return retryAt - Date.now() + 500;
    }
    return Math.round(2000 * Math.pow(1.7, attempt)) + Math.floor(Math.random() * 500);
}

let callNetworkRequests = 0;
let callCacheHits = 0;
let activeBackgroundRevalidations = 0;

export function resetCacheSignal(): void {
    callNetworkRequests = 0;
    callCacheHits = 0;
}

export function clearJolpicaCache(): void {
    memoryCache.clear();
    inFlightRequests.clear();
}

export function markCacheHit(): void {
    callCacheHits++;
}

export function markNetworkRequest(options?: { isBackground?: boolean }): void {
    if (!options?.isBackground) {
        callNetworkRequests++;
    }
}

export function wasLastResponseFromCache(): boolean {
    return callNetworkRequests === 0 && callCacheHits > 0;
}

// Pace every Jolpica request, including parallel page loads and retry paths.
api.interceptors.request.use(async config => {
    const isBackground = Boolean(
        config.isBackground || config.priority === 'low',
    );
    const priority: RequestPriority = config.priority ?? (isBackground ? 'low' : 'high');
    const queueKey = config.queueKey;
    const signal = config.signal as unknown as AbortSignal | undefined;

    await jolpicaQueue.acquireSlot({ priority, key: queueKey, signal });

    markNetworkRequest({ isBackground });
    return config;
});

api.interceptors.response.use(
    response => response,
    error => {
        if (isRateLimitAxiosError(error)) {
            const backoffMs = getRateLimitBackoffMs(error, 0);
            rateLimitCooldownUntil = Math.max(
                rateLimitCooldownUntil,
                Date.now() + backoffMs,
            );
            jolpicaQueue.handleRateLimit(backoffMs);
        }
        return Promise.reject(error);
    },
);

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
const currentMemoryEpoch = `epoch-${Date.now()}`;

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

function dedupeInFlight<T>(
    key: string,
    fetcher: () => Promise<T>,
    priority: RequestPriority = 'high',
): Promise<T> {
    const existing = inFlightRequests.get(key) as Promise<T> | undefined;
    if (existing) {
        if (priority === 'high') {
            jolpicaQueue.promoteKey(key);
        }
        return existing;
    }

    const request = fetcher().finally(() => {
        if (inFlightRequests.get(key) === request) {
            inFlightRequests.delete(key);
        }
    });

    inFlightRequests.set(key, request);
    return request;
}

export interface CacheEntry<T> {
    data: T;
    isStale: boolean;
    expiresAt: number;
}

export function getCacheEntry<T>(key: string): CacheEntry<T> | null {
    const now = Date.now();
    try {
        syncMemoryCacheWithStorage();
        const memRecord = memoryCache.get(key) as CacheRecord<T> | undefined;
        if (memRecord && memRecord.data !== undefined) {
            const isStale = now > memRecord.expiresAt;
            // Refresh LRU position
            memoryCache.delete(key);
            memoryCache.set(key, memRecord as CacheRecord<unknown>);
            return {
                data: memRecord.data,
                isStale,
                expiresAt: memRecord.expiresAt,
            };
        }

        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as CacheRecord<T>;
        if (!parsed || typeof parsed.expiresAt !== 'number' || parsed.data === undefined) {
            return null;
        }
        const isStale = now > parsed.expiresAt;
        setMemoryCacheRecord(key, parsed);
        return {
            data: parsed.data,
            isStale,
            expiresAt: parsed.expiresAt,
        };
    } catch {
        return null;
    }
}

export function getCache<T>(key: string): T | null {
    const entry = getCacheEntry<T>(key);
    if (!entry || entry.isStale) return null;
    return entry.data;
}

export function getStaleCache<T>(key: string): T | null {
    const entry = getCacheEntry<T>(key);
    return entry ? entry.data : null;
}

export function setCache<T>(key: string, data: T, ttlMs: number, options?: { memoryOnly?: boolean }) {
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

// 4-Tier Granular TTL Resolver
export const TTL_TIERS = {
    ARCHIVED_SEASON_MS: 30 * 24 * 60 * 60 * 1000,    // Tier 1: 30 days
    COMPLETED_ROUND_MS: 7 * 24 * 60 * 60 * 1000,     // Tier 2: 7 days
    ACTIVE_WEEKEND_MS: 2 * 60 * 1000,                // Tier 3: 2 minutes
    DOWNTIME_MS: 24 * 60 * 60 * 1000,                // Tier 4: 24 hours
} as const;

export interface GranularTtlOptions {
    now?: number | Date;
    archivedMs?: number;
    completedRoundMs?: number;
    activeWeekendMs?: number;
    downtimeMs?: number;
    racesCalendar?: RaceLike[];
}

export function parseRaceDateUtc(dateStr: string): number | null {
    if (!dateStr) return null;
    const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return null;
    const year = Number.parseInt(match[1], 10);
    const month = Number.parseInt(match[2], 10) - 1;
    const day = Number.parseInt(match[3], 10);
    return Date.UTC(year, month, day);
}

export function getRaceWeekendWindow(dateStr: string): { startMs: number; endMs: number } | null {
    const raceDayMidnightUtc = parseRaceDateUtc(dateStr);
    if (raceDayMidnightUtc === null) return null;

    const dayOfWeek = new Date(raceDayMidnightUtc).getUTCDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat

    // Calculate Thursday 00:00:00 UTC of race week
    const daysBackToThursday = (dayOfWeek + 7 - 4) % 7;
    const startMs = raceDayMidnightUtc - daysBackToThursday * 86_400_000;

    // Calculate Monday 23:59:59.999 UTC after the race
    const daysForwardToMonday = (1 + 7 - dayOfWeek) % 7;
    const endMs = raceDayMidnightUtc + (daysForwardToMonday + 1) * 86_400_000 - 1;

    return { startMs, endMs };
}

function getCachedSeasonCalendar(season: string | number): RaceLike[] | null {
    const cacheKey = `jolpica:races:${season}`;
    return getCache<RaceLike[]>(cacheKey) ?? getStaleCache<RaceLike[]>(cacheKey);
}

export function getGranularTtl(
    season: string | number,
    round?: string | number,
    raceDate?: string | Date | RaceLike,
    options?: GranularTtlOptions,
): number {
    const seasonNum = typeof season === 'number' ? season : Number.parseInt(String(season), 10);
    const nowMs = options?.now !== undefined
        ? (typeof options.now === 'number' ? options.now : options.now.getTime())
        : Date.now();
    const currentYear = new Date(nowMs).getUTCFullYear();

    if (!Number.isFinite(seasonNum)) {
        return 10 * 60 * 1000; // 10 minutes
    }

    const archivedMs = options?.archivedMs ?? TTL_TIERS.ARCHIVED_SEASON_MS;
    const completedRoundMs = options?.completedRoundMs ?? TTL_TIERS.COMPLETED_ROUND_MS;
    const activeWeekendMs = options?.activeWeekendMs ?? TTL_TIERS.ACTIVE_WEEKEND_MS;
    const downtimeMs = options?.downtimeMs ?? TTL_TIERS.DOWNTIME_MS;

    // Tier 1: Past seasons (< currentYear) are permanently archived
    if (seasonNum < currentYear) {
        return archivedMs;
    }

    let dateStr: string | null = null;
    if (typeof raceDate === 'string') {
        dateStr = raceDate;
    } else if (raceDate instanceof Date) {
        dateStr = raceDate.toISOString().slice(0, 10);
    } else if (raceDate && typeof raceDate === 'object' && 'date' in raceDate && typeof raceDate.date === 'string') {
        dateStr = raceDate.date;
    }

    const roundStr = round !== undefined && round !== null ? String(round) : null;
    const calendar = options?.racesCalendar ?? getCachedSeasonCalendar(seasonNum);

    if (!dateStr && roundStr && calendar && calendar.length > 0) {
        const matched = calendar.find(r => String(r.round) === roundStr);
        if (matched?.date) {
            dateStr = matched.date;
        }
    }

    // Branch A: Specific round / race date evaluated
    if (dateStr) {
        const window = getRaceWeekendWindow(dateStr);
        if (window) {
            if (nowMs > window.endMs) {
                // Tier 2: Completed round in current season
                return completedRoundMs;
            }
            if (nowMs >= window.startMs && nowMs <= window.endMs) {
                // Tier 3: Active race weekend (Thursday 00:00 to Monday 23:59:59.999 UTC)
                return activeWeekendMs;
            }
            // Tier 4: Future round in current season
            return downtimeMs;
        }
    }

    // Branch B: Whole-season query (calendar, standings, season feeds)
    if (calendar && calendar.length > 0) {
        const isAnyWeekendActive = calendar.some(race => {
            if (!race.date) return false;
            const window = getRaceWeekendWindow(race.date);
            return window ? (nowMs >= window.startMs && nowMs <= window.endMs) : false;
        });

        if (isAnyWeekendActive) {
            // Tier 3: Season currently in active race weekend
            return activeWeekendMs;
        }

        // Tier 4: Season downtime between race weekends
        return downtimeMs;
    }

    // Fallback when calendar is not yet warm:
    return seasonNum > currentYear ? downtimeMs : activeWeekendMs;
}

export function getSeasonCacheTtlMs(
    season: string | number,
    opts?: { currentMs?: number; pastMs?: number },
): number {
    return getGranularTtl(season, undefined, undefined, {
        activeWeekendMs: opts?.currentMs,
        archivedMs: opts?.pastMs,
    });
}

// Stale-While-Revalidate (SWR) Engine
export interface SwrFetchOptions<T> {
    priority?: RequestPriority;
    signal?: AbortSignal;
    memoryOnly?: boolean;
    throwOnError?: boolean;
    fallback?: T;
    isValid?: (data: T) => boolean;
    revalidate?: boolean;
    onBackgroundUpdate?: (data: T) => void;
}

export interface SwrFetchContext {
    priority?: RequestPriority;
    isBackground?: boolean;
}

export type SwrFetcher<T> = (context?: SwrFetchContext) => Promise<T>;

function triggerBackgroundRevalidation<T>(
    key: string,
    fetcher: SwrFetcher<T>,
    resolveTtl: (data: T) => number,
    options?: SwrFetchOptions<T>,
): void {
    if (inFlightRequests.has(key)) {
        return;
    }

    activeBackgroundRevalidations++;
    markNetworkRequest({ isBackground: true });

    dedupeInFlight(key, async () => {
        try {
            const freshData = await fetcher({ priority: 'low', isBackground: true });
            const shouldCache = !options?.isValid || options.isValid(freshData);
            if (shouldCache) {
                setCache(key, freshData, resolveTtl(freshData), { memoryOnly: options?.memoryOnly });
                options?.onBackgroundUpdate?.(freshData);
            }
            return freshData;
        } catch (error) {
            if (!IS_TEST_ENV && typeof import.meta !== 'undefined' && import.meta.env?.DEV) {
                console.debug(`[SWR] Background revalidation failed for ${key}:`, error);
            }
            return null as unknown as T;
        } finally {
            activeBackgroundRevalidations = Math.max(0, activeBackgroundRevalidations - 1);
        }
    }, 'low').catch(() => {});
}

export async function swrFetch<T>(
    key: string,
    fetcher: SwrFetcher<T>,
    ttlMs: number | ((data: T) => number),
    options?: SwrFetchOptions<T>,
): Promise<T> {
    const resolveTtl = (data: T) => (typeof ttlMs === 'function' ? ttlMs(data) : ttlMs);
    const entry = getCacheEntry<T>(key);

    if (entry) {
        markCacheHit();

        if (entry.isStale || options?.revalidate) {
            triggerBackgroundRevalidation(key, fetcher, resolveTtl, options);
        }

        return entry.data;
    }

    const priority = options?.priority ?? 'high';
    markNetworkRequest({ isBackground: priority === 'low' });
    return await dedupeInFlight(key, async () => {
        try {
            const data = await fetcher({ priority, isBackground: priority === 'low' });
            const shouldCache = !options?.isValid || options.isValid(data);
            if (shouldCache) {
                setCache(key, data, resolveTtl(data), { memoryOnly: options?.memoryOnly });
            }
            return data;
        } catch (error) {
            const fallbackStale = getStaleCache<T>(key);
            if (fallbackStale !== null) {
                return fallbackStale;
            }
            if (options?.throwOnError || (isRateLimitAxiosError(error) && options?.fallback === undefined)) {
                throw error;
            }
            if (options?.fallback !== undefined) {
                return options.fallback;
            }
            throw error;
        }
    }, priority);
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

const SEASONS_FALLBACK: Season[] = [
    { season: '2026', url: '' },
    { season: '2025', url: '' },
    { season: '2024', url: '' },
    { season: '2023', url: '' },
    { season: '2022', url: '' },
    { season: '2021', url: '' },
    { season: '2020', url: '' },
];

// Fetch available seasons (2020-current)
export async function getSeasons(options?: ApiRequestOptions): Promise<Season[]> {
    const cacheKey = 'jolpica:seasons';
    return swrFetch<Season[]>(
        cacheKey,
        async (ctx) => {
            const response = await api.get('/seasons.json?limit=10&offset=70', {
                priority: ctx?.priority ?? options?.priority,
                isBackground: ctx?.isBackground,
                queueKey: cacheKey,
                signal: options?.signal,
            });
            const seasons = (response.data?.MRData?.SeasonTable?.Seasons ?? []) as Season[];
            // Filter to recent seasons and reverse for newest first
            return seasons.filter(s => parseInt(s.season, 10) >= 2020).reverse();
        },
        24 * 60 * 60 * 1000,
        {
            priority: options?.priority,
            signal: options?.signal,
            throwOnError: options?.throwOnError,
            fallback: SEASONS_FALLBACK,
            isValid: data => Array.isArray(data) && data.length > 0,
        },
    );
}

// Fetch all races for a season
export async function getRaces(season: string, options?: ApiRequestOptions): Promise<Race[]> {
    const cacheKey = `jolpica:races:${season}`;

    const inMemoryRaces = getStaticRacesSync(season);
    if (inMemoryRaces && inMemoryRaces.length > 0) {
        markCacheHit();
        const normalized = normalizeRaceCalendar(inMemoryRaces);
        const ttl = getGranularTtl(season, undefined, undefined, { racesCalendar: normalized });
        setCache(cacheKey, normalized, ttl, { memoryOnly: true });
        return normalized;
    }

    if (!getCacheEntry<Race[]>(cacheKey) && isFetchMockedOrAvailable()) {
        try {
            const staticRaces = await getStaticRaces(season);
            if (staticRaces && staticRaces.length > 0) {
                markCacheHit();
                const normalized = normalizeRaceCalendar(staticRaces);
                const ttl = getGranularTtl(season, undefined, undefined, { racesCalendar: normalized });
                setCache(cacheKey, normalized, ttl, { memoryOnly: true });
                return normalized;
            }
        } catch {
            // Fall back gracefully to SWR endpoint
        }
    }

    return swrFetch<Race[]>(
        cacheKey,
        async (ctx) => {
            const response = await api.get(`/${season}.json?limit=100`, {
                priority: ctx?.priority ?? options?.priority,
                isBackground: ctx?.isBackground,
                queueKey: cacheKey,
                signal: options?.signal,
            });
            const races = (response.data?.MRData?.RaceTable?.Races ?? []) as Race[];
            return normalizeRaceCalendar(races);
        },
        data => getGranularTtl(season, undefined, undefined, { racesCalendar: data }),
        {
            priority: options?.priority,
            signal: options?.signal,
            throwOnError: options?.throwOnError,
            fallback: [],
            isValid: data => Array.isArray(data) && data.length > 0,
        },
    );
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
            const response = await api.get(`/${season}/${round}/results.json`, {
                priority: ctx?.priority ?? options?.priority,
                isBackground: ctx?.isBackground,
                queueKey: cacheKey,
                signal: options?.signal,
            });
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
    const positionText = result.positionText?.trim().toUpperCase();
    const status = result.status?.trim();
    const hasClassifiedStatus = !status || /^(finished|lapped|\+\s*\d+\s*lap(?:s)?)$/i.test(status);

    return !UNCLASSIFIED_POSITION_TEXT.has(positionText ?? '')
        && hasClassifiedStatus
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
            const response = await api.get(`/${season}/${round}/qualifying.json`, {
                priority: ctx?.priority ?? options?.priority,
                isBackground: ctx?.isBackground,
                queueKey: cacheKey,
                signal: options?.signal,
            });
            const races = (response.data?.MRData?.RaceTable?.Races ?? []) as Array<{ QualifyingResults?: RaceQualifyingResult[] }>;
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
            const response = await api.get<StandingsResponse>(`/${season}/driverStandings.json`, {
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

// Check if a race has been completed (date + time + 3h buffer is in the past)
export function isRaceCompleted(raceDate: string, raceTime?: string): boolean {
    return isRoundFinished({ date: raceDate, time: raceTime });
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
                            response = await api.get<PaginatedRaceResponse>(url, {
                                priority: ctx?.priority ?? options?.priority,
                                isBackground: ctx?.isBackground,
                                queueKey: cacheKey,
                                signal: options?.signal,
                            });
                            break;
                        } catch (err) {
                            if (!isRateLimitAxiosError(err) || attempt === maxRetries) throw err;
                            const backoffMs = getRateLimitBackoffMs(err, attempt);
                            rateLimitCooldownUntil = Math.max(rateLimitCooldownUntil, Date.now() + backoffMs);
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
                    if (isRateLimitAxiosError(error)) {
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

export interface ConstructorStanding {
    constructorId: string;
    constructorName: string;
    position: number;
    points: number;
    wins: number;
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
                    response = await api.get<StandingsResponse>(endpoint, {
                        priority: ctx?.priority ?? options?.priority,
                        isBackground: ctx?.isBackground,
                        queueKey: cacheKey,
                        signal: options?.signal,
                    });
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

// Get all sprint results for a season (for standings race-by-race points)
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
                            const response = await api.get(`/${season}/${race.round}/sprint.json`, {
                                priority: options?.priority,
                                signal: options?.signal,
                            });
                            const sprintRaces = (response.data?.MRData?.RaceTable?.Races ?? []) as JolpicaRaceRecord[];
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
    if (Number.isFinite(seasonNum) && seasonNum >= 2020 && seasonNum <= 2026) {
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
    if (Number.isFinite(seasonNum) && seasonNum >= 2020 && seasonNum <= 2026) {
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
    // Check static historical dataset (2000-2025) first -> 0 Jolpica API requests
    const historical = await loadHistoricalH2HPayload();
    if (historical) {
        const staticStints = extractHistoricalDriverStints(historical, driverId);
        if (staticStints.length > 0) {
            return staticStints;
        }
    }

    const cacheKey = `jolpica:driver-career-stints:${driverId}:v2`;

    return swrFetch<DriverCareerStint[]>(
        cacheKey,
        async (ctx) => {
            // Keep raw driver career results in memory only; the compact stints array is persisted to localStorage
            const allDriverRaces = await fetchAllPaginated(`/drivers/${driverId}/results.json`, {
                cacheRaw: false,
                priority: ctx?.priority,
            });
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

            return stints;
        },
        6 * 60 * 60 * 1000,
        {
            fallback: [],
            isValid: data => Array.isArray(data) && data.length > 0,
        },
    );
}

export function hasConstructorSeasonH2HCache(season: string, constructorId: string): boolean {
    if (hasCachedHistoricalConstructorSeasonH2H(season, constructorId)) return true;
    const cacheKey = `jolpica:constructor-h2h:${season}:${constructorId}:v2`;
    if (getCache<ConstructorSeasonH2HRaw>(cacheKey)) return true;
    const hasFullSeasonRaces = getCache<JolpicaRaceRecord[]>(`jolpica:paginated:/${season}/results.json`) !== null;
    const hasFullSeasonQuali = getCache<JolpicaRaceRecord[]>(`jolpica:paginated:/${season}/qualifying.json`) !== null;
    return hasFullSeasonRaces && hasFullSeasonQuali;
}

export async function getConstructorSeasonH2HRaw(
    season: string,
    constructorId: string,
    constructorNameFallback = constructorId,
    options?: { throwOnError?: boolean },
): Promise<ConstructorSeasonH2HRaw> {
    // Check static historical dataset (2000-2025) first -> 0 Jolpica API requests
    const historical = await loadHistoricalH2HPayload();
    if (historical) {
        const fromStatic = extractHistoricalConstructorSeasonH2H(
            historical,
            season,
            constructorId,
            constructorNameFallback,
        );
        if (fromStatic) {
            return fromStatic;
        }
    }

    const cacheKey = `jolpica:constructor-h2h:${season}:${constructorId}:v2`;

    return swrFetch<ConstructorSeasonH2HRaw>(
        cacheKey,
        async (ctx) => {
            const cachedFullSeasonRaces = getCache<JolpicaRaceRecord[]>(`jolpica:paginated:/${season}/results.json`);
            const cachedFullSeasonQuali = getCache<JolpicaRaceRecord[]>(`jolpica:paginated:/${season}/qualifying.json`);

            // Fetch race results first, then qualifying sequentially when uncached to avoid burst rate limits
            const rawRaces = cachedFullSeasonRaces
                ? cachedFullSeasonRaces
                : await fetchAllPaginated(`/${season}/constructors/${constructorId}/results.json`, {
                    cacheRaw: false,
                    priority: ctx?.priority,
                });
            const rawQualifying = cachedFullSeasonQuali
                ? cachedFullSeasonQuali
                : await fetchAllPaginated(`/${season}/constructors/${constructorId}/qualifying.json`, {
                    cacheRaw: false,
                    priority: ctx?.priority,
                });

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
                        positionText: result.positionText,
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

            return {
                season,
                constructorId,
                constructorName: resolvedConstructorName,
                raceResults,
                qualiResults,
            };
        },
        () => getGranularTtl(season),
        {
            throwOnError: options?.throwOnError,
            fallback: {
                season,
                constructorId,
                constructorName: constructorNameFallback,
                raceResults: [],
                qualiResults: [],
            },
            isValid: data => data.raceResults.length > 0 || data.qualiResults.length > 0,
        },
    );
}

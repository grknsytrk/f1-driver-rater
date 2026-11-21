import type { Race } from '../types';
import { jolpicaQueue, type RequestPriority } from './jolpicaQueue';

export const IS_TEST_ENV = typeof import.meta !== 'undefined' && import.meta.env?.MODE === 'test';

let callNetworkRequests = 0;
let callCacheHits = 0;

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

export function getEndpointSeason(endpoint: string): string | null {
    const match = endpoint.match(/^\/(\d{4})\//);
    return match?.[1] ?? null;
}

function isHttp429Error(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    const err = error as { status?: unknown; response?: { status?: unknown } };
    return err.status === 429 || err.response?.status === 429;
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

export function dedupeInFlight<T>(
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
            if (options?.throwOnError || (isHttp429Error(error) && options?.fallback === undefined)) {
                throw error;
            }
            if (options?.fallback !== undefined) {
                return options.fallback;
            }
            throw error;
        }
    }, priority);
}

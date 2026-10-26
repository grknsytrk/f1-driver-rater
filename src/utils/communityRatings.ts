import type { SupabaseClient } from '@supabase/supabase-js';
import type { AverageRating, SeasonRatings } from '../types';
import { supabase } from '../lib/supabaseClient';
import { COMMUNITY_CHANGE_EVENT, ensureGuestUser } from './guestSync';
import { validRatings, type RatingScope } from './ratingData';
import { normalizeCommunityDistributions, type CommunityRatingDistribution } from './communityRatingDistribution';

export interface CommunityRating {
    driverId: string;
    round?: string;
    averageRating: number;
    voteCount: number;
}
export interface CommunityQuery { kind: 'race' | 'quick'; season: string; round?: string }
export interface CommunityDistributionQuery { kind: 'race' | 'quick'; season: string }
export type CommunityStatus = 'disabled' | 'loading' | 'ready' | 'unavailable';
export interface CommunityState { status: CommunityStatus; ratings: CommunityRating[] }
export const queryKey = (query: CommunityQuery) => JSON.stringify([query.kind, query.season, query.round ?? '']);
export function scopeAffectsQuery(scope: RatingScope, query: CommunityQuery): boolean {
    return (!scope.kind || scope.kind === query.kind) && (!scope.season || scope.season === query.season)
        && (!scope.round || !query.round || scope.round === query.round);
}

export const COMMUNITY_CACHE_PREFIX = 'f1_community_cache_v1:';
export const COMMUNITY_DIST_CACHE_PREFIX = 'f1_community_dist_cache_v1:';

export interface CommunityClientOptions {
    ttlMs?: number | ((season: string) => number);
    storage?: Storage | null;
}

export function getCommunityCacheTtlMs(season: string, nowMs = Date.now()): number {
    const parsedSeason = Number.parseInt(season, 10);
    const currentYear = new Date(nowMs).getFullYear();
    if (!Number.isFinite(parsedSeason) || parsedSeason >= currentYear) {
        return 5 * 60_000; // 5 minutes for active season
    }
    return 30 * 60_000; // 30 minutes for past seasons
}

interface StoredCommunityEntry<T, Q> {
    query: Q;
    expires: number;
    data: T;
}

export function createCommunityClient(
    client: SupabaseClient | null,
    ensureUser: () => Promise<unknown>,
    now = Date.now,
    options: CommunityClientOptions = {},
) {
    const storage = options.storage ?? null;
    const resolveTtl = (season: string) =>
        typeof options.ttlMs === 'function' ? options.ttlMs(season) : (options.ttlMs ?? 60_000);

    const cache = new Map<string, {
        query: CommunityQuery;
        expires: number;
        promise: Promise<CommunityRating[]>;
        value?: CommunityRating[];
    }>();
    const distributionCache = new Map<string, {
        query: CommunityDistributionQuery;
        expires: number;
        promise: Promise<CommunityRatingDistribution[]>;
        value?: CommunityRatingDistribution[];
    }>();

    function readStorage<T, Q>(storageKey: string): StoredCommunityEntry<T, Q> | null {
        if (!storage) return null;
        try {
            const raw = storage.getItem(storageKey);
            if (!raw) return null;
            const parsed = JSON.parse(raw) as StoredCommunityEntry<T, Q>;
            if (!parsed || typeof parsed.expires !== 'number' || !Array.isArray(parsed.data)) {
                storage.removeItem(storageKey);
                return null;
            }
            if (parsed.expires <= now()) {
                storage.removeItem(storageKey);
                return null;
            }
            return parsed;
        } catch {
            return null;
        }
    }

    function writeStorage<T, Q>(storageKey: string, entry: StoredCommunityEntry<T, Q>) {
        if (!storage) return;
        try {
            storage.setItem(storageKey, JSON.stringify(entry));
        } catch {
            // ignore storage quota / privacy errors
        }
    }

    function invalidate(scopes: RatingScope[]) {
        for (const [key, entry] of cache) {
            if (scopes.some(scope => scopeAffectsQuery(scope, entry.query))) cache.delete(key);
        }
        for (const [key, entry] of distributionCache) {
            const query: CommunityQuery = entry.query;
            if (scopes.some(scope => scopeAffectsQuery(scope, query))) distributionCache.delete(key);
        }
        if (storage) {
            try {
                const keysToDelete: string[] = [];
                for (let i = 0; i < storage.length; i += 1) {
                    const storageKey = storage.key(i);
                    if (!storageKey) continue;
                    if (
                        storageKey.startsWith(COMMUNITY_CACHE_PREFIX)
                        || storageKey.startsWith(COMMUNITY_DIST_CACHE_PREFIX)
                    ) {
                        const raw = storage.getItem(storageKey);
                        if (!raw) continue;
                        try {
                            const parsed = JSON.parse(raw) as { query?: CommunityQuery };
                            if (parsed?.query && scopes.some(scope => scopeAffectsQuery(scope, parsed.query!))) {
                                keysToDelete.push(storageKey);
                            }
                        } catch {
                            keysToDelete.push(storageKey);
                        }
                    }
                }
                keysToDelete.forEach(k => storage.removeItem(k));
            } catch {
                // ignore storage errors
            }
        }
    }

    function getResolvedFullSeasonRaceRatings(season: string): { ratings: CommunityRating[]; expires: number } | null {
        const fullSeasonQuery: CommunityQuery = { kind: 'race', season };
        const fullSeasonKey = queryKey(fullSeasonQuery);
        const mem = cache.get(fullSeasonKey);
        if (mem && mem.value !== undefined && mem.expires > now()) {
            return { ratings: mem.value, expires: mem.expires };
        }
        const stored = readStorage<CommunityRating[], CommunityQuery>(COMMUNITY_CACHE_PREFIX + fullSeasonKey);
        if (stored) {
            cache.set(fullSeasonKey, {
                query: fullSeasonQuery,
                expires: stored.expires,
                promise: Promise.resolve(stored.data),
                value: stored.data,
            });
            return { ratings: stored.data, expires: stored.expires };
        }
        return null;
    }

    function load(query: CommunityQuery): Promise<CommunityRating[]> {
        if (!client) return Promise.resolve([]);
        const key = queryKey(query);
        const cached = cache.get(key);
        if (cached && cached.expires > now()) return cached.promise;

        const stored = readStorage<CommunityRating[], CommunityQuery>(COMMUNITY_CACHE_PREFIX + key);
        if (stored) {
            const hydratedEntry = {
                query,
                expires: stored.expires,
                promise: Promise.resolve(stored.data),
                value: stored.data,
            };
            cache.set(key, hydratedEntry);
            return hydratedEntry.promise;
        }

        // If a single race round is requested and the full season's race ratings are already resolved,
        // slice the round directly from memory/sessionStorage with 0 Supabase egress.
        if (query.kind === 'race' && query.round) {
            const fullSeason = getResolvedFullSeasonRaceRatings(query.season);
            if (fullSeason) {
                const roundRatings = fullSeason.ratings.filter(row => row.round === query.round);
                const derivedEntry = {
                    query,
                    expires: fullSeason.expires,
                    promise: Promise.resolve(roundRatings),
                    value: roundRatings,
                };
                cache.set(key, derivedEntry);
                return derivedEntry.promise;
            }
        }

        const controller = new AbortController();
        let timeout: ReturnType<typeof setTimeout>;
        const deadline = new Promise<never>((_, reject) => {
            timeout = setTimeout(() => { controller.abort(); reject(new Error('Community request timed out')); }, 8000);
        });
        const request = (async () => {
            await ensureUser();
            if (controller.signal.aborted) throw new Error('Community request timed out');
            const { data, error } = await client.rpc(
                query.kind === 'race' ? 'get_race_community_ratings' : 'get_quick_community_ratings',
                { p_season: query.season, ...(query.kind === 'race' ? { p_round: query.round ?? null } : {}) },
            ).abortSignal(controller.signal);
            if (error) throw error;
            return (data as { driver_id: string; round?: string; average_rating: number | string; vote_count: number | string }[] ?? [])
                .map(row => ({ driverId: row.driver_id, round: row.round,
                    averageRating: Number(row.average_rating), voteCount: Number(row.vote_count) }))
                .filter(row => Number.isFinite(row.averageRating) && row.averageRating >= 0.5 && row.averageRating <= 10
                    && Number.isSafeInteger(row.voteCount) && row.voteCount > 0);
        })();
        const entry: {
            query: CommunityQuery;
            expires: number;
            promise: Promise<CommunityRating[]>;
            value?: CommunityRating[];
        } = { query, expires: Infinity, promise: Promise.resolve([] as CommunityRating[]) };
        entry.promise = Promise.race([request, deadline]).then(ratings => {
            const expires = now() + resolveTtl(query.season);
            entry.expires = expires;
            entry.value = ratings;
            if (cache.get(key) === entry) {
                writeStorage(COMMUNITY_CACHE_PREFIX + key, { query, expires, data: ratings });
            }
            return ratings;
        }).catch(error => {
            if (cache.get(key) === entry) cache.delete(key);
            throw error;
        }).finally(() => clearTimeout(timeout));
        cache.set(key, entry);
        return entry.promise;
    }
    function loadDistribution(query: CommunityDistributionQuery): Promise<CommunityRatingDistribution[]> {
        if (!client) return Promise.resolve([]);
        const key = JSON.stringify(['distribution', query.kind, query.season]);
        const cached = distributionCache.get(key);
        if (cached && cached.expires > now()) return cached.promise;

        const stored = readStorage<CommunityRatingDistribution[], CommunityDistributionQuery>(
            COMMUNITY_DIST_CACHE_PREFIX + key,
        );
        if (stored) {
            const hydratedEntry = {
                query,
                expires: stored.expires,
                promise: Promise.resolve(stored.data),
                value: stored.data,
            };
            distributionCache.set(key, hydratedEntry);
            return hydratedEntry.promise;
        }

        const controller = new AbortController();
        let timeout: ReturnType<typeof setTimeout>;
        const deadline = new Promise<never>((_, reject) => {
            timeout = setTimeout(() => { controller.abort(); reject(new Error('Community distribution request timed out')); }, 8000);
        });
        const request = (async () => {
            await ensureUser();
            if (controller.signal.aborted) throw new Error('Community distribution request timed out');
            const { data, error } = await client.rpc('get_community_rating_distributions_by_round', {
                p_kind: query.kind, p_season: query.season,
            }).abortSignal(controller.signal);
            if (error) throw error;
            return normalizeCommunityDistributions(data ?? [], query.kind);
        })();
        const entry: {
            query: CommunityDistributionQuery;
            expires: number;
            promise: Promise<CommunityRatingDistribution[]>;
            value?: CommunityRatingDistribution[];
        } = { query, expires: Infinity, promise: Promise.resolve([] as CommunityRatingDistribution[]) };
        entry.promise = Promise.race([request, deadline]).then(distributions => {
            const expires = now() + resolveTtl(query.season);
            entry.expires = expires;
            entry.value = distributions;
            if (distributionCache.get(key) === entry) {
                writeStorage(COMMUNITY_DIST_CACHE_PREFIX + key, { query, expires, data: distributions });
            }
            return distributions;
        }).catch(error => {
            if (distributionCache.get(key) === entry) distributionCache.delete(key);
            throw error;
        }).finally(() => clearTimeout(timeout));
        distributionCache.set(key, entry);
        return entry.promise;
    }
    return { load, loadDistribution, invalidate, configured: client !== null };
}

function getDefaultSessionStorage(): Storage | null {
    try {
        return typeof window !== 'undefined' ? window.sessionStorage : null;
    } catch {
        return null;
    }
}

export const communityClient = createCommunityClient(supabase, ensureGuestUser, Date.now, {
    ttlMs: season => getCommunityCacheTtlMs(season),
    storage: getDefaultSessionStorage(),
});
window.addEventListener(COMMUNITY_CHANGE_EVENT, event => {
    communityClient.invalidate((event as CustomEvent<RatingScope[]>).detail);
});

export interface CommunityComparison {
    myAverage: number;
    communityAverage: number | null;
    voteCount: number;
    raceCount: number;
    personalRaceCount: number;
}

export function compareCommunity(
    driver: AverageRating, races: SeasonRatings | null, ratings: CommunityRating[],
    source: 'race' | 'quick', scope: 'same' | 'season',
): CommunityComparison {
    const community = ratings.filter(row => row.driverId === driver.driverId && row.voteCount > 0);
    const personal = new Map((races?.races ?? []).filter(race => race.completed).flatMap(race => {
        const rating = validRatings(race.ratings).find(rating => rating.driverId === driver.driverId);
        return rating ? [[race.round, rating.rating] as const] : [];
    }));
    const selected = source === 'quick' ? community.slice(0, 1)
        : scope === 'same' ? community.filter(row => row.round && personal.has(row.round)) : community;
    const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
    return {
        myAverage: source === 'race' && scope === 'same' && selected.length
            ? mean(selected.map(row => personal.get(row.round!)!)) : driver.averageRating,
        communityAverage: selected.length ? mean(selected.map(row => row.averageRating)) : null,
        voteCount: selected.reduce((sum, row) => sum + row.voteCount, 0),
        raceCount: source === 'race' ? selected.length : 0,
        personalRaceCount: personal.size,
    };
}

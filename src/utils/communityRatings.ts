import type { SupabaseClient } from '@supabase/supabase-js';
import type { AverageRating, SeasonRatings } from '../types';
import { supabase } from '../lib/supabaseClient';
import { COMMUNITY_CHANGE_EVENT, ensureGuestUser } from './guestSync';
import { validRatings, type RatingScope } from './ratingData';

export interface CommunityRating {
    driverId: string;
    round?: string;
    averageRating: number;
    voteCount: number;
}
export interface CommunityQuery { kind: 'race' | 'quick'; season: string; round?: string }
export type CommunityStatus = 'disabled' | 'loading' | 'ready' | 'unavailable';
export interface CommunityState { status: CommunityStatus; ratings: CommunityRating[] }
export const queryKey = (query: CommunityQuery) => JSON.stringify([query.kind, query.season, query.round ?? '']);
export function scopeAffectsQuery(scope: RatingScope, query: CommunityQuery): boolean {
    return (!scope.kind || scope.kind === query.kind) && (!scope.season || scope.season === query.season)
        && (!scope.round || !query.round || scope.round === query.round);
}

export function createCommunityClient(client: SupabaseClient | null, ensureUser: () => Promise<unknown>, now = Date.now) {
    const cache = new Map<string, { query: CommunityQuery; expires: number; promise: Promise<CommunityRating[]> }>();
    function invalidate(scopes: RatingScope[]) {
        for (const [key, entry] of cache) {
            if (scopes.some(scope => scopeAffectsQuery(scope, entry.query))) cache.delete(key);
        }
    }
    function load(query: CommunityQuery): Promise<CommunityRating[]> {
        if (!client) return Promise.resolve([]);
        const key = queryKey(query);
        const cached = cache.get(key);
        if (cached && cached.expires > now()) return cached.promise;
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
        const entry = { query, expires: Infinity, promise: Promise.resolve([] as CommunityRating[]) };
        entry.promise = Promise.race([request, deadline]).then(ratings => {
            entry.expires = now() + 60_000;
            return ratings;
        }).catch(error => {
            if (cache.get(key) === entry) cache.delete(key);
            throw error;
        }).finally(() => clearTimeout(timeout));
        cache.set(key, entry);
        return entry.promise;
    }
    return { load, invalidate, configured: client !== null };
}

export const communityClient = createCommunityClient(supabase, ensureGuestUser);
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

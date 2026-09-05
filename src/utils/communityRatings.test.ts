import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { compareCommunity, createCommunityClient, type CommunityRating } from './communityRatings';
import type { AverageRating, SeasonRatings } from '../types';

const driver: AverageRating = { driverId: 'norris', driverName: 'Lando Norris', constructorId: 'mclaren', constructorName: 'McLaren', averageRating: 8, totalRaces: 3, ratings: [10, 8, 6] };
const races: SeasonRatings = { season: '2026', races: [10, 8, 6].map((rating, index) => ({
    round: String(index + 1), raceName: 'GP', date: '2026-01-01', completed: true,
    ratings: [{ ...driver, rating, constructorId: index === 0 ? 'old-team' : 'mclaren' }],
})) };
const community: CommunityRating[] = [
    { driverId: 'norris', round: '1', averageRating: 6, voteCount: 100 },
    { driverId: 'norris', round: '2', averageRating: 10, voteCount: 1 },
    { driverId: 'norris', round: '4', averageRating: 2, voteCount: 3 },
    { driverId: 'piastri', round: '1', averageRating: 1, voteCount: 1 },
];

describe('community comparison', () => {
    it('compares the common races with equal race weights, including one-vote races', () => {
        expect(compareCommunity(driver, races, community, 'race', 'same')).toEqual({
            myAverage: 9, communityAverage: 8, voteCount: 101, raceCount: 2, personalRaceCount: 3,
        });
        expect(driver.averageRating).toBe(8);
    });
    it('uses the full season without changing the personal season score', () => {
        expect(compareCommunity(driver, races, community, 'race', 'season')).toMatchObject({
            myAverage: 8, communityAverage: 6, voteCount: 104, raceCount: 3,
        });
    });
    it('retains personal scores when no community race overlaps', () => {
        expect(compareCommunity(driver, races, community.slice(2), 'race', 'same')).toMatchObject({
            myAverage: 8, communityAverage: null, voteCount: 0, raceCount: 0,
        });
    });
    it('handles quick ratings without a race timeline', () => {
        expect(compareCommunity(driver, null, [{ driverId: 'norris', averageRating: 7.5, voteCount: 1 }], 'quick', 'same'))
            .toMatchObject({ myAverage: 8, communityAverage: 7.5, voteCount: 1, raceCount: 0 });
    });
});

describe('community request cache', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());
    const query = { kind: 'race' as const, season: '2026', round: '1' };
    function setup() {
        const response = vi.fn().mockResolvedValue({ data: [{ driver_id: 'norris', round: '1', average_rating: '8.12345', vote_count: '1' }], error: null });
        const rpc = vi.fn(() => ({ abortSignal: response }));
        const ensureUser = vi.fn().mockResolvedValue({});
        const client = createCommunityClient({ rpc } as unknown as SupabaseClient, ensureUser);
        return { client, rpc, response, ensureUser };
    }
    it('deduplicates in-flight reads and caches for 60 seconds without rounding', async () => {
        const { client, rpc } = setup();
        const a = client.load(query);
        const b = client.load(query);
        expect(a).toBe(b);
        expect((await a)[0].averageRating).toBe(8.12345);
        await client.load(query);
        expect(rpc).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(60_001);
        await client.load(query);
        expect(rpc).toHaveBeenCalledTimes(2);
    });
    it('keeps season, round, and quick data separate and invalidates affected scopes only', async () => {
        const { client, rpc } = setup();
        const queries = [query, { ...query, round: '2' }, { kind: 'race' as const, season: '2026' }, { kind: 'quick' as const, season: '2026' }, { ...query, season: '2025' }];
        await Promise.all(queries.map(query => client.load(query)));
        client.invalidate([{ kind: 'race', season: '2026', round: '1' }]);
        await Promise.all(queries.map(query => client.load(query)));
        expect(rpc).toHaveBeenCalledTimes(7);
        expect(rpc).toHaveBeenCalledWith('get_quick_community_ratings', { p_season: '2026' });
    });
    it('times out even if guest authentication hangs, and allows retry', async () => {
        const ensureUser = vi.fn().mockImplementation(() => new Promise(() => {}));
        const client = createCommunityClient({} as SupabaseClient, ensureUser);
        const result = expect(client.load(query)).rejects.toThrow('timed out');
        await vi.advanceTimersByTimeAsync(8000);
        await result;
        expect(ensureUser).toHaveBeenCalledTimes(1);
    });
    it('does not let an invalidated in-flight response overwrite a newer cache entry', async () => {
        const { client, response, rpc } = setup();
        let finish!: (value: unknown) => void;
        response.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
        const old = client.load(query);
        await Promise.resolve();
        client.invalidate([{ kind: 'race', season: '2026' }]);
        const fresh = await client.load(query);
        finish({ data: [{ driver_id: 'norris', average_rating: 1, vote_count: 1 }], error: null });
        await old;
        expect(await client.load(query)).toEqual(fresh);
        expect(rpc).toHaveBeenCalledTimes(2);
    });
    it('does not cache failures or make requests when unconfigured', async () => {
        const { client, response, rpc } = setup();
        response.mockResolvedValueOnce({ data: null, error: new Error('Unavailable') });
        await expect(client.load(query)).rejects.toThrow('Unavailable');
        await client.load(query);
        expect(rpc).toHaveBeenCalledTimes(2);
        expect(await createCommunityClient(null, vi.fn()).load(query)).toEqual([]);
    });
});

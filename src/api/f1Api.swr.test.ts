import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    getCache,
    getCacheEntry,
    getConstructorStandings,
    getDriverStandings,
    getRaceResults,
    getRaces,
    getSeasons,
    getStaleCache,
    markCacheHit,
    markNetworkRequest,
    resetCacheSignal,
    setCache,
    swrFetch,
    wasLastResponseFromCache,
} from './f1Api';
import { delay, withMinimumDelay } from '../utils/delay';

const apiGet = vi.hoisted(() => vi.fn());
vi.mock('axios', () => ({
    default: {
        create: () => ({
            get: apiGet,
            interceptors: {
                request: { use: () => undefined },
                response: { use: () => undefined },
            },
        }),
        isAxiosError: () => false,
    },
}));

beforeEach(() => {
    apiGet.mockReset();
    localStorage.clear();
    resetCacheSignal();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'debug').mockImplementation(() => {});
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('Non-destructive cache retrieval & eviction bug fix (f1Api.swr.test.ts)', () => {
    it('does not evict expired entries from localStorage on getCache reads', () => {
        const testKey = 'jolpica:test-round';
        const expiredData = [{ round: '1', raceName: 'Expired GP' }];
        const expiredRecord = {
            expiresAt: Date.now() - 5000, // Expired 5 seconds ago
            data: expiredData,
        };
        localStorage.setItem(testKey, JSON.stringify(expiredRecord));

        // getCache returns null because entry is expired
        const cached = getCache<typeof expiredData>(testKey);
        expect(cached).toBeNull();

        // FATAL BUG FIX: Verify the expired record was NOT deleted from localStorage!
        const raw = localStorage.getItem(testKey);
        expect(raw).not.toBeNull();

        // Verify getStaleCache succeeds in reading the intact expired entry
        const stale = getStaleCache<typeof expiredData>(testKey);
        expect(stale).toEqual(expiredData);
    });

    it('getCacheEntry returns isStale=true without deleting the record', () => {
        const testKey = 'jolpica:test-stale-entry';
        const data = { score: 42 };
        setCache(testKey, data, -1000); // Created as already expired

        const entry = getCacheEntry<typeof data>(testKey);
        expect(entry).not.toBeNull();
        expect(entry?.isStale).toBe(true);
        expect(entry?.data).toEqual(data);

        // Entry remains available in storage
        expect(getStaleCache(testKey)).toEqual(data);
    });
});

describe('Stale-While-Revalidate (swrFetch) engine', () => {
    it('returns stale cache immediately (0ms) and signals cache hit', async () => {
        const testKey = 'jolpica:swr-immediate';
        const stalePayload = ['stale-round-1'];
        setCache(testKey, stalePayload, -5000); // Expired 5s ago

        let fetcherCalled = false;
        const fetcher = async () => {
            fetcherCalled = true;
            await delay(50);
            return ['fresh-round-1'];
        };

        const result = await swrFetch(testKey, fetcher, 60000);

        // Returns stale data immediately without awaiting fetcher
        expect(result).toEqual(stalePayload);
        expect(wasLastResponseFromCache()).toBe(true);
        expect(fetcherCalled).toBe(true);
    });

    it('updates cache in background after stale hit revalidation resolves', async () => {
        const testKey = 'jolpica:swr-bg-update';
        const stalePayload = ['old-data'];
        const freshPayload = ['new-fresh-data'];
        setCache(testKey, stalePayload, -2000);

        let resolveBgPromise: (val: string[]) => void = () => {};
        const bgPromise = new Promise<string[]>(resolve => {
            resolveBgPromise = resolve;
        });

        const fetcher = () => bgPromise;

        // First call receives stale data immediately
        const firstRead = await swrFetch(testKey, fetcher, 60000);
        expect(firstRead).toEqual(stalePayload);

        // Resolve background fetcher
        resolveBgPromise(freshPayload);
        await delay(10); // Yield to microtasks

        // Cache now contains fresh data
        const freshCache = getCache<string[]>(testKey);
        expect(freshCache).toEqual(freshPayload);

        // Subsequent swrFetch returns fresh data without triggering background fetch
        const secondRead = await swrFetch(testKey, async () => ['unexpected'], 60000);
        expect(secondRead).toEqual(freshPayload);
    });

    it('silently absorbs background network errors and preserves stale cache', async () => {
        const testKey = 'jolpica:swr-bg-error';
        const stalePayload = ['preserved-stale-data'];
        setCache(testKey, stalePayload, -1000);

        const fetcher = async () => {
            throw new Error('Jolpica 429 Rate Limit in background');
        };

        // Calling swrFetch must NOT reject even though background revalidation throws
        const result = await swrFetch(testKey, fetcher, 60000);
        expect(result).toEqual(stalePayload);

        await delay(10); // Allow background catch to complete

        // Stale data remains intact
        expect(getStaleCache(testKey)).toEqual(stalePayload);
    });

    it('deduplicates in-flight background requests for the same cache key', async () => {
        const testKey = 'jolpica:swr-dedup';
        setCache(testKey, ['initial-data'], -1000);

        let networkCalls = 0;
        const fetcher = async () => {
            networkCalls++;
            await delay(30);
            return ['fresh-data'];
        };

        // Trigger two concurrent SWR calls on the stale entry
        const [res1, res2] = await Promise.all([
            swrFetch(testKey, fetcher, 60000),
            swrFetch(testKey, fetcher, 60000),
        ]);

        expect(res1).toEqual(['initial-data']);
        expect(res2).toEqual(['initial-data']);

        await delay(50);
        // Both shared the exact same in-flight background request
        expect(networkCalls).toBe(1);
    });

    it('awaits fetcher directly on cold cache miss and saves fresh entry', async () => {
        const testKey = 'jolpica:swr-cold-miss';
        const freshData = { season: '2026', champion: 'TBD' };

        resetCacheSignal();
        const result = await swrFetch(testKey, async () => {
            await delay(10);
            return freshData;
        }, 60000);

        expect(result).toEqual(freshData);
        expect(wasLastResponseFromCache()).toBe(false);

        // Entry is now cached
        expect(getCache(testKey)).toEqual(freshData);
    });

    it('returns options.fallback on cold miss network error when throwOnError is false', async () => {
        const testKey = 'jolpica:swr-cold-fallback';
        const fallback = ['safe-fallback'];

        const result = await swrFetch(
            testKey,
            async () => {
                throw new Error('Network failure');
            },
            60000,
            { fallback, throwOnError: false },
        );

        expect(result).toEqual(fallback);
    });

    it('rethrows on cold miss network error when throwOnError is true', async () => {
        const testKey = 'jolpica:swr-cold-throw';
        const networkError = new Error('Fatal network error');

        await expect(
            swrFetch(testKey, async () => {
                throw networkError;
            }, 60000, { throwOnError: true }),
        ).rejects.toBe(networkError);
    });

    it('passes priority: low and isBackground: true during background revalidation, but foreground receives high', async () => {
        const staleKey = 'jolpica:swr-priority-test';
        setCache(staleKey, ['stale'], -5000);

        const receivedContexts: Array<{ priority?: string; isBackground?: boolean } | undefined> = [];
        const fetcher = async (ctx?: { priority?: string; isBackground?: boolean }) => {
            receivedContexts.push(ctx);
            return ['fresh'];
        };

        // Stale read triggers background revalidation
        await swrFetch(staleKey, fetcher, 60000);
        await delay(10);

        expect(receivedContexts).toHaveLength(1);
        expect(receivedContexts[0]).toEqual({ priority: 'low', isBackground: true });

        // Foreground cold fetch passes priority: high and isBackground: false
        const coldKey = 'jolpica:swr-cold-priority';
        await swrFetch(coldKey, fetcher, 60000);
        expect(receivedContexts).toHaveLength(2);
        expect(receivedContexts[1]).toEqual({ priority: 'high', isBackground: false });
    });
});

describe('Cache-hit signaling and zero-delay elimination in delay.ts', () => {
    it('signals cache hit and wasLastResponseFromCache returns true', () => {
        resetCacheSignal();
        expect(wasLastResponseFromCache()).toBe(false);

        markCacheHit();
        expect(wasLastResponseFromCache()).toBe(true);

        // Foreground network request clears the cache-hit signal
        markNetworkRequest();
        expect(wasLastResponseFromCache()).toBe(false);
    });

    it('background network requests do not clear foreground cache hit signal', () => {
        resetCacheSignal();
        markCacheHit();
        expect(wasLastResponseFromCache()).toBe(true);

        // Detached background request
        markNetworkRequest({ isBackground: true });
        expect(wasLastResponseFromCache()).toBe(true);
    });

    it('withMinimumDelay skips artificial delay on cache hits even when execution takes >50ms', async () => {
        // Simulate a cache hit where JSON parsing took 70ms (exceeding fastThreshold of 50ms)
        const start = performance.now();
        const result = await withMinimumDelay(async () => {
            markCacheHit();
            await delay(70);
            return 'cached-result';
        }, 800, 50);
        const elapsed = performance.now() - start;

        expect(result).toBe('cached-result');
        // Resolves immediately at ~70ms, rather than waiting 800ms
        expect(elapsed).toBeLessThan(150);
    });

    it('withMinimumDelay enforces 800ms delay on genuine network calls taking >50ms', async () => {
        const start = performance.now();
        const result = await withMinimumDelay(async () => {
            markNetworkRequest();
            await delay(60);
            return 'network-result';
        }, 150, 50);
        const elapsed = performance.now() - start;

        expect(result).toBe('network-result');
        expect(elapsed).toBeGreaterThanOrEqual(140);
    });
});

describe('End-to-end endpoint SWR integration', () => {
    it('getRaces serves stale schedule immediately without blocking', async () => {
        const staleSchedule = [
            { round: '1', date: '2026-03-15', raceName: 'Stale Bahrain GP' },
        ];
        setCache('jolpica:races:2026', staleSchedule, -10000);

        apiGet.mockImplementation(async () => {
            await delay(50);
            return {
                data: {
                    MRData: {
                        RaceTable: {
                            Races: [{ round: '1', date: '2026-03-15', raceName: 'Fresh Bahrain GP' }],
                        },
                    },
                },
            };
        });

        const start = performance.now();
        const races = await getRaces('2026');
        const elapsed = performance.now() - start;

        // Served immediately from stale cache
        expect(races[0].raceName).toBe('Stale Bahrain GP');
        expect(elapsed).toBeLessThan(40);
        expect(wasLastResponseFromCache()).toBe(true);

        // Wait for background revalidation
        await delay(70);
        const updated = getCache<typeof staleSchedule>('jolpica:races:2026');
        expect(updated?.[0]?.raceName).toBe('Fresh Bahrain GP');
    });

    it('getSeasons serves cached seasons immediately and falls back gracefully', async () => {
        const staleSeasons = [{ season: '2026', url: '' }, { season: '2025', url: '' }];
        setCache('jolpica:seasons', staleSeasons, -5000);

        const seasons = await getSeasons();
        expect(seasons).toEqual(staleSeasons);
        expect(wasLastResponseFromCache()).toBe(true);
    });

    it('getDriverStandings serves stale standings immediately while refreshing', async () => {
        const staleStandings = [
            {
                position: '1',
                positionText: '1',
                points: '25',
                wins: '1',
                Driver: { driverId: 'norris', givenName: 'Lando', familyName: 'Norris', url: '' },
            },
        ];
        setCache('jolpica:driver-standings:2026', staleStandings, -5000);

        const standings = await getDriverStandings('2026');
        expect(standings).toEqual(staleStandings);
        expect(wasLastResponseFromCache()).toBe(true);
    });

    it('getConstructorStandings serves stale standings immediately while refreshing', async () => {
        const staleConstructors = [
            { constructorId: 'mclaren', constructorName: 'McLaren', position: 1, points: 43, wins: 1 },
        ];
        setCache('jolpica:constructor-standings:2026', staleConstructors, -5000);

        const standings = await getConstructorStandings('2026');
        expect(standings).toEqual(staleConstructors);
        expect(wasLastResponseFromCache()).toBe(true);
    });

    it('getRaceResults serves individual round immediately from sliced full season results', async () => {
        const sampleRace = {
            round: '3',
            date: '2026-04-05',
            Results: [
                {
                    position: '1',
                    positionText: '1',
                    points: '25',
                    grid: '1',
                    laps: '56',
                    status: 'Finished',
                    Driver: { driverId: 'norris', givenName: 'Lando', familyName: 'Norris', url: '' },
                    Constructor: { constructorId: 'mclaren', name: 'McLaren', url: '' },
                },
            ],
        };
        setCache('jolpica:paginated:/2026/results.json', [sampleRace], 3600000);

        const results = await getRaceResults('2026', '3');
        expect(results).toHaveLength(1);
        expect(results[0].Driver.driverId).toBe('norris');
        expect(wasLastResponseFromCache()).toBe(true);
    });
});

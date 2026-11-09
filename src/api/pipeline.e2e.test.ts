import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import vercelConfig from '../../vercel.json';
import indexHtml from '../../index.html?raw';
import manifestJson from '../../public/data/seasons/manifest.json';
import bundle2020Json from '../../public/data/seasons/2020.json';
import bundle2021Json from '../../public/data/seasons/2021.json';
import bundle2022Json from '../../public/data/seasons/2022.json';
import bundle2023Json from '../../public/data/seasons/2023.json';
import bundle2024Json from '../../public/data/seasons/2024.json';
import bundle2025Json from '../../public/data/seasons/2025.json';
import bundle2026Json from '../../public/data/seasons/2026.json';
import { withMinimumDelay } from '../utils/delay';
import {
    clearStaticSeasonCache,
    type CompactSeasonBundle,
    type SeasonManifest,
} from './staticSeasonData';
import {
    getAllSeasonQualifying,
    getAllSeasonResults,
    getAllSeasonSprints,
    getConstructorStandings,
    getDriverSeasonStats,
    getDriverStandings,
    getGranularTtl,
    getRaces,
    resetCacheSignal,
    setCache,
    swrFetch,
    TTL_TIERS,
    wasLastResponseFromCache,
} from './f1Api';
import {
    JolpicaPriorityQueue,
    RateLimitFlushError,
    resetJolpicaQueue,
} from './jolpicaQueue';
import {
    preloadRaceRatingRoute,
    resetRoutePrefetchCache,
} from '../routes/routeChunks';

const STATIC_BUNDLES: Record<string, CompactSeasonBundle> = {
    '2020': bundle2020Json as unknown as CompactSeasonBundle,
    '2021': bundle2021Json as unknown as CompactSeasonBundle,
    '2022': bundle2022Json as unknown as CompactSeasonBundle,
    '2023': bundle2023Json as unknown as CompactSeasonBundle,
    '2024': bundle2024Json as unknown as CompactSeasonBundle,
    '2025': bundle2025Json as unknown as CompactSeasonBundle,
    '2026': bundle2026Json as unknown as CompactSeasonBundle,
};

describe('Milestone 5 — End-to-End Pipeline & Adversarial Hardening (R1–R5)', () => {
    beforeEach(() => {
        clearStaticSeasonCache();
        resetJolpicaQueue(true);
        resetRoutePrefetchCache();
        resetCacheSignal();
        localStorage.clear();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        clearStaticSeasonCache();
        resetJolpicaQueue(true);
        resetRoutePrefetchCache();
    });

    describe('Tier 1 (R1): Production Asset Headers & Early Connection Hints', () => {
        it('configures immutable and SWR Cache-Control headers in vercel.json', () => {
            const getHeader = (source: string) =>
                vercelConfig.headers
                    .find(h => h.source === source)
                    ?.headers.find(kv => kv.key === 'Cache-Control')?.value;

            expect(getHeader('/assets/(.*)')).toBe('public, max-age=31536000, immutable');
            expect(getHeader('/fonts/(.*)')).toBe('public, max-age=31536000, immutable');
            expect(getHeader('/data/(.*)')).toContain('stale-while-revalidate');
            expect(getHeader('/images/(.*)')).toContain('stale-while-revalidate');
        });

        it('includes preconnect and dns-prefetch hints for https://api.jolpi.ca in index.html', () => {
            expect(indexHtml).toMatch(/<link[^>]+rel="preconnect"[^>]+href="https:\/\/api\.jolpi\.ca"/);
            expect(indexHtml).toMatch(/<link[^>]+rel="dns-prefetch"[^>]+href="https:\/\/api\.jolpi\.ca"/);
        });
    });

    describe('Tier 2 (R2): SWR Background Revalidation, Granular TTLs & Zero Cache-Hit Delay', () => {
        it('serves stale cache immediately in 0ms via withMinimumDelay and updates in background', async () => {
            const key = 'jolpica:e2e:swr-zero-delay';
            setCache(key, ['stale-v1'], -5000);

            let resolveBg!: (val: string[]) => void;
            const bgPromise = new Promise<string[]>(res => {
                resolveBg = res;
            });
            const fetcher = vi.fn(() => bgPromise);

            const start = performance.now();
            const data = await withMinimumDelay(
                () => swrFetch(key, fetcher, 60_000),
                800,
            );
            const elapsed = performance.now() - start;

            expect(data).toEqual(['stale-v1']);
            expect(wasLastResponseFromCache()).toBe(true);
            expect(elapsed).toBeLessThan(100);
            expect(fetcher).toHaveBeenCalledTimes(1);

            resolveBg(['fresh-v2']);
            await new Promise(r => setTimeout(r, 10));

            const updated = await swrFetch(key, fetcher, 60_000);
            expect(updated).toEqual(['fresh-v2']);
            expect(fetcher).toHaveBeenCalledTimes(1);
        });

        it('enforces 4-tier granular TTL across archived seasons, completed rounds, active weekends, and downtime', () => {
            const now = new Date('2026-06-07T14:00:00Z');
            const calendar = [
                { round: '1', date: '2026-03-08' },
                { round: '8', date: '2026-06-07' },
                { round: '9', date: '2026-06-21' },
            ];

            expect(getGranularTtl('2024', undefined, undefined, { now })).toBe(TTL_TIERS.ARCHIVED_SEASON_MS);
            expect(getGranularTtl('2026', '1', undefined, { now, racesCalendar: calendar })).toBe(TTL_TIERS.COMPLETED_ROUND_MS);
            expect(getGranularTtl('2026', '8', undefined, { now, racesCalendar: calendar })).toBe(TTL_TIERS.ACTIVE_WEEKEND_MS);
            expect(getGranularTtl('2026', '9', undefined, { now, racesCalendar: calendar })).toBe(TTL_TIERS.DOWNTIME_MS);
        });
    });

    describe('Tier 3 (R3): Dual-Tier Priority Queue & Route Prefetching', () => {
        it('preempts queued low-priority prefetches with high-priority user requests and promotes on collision', async () => {
            const queue = new JolpicaPriorityQueue({ intervalMs: 25, maxLowQueueSize: 4, isTestEnv: false });
            const executionOrder: string[] = [];

            const p1 = queue.enqueue(async () => {
                executionOrder.push('initial');
                return 'initial';
            }, { priority: 'high', key: 'k-init' });

            await Promise.resolve();

            const pLow1 = queue.enqueue(async () => {
                executionOrder.push('low-1');
                return 'low-1';
            }, { priority: 'low', key: 'k-low-1' });

            const pLowPromoted = queue.enqueue(async () => {
                executionOrder.push('promoted-from-low');
                return 'promoted-from-low';
            }, { priority: 'low', key: 'k-collide' });

            const pHighUser = queue.enqueue(async () => {
                executionOrder.push('high-user');
                return 'high-user';
            }, { priority: 'high', key: 'k-high' });

            const pCollideUser = queue.enqueue(async () => {
                executionOrder.push('should-dedupe');
                return 'should-dedupe';
            }, { priority: 'high', key: 'k-collide' });

            await Promise.all([p1, pLow1, pLowPromoted, pHighUser, pCollideUser]);

            expect(executionOrder).toEqual([
                'initial',
                'promoted-from-low',
                'high-user',
                'low-1',
            ]);
        });

        it('flushes low-priority prefetch queue on 429 rate limit without dropping high-priority user calls', async () => {
            const queue = new JolpicaPriorityQueue({ intervalMs: 20, maxLowQueueSize: 4, isTestEnv: false });

            const p1 = queue.enqueue(async () => 'first', { priority: 'high' });
            const pLow = queue.enqueue(async () => 'low-item', { priority: 'low' });
            const pHigh = queue.enqueue(async () => 'high-survivor', { priority: 'high' });

            queue.handleRateLimit(30);

            await expect(pLow).rejects.toBeInstanceOf(RateLimitFlushError);
            await expect(p1).resolves.toBe('first');
            await expect(pHigh).resolves.toBe('high-survivor');
        });
    });

    describe('Tier 4 (R4): Real Static Season Bundles on Disk & Zero-API Season Views', () => {
        it('validates manifest.json and all 2020–2026 static bundle files on disk', () => {
            const manifest = manifestJson as unknown as SeasonManifest;
            expect(manifest.version).toBe(1);

            for (const year of ['2020', '2021', '2022', '2023', '2024', '2025', '2026']) {
                const entry = manifest.seasons[year];
                expect(entry).toBeDefined();

                const bundle = STATIC_BUNDLES[year];
                expect(bundle.season).toBe(year);
                expect(bundle.isArchived).toBe(Number(year) < 2026);
                expect(bundle.races.length).toBeGreaterThan(0);
                expect(bundle.results.length).toBeGreaterThan(0);
                expect(bundle.qualifying.length).toBeGreaterThan(0);
                expect(bundle.driverStandings.length).toBeGreaterThan(0);
                expect(bundle.constructorStandings.length).toBeGreaterThan(0);
                expect(Object.keys(bundle.roundResults ?? {}).length).toBe(bundle.lastCompletedRound);

                // Per-round map integrity: roundResults must equal aggregate count and have a P1 winner
                for (const [round, roundRes] of Object.entries(bundle.roundResults ?? {})) {
                    const agg = bundle.results.filter(r => String(r.round) === String(round));
                    expect(roundRes.length).toBe(agg.length);
                    expect(roundRes.some(r => String(r.position) === '1')).toBe(true);
                }
                for (const [round, roundQuali] of Object.entries(bundle.roundQualifying ?? {})) {
                    const agg = bundle.qualifying.filter(q => String(q.round) === String(round));
                    expect(roundQuali.length).toBe(agg.length);
                    if (roundQuali.length > 0) {
                        expect(roundQuali.some(q => String(q.position) === '1')).toBe(true);
                    }
                }
            }

            // Explicit verification of 2026 completed rounds (no 5-round truncation)
            const bundle2026 = STATIC_BUNDLES['2026'];
            expect(bundle2026.lastCompletedRound).toBeGreaterThanOrEqual(19);
            expect(bundle2026.results.length).toBeGreaterThanOrEqual(418);
            expect(bundle2026.qualifying.length).toBeGreaterThanOrEqual(435);
            expect(bundle2026.sprints.length).toBeGreaterThanOrEqual(132);
            expect(manifest.seasons['2026'].bundleUrl).toContain('/data/seasons/2026.json?v=');
        });

        it('hydrates full 2025 Standings, Awards & Teammate Wars data from real disk bundle with 0 Jolpica calls', async () => {
            const bundle2025 = STATIC_BUNDLES['2025'];

            const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
                ok: true,
                json: async () => bundle2025,
            } as Response);

            const [races, stats, wcc, wdc, results, qualifying, sprints] = await Promise.all([
                getRaces('2025'),
                getDriverSeasonStats('2025'),
                getConstructorStandings('2025'),
                getDriverStandings('2025'),
                getAllSeasonResults('2025'),
                getAllSeasonQualifying('2025'),
                getAllSeasonSprints('2025'),
            ]);

            expect(fetchSpy).toHaveBeenCalledTimes(1);
            expect(races.length).toBe(24);
            expect(stats.length).toBeGreaterThanOrEqual(20);
            expect(wcc.length).toBe(10);
            expect(wdc.length).toBeGreaterThanOrEqual(20);
            expect(results.length).toBe(bundle2025.results.length);
            expect(qualifying.length).toBe(bundle2025.qualifying.length);
            expect(sprints.length).toBe(bundle2025.sprints.length);
            expect(wasLastResponseFromCache()).toBe(true);
        });

        it('hydrates 2026 current-season Standings, Awards, Quick Rate & Teammate Wars from 2026 bundle with 0 Jolpica calls when no newer round finished', async () => {
            const bundle2026 = STATIC_BUNDLES['2026'];
            // Pin system time just after the last completed race (start + 4h) so that
            // the next round's sessions, including its qualifying, have not happened yet.
            const lastCompletedRound = bundle2026.lastCompletedRound ?? 0;
            const lastRace = bundle2026.races.find(r => Number.parseInt(r.round, 10) === lastCompletedRound);
            const lastRaceStart = lastRace?.date
                ? new Date(`${lastRace.date}T${lastRace.time ?? '14:00:00Z'}`)
                : new Date('2026-11-08T12:00:00Z');
            const pinnedTime = new Date(lastRaceStart.getTime() + 4 * 60 * 60 * 1000);

            vi.useFakeTimers();
            vi.setSystemTime(pinnedTime);
            try {
                const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
                    ok: true,
                    json: async () => bundle2026,
                } as Response);

                const [races, stats, wcc, wdc, results, qualifying, sprints] = await Promise.all([
                    getRaces('2026'),
                    getDriverSeasonStats('2026'),
                    getConstructorStandings('2026'),
                    getDriverStandings('2026'),
                    getAllSeasonResults('2026'),
                    getAllSeasonQualifying('2026'),
                    getAllSeasonSprints('2026'),
                ]);

                expect(fetchSpy).toHaveBeenCalledTimes(1);
                expect(races.length).toBe(bundle2026.races.length);
                expect(stats.length).toBeGreaterThanOrEqual(20);
                expect(wcc.length).toBe(bundle2026.constructorStandings.length);
                expect(wdc.length).toBeGreaterThanOrEqual(20);
                expect(results.length).toBe(bundle2026.results.length);
                expect(qualifying.length).toBe(bundle2026.qualifying.length);
                expect(sprints.length).toBe(bundle2026.sprints.length);
                expect(wasLastResponseFromCache()).toBe(true);
            } finally {
                vi.useRealTimers();
            }
        });
    });

    describe('Tier 5: Adversarial Edge Cases & Corruption Recovery', () => {
        it('recovers gracefully when localStorage contains malformed JSON', async () => {
            const key = 'jolpica:corrupted-entry';
            localStorage.setItem(key, '{malformed-json');

            const data = await swrFetch(key, async () => ['recovered'], 60_000);
            expect(data).toEqual(['recovered']);
        });

        it('deduplicates preloadRaceRatingRoute calls for the same season and round', async () => {
            const bundle2025 = STATIC_BUNDLES['2025'];

            const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
                ok: true,
                json: async () => bundle2025,
            } as Response);

            preloadRaceRatingRoute('2025', '1');
            preloadRaceRatingRoute('2025', '1');
            await new Promise(r => setTimeout(r, 20));

            expect(fetchSpy).toHaveBeenCalledTimes(1);
        });
    });
});

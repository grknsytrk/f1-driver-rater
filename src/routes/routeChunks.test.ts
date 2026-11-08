import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as f1Api from '../api/f1Api';
import {
    preloadQuickRateRoute,
    preloadRaceRatingRoute,
    resetRoutePrefetchCache,
} from './routeChunks';

describe('Route Chunk Preloaders (src/routes/routeChunks.test.ts)', () => {
    beforeEach(() => {
        resetRoutePrefetchCache();
        vi.restoreAllMocks();
    });

    describe('preloadRaceRatingRoute', () => {
        it('calls getRaceRatingContext with low priority for valid season and round', () => {
            const spy = vi.spyOn(f1Api, 'getRaceRatingContext').mockResolvedValue({
                drivers: [],
                recap: { winner: null, podium: [], pole: null, fastestLap: null, dnfCount: 0 },
            });

            preloadRaceRatingRoute('2024', '3');

            expect(spy).toHaveBeenCalledTimes(1);
            expect(spy).toHaveBeenCalledWith('2024', '3', { priority: 'low' });
        });

        it('deduplicates calls for the same season and round via module Set', () => {
            const spy = vi.spyOn(f1Api, 'getRaceRatingContext').mockResolvedValue({
                drivers: [],
                recap: { winner: null, podium: [], pole: null, fastestLap: null, dnfCount: 0 },
            });

            preloadRaceRatingRoute('2024', '3');
            preloadRaceRatingRoute('2024', '3');
            preloadRaceRatingRoute('2024', '3');

            expect(spy).toHaveBeenCalledTimes(1);
        });

        it('does nothing when season or round is missing', () => {
            const spy = vi.spyOn(f1Api, 'getRaceRatingContext').mockResolvedValue({
                drivers: [],
                recap: { winner: null, podium: [], pole: null, fastestLap: null, dnfCount: 0 },
            });

            preloadRaceRatingRoute();
            preloadRaceRatingRoute('2024');
            preloadRaceRatingRoute(undefined, '1');

            expect(spy).not.toHaveBeenCalled();
        });

        it('purges cache key on fetch failure to allow subsequent retry', async () => {
            let attempt = 0;
            const spy = vi.spyOn(f1Api, 'getRaceRatingContext').mockImplementation(async () => {
                attempt++;
                if (attempt === 1) {
                    throw new Error('Network error');
                }
                return {
                    drivers: [],
                    recap: { winner: null, podium: [], pole: null, fastestLap: null, dnfCount: 0 },
                };
            });

            preloadRaceRatingRoute('2024', '5');
            expect(spy).toHaveBeenCalledTimes(1);

            // Allow catch handler to execute
            await Promise.resolve();
            await Promise.resolve();

            // Next call should retry because first failed and key was deleted
            preloadRaceRatingRoute('2024', '5');
            expect(spy).toHaveBeenCalledTimes(2);
        });
    });

    describe('preloadQuickRateRoute', () => {
        it('calls getDriverSeasonStats with low priority for valid season', () => {
            const spy = vi.spyOn(f1Api, 'getDriverSeasonStats').mockResolvedValue([]);

            preloadQuickRateRoute('2024');

            expect(spy).toHaveBeenCalledTimes(1);
            expect(spy).toHaveBeenCalledWith('2024', { priority: 'low' });
        });

        it('deduplicates calls for the same season', () => {
            const spy = vi.spyOn(f1Api, 'getDriverSeasonStats').mockResolvedValue([]);

            preloadQuickRateRoute('2024');
            preloadQuickRateRoute('2024');

            expect(spy).toHaveBeenCalledTimes(1);
        });

        it('does nothing when season is missing', () => {
            const spy = vi.spyOn(f1Api, 'getDriverSeasonStats').mockResolvedValue([]);

            preloadQuickRateRoute();
            preloadQuickRateRoute(undefined);

            expect(spy).not.toHaveBeenCalled();
        });

        it('purges cache key on failure to permit retry', async () => {
            let attempt = 0;
            const spy = vi.spyOn(f1Api, 'getDriverSeasonStats').mockImplementation(async () => {
                attempt++;
                if (attempt === 1) {
                    throw new Error('Stats failure');
                }
                return [];
            });

            preloadQuickRateRoute('2025');
            expect(spy).toHaveBeenCalledTimes(1);

            await Promise.resolve();
            await Promise.resolve();

            preloadQuickRateRoute('2025');
            expect(spy).toHaveBeenCalledTimes(2);
        });
    });

    describe('resetRoutePrefetchCache', () => {
        it('clears all prefetched keys', () => {
            const raceSpy = vi.spyOn(f1Api, 'getRaceRatingContext').mockResolvedValue({
                drivers: [],
                recap: { winner: null, podium: [], pole: null, fastestLap: null, dnfCount: 0 },
            });
            const statsSpy = vi.spyOn(f1Api, 'getDriverSeasonStats').mockResolvedValue([]);

            preloadRaceRatingRoute('2024', '1');
            preloadQuickRateRoute('2024');
            expect(raceSpy).toHaveBeenCalledTimes(1);
            expect(statsSpy).toHaveBeenCalledTimes(1);

            resetRoutePrefetchCache();

            preloadRaceRatingRoute('2024', '1');
            preloadQuickRateRoute('2024');
            expect(raceSpy).toHaveBeenCalledTimes(2);
            expect(statsSpy).toHaveBeenCalledTimes(2);
        });
    });
});

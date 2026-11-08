import { lazy, type ComponentType } from 'react';

type RouteModule<TProps = object> = { default: ComponentType<TProps> };

function createLazyRoute<TProps = object>(loader: () => Promise<RouteModule<TProps>>) {
    let pendingImport: Promise<RouteModule<TProps>> | null = null;

    const load = () => {
        if (!pendingImport) {
            pendingImport = loader();
        }

        return pendingImport;
    };

    return {
        Route: lazy(load),
        preload: () => {
            void load();
        },
    };
}

const resultsRoute = createLazyRoute(() => import('./ResultsRoute'));
const teammateWarsRoute = createLazyRoute(() => import('./TeammateWarsRoute'));
const standingsRoute = createLazyRoute(() => import('./StandingsRoute'));
const awardsRoute = createLazyRoute(() => import('./SeasonAwardsRoute'));
const driverProfileRoute = createLazyRoute(() => import('./DriverProfileRoute'));

export const ResultsRoute = resultsRoute.Route;
export const TeammateWarsRoute = teammateWarsRoute.Route;
export const StandingsRoute = standingsRoute.Route;
export const AwardsRoute = awardsRoute.Route;
export const DriverProfileRoute = driverProfileRoute.Route;

import { getRaceRatingContext, getDriverSeasonStats } from '../api/f1Api';
import { loadStaticSeasonData } from '../api/staticSeasonData';

export function preloadResultsRoute(season?: string): void {
    resultsRoute.preload();
    if (season) void loadStaticSeasonData(season);
}

export function preloadTeammateWarsRoute(season?: string): void {
    teammateWarsRoute.preload();
    if (season) void loadStaticSeasonData(season);
}

export function preloadStandingsRoute(season?: string): void {
    standingsRoute.preload();
    if (season) void loadStaticSeasonData(season);
}

export function preloadAwardsRoute(season?: string): void {
    awardsRoute.preload();
    if (season) void loadStaticSeasonData(season);
}

export const preloadDriverProfileRoute = driverProfileRoute.preload;

const prefetchedRaceRatings = new Set<string>();
const prefetchedQuickRates = new Set<string>();

export function resetRoutePrefetchCache(): void {
    prefetchedRaceRatings.clear();
    prefetchedQuickRates.clear();
}

export function preloadRaceRatingRoute(season?: string, round?: string): void {
    if (!season || !round) return;
    const key = `${season}:${round}`;
    if (prefetchedRaceRatings.has(key)) return;
    prefetchedRaceRatings.add(key);

    void getRaceRatingContext(season, round, { priority: 'low' }).catch(() => {
        prefetchedRaceRatings.delete(key);
    });
}

export function preloadQuickRateRoute(season?: string): void {
    if (!season) return;
    if (prefetchedQuickRates.has(season)) return;
    prefetchedQuickRates.add(season);

    void getDriverSeasonStats(season, { priority: 'low' }).catch(() => {
        prefetchedQuickRates.delete(season);
    });
}

export function preloadSeasonRouteChunks() {
    preloadResultsRoute();
    preloadTeammateWarsRoute();
    preloadStandingsRoute();
    preloadAwardsRoute();
}

export function scheduleSeasonRoutePrefetch() {
    if (typeof window === 'undefined') {
        return () => undefined;
    }

    if ('requestIdleCallback' in window) {
        const handle = window.requestIdleCallback(() => {
            preloadSeasonRouteChunks();
        }, { timeout: 1200 });

        return () => window.cancelIdleCallback(handle);
    }

    const handle = globalThis.setTimeout(() => {
        preloadSeasonRouteChunks();
    }, 700);

    return () => globalThis.clearTimeout(handle);
}

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
const quickRateRoute = createLazyRoute(() => import('./QuickRateRoute'));
const raceRatingRoute = createLazyRoute(() => import('./RaceRatingRoute'));

export const ResultsRoute = resultsRoute.Route;
export const TeammateWarsRoute = teammateWarsRoute.Route;
export const StandingsRoute = standingsRoute.Route;
export const QuickRateRoute = quickRateRoute.Route;
export const RaceRatingRoute = raceRatingRoute.Route;

export const preloadResultsRoute = resultsRoute.preload;
export const preloadTeammateWarsRoute = teammateWarsRoute.preload;
export const preloadStandingsRoute = standingsRoute.preload;
export const preloadQuickRateRoute = quickRateRoute.preload;
export const preloadRaceRatingRoute = raceRatingRoute.preload;

export function preloadSeasonRouteChunks() {
    preloadResultsRoute();
    preloadTeammateWarsRoute();
    preloadStandingsRoute();
    preloadQuickRateRoute();
    preloadRaceRatingRoute();
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

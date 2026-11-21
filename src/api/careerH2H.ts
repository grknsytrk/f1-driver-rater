import {
    extractHistoricalConstructorSeasonH2H,
    extractHistoricalDriverStints,
    hasCachedHistoricalConstructorSeasonH2H,
    loadHistoricalH2HPayload,
} from '../utils/historicalH2H';
import { getCache, getGranularTtl, swrFetch } from './jolpicaCache';
import {
    didStartRace,
    fetchAllPaginated,
    getAllSeasonQualifying,
    getAllSeasonResults,
    isClassifiedRaceResult,
    type JolpicaRaceRecord,
    type SeasonQualifyingResult,
    type SeasonRaceResult,
} from './seasonResults';
import { getSeasonManifestSync, getStaticRacesSync, getStaticSeasonBundle } from './staticSeasonData';

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
    // Check static historical dataset (2000-2025) and post-2025 static season bundles (e.g. 2026) -> 0 Jolpica API requests
    const manifestSeasons = Object.keys(getSeasonManifestSync()?.seasons ?? {})
        .filter(seasonKey => (Number.parseInt(seasonKey, 10) || 0) > 2025)
        .sort((a, b) => (Number.parseInt(a, 10) || 0) - (Number.parseInt(b, 10) || 0));

    const [historical, postHistoricalBundles] = await Promise.all([
        loadHistoricalH2HPayload(),
        Promise.all(manifestSeasons.map(seasonKey => getStaticSeasonBundle(seasonKey).catch(() => null))),
    ]);

    const combinedStints = new Map<string, DriverCareerStint>();

    if (historical) {
        for (const stint of extractHistoricalDriverStints(historical, driverId)) {
            combinedStints.set(`${stint.season}::${stint.constructorId}`, stint);
        }
    }

    for (const bundle of postHistoricalBundles) {
        if (!bundle) continue;
        for (const res of bundle.results ?? []) {
            if (res.driverId !== driverId || !res.constructorId) continue;
            const key = `${bundle.season}::${res.constructorId}`;
            if (!combinedStints.has(key)) {
                combinedStints.set(key, {
                    season: bundle.season,
                    constructorId: res.constructorId,
                    constructorName: res.constructorName || res.constructorId,
                });
            }
        }
        for (const quali of bundle.qualifying ?? []) {
            if (quali.driverId !== driverId || !quali.constructorId) continue;
            const key = `${bundle.season}::${quali.constructorId}`;
            if (!combinedStints.has(key)) {
                combinedStints.set(key, {
                    season: bundle.season,
                    constructorId: quali.constructorId,
                    constructorName: quali.constructorName || quali.constructorId,
                });
            }
        }
    }

    if (combinedStints.size > 0) {
        return [...combinedStints.values()].sort(
            (a, b) => (Number.parseInt(a.season, 10) || 0) - (Number.parseInt(b.season, 10) || 0),
        );
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
    if (getStaticRacesSync(season) !== null) return true;
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

    // Check static season bundle (e.g. 2026 active season) -> merges bundle with any newly completed live rounds
    const staticBundle = await getStaticSeasonBundle(season).catch(() => null);
    if (staticBundle && ((staticBundle.results && staticBundle.results.length > 0) || (staticBundle.qualifying && staticBundle.qualifying.length > 0))) {
        const [allRaceResults, allQualiResults] = await Promise.all([
            getAllSeasonResults(season, { throwOnError: options?.throwOnError }),
            getAllSeasonQualifying(season, { throwOnError: options?.throwOnError }),
        ]);
        const raceResults = allRaceResults.filter(r => r.constructorId === constructorId);
        const qualiResults = allQualiResults.filter(q => q.constructorId === constructorId);
        if (raceResults.length > 0 || qualiResults.length > 0) {
            const resolvedConstructorName =
                raceResults[0]?.constructorName
                || qualiResults[0]?.constructorName
                || constructorNameFallback;
            return {
                season,
                constructorId,
                constructorName: resolvedConstructorName,
                raceResults,
                qualiResults,
            };
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

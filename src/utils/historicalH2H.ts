import type {
    ConstructorSeasonH2HRaw,
    DriverCareerStint,
    SeasonQualifyingResult,
    SeasonRaceResult,
} from '../api/f1Api';

export type CompactRoundEntryTuple = [
    driverIdx: number,
    constructorIdx: number,
    gridPosition: number | null,
    racePosition: number | null,
    points: number,
    statusIdx: number,
    startedFlag: 0 | 1,
    qualiPosition: number | null,
];

export type CompactSeasonRoundTuple = [
    round: string,
    raceName: string,
    date: string,
    entries: CompactRoundEntryTuple[],
];

export interface CompactHistoricalH2HPayload {
    version: 1;
    drivers: [string, string][];
    constructors: [string, string][];
    statuses: string[];
    seasons: Record<string, CompactSeasonRoundTuple[]>;
}

let cachedPayload: CompactHistoricalH2HPayload | null = null;
let inFlightPayloadPromise: Promise<CompactHistoricalH2HPayload | null> | null = null;

export function hasCachedHistoricalConstructorSeasonH2H(season: string, constructorId: string): boolean {
    if (!cachedPayload) return false;

    const constructorIdx = cachedPayload.constructors.findIndex(constructor => constructor[0] === constructorId);
    if (constructorIdx < 0) return false;

    return (cachedPayload.seasons[season] ?? []).some(([, , , entries]) =>
        entries.some(entry => entry[1] === constructorIdx),
    );
}

export async function loadHistoricalH2HPayload(): Promise<CompactHistoricalH2HPayload | null> {
    if (cachedPayload) return cachedPayload;
    if (inFlightPayloadPromise) return inFlightPayloadPromise;

    if (typeof import.meta !== 'undefined' && import.meta.env?.MODE === 'test') return null;
    if (typeof fetch !== 'function') return null;

    inFlightPayloadPromise = (async () => {
        try {
            const response = await fetch('/data/historical-h2h-v1.json');
            if (!response.ok) return null;
            const data = (await response.json()) as CompactHistoricalH2HPayload;
            if (!data || data.version !== 1 || !data.seasons) return null;
            cachedPayload = data;
            return data;
        } catch {
            return null;
        } finally {
            inFlightPayloadPromise = null;
        }
    })();

    return inFlightPayloadPromise;
}

export function extractHistoricalDriverStints(
    payload: CompactHistoricalH2HPayload,
    driverId: string,
): DriverCareerStint[] {
    const driverIdx = payload.drivers.findIndex(d => d[0] === driverId);
    if (driverIdx < 0) return [];

    const stints: DriverCareerStint[] = [];
    const seen = new Set<string>();
    const sortedSeasons = Object.keys(payload.seasons).sort(
        (a, b) => (Number.parseInt(a, 10) || 0) - (Number.parseInt(b, 10) || 0),
    );

    for (const season of sortedSeasons) {
        const rounds = payload.seasons[season] ?? [];
        for (const [, , , entries] of rounds) {
            for (const entry of entries) {
                if (entry[0] !== driverIdx) continue;
                const constructorTuple = payload.constructors[entry[1]];
                if (!constructorTuple) continue;
                const [constructorId, constructorName] = constructorTuple;
                const key = `${season}::${constructorId}`;
                if (!seen.has(key)) {
                    seen.add(key);
                    stints.push({ season, constructorId, constructorName });
                }
            }
        }
    }

    return stints;
}

export function extractHistoricalConstructorSeasonH2H(
    payload: CompactHistoricalH2HPayload,
    season: string,
    constructorId: string,
    constructorNameFallback = constructorId,
): ConstructorSeasonH2HRaw | null {
    const rounds = payload.seasons[season];
    if (!rounds) return null;

    const constructorIdx = payload.constructors.findIndex(c => c[0] === constructorId);
    if (constructorIdx < 0) return null;

    const resolvedConstructorName = payload.constructors[constructorIdx]?.[1] || constructorNameFallback;
    const raceResults: SeasonRaceResult[] = [];
    const qualiResults: SeasonQualifyingResult[] = [];

    for (const [round, raceName, date, entries] of rounds) {
        for (const [dIdx, cIdx, gridPos, racePos, points, statusIdx, startedFlag, qualiPos] of entries) {
            if (cIdx !== constructorIdx) continue;
            const driverTuple = payload.drivers[dIdx];
            if (!driverTuple) continue;
            const [driverId, driverName] = driverTuple;
            const status = payload.statuses[statusIdx] ?? 'Finished';

            if (gridPos !== null || racePos !== null || startedFlag === 1) {
                raceResults.push({
                    round,
                    raceName,
                    date,
                    driverId,
                    driverName,
                    constructorId,
                    constructorName: resolvedConstructorName,
                    gridPosition: gridPos,
                    position: racePos,
                    points,
                    status,
                    started: startedFlag === 1,
                });
            }

            if (qualiPos !== null) {
                qualiResults.push({
                    round,
                    raceName,
                    date,
                    driverId,
                    driverName,
                    constructorId,
                    constructorName: resolvedConstructorName,
                    position: qualiPos,
                });
            }
        }
    }

    if (raceResults.length === 0 && qualiResults.length === 0) return null;

    return {
        season,
        constructorId,
        constructorName: resolvedConstructorName,
        raceResults,
        qualiResults,
    };
}

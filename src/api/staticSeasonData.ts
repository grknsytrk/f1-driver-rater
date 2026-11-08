import type { Race, RaceResult } from '../types';
import { parseF1TimeSeconds } from '../utils/f1Time';
import manifestData from '../../public/data/seasons/manifest.json';
import type {
    ConstructorStanding,
    DriverStanding,
    RaceQualifyingResult,
    SeasonQualifyingResult,
    SeasonRaceResult,
    SeasonSprintResult,
} from './f1Api';

export type SeasonDataset = 'results' | 'qualifying' | 'sprints' | 'driverStandings' | 'constructorStandings';

/**
 * Compact static bundle schema stored at `/public/data/seasons/${season}.json`.
 */
export interface CompactSeasonBundle {
    season: string;
    version: number;
    generatedAt: string;
    isArchived: boolean;
    lastCompletedRound: number | null;
    totalRounds: number;
    races: Race[];
    results: SeasonRaceResult[];
    qualifying: SeasonQualifyingResult[];
    sprints: SeasonSprintResult[];
    driverStandings: DriverStanding[];
    constructorStandings: ConstructorStanding[];
    roundResults?: Record<string, RaceResult[]>;
    roundQualifying?: Record<string, RaceQualifyingResult[]>;
    lastResultsRound?: number | null;
    lastQualifyingRound?: number | null;
    lastSprintsRound?: number | null;
    lastDriverStandingsRound?: number | null;
    lastConstructorStandingsRound?: number | null;
}

export interface SeasonManifestEntry {
    season: string;
    isArchived: boolean;
    lastCompletedRound: number | null;
    totalRounds: number;
    generatedAt: string;
    bundleUrl: string;
}

export interface SeasonManifest {
    version: number;
    generatedAt: string;
    seasons: Record<string, SeasonManifestEntry>;
}

const UNCLASSIFIED_POSITION_TEXT = new Set(['R', 'D', 'E', 'W', 'F', 'N']);

// Three-tier session cache
const seasonBundleCache = new Map<string, CompactSeasonBundle>();
const inFlightSeasonPromises = new Map<string, Promise<CompactSeasonBundle | null>>();
const failedSeasonFetches = new Set<string>();

/**
 * Clears all in-memory static season caches. Useful for unit testing.
 */
export function clearStaticSeasonCache(): void {
    seasonBundleCache.clear();
    inFlightSeasonPromises.clear();
    failedSeasonFetches.clear();
}

function isValidSeasonBundle(data: unknown, expectedSeason: string): data is CompactSeasonBundle {
    if (!data || typeof data !== 'object') return false;
    const b = data as Partial<CompactSeasonBundle>;
    return (
        b.season === expectedSeason &&
        Array.isArray(b.results) &&
        Array.isArray(b.races) &&
        typeof b.isArchived === 'boolean'
    );
}

const STATIC_MANIFEST = manifestData as unknown as SeasonManifest;

export function getSeasonManifestSync(): SeasonManifest {
    return STATIC_MANIFEST;
}

/**
 * Updates the in-memory cached bundle (e.g. after merging newly completed live rounds)
 * so subsequent queries do not re-fetch or re-merge the same diff rounds.
 */
export function updateStaticSeasonBundleInMemory(
    season: string | number,
    updates: Partial<CompactSeasonBundle>,
): void {
    const seasonKey = String(season).trim();
    const existing = seasonBundleCache.get(seasonKey);
    if (existing) {
        seasonBundleCache.set(seasonKey, { ...existing, ...updates });
    }
}

/**
 * Loads a compact season bundle from static asset storage (`/data/seasons/${season}.json`).
 * Implements three-tier caching: resolved memory cache, in-flight promise deduplication,
 * and negative caching for 404/network errors. Never throws unhandled rejections.
 */
export async function loadStaticSeasonData(season: string | number): Promise<CompactSeasonBundle | null> {
    const seasonKey = String(season).trim();
    const seasonNum = Number.parseInt(seasonKey, 10);
    const maxSupportedSeason = Math.max(2026, new Date().getUTCFullYear() + 1);
    const manifestEntry = STATIC_MANIFEST?.seasons?.[seasonKey];

    // Guard against unsupported seasons without making wasteful 404 network requests
    if (!Number.isFinite(seasonNum) || seasonNum < 2020 || (seasonNum > maxSupportedSeason && !manifestEntry)) {
        return null;
    }

    const isTestEnv = typeof import.meta !== 'undefined' && import.meta.env?.MODE === 'test';
    if (isTestEnv) {
        // In happy-dom test environments without a mock, relative fetch tries to connect to localhost:3000.
        // Return null unless fetch is explicitly mocked or the bundle is already in memory cache.
        const isMocked = typeof fetch === 'function' && Boolean((fetch as unknown as { _isMockFunction?: boolean })._isMockFunction);
        if (!isMocked && !seasonBundleCache.has(seasonKey)) {
            return null;
        }
    }

    // 1. Resolved In-Memory Cache
    const cached = seasonBundleCache.get(seasonKey);
    if (cached) {
        return cached;
    }

    // 2. Negative Cache
    if (failedSeasonFetches.has(seasonKey)) {
        return null;
    }

    // 3. In-flight Promise Deduplication
    const inFlight = inFlightSeasonPromises.get(seasonKey);
    if (inFlight) {
        return inFlight;
    }

    const fetchUrl = !isTestEnv && manifestEntry?.bundleUrl
        ? manifestEntry.bundleUrl
        : `/data/seasons/${seasonKey}.json`;

    const fetchPromise = (async (): Promise<CompactSeasonBundle | null> => {
        try {
            if (typeof fetch !== 'function') {
                return null;
            }

            const response = await fetch(fetchUrl, {
                headers: { Accept: 'application/json' },
            });

            if (!response.ok) {
                failedSeasonFetches.add(seasonKey);
                return null;
            }

            const data = await response.json();
            if (!isValidSeasonBundle(data, seasonKey)) {
                failedSeasonFetches.add(seasonKey);
                return null;
            }

            seasonBundleCache.set(seasonKey, data);
            return data;
        } catch {
            failedSeasonFetches.add(seasonKey);
            return null;
        } finally {
            inFlightSeasonPromises.delete(seasonKey);
        }
    })();

    inFlightSeasonPromises.set(seasonKey, fetchPromise);
    return fetchPromise;
}

/**
 * Retrieves the full static bundle for a given season, or null if not available.
 */
export async function getStaticSeasonBundle(season: string | number): Promise<CompactSeasonBundle | null> {
    return loadStaticSeasonData(season);
}

/**
 * Retrieves static season race results for a season.
 */
export async function getStaticSeasonResults(season: string | number): Promise<SeasonRaceResult[] | null> {
    const bundle = await loadStaticSeasonData(season);
    return bundle?.results ?? null;
}

/**
 * Retrieves static season qualifying results for a season.
 */
export async function getStaticSeasonQualifying(season: string | number): Promise<SeasonQualifyingResult[] | null> {
    const bundle = await loadStaticSeasonData(season);
    return bundle?.qualifying ?? null;
}

/**
 * Retrieves static season sprint results for a season.
 */
export async function getStaticSeasonSprints(season: string | number): Promise<SeasonSprintResult[] | null> {
    const bundle = await loadStaticSeasonData(season);
    return bundle?.sprints ?? null;
}

/**
 * Retrieves static driver standings for a season.
 */
export async function getStaticDriverStandings(season: string | number): Promise<DriverStanding[] | null> {
    const bundle = await loadStaticSeasonData(season);
    return bundle?.driverStandings ?? null;
}

/**
 * Retrieves static constructor standings for a season.
 */
export async function getStaticConstructorStandings(season: string | number): Promise<ConstructorStanding[] | null> {
    const bundle = await loadStaticSeasonData(season);
    return bundle?.constructorStandings ?? null;
}

/**
 * Retrieves the scheduled race calendar from the static bundle.
 */
export async function getStaticRaces(season: string | number): Promise<Race[] | null> {
    const bundle = await loadStaticSeasonData(season);
    return bundle?.races ?? null;
}

/**
 * Synchronously retrieves the scheduled race calendar from the in-memory bundle if already loaded.
 */
export function getStaticRacesSync(season: string | number): Race[] | null {
    const bundle = seasonBundleCache.get(String(season).trim());
    return bundle?.races ?? null;
}

/**
 * Synchronously retrieves raw race results from the in-memory bundle if already loaded.
 */
export function getStaticRoundResultsSync(
    season: string | number,
    round: string | number,
): RaceResult[] | null {
    const bundle = seasonBundleCache.get(String(season).trim());
    if (!bundle?.roundResults) return null;
    return bundle.roundResults[String(round)] ?? null;
}

/**
 * Synchronously retrieves raw qualifying results from the in-memory bundle if already loaded.
 */
export function getStaticRoundQualifyingSync(
    season: string | number,
    round: string | number,
): RaceQualifyingResult[] | null {
    const bundle = seasonBundleCache.get(String(season).trim());
    if (!bundle?.roundQualifying) return null;
    return bundle.roundQualifying[String(round)] ?? null;
}

/**
 * Checks whether fetch is available and, in test mode, explicitly mocked.
 */
export function isFetchMockedOrAvailable(): boolean {
    if (typeof import.meta !== 'undefined' && import.meta.env?.MODE === 'test') {
        return typeof fetch === 'function' && Boolean((fetch as unknown as { _isMockFunction?: boolean })._isMockFunction);
    }
    return typeof fetch === 'function';
}

/**
 * Retrieves raw race results for an individual round from the static bundle.
 */
export async function getStaticRoundResults(
    season: string | number,
    round: string | number,
): Promise<RaceResult[] | null> {
    const bundle = await loadStaticSeasonData(season);
    if (!bundle?.roundResults) return null;
    return bundle.roundResults[String(round)] ?? null;
}

/**
 * Retrieves raw qualifying results for an individual round from the static bundle.
 */
export async function getStaticRoundQualifying(
    season: string | number,
    round: string | number,
): Promise<RaceQualifyingResult[] | null> {
    const bundle = await loadStaticSeasonData(season);
    if (!bundle?.roundQualifying) return null;
    return bundle.roundQualifying[String(round)] ?? null;
}

/**
 * Checks whether a race has finished using its scheduled start date + time + 3-hour buffer.
 */
export function isRoundFinished(
    race: Pick<Race, 'date'> & Partial<Pick<Race, 'time'>>,
    nowMs: number = Date.now(),
): boolean {
    if (!race.date) return false;
    const rawDate = race.date.trim();
    let timeStr = race.time && race.time.trim().length > 0 ? race.time.trim() : '14:00:00Z';
    if (!timeStr.endsWith('Z') && !timeStr.includes('+') && !timeStr.includes('-')) {
        timeStr = `${timeStr}Z`;
    }
    const isoStr = rawDate.includes('T')
        ? rawDate
        : `${rawDate}T${timeStr}`;
    const startMs = new Date(isoStr).getTime();
    if (!Number.isFinite(startMs)) return false;
    return nowMs > startMs + 3 * 60 * 60 * 1000;
}

/**
 * Synchronously checks if a specific round is present in the static bundle for a season.
 */
export function isRoundInStaticBundle(season: string | number, round: string | number): boolean {
    const seasonKey = String(season).trim();
    const roundKey = String(round).trim();
    const roundNum = Number.parseInt(roundKey, 10);
    if (!Number.isFinite(roundNum) || roundNum < 1) return false;

    const cached = seasonBundleCache.get(seasonKey);

    if (!cached) {
        const manifestEntry = STATIC_MANIFEST?.seasons?.[seasonKey];
        if (!manifestEntry) {
            const seasonNum = Number.parseInt(seasonKey, 10);
            return Number.isFinite(seasonNum) && seasonNum >= 2020 && seasonNum < new Date().getUTCFullYear();
        }
        if (manifestEntry.isArchived) {
            return roundNum <= manifestEntry.totalRounds;
        }
        return roundNum <= (manifestEntry.lastCompletedRound ?? 0);
    }

    if (cached.isArchived) {
        return roundNum <= cached.totalRounds;
    }

    return roundNum <= (cached.lastCompletedRound ?? 0);
}

export function getDatasetBaselineRound(
    bundle: CompactSeasonBundle,
    dataset?: SeasonDataset,
): number {
    if (dataset === 'results') return bundle.lastResultsRound ?? bundle.lastCompletedRound ?? 0;
    if (dataset === 'qualifying') return bundle.lastQualifyingRound ?? bundle.lastCompletedRound ?? 0;
    if (dataset === 'sprints') return bundle.lastSprintsRound ?? bundle.lastCompletedRound ?? 0;
    if (dataset === 'driverStandings') return bundle.lastDriverStandingsRound ?? bundle.lastCompletedRound ?? 0;
    if (dataset === 'constructorStandings') return bundle.lastConstructorStandingsRound ?? bundle.lastCompletedRound ?? 0;
    return bundle.lastCompletedRound ?? 0;
}

/**
 * Detects newly completed rounds beyond the bundle's baseline for an active season.
 * Supports per-dataset baselines and per-session completion (e.g. Saturday qualifying/sprint vs Sunday race).
 */
export function detectNewlyCompletedRounds(
    bundle: CompactSeasonBundle,
    calendar?: Race[],
    now?: Date,
    datasetOrBaseline?: SeasonDataset | number,
): Race[] {
    if (bundle.isArchived) {
        return [];
    }

    const races = calendar && calendar.length > 0 ? calendar : bundle.races;
    if (!races || races.length === 0) {
        return [];
    }

    const baselineRound = typeof datasetOrBaseline === 'number'
        ? datasetOrBaseline
        : typeof datasetOrBaseline === 'string'
            ? getDatasetBaselineRound(bundle, datasetOrBaseline)
            : (bundle.lastCompletedRound ?? 0);
    const referenceMs = (now ?? new Date()).getTime();

    return races.filter(race => {
        const roundNum = Number.parseInt(race.round, 10);
        if (!Number.isFinite(roundNum) || roundNum <= baselineRound) {
            return false;
        }

        const sessionRecord = race as unknown as {
            Qualifying?: { date: string; time?: string };
            Sprint?: { date: string; time?: string };
        };

        if (datasetOrBaseline === 'qualifying') {
            if (sessionRecord.Qualifying?.date) {
                return isRoundFinished(sessionRecord.Qualifying, referenceMs);
            }
            return isRoundFinished(race, referenceMs);
        }

        if (datasetOrBaseline === 'sprints') {
            if (!sessionRecord.Sprint?.date) {
                return false;
            }
            return isRoundFinished(sessionRecord.Sprint, referenceMs);
        }

        return isRoundFinished(race, referenceMs);
    });
}

/**
 * Merges static baseline race results with newly fetched live round results.
 * Deduplicates by round and sorts canonically by round ascending, then position ascending.
 */
export function mergeSeasonResults(
    staticResults: SeasonRaceResult[],
    newResults: SeasonRaceResult[],
): SeasonRaceResult[] {
    if (!newResults || newResults.length === 0) return staticResults;
    if (!staticResults || staticResults.length === 0) return newResults;

    const newRoundNumbers = new Set(newResults.map(r => r.round));
    const filteredStatic = staticResults.filter(r => !newRoundNumbers.has(r.round));
    const combined = [...filteredStatic, ...newResults];

    return combined.sort((a, b) => {
        const roundDiff = (Number.parseInt(a.round, 10) || 0) - (Number.parseInt(b.round, 10) || 0);
        if (roundDiff !== 0) return roundDiff;
        const posA = a.position ?? 999;
        const posB = b.position ?? 999;
        return posA - posB;
    });
}

/**
 * Merges static baseline qualifying results with newly fetched live qualifying results.
 */
export function mergeSeasonQualifying(
    staticQualifying: SeasonQualifyingResult[],
    newQualifying: SeasonQualifyingResult[],
): SeasonQualifyingResult[] {
    if (!newQualifying || newQualifying.length === 0) return staticQualifying;
    if (!staticQualifying || staticQualifying.length === 0) return newQualifying;

    const newRoundNumbers = new Set(newQualifying.map(q => q.round));
    const filteredStatic = staticQualifying.filter(q => !newRoundNumbers.has(q.round));
    const combined = [...filteredStatic, ...newQualifying];

    return combined.sort((a, b) => {
        const roundDiff = (Number.parseInt(a.round, 10) || 0) - (Number.parseInt(b.round, 10) || 0);
        if (roundDiff !== 0) return roundDiff;
        return a.position - b.position;
    });
}

/**
 * Merges static baseline sprint results with newly fetched live sprint results.
 */
export function mergeSeasonSprints(
    staticSprints: SeasonSprintResult[],
    newSprints: SeasonSprintResult[],
): SeasonSprintResult[] {
    if (!newSprints || newSprints.length === 0) return staticSprints;
    if (!staticSprints || staticSprints.length === 0) return newSprints;

    const newRoundNumbers = new Set(newSprints.map(s => s.round));
    const filteredStatic = staticSprints.filter(s => !newRoundNumbers.has(s.round));
    const combined = [...filteredStatic, ...newSprints];

    return combined.sort((a, b) => {
        const roundDiff = (Number.parseInt(a.round, 10) || 0) - (Number.parseInt(b.round, 10) || 0);
        if (roundDiff !== 0) return roundDiff;
        const posA = a.position ?? 999;
        const posB = b.position ?? 999;
        return posA - posB;
    });
}

/**
 * Maps raw single-round RaceResult[] to canonical SeasonRaceResult[].
 */
export function mapRaceResultsToSeasonResults(
    round: string,
    raceName: string,
    date: string,
    rawResults: RaceResult[],
): SeasonRaceResult[] {
    const winnerResult = rawResults.find(r => Number.parseInt(r.position, 10) === 1);
    let winnerElapsedSeconds: number | null = null;
    if (winnerResult) {
        const millis = winnerResult.Time?.millis ? Number(winnerResult.Time.millis) : Number.NaN;
        if (Number.isFinite(millis) && millis >= 0) {
            winnerElapsedSeconds = millis / 1000;
        } else {
            winnerElapsedSeconds = parseF1TimeSeconds(winnerResult.Time?.time);
        }
    }

    return rawResults.map(result => {
        const positionText = (result.positionText || '').trim().toUpperCase();
        const status = (result.status || '').trim();
        const hasClassifiedStatus = !status || /^(finished|lapped|\+\s*\d+\s*lap(?:s)?)$/i.test(status);
        const isClassified = !UNCLASSIFIED_POSITION_TEXT.has(positionText)
            && hasClassifiedStatus
            && Number.isFinite(Number.parseInt(result.position, 10));

        const parsedPosition = Number.parseInt(result.position, 10);
        const parsedGrid = Number.parseInt(result.grid, 10);

        let raceTimeGapSeconds: number | null = null;
        const ownMillis = result.Time?.millis ? Number(result.Time.millis) : Number.NaN;
        if (Number.isFinite(ownMillis) && ownMillis >= 0 && winnerElapsedSeconds !== null) {
            raceTimeGapSeconds = Math.max(0, ownMillis / 1000 - winnerElapsedSeconds);
        } else if (parsedPosition === 1) {
            raceTimeGapSeconds = 0;
        } else {
            const officialTime = result.Time?.time?.trim();
            if (officialTime) {
                if (officialTime.startsWith('+')) {
                    raceTimeGapSeconds = parseF1TimeSeconds(officialTime.slice(1));
                } else {
                    const ownElapsedSeconds = parseF1TimeSeconds(officialTime);
                    if (ownElapsedSeconds !== null && winnerElapsedSeconds !== null) {
                        raceTimeGapSeconds = Math.max(0, ownElapsedSeconds - winnerElapsedSeconds);
                    }
                }
            }
        }

        const started = !/^(did not start|did not qualify|not started|withdrawn|dns)\b/i.test(status);

        return {
            round,
            raceName: raceName ?? `Round ${round}`,
            date: date ?? '',
            driverId: result.Driver?.driverId ?? 'unknown',
            driverName: `${result.Driver?.givenName ?? ''} ${result.Driver?.familyName ?? ''}`.trim(),
            constructorId: result.Constructor?.constructorId ?? 'unknown',
            constructorName: result.Constructor?.name ?? 'Unknown',
            gridPosition: Number.isFinite(parsedGrid) ? parsedGrid : null,
            position: isClassified && Number.isFinite(parsedPosition) ? parsedPosition : null,
            positionText: result.positionText ?? '',
            points: Number.parseFloat(result.points) || 0,
            status: result.status ?? '',
            started,
            raceTimeGapSeconds,
        };
    });
}

/**
 * Maps raw single-round RaceQualifyingResult[] to canonical SeasonQualifyingResult[].
 */
export function mapQualifyingResultsToSeasonQualifying(
    round: string,
    raceName: string,
    date: string,
    rawQualifying: RaceQualifyingResult[],
): SeasonQualifyingResult[] {
    return rawQualifying.map(result => {
        const bestTime = [result.Q1, result.Q2, result.Q3]
            .map(time => parseF1TimeSeconds(time))
            .filter((time): time is number => time !== null)
            .reduce<number | null>((best, time) => (best === null || time < best ? time : best), null);

        return {
            round,
            raceName: raceName ?? `Round ${round}`,
            date: date ?? '',
            driverId: result.Driver?.driverId ?? 'unknown',
            driverName: `${result.Driver?.givenName ?? ''} ${result.Driver?.familyName ?? ''}`.trim(),
            constructorId: result.Constructor?.constructorId ?? 'unknown',
            constructorName: result.Constructor?.name ?? 'Unknown',
            position: Number.parseInt(result.position, 10) || 0,
            bestTimeSeconds: bestTime,
        };
    });
}

import type { DriverStanding, SeasonQualifyingResult, SeasonRaceResult } from '../api/f1Api';
import type { AverageRating } from '../types';
import type { CommunityRating, CommunityStatus } from './communityRatings';
import { classifiedRacePosition } from './driverProfile';
import {
    countCategoryWins,
    h2hRow,
    numericRow,
    type DataStatus,
    type RowWinner,
    type VersusRow,
} from './teamVersus';

export type { DataStatus, RowWinner, VersusRow };
export { countCategoryWins };

export const START_VERSUS_SEASON = 2020;

export interface DriverVersusOption {
    driverId: string;
    driverName: string;
    constructorId: string;
    constructorName: string;
    wdcPosition: number | null;
}

export interface DriverSeasonDataset {
    raceResults: SeasonRaceResult[];
    qualiResults: SeasonQualifyingResult[];
    driverStandings: DriverStanding[];
    raceStatus: DataStatus;
    qualiStatus: DataStatus;
}

export interface DriverSeasonStats {
    season: string;
    driverId: string;
    driverName: string;
    constructorId: string;
    constructorName: string;
    personalAvg: number | null;
    personalRatedRaces: number;
    communityAvg: number | null;
    communityVotes: number;
    wdcPosition: number | null;
    wdcPoints: number | null;
    racesStarted: number;
    pointsPerRace: number | null;
    wins: number;
    podiums: number;
    poles: number;
    avgFinish: number | null;
    avgQuali: number | null;
    dnfs: number;
}

export interface DriverDirectH2H {
    raceWinsA: number;
    raceWinsB: number;
    totalRaces: number;
    qualiWinsA: number;
    qualiWinsB: number;
    totalQualis: number;
}

export interface DriverVersusSelection {
    seasonA: string;
    driverA: string;
    seasonB: string;
    driverB: string;
}

/** Return descending season strings from `max(2026, currentYear)` down to 2020. */
export function getAvailableVersusSeasons(currentYear = new Date().getFullYear()): string[] {
    const maxYear = Math.max(2026, currentYear);
    const seasons: string[] = [];
    for (let year = maxYear; year >= START_VERSUS_SEASON; year -= 1) {
        seasons.push(String(year));
    }
    return seasons;
}

function getStandingDriverName(standing: DriverStanding): string {
    return `${standing.Driver.givenName} ${standing.Driver.familyName}`.trim() || standing.Driver.driverId;
}

function getStandingConstructor(standing: DriverStanding): { constructorId: string; constructorName: string } {
    const team = standing.Constructors?.[standing.Constructors.length - 1];
    return {
        constructorId: team?.constructorId ?? '',
        constructorName: team?.name ?? '',
    };
}

/** Deduplicate and order a season's driver roster by WDC position, then name. */
export function buildDriverOptions(
    dataset: DriverSeasonDataset,
    averages: AverageRating[],
): DriverVersusOption[] {
    const byId = new Map<string, DriverVersusOption>();

    dataset.driverStandings.forEach((standing) => {
        const parsedPos = Number.parseInt(standing.position, 10);
        const { constructorId, constructorName } = getStandingConstructor(standing);
        byId.set(standing.Driver.driverId, {
            driverId: standing.Driver.driverId,
            driverName: getStandingDriverName(standing),
            constructorId,
            constructorName,
            wdcPosition: Number.isFinite(parsedPos) && parsedPos > 0 ? parsedPos : null,
        });
    });

    dataset.raceResults.forEach((result) => {
        const existing = byId.get(result.driverId);
        byId.set(result.driverId, {
            driverId: result.driverId,
            driverName: result.driverName || existing?.driverName || result.driverId,
            constructorId: result.constructorId || existing?.constructorId || '',
            constructorName: result.constructorName || existing?.constructorName || '',
            wdcPosition: existing?.wdcPosition ?? null,
        });
    });

    dataset.qualiResults.forEach((result) => {
        const existing = byId.get(result.driverId);
        if (!existing) {
            byId.set(result.driverId, {
                driverId: result.driverId,
                driverName: result.driverName,
                constructorId: result.constructorId,
                constructorName: result.constructorName,
                wdcPosition: null,
            });
        } else if (!existing.constructorId && result.constructorId) {
            existing.constructorId = result.constructorId;
            existing.constructorName = result.constructorName;
        }
    });

    averages.forEach((avg) => {
        const existing = byId.get(avg.driverId);
        if (!existing) {
            byId.set(avg.driverId, {
                driverId: avg.driverId,
                driverName: avg.driverName,
                constructorId: avg.constructorId,
                constructorName: avg.constructorName,
                wdcPosition: null,
            });
        } else if (!existing.constructorId && avg.constructorId) {
            existing.constructorId = avg.constructorId;
            existing.constructorName = avg.constructorName;
        }
    });

    return [...byId.values()].sort((a, b) => {
        const posA = a.wdcPosition ?? Number.MAX_SAFE_INTEGER;
        const posB = b.wdcPosition ?? Number.MAX_SAFE_INTEGER;
        if (posA !== posB) return posA - posB;
        return a.driverName.localeCompare(b.driverName);
    });
}

/**
 * Resolve valid (seasonA, driverA, seasonB, driverB) tuple from URL parameters.
 * Allows same driver across distinct seasons (era battle) while preventing identical same-season self-matchups.
 */
export function resolveDriverVersusSelection(
    raw: { sa?: string | null; da?: string | null; sb?: string | null; db?: string | null },
    defaultSeason: string,
    availableSeasons: string[],
    optionsA: DriverVersusOption[],
    optionsB: DriverVersusOption[],
): DriverVersusSelection | null {
    const validSeason = (candidate?: string | null) =>
        candidate && availableSeasons.includes(candidate) ? candidate : defaultSeason;

    const seasonA = validSeason(raw.sa);
    const seasonB = validSeason(raw.sb);

    const hasA = (id?: string | null): id is string =>
        Boolean(id && optionsA.some(option => option.driverId === id));
    const hasB = (id?: string | null): id is string =>
        Boolean(id && optionsB.some(option => option.driverId === id));

    const driverA = hasA(raw.da) ? raw.da : optionsA[0]?.driverId;
    if (!driverA) return null;

    const isIdenticalMatchup = (candidateB: string) =>
        seasonA === seasonB && candidateB === driverA;

    let driverB: string | undefined;
    if (hasB(raw.db) && !isIdenticalMatchup(raw.db)) {
        driverB = raw.db;
    } else {
        driverB = optionsB.find(option => !isIdenticalMatchup(option.driverId))?.driverId;
    }

    if (!driverB) return null;

    return { seasonA, driverA, seasonB, driverB };
}

/** Aggregate a single driver's community rating mean and total vote count for a season. */
export function buildDriverCommunitySummary(
    driverId: string,
    ratings: CommunityRating[],
    source: 'race' | 'quick',
): { averageRating: number | null; voteCount: number } {
    const valid = ratings.filter(
        row =>
            row.driverId === driverId
            && Number.isSafeInteger(row.voteCount)
            && row.voteCount > 0
            && Number.isFinite(row.averageRating)
            && row.averageRating >= 0.5
            && row.averageRating <= 10,
    );

    if (valid.length === 0) {
        return { averageRating: null, voteCount: 0 };
    }

    if (source === 'quick') {
        return {
            averageRating: valid[0].averageRating,
            voteCount: valid[0].voteCount,
        };
    }

    const sumAvg = valid.reduce((sum, row) => sum + row.averageRating, 0);
    const voteCount = valid.reduce((sum, row) => sum + row.voteCount, 0);

    return {
        averageRating: sumAvg / valid.length,
        voteCount,
    };
}

/** Compute per-season stats and rating summaries for one driver. */
export function buildDriverSeasonStats(
    season: string,
    driverId: string,
    dataset: DriverSeasonDataset,
    averages: AverageRating[],
    communityRatings: CommunityRating[],
    communitySource: 'race' | 'quick',
): DriverSeasonStats {
    const standing = dataset.driverStandings.find(entry => entry.Driver.driverId === driverId);
    const driverRaces = dataset.raceResults.filter(entry => entry.driverId === driverId);
    const driverQualis = dataset.qualiResults.filter(entry => entry.driverId === driverId);
    const avgEntry = averages.find(entry => entry.driverId === driverId);

    const latestRace = driverRaces[driverRaces.length - 1];
    const latestQuali = driverQualis[driverQualis.length - 1];
    const standingTeam = standing ? getStandingConstructor(standing) : null;

    const driverName = (standing ? getStandingDriverName(standing) : '')
        || latestRace?.driverName
        || latestQuali?.driverName
        || avgEntry?.driverName
        || driverId;

    const constructorId = latestRace?.constructorId
        || standingTeam?.constructorId
        || latestQuali?.constructorId
        || avgEntry?.constructorId
        || '';

    const constructorName = latestRace?.constructorName
        || standingTeam?.constructorName
        || latestQuali?.constructorName
        || avgEntry?.constructorName
        || '';

    const parsedWdcPos = standing ? Number.parseInt(standing.position, 10) : Number.NaN;
    const wdcPosition = Number.isFinite(parsedWdcPos) && parsedWdcPos > 0 ? parsedWdcPos : null;

    let wdcPoints: number | null = null;
    if (standing) {
        const parsedPts = Number.parseFloat(standing.points);
        wdcPoints = Number.isFinite(parsedPts) ? parsedPts : 0;
    } else if (driverRaces.length > 0) {
        wdcPoints = driverRaces.reduce((sum, r) => sum + (Number.isFinite(r.points) ? r.points : 0), 0);
    }

    const racesStarted = driverRaces.length;
    const pointsPerRace = racesStarted > 0 && wdcPoints !== null ? wdcPoints / racesStarted : null;

    const standingWins = standing ? (Number.parseInt(standing.wins, 10) || 0) : 0;
    const wins = driverRaces.length > 0
        ? driverRaces.filter(r => r.position === 1).length
        : standingWins;
    const podiums = driverRaces.filter(r => r.position !== null && r.position <= 3).length;
    const poles = driverQualis.filter(q => q.position === 1).length;

    const classifiedFinishes = driverRaces
        .map(r => r.position)
        .filter((pos): pos is number => pos !== null && pos > 0);
    const avgFinish = classifiedFinishes.length > 0
        ? classifiedFinishes.reduce((sum, pos) => sum + pos, 0) / classifiedFinishes.length
        : null;

    const validQualis = driverQualis
        .map(q => q.position)
        .filter(pos => Number.isFinite(pos) && pos > 0);
    const avgQuali = validQualis.length > 0
        ? validQualis.reduce((sum, pos) => sum + pos, 0) / validQualis.length
        : null;

    const dnfs = driverRaces.filter(r => r.position === null).length;

    const communitySummary = buildDriverCommunitySummary(driverId, communityRatings, communitySource);

    return {
        season,
        driverId,
        driverName,
        constructorId,
        constructorName,
        personalAvg: avgEntry ? avgEntry.averageRating : null,
        personalRatedRaces: avgEntry ? avgEntry.totalRaces : 0,
        communityAvg: communitySummary.averageRating,
        communityVotes: communitySummary.voteCount,
        wdcPosition,
        wdcPoints,
        racesStarted,
        pointsPerRace,
        wins,
        podiums,
        poles,
        avgFinish,
        avgQuali,
        dnfs,
    };
}

function compareBothClassified(
    a: Map<string, number>,
    b: Map<string, number>,
): { winsA: number; winsB: number; total: number } {
    let winsA = 0;
    let winsB = 0;
    let total = 0;

    a.forEach((posA, round) => {
        const posB = b.get(round);
        if (posB === undefined) return;
        total++;
        if (posA < posB) winsA++;
        else if (posB < posA) winsB++;
    });

    return { winsA, winsB, total };
}

/** Calculate direct round-by-round race (both finished) & qualifying H2H between two drivers in the same season. */
export function calculateDirectDriverH2H(
    driverAId: string,
    driverBId: string,
    raceResults: SeasonRaceResult[],
    qualiResults: SeasonQualifyingResult[],
): DriverDirectH2H {
    const normalizeRound = (round: string) => {
        const parsed = Number.parseInt(round, 10);
        return Number.isFinite(parsed) ? String(parsed) : round;
    };

    const raceA = new Map<string, number>();
    const raceB = new Map<string, number>();
    raceResults.forEach((result) => {
        const pos = classifiedRacePosition(result);
        if (pos === null) return;
        const key = normalizeRound(result.round);
        if (result.driverId === driverAId) raceA.set(key, pos);
        else if (result.driverId === driverBId) raceB.set(key, pos);
    });

    const qualiA = new Map<string, number>();
    const qualiB = new Map<string, number>();
    qualiResults.forEach((result) => {
        if (!Number.isFinite(result.position) || result.position <= 0) return;
        const key = normalizeRound(result.round);
        if (result.driverId === driverAId) qualiA.set(key, result.position);
        else if (result.driverId === driverBId) qualiB.set(key, result.position);
    });

    const race = compareBothClassified(raceA, raceB);
    const quali = compareBothClassified(qualiA, qualiB);

    return {
        raceWinsA: race.winsA,
        raceWinsB: race.winsB,
        totalRaces: race.total,
        qualiWinsA: quali.winsA,
        qualiWinsB: quali.winsB,
        totalQualis: quali.total,
    };
}

export interface DriverComparisonOptions {
    directH2H?: DriverDirectH2H | null;
    raceAvailable?: boolean;
    qualiAvailable?: boolean;
    communityStatusA?: CommunityStatus;
    communityStatusB?: CommunityStatus;
}

/** Build ordered comparison metric rows for Driver VS (including H2H rows only on same-season matchups). */
export function buildDriverComparisonRows(
    a: DriverSeasonStats,
    b: DriverSeasonStats,
    options: DriverComparisonOptions = {},
): VersusRow[] {
    const {
        directH2H = null,
        raceAvailable = true,
        qualiAvailable = true,
        communityStatusA = 'disabled',
        communityStatusB = 'disabled',
    } = options;

    let communityNote: string;
    if ((communityStatusA === 'loading' || communityStatusB === 'loading') && a.communityVotes + b.communityVotes === 0) {
        communityNote = 'Loading community votes…';
    } else if (communityStatusA === 'disabled' && communityStatusB === 'disabled') {
        communityNote = 'Community data unavailable';
    } else if (communityStatusA === 'unavailable' && communityStatusB === 'unavailable') {
        communityNote = 'Community data unavailable';
    } else if (a.communityVotes + b.communityVotes === 0) {
        communityNote = 'No votes yet';
    } else {
        communityNote = `A ${a.communityVotes} · B ${b.communityVotes} votes`;
    }

    const personalNote = a.personalRatedRaces + b.personalRatedRaces > 0
        ? `A ${a.personalRatedRaces} · B ${b.personalRatedRaces} races`
        : undefined;

    const pprNote = a.racesStarted + b.racesStarted > 0
        ? `A ${a.racesStarted} · B ${b.racesStarted} races`
        : undefined;

    const rows: VersusRow[] = [
        numericRow('communityAvg', 'Community Avg', a.communityAvg, b.communityAvg, true, v => v.toFixed(2), communityNote),
        numericRow('personalAvg', 'My Rating Avg', a.personalAvg, b.personalAvg, true, v => v.toFixed(2), personalNote),
        numericRow('wdcPosition', 'WDC Position', a.wdcPosition, b.wdcPosition, false, v => `P${v}`),
        numericRow('wdcPoints', 'WDC Points', a.wdcPoints, b.wdcPoints, true),
        numericRow('pointsPerRace', 'Points / Race', a.pointsPerRace, b.pointsPerRace, true, v => v.toFixed(2), pprNote),
    ];

    if (directH2H !== null) {
        rows.push(
            h2hRow('raceH2H', 'Race H2H', directH2H.raceWinsA, directH2H.raceWinsB, directH2H.totalRaces, raceAvailable, 'both finished'),
            h2hRow('qualiH2H', 'Quali H2H', directH2H.qualiWinsA, directH2H.qualiWinsB, directH2H.totalQualis, qualiAvailable, 'shared sessions'),
        );
    }

    rows.push(
        numericRow('avgFinish', 'Avg Finish', a.avgFinish, b.avgFinish, false, v => `P${v.toFixed(2)}`),
        numericRow('avgQuali', 'Avg Qualifying', a.avgQuali, b.avgQuali, false, v => `P${v.toFixed(2)}`),
        numericRow('wins', 'Wins', a.wins, b.wins, true),
        numericRow('podiums', 'Podiums', a.podiums, b.podiums, true),
        numericRow('poles', 'Poles', a.poles, b.poles, true),
        numericRow('dnfs', 'DNFs', a.dnfs, b.dnfs, false),
    );

    return rows;
}

const YELLOW_HEX_SET = new Set(['#facc15', '#ffd700', '#f59e0b', '#eab308']);

/** Ensure side B's progress bar color contrasts cleanly even on same-team or same-driver comparisons. */
export function resolveDistinctBarColors(colorA: string, colorB: string): [string, string] {
    const normA = colorA.trim().toLowerCase();
    const normB = colorB.trim().toLowerCase();
    if (normA !== normB) {
        return [colorA, colorB];
    }
    const fallbackB = YELLOW_HEX_SET.has(normA) ? '#E10600' : '#FACC15';
    return [colorA, fallbackB];
}

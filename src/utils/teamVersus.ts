import type { ConstructorStanding, SeasonQualifyingResult, SeasonRaceResult } from '../api/f1Api';
import type { AverageRating } from '../types';

export type DataStatus = 'idle' | 'ok' | 'rate_limited' | 'error';

export interface TeamOption {
    teamId: string;
    teamName: string;
}

export interface TeamVersusStats {
    teamId: string;
    teamName: string;
    /** Mean of every individual rating given to the team's drivers. */
    avgRating: number | null;
    ratedRaces: number;
    wccPosition: number | null;
    wccPoints: number | null;
    wins: number;
    podiums: number;
    dnfs: number;
}

export interface TeamH2H {
    raceWinsA: number;
    raceWinsB: number;
    totalRaces: number;
    qualiWinsA: number;
    qualiWinsB: number;
    totalQualis: number;
}

export interface TeamDriverSummary {
    driverId: string;
    driverName: string;
    races: number;
    averageRating: number | null;
}

export type RowWinner = 'a' | 'b' | 'tie' | 'none';

export interface VersusRow {
    key: string;
    label: string;
    displayA: string;
    displayB: string;
    winner: RowWinner;
    /** Share (0-1) of the comparison bar that belongs to team A, or null when there is nothing to compare. */
    shareA: number | null;
    note?: string;
}

export interface VersusRowOptions {
    raceAvailable?: boolean;
    qualiAvailable?: boolean;
}

/** Teams that appear in the season, ordered by WCC position (then points, then name). */
export function buildTeamOptions(
    raceResults: SeasonRaceResult[],
    qualiResults: SeasonQualifyingResult[],
    averages: AverageRating[],
    standings: ConstructorStanding[],
): TeamOption[] {
    const names = new Map<string, string>();
    const register = (id: string, name: string) => {
        if (id && !names.has(id)) names.set(id, name);
    };

    standings.forEach(s => register(s.constructorId, s.constructorName));
    raceResults.forEach(r => register(r.constructorId, r.constructorName));
    if (raceResults.length === 0) qualiResults.forEach(q => register(q.constructorId, q.constructorName));
    if (names.size === 0) averages.forEach(a => register(a.constructorId, a.constructorName));

    const standingById = new Map(standings.map(s => [s.constructorId, s]));
    // Only teams with real season activity are selectable; standings alone can list teams with no data.
    const activeIds = new Set<string>([
        ...raceResults.map(r => r.constructorId),
        ...(raceResults.length === 0 ? qualiResults.map(q => q.constructorId) : []),
        ...(raceResults.length === 0 && qualiResults.length === 0 ? averages.map(a => a.constructorId) : []),
    ]);
    const ids = activeIds.size > 0 ? [...activeIds] : [...names.keys()];

    return ids
        .map(teamId => ({ teamId, teamName: names.get(teamId) ?? teamId }))
        .sort((a, b) => {
            const sa = standingById.get(a.teamId);
            const sb = standingById.get(b.teamId);
            const posA = sa?.position ?? Number.POSITIVE_INFINITY;
            const posB = sb?.position ?? Number.POSITIVE_INFINITY;
            if (posA !== posB) return posA - posB;
            const ptsA = sa?.points ?? Number.NEGATIVE_INFINITY;
            const ptsB = sb?.points ?? Number.NEGATIVE_INFINITY;
            if (ptsA !== ptsB) return ptsB - ptsA;
            return a.teamName.localeCompare(b.teamName);
        });
}

/** Resolve the A/B selection (e.g. from the URL) to two distinct valid team ids, falling back to the top of `teamIds`. */
export function resolveTeamSelection(
    a: string | null | undefined,
    b: string | null | undefined,
    teamIds: string[],
): [string, string] | null {
    if (teamIds.length < 2) return null;

    const first = a && teamIds.includes(a) ? a : null;
    const second = b && teamIds.includes(b) && b !== first ? b : null;

    const resolvedFirst = first ?? teamIds.find(id => id !== second)!;
    const resolvedSecond = second ?? teamIds.find(id => id !== resolvedFirst)!;
    return [resolvedFirst, resolvedSecond];
}

function roundTo2(value: number): number {
    return parseFloat(value.toFixed(2));
}

export function buildTeamStats(
    teamId: string,
    teamName: string,
    raceResults: SeasonRaceResult[],
    averages: AverageRating[],
    standings: ConstructorStanding[],
): TeamVersusStats {
    const teamRatings = averages
        .filter(avg => avg.constructorId === teamId)
        .flatMap(avg => avg.ratings);
    const avgRating = teamRatings.length > 0
        ? roundTo2(teamRatings.reduce((sum, value) => sum + value, 0) / teamRatings.length)
        : null;

    const teamResults = raceResults.filter(r => r.constructorId === teamId);
    const standing = standings.find(s => s.constructorId === teamId);

    return {
        teamId,
        teamName,
        avgRating,
        ratedRaces: teamRatings.length,
        wccPosition: standing?.position ?? null,
        wccPoints: standing?.points ?? null,
        wins: teamResults.filter(r => r.position === 1).length,
        podiums: teamResults.filter(r => r.position !== null && r.position <= 3).length,
        dnfs: teamResults.filter(r => r.position === null).length,
    };
}

function bestPositionByRound(
    entries: Array<{ round: string; constructorId: string; position: number | null }>,
    teamId: string,
): Map<string, number | null> {
    const byRound = new Map<string, number | null>();
    entries.forEach(entry => {
        if (entry.constructorId !== teamId) return;
        const current = byRound.get(entry.round);
        if (current === undefined) {
            byRound.set(entry.round, entry.position);
        } else if (entry.position !== null && (current === null || entry.position < current)) {
            byRound.set(entry.round, entry.position);
        }
    });
    return byRound;
}

/**
 * Per round, the team whose best classified driver finished ahead wins the round.
 * A team with no classified driver loses to one that has; rounds where neither has one are skipped.
 */
function compareBestPositions(
    a: Map<string, number | null>,
    b: Map<string, number | null>,
): { winsA: number; winsB: number; total: number } {
    let winsA = 0;
    let winsB = 0;
    let total = 0;

    a.forEach((posA, round) => {
        if (!b.has(round)) return;
        const posB = b.get(round) ?? null;
        if (posA === null && posB === null) return;

        total++;
        if (posB === null || (posA !== null && posA < posB)) winsA++;
        else if (posA === null || posB < posA) winsB++;
    });

    return { winsA, winsB, total };
}

export function calculateTeamH2H(
    teamA: string,
    teamB: string,
    raceResults: SeasonRaceResult[],
    qualiResults: SeasonQualifyingResult[],
): TeamH2H {
    const race = compareBestPositions(
        bestPositionByRound(raceResults, teamA),
        bestPositionByRound(raceResults, teamB),
    );
    const quali = compareBestPositions(
        bestPositionByRound(qualiResults, teamA),
        bestPositionByRound(qualiResults, teamB),
    );

    return {
        raceWinsA: race.winsA,
        raceWinsB: race.winsB,
        totalRaces: race.total,
        qualiWinsA: quali.winsA,
        qualiWinsB: quali.winsB,
        totalQualis: quali.total,
    };
}

/** The team's two main drivers: most races first, then higher rating. */
export function getTeamDrivers(
    teamId: string,
    raceResults: SeasonRaceResult[],
    averages: AverageRating[],
    limit = 2,
): TeamDriverSummary[] {
    const drivers = new Map<string, TeamDriverSummary>();

    raceResults.forEach(result => {
        if (result.constructorId !== teamId) return;
        const entry = drivers.get(result.driverId);
        if (entry) {
            entry.races++;
        } else {
            drivers.set(result.driverId, {
                driverId: result.driverId,
                driverName: result.driverName,
                races: 1,
                averageRating: null,
            });
        }
    });

    if (drivers.size === 0) {
        averages.forEach(avg => {
            if (avg.constructorId !== teamId) return;
            drivers.set(avg.driverId, {
                driverId: avg.driverId,
                driverName: avg.driverName,
                races: avg.totalRaces,
                averageRating: avg.averageRating,
            });
        });
    }

    drivers.forEach(driver => {
        const rating = averages.find(avg => avg.driverId === driver.driverId && avg.constructorId === teamId);
        if (rating) driver.averageRating = rating.averageRating;
    });

    return [...drivers.values()]
        .sort((x, y) => {
            if (y.races !== x.races) return y.races - x.races;
            return (y.averageRating ?? -Infinity) - (x.averageRating ?? -Infinity);
        })
        .slice(0, limit);
}

function numericRow(
    key: string,
    label: string,
    a: number | null,
    b: number | null,
    higherIsBetter: boolean,
    format: (value: number) => string = value => String(value),
    note?: string,
): VersusRow {
    const displayA = a === null ? '—' : format(a);
    const displayB = b === null ? '—' : format(b);

    if (a === null || b === null) {
        return { key, label, displayA, displayB, winner: 'none', shareA: null, note };
    }

    const winner: RowWinner = a === b ? 'tie' : (a > b) === higherIsBetter ? 'a' : 'b';
    const sum = a + b;
    let shareA = 0.5;
    if (sum > 0) shareA = higherIsBetter ? a / sum : b / sum;

    return { key, label, displayA, displayB, winner, shareA, note };
}

function h2hRow(key: string, label: string, winsA: number, winsB: number, total: number, available: boolean, unit: string): VersusRow {
    if (!available || total === 0) {
        return { key, label, displayA: '—', displayB: '—', winner: 'none', shareA: null };
    }
    return {
        ...numericRow(key, label, winsA, winsB, true, undefined, `${total} ${unit}`),
        // Wins can both be zero only if every counted round was a tie, which cannot happen; keep the bar even regardless.
        shareA: winsA + winsB > 0 ? winsA / (winsA + winsB) : 0.5,
    };
}

export function buildComparisonRows(
    a: TeamVersusStats,
    b: TeamVersusStats,
    h2h: TeamH2H,
    options: VersusRowOptions = {},
): VersusRow[] {
    const { raceAvailable = true, qualiAvailable = true } = options;

    return [
        numericRow('avgRating', 'Avg Rating', a.avgRating, b.avgRating, true, value => value.toFixed(2)),
        numericRow('wccPosition', 'WCC Position', a.wccPosition, b.wccPosition, false, value => `P${value}`),
        numericRow('wccPoints', 'WCC Points', a.wccPoints, b.wccPoints, true),
        h2hRow('raceH2H', 'Race H2H', h2h.raceWinsA, h2h.raceWinsB, h2h.totalRaces, raceAvailable, 'races'),
        h2hRow('qualiH2H', 'Quali H2H', h2h.qualiWinsA, h2h.qualiWinsB, h2h.totalQualis, qualiAvailable, 'sessions'),
        numericRow('wins', 'Wins', a.wins, b.wins, true),
        numericRow('podiums', 'Podiums', a.podiums, b.podiums, true),
        numericRow('dnfs', 'DNFs', a.dnfs, b.dnfs, false),
    ];
}

/** Number of rows each team won. */
export function countCategoryWins(rows: VersusRow[]): [number, number] {
    return [
        rows.filter(row => row.winner === 'a').length,
        rows.filter(row => row.winner === 'b').length,
    ];
}

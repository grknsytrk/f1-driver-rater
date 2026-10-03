import type { ConstructorStanding, DriverSeasonStats, SeasonRaceResult, SeasonSprintResult } from '../api/f1Api';
import { TEAM_COLORS, type Race } from '../types';

export interface WdcRaceWeekendData {
    position: number | null | undefined;
    points: number;
    status?: string;
}

export interface WdcCellDisplay {
    kind: 'empty' | 'classified' | 'points-only' | 'status-only' | 'points-status';
    points?: number;
    position?: number;
    statusLabel?: 'DNF' | 'DSQ' | 'DNS';
}

export interface ChampionshipProgressPoint {
    round: string;
    raceName: string;
    sprintOnly: boolean;
    scores: Record<string, { weekendPoints: number; totalPoints: number }>;
}

export interface PointsTrackerEntry {
    id: string;
    name: string;
    label: string;
    code?: string;
    description: string;
    points: number;
    color: string;
    dash?: string;
}

export type LatestTeamMap = Map<string, { constructorId: string; constructorName: string }>;

const LINE_PATTERNS = [undefined, '8 5', '2 4', '10 4 2 4', '12 4 2 4 2 4'];

/** Keep each driver's line style stable and distinguish teammates in every tracker. */
export function buildDriverLineDashes(drivers: { driverId: string; constructorId: string }[]): Map<string, string | undefined> {
    const teamCounts = new Map<string, number>();
    const patterns = new Map<string, string | undefined>();
    [...drivers].sort((a, b) => a.driverId.localeCompare(b.driverId)).forEach(driver => {
        const index = teamCounts.get(driver.constructorId) ?? 0;
        patterns.set(driver.driverId, LINE_PATTERNS[index % LINE_PATTERNS.length]);
        teamCounts.set(driver.constructorId, index + 1);
    });
    return patterns;
}

export function buildDriverTrackerEntries(drivers: DriverSeasonStats[], latestTeams: LatestTeamMap): PointsTrackerEntry[] {
    const patterns = buildDriverLineDashes(drivers.map(driver => ({
        driverId: driver.driverId,
        constructorId: latestTeams.get(driver.driverId)?.constructorId ?? driver.constructorId,
    })));

    return [...drivers].sort((a, b) => Number(a.position) - Number(b.position)).map(driver => {
        const team = latestTeams.get(driver.driverId) ?? driver;
        const label = driver.driverName.split(' ').pop() ?? driver.driverName;
        const officialCode = driver.code?.trim();
        return {
            id: driver.driverId,
            name: driver.driverName,
            label,
            code: officialCode && /^[A-Za-z]{3}$/.test(officialCode)
                ? officialCode.toUpperCase()
                : label.slice(0, 3).toUpperCase(),
            description: `${driver.driverName} · ${team.constructorName}`,
            points: Number(driver.points),
            color: TEAM_COLORS[team.constructorId] ?? '#888888',
            dash: patterns.get(driver.driverId),
        };
    });
}

export function buildConstructorTrackerEntries(constructors: ConstructorStanding[]): PointsTrackerEntry[] {
    return [...constructors].sort((a, b) => a.position - b.position).map(constructor => ({
        id: constructor.constructorId,
        name: constructor.constructorName,
        label: constructor.constructorName.replace(/\s+F1 Team$/i, ''),
        description: constructor.constructorName,
        points: constructor.points,
        color: TEAM_COLORS[constructor.constructorId] ?? '#888888',
    }));
}

export function buildWccRaceMap(
    raceResults: SeasonRaceResult[],
    sprintResults: SeasonSprintResult[],
): Map<string, Map<string, number>> {
    const raceMap = new Map<string, Map<string, number>>();
    [...raceResults, ...sprintResults].forEach(result => {
        let rounds = raceMap.get(result.constructorId);
        if (!rounds) {
            rounds = new Map();
            raceMap.set(result.constructorId, rounds);
        }
        rounds.set(result.round, (rounds.get(result.round) ?? 0) + result.points);
    });
    return raceMap;
}

/** Build a shared timeline from published results, including a sprint before its GP. */
export function buildChampionshipProgress(
    driverIds: string[],
    calendar: Pick<Race, 'round' | 'raceName'>[],
    raceMap: Map<string, Map<string, WdcRaceWeekendData>>,
): ChampionshipProgressPoint[] {
    const gpRounds = new Set<string>();
    const pointsByDriver = new Map([...raceMap].map(([driverId, rounds]) => [
        driverId,
        new Map([...rounds].map(([round, weekend]) => {
            if (weekend.position !== undefined) gpRounds.add(round);
            return [round, weekend.points];
        })),
    ]));
    return buildPointsTimeline(driverIds, calendar, pointsByDriver, gpRounds);
}

/** Shared cumulative calculation for driver and constructor weekend totals. */
export function buildPointsTimeline(
    entryIds: string[],
    calendar: Pick<Race, 'round' | 'raceName'>[],
    raceMap: Map<string, Map<string, number>>,
    gpRounds: ReadonlySet<string>,
): ChampionshipProgressPoint[] {
    const rounds = new Set([...raceMap.values()].flatMap(rounds => [...rounds.keys()]));
    const raceNames = new Map(calendar.map(race => [race.round, race.raceName]));
    const totals = new Map<string, number>();

    return [...rounds].sort((a, b) => Number(a) - Number(b)).map(round => ({
        round,
        raceName: raceNames.get(round) ?? `Round ${round}`,
        sprintOnly: !gpRounds.has(round),
        scores: Object.fromEntries(entryIds.map(entryId => {
            const weekendPoints = raceMap.get(entryId)?.get(round) ?? 0;
            const totalPoints = (totals.get(entryId) ?? 0) + weekendPoints;
            totals.set(entryId, totalPoints);
            return [entryId, { weekendPoints, totalPoints }];
        })),
    }));
}

export function normalizeStandingStatus(status?: string | null): 'DNF' | 'DSQ' | 'DNS' {
    const normalized = status?.trim().toLowerCase() ?? '';

    if (normalized === 'dsq' || normalized.includes('disqualif') || normalized.includes('excluded')) {
        return 'DSQ';
    }

    if (normalized === 'dns' || normalized.includes('did not start')) {
        return 'DNS';
    }

    return 'DNF';
}

export function buildWdcRaceMap(
    raceResults: SeasonRaceResult[],
    sprintResults: SeasonSprintResult[]
): Map<string, Map<string, WdcRaceWeekendData>> {
    const raceMap = new Map<string, Map<string, WdcRaceWeekendData>>();

    raceResults.forEach(result => {
        if (!raceMap.has(result.driverId)) {
            raceMap.set(result.driverId, new Map());
        }

        raceMap.get(result.driverId)!.set(result.round, {
            position: result.position,
            points: result.points,
            status: result.status,
        });
    });

    sprintResults.forEach(result => {
        if (!raceMap.has(result.driverId)) {
            raceMap.set(result.driverId, new Map());
        }

        const driverRounds = raceMap.get(result.driverId)!;
        const previous = driverRounds.get(result.round);

        if (previous) {
            driverRounds.set(result.round, {
                ...previous,
                points: previous.points + result.points,
            });
        } else {
            driverRounds.set(result.round, {
                position: undefined,
                points: result.points,
            });
        }
    });

    return raceMap;
}

export function getWdcCellDisplay(raceData?: WdcRaceWeekendData): WdcCellDisplay {
    if (!raceData) {
        return { kind: 'empty' };
    }

    if (typeof raceData.position === 'number') {
        return {
            kind: 'classified',
            points: raceData.points,
            position: raceData.position,
        };
    }

    if (raceData.position === null) {
        const statusLabel = normalizeStandingStatus(raceData.status);

        if (raceData.points > 0) {
            return {
                kind: 'points-status',
                points: raceData.points,
                statusLabel,
            };
        }

        return {
            kind: 'status-only',
            statusLabel,
        };
    }

    return {
        kind: 'points-only',
        points: raceData.points,
    };
}

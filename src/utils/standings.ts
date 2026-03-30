import type { SeasonRaceResult, SeasonSprintResult } from '../api/f1Api';

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

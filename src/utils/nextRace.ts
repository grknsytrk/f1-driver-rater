import type { CompactSeasonBundle } from '../api/staticSeasonData';
import { isRoundFinished } from '../api/staticSeasonData';
import type { Race, RaceSessionTime } from '../types';

export const CIRCUIT_HISTORY_START_YEAR = 2018;

const ONE_HOUR_MS = 60 * 60 * 1000;
const THREE_HOURS_MS = 3 * ONE_HOUR_MS;

export type WeekendSessionKey = 'fp1' | 'fp2' | 'fp3' | 'sq' | 'sprint' | 'quali' | 'race';

export type WeekendSessionStatus = 'completed' | 'live' | 'next' | 'upcoming';

export interface WeekendSession {
    key: WeekendSessionKey;
    label: string;
    shortLabel: string;
    date: string;
    time?: string;
    startMs: number;
    hasTime: boolean;
    durationMs: number;
    status: WeekendSessionStatus;
}

export interface CountdownParts {
    totalMs: number;
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
    isLive: boolean;
    isFinished: boolean;
}

export interface CircuitPastWinner {
    season: string;
    round: string;
    raceName: string;
    date: string;
    driverId: string;
    driverName: string;
    constructorId: string;
    constructorName: string;
    gridPosition: number | null;
}

export interface CircuitTopScorer {
    driverId: string;
    driverName: string;
    totalPoints: number;
    wins: number;
    podiums: number;
    starts: number;
    latestSeason: string;
    latestConstructorId: string;
    latestConstructorName: string;
}

export interface CircuitHistorySummary {
    circuitId: string;
    totalRaces: number;
    fromYear: string | null;
    toYear: string | null;
    winners: CircuitPastWinner[];
    topScorers: CircuitTopScorer[];
}

function normalizeUtcTime(rawTime?: string): string {
    const trimmed = rawTime?.trim() ?? '';
    if (!trimmed) return '14:00:00Z';
    if (!trimmed.endsWith('Z') && !trimmed.includes('+') && !trimmed.includes('-')) {
        return `${trimmed}Z`;
    }
    return trimmed;
}

/**
 * Parses a race or weekend session `{ date, time }` into UTC milliseconds.
 * Returns `null` when `date` is missing or unparseable.
 */
export function parseSessionTimestampMs(session: RaceSessionTime): number | null {
    const rawDate = session.date?.trim();
    if (!rawDate) return null;

    const iso = rawDate.includes('T')
        ? rawDate
        : `${rawDate}T${normalizeUtcTime(session.time)}`;
    const ms = new Date(iso).getTime();
    return Number.isFinite(ms) ? ms : null;
}

/** Returns `true` when the race calendar entry includes Sprint or Sprint Qualifying sessions. */
export function isSprintWeekend(race: Race): boolean {
    return Boolean(race.Sprint || race.SprintQualifying);
}

/**
 * Finds the first chronologically upcoming or live race in the schedule.
 * Matches `isRoundFinished` (date + time + 3h buffer), returning `null` if all races finished.
 */
export function findNextUpcomingRace(races: Race[], nowMs: number = Date.now()): Race | null {
    if (races.length === 0) return null;

    const sorted = [...races].sort((a, b) => {
        const aMs = parseSessionTimestampMs({ date: a.date, time: a.time }) ?? Number.MAX_SAFE_INTEGER;
        const bMs = parseSessionTimestampMs({ date: b.date, time: b.time }) ?? Number.MAX_SAFE_INTEGER;
        if (aMs !== bMs) return aMs - bMs;
        return Number.parseInt(a.round, 10) - Number.parseInt(b.round, 10);
    });

    return sorted.find(race => !isRoundFinished({ date: race.date, time: race.time }, nowMs)) ?? null;
}

const SESSION_DESCRIPTORS: Array<{
    key: WeekendSessionKey;
    label: string;
    shortLabel: string;
    durationMs: number;
    read: (race: Race) => RaceSessionTime | undefined;
}> = [
    { key: 'fp1', label: 'Practice 1', shortLabel: 'FP1', durationMs: ONE_HOUR_MS, read: r => r.FirstPractice },
    { key: 'fp2', label: 'Practice 2', shortLabel: 'FP2', durationMs: ONE_HOUR_MS, read: r => r.SecondPractice },
    { key: 'fp3', label: 'Practice 3', shortLabel: 'FP3', durationMs: ONE_HOUR_MS, read: r => r.ThirdPractice },
    { key: 'sq', label: 'Sprint Quali', shortLabel: 'SQ', durationMs: ONE_HOUR_MS, read: r => r.SprintQualifying },
    { key: 'sprint', label: 'Sprint', shortLabel: 'SPRINT', durationMs: ONE_HOUR_MS, read: r => r.Sprint },
    { key: 'quali', label: 'Qualifying', shortLabel: 'QUALI', durationMs: ONE_HOUR_MS, read: r => r.Qualifying },
    {
        key: 'race',
        label: 'Grand Prix',
        shortLabel: 'RACE',
        durationMs: THREE_HOURS_MS,
        read: r => (r.date ? { date: r.date, time: r.time } : undefined),
    },
];

/**
 * Extracts and chronologically sorts all weekend sessions for a race, marking each as
 * `completed`, `live`, `next`, or `upcoming`.
 */
export function buildWeekendSessions(race: Race, nowMs: number = Date.now()): WeekendSession[] {
    const rawSessions: Array<Omit<WeekendSession, 'status'>> = [];

    for (const descriptor of SESSION_DESCRIPTORS) {
        const slot = descriptor.read(race);
        if (!slot?.date) continue;
        const startMs = parseSessionTimestampMs(slot);
        if (startMs === null) continue;

        rawSessions.push({
            key: descriptor.key,
            label: descriptor.label,
            shortLabel: descriptor.shortLabel,
            date: slot.date,
            time: slot.time,
            startMs,
            hasTime: Boolean(slot.time?.trim()),
            durationMs: descriptor.durationMs,
        });
    }

    rawSessions.sort((a, b) => a.startMs - b.startMs);

    let assignedNext = false;
    return rawSessions.map((session) => {
        if (nowMs >= session.startMs + session.durationMs) {
            return { ...session, status: 'completed' };
        }
        if (nowMs >= session.startMs) {
            return { ...session, status: 'live' };
        }
        if (!assignedNext) {
            assignedNext = true;
            return { ...session, status: 'next' };
        }
        return { ...session, status: 'upcoming' };
    });
}

/** Splits remaining time until `targetMs` into countdown components + live/finished flags. */
export function splitCountdown(
    targetMs: number,
    nowMs: number,
    liveDurationMs: number = THREE_HOURS_MS,
): CountdownParts {
    const diff = targetMs - nowMs;
    if (diff <= 0) {
        const isLive = diff > -liveDurationMs;
        return {
            totalMs: 0,
            days: 0,
            hours: 0,
            minutes: 0,
            seconds: 0,
            isLive,
            isFinished: !isLive,
        };
    }

    const totalSeconds = Math.floor(diff / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return {
        totalMs: diff,
        days,
        hours,
        minutes,
        seconds,
        isLive: false,
        isFinished: false,
    };
}

/** Formats a session's date and clock time into the viewer's local timezone (or explicit override). */
export function formatLocalSessionTime(
    session: Pick<WeekendSession, 'date' | 'time' | 'startMs' | 'hasTime'>,
    timeZone?: string,
): { dayLabel: string; timeLabel: string } {
    try {
        const targetMs = session.hasTime
            ? session.startMs
            : new Date(`${session.date}T12:00:00Z`).getTime();
        const dateObj = new Date(targetMs);

        const weekday = new Intl.DateTimeFormat('en-GB', {
            weekday: 'short',
            timeZone: session.hasTime ? timeZone : 'UTC',
        }).format(dateObj);
        const day = new Intl.DateTimeFormat('en-GB', {
            day: '2-digit',
            month: 'short',
            timeZone: session.hasTime ? timeZone : 'UTC',
        }).format(dateObj);

        const dayLabel = `${weekday} ${day}`.toUpperCase();
        if (!session.hasTime) {
            return { dayLabel, timeLabel: 'TBA' };
        }

        const timeLabel = new Intl.DateTimeFormat('en-GB', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
            timeZone,
        }).format(dateObj);

        return { dayLabel, timeLabel };
    } catch {
        return {
            dayLabel: session.date,
            timeLabel: session.hasTime ? (session.time?.slice(0, 5) ?? 'TBA') : 'TBA',
        };
    }
}

/** Returns a compact label for the active local (or specified) timezone, e.g. `Europe/Istanbul (GMT+3)`. */
export function getLocalTimezoneLabel(nowMs: number = Date.now(), timeZone?: string): string {
    try {
        const resolvedZone = timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
        const offsetParts = new Intl.DateTimeFormat('en-GB', {
            timeZoneName: 'shortOffset',
            timeZone: resolvedZone,
        }).formatToParts(new Date(nowMs));
        const offset = offsetParts.find(part => part.type === 'timeZoneName')?.value;
        if (resolvedZone && offset) {
            return `${resolvedZone} (${offset})`;
        }
        return resolvedZone || offset || 'LOCAL TIME';
    } catch {
        return 'LOCAL TIME';
    }
}

interface ScorerAccumulator {
    driverId: string;
    driverName: string;
    totalPoints: number;
    wins: number;
    podiums: number;
    starts: number;
    latestSortKey: string;
    latestSeason: string;
    latestConstructorId: string;
    latestConstructorName: string;
}

/**
 * Aggregates historical GP winners and top career points scorers at a given circuit
 * from static season bundles (race points + sprint points on the same circuit round).
 */
export function buildCircuitHistory(
    circuitId: string,
    bundles: CompactSeasonBundle[],
    maxWinners: number = 6,
    maxScorers: number = 5,
): CircuitHistorySummary {
    const winners: CircuitPastWinner[] = [];
    const scorers = new Map<string, ScorerAccumulator>();
    const years = new Set<string>();

    for (const bundle of bundles) {
        const matchingRaces = bundle.races.filter(r => r.Circuit?.circuitId === circuitId);
        if (matchingRaces.length === 0) continue;

        for (const race of matchingRaces) {
            const roundResults = bundle.results.filter(r => String(r.round) === String(race.round));
            if (roundResults.length === 0) continue;

            years.add(bundle.season);

            const winnerRow = roundResults.find(r => r.position === 1);
            if (winnerRow) {
                winners.push({
                    season: bundle.season,
                    round: String(race.round),
                    raceName: race.raceName,
                    date: race.date,
                    driverId: winnerRow.driverId,
                    driverName: winnerRow.driverName,
                    constructorId: winnerRow.constructorId,
                    constructorName: winnerRow.constructorName,
                    gridPosition: typeof winnerRow.gridPosition === 'number' ? winnerRow.gridPosition : null,
                });
            }

            const sprintPointsByDriver = new Map<string, number>();
            for (const sprintRow of bundle.sprints ?? []) {
                if (String(sprintRow.round) === String(race.round)) {
                    const pts = Number.isFinite(sprintRow.points) ? sprintRow.points : 0;
                    sprintPointsByDriver.set(
                        sprintRow.driverId,
                        (sprintPointsByDriver.get(sprintRow.driverId) ?? 0) + pts,
                    );
                }
            }

            const sortKey = `${bundle.season}-${String(race.round).padStart(2, '0')}`;

            for (const row of roundResults) {
                const racePts = Number.isFinite(row.points) ? row.points : 0;
                const sprintPts = sprintPointsByDriver.get(row.driverId) ?? 0;
                const pointsEarned = racePts + sprintPts;
                const isWin = row.position === 1;
                const isPodium = row.position !== null && row.position >= 1 && row.position <= 3;

                const existing = scorers.get(row.driverId);
                if (!existing) {
                    scorers.set(row.driverId, {
                        driverId: row.driverId,
                        driverName: row.driverName,
                        totalPoints: pointsEarned,
                        wins: isWin ? 1 : 0,
                        podiums: isPodium ? 1 : 0,
                        starts: 1,
                        latestSortKey: sortKey,
                        latestSeason: bundle.season,
                        latestConstructorId: row.constructorId,
                        latestConstructorName: row.constructorName,
                    });
                } else {
                    existing.totalPoints += pointsEarned;
                    if (isWin) existing.wins += 1;
                    if (isPodium) existing.podiums += 1;
                    existing.starts += 1;
                    if (sortKey >= existing.latestSortKey) {
                        existing.latestSortKey = sortKey;
                        existing.latestSeason = bundle.season;
                        existing.latestConstructorId = row.constructorId;
                        existing.latestConstructorName = row.constructorName;
                        if (row.driverName) existing.driverName = row.driverName;
                    }
                }
            }
        }
    }

    winners.sort((a, b) => {
        if (b.date !== a.date) return b.date.localeCompare(a.date);
        return Number.parseInt(b.round, 10) - Number.parseInt(a.round, 10);
    });

    const topScorers: CircuitTopScorer[] = [...scorers.values()]
        .sort((a, b) => {
            if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
            if (b.wins !== a.wins) return b.wins - a.wins;
            if (b.podiums !== a.podiums) return b.podiums - a.podiums;
            return a.driverName.localeCompare(b.driverName, 'en', { sensitivity: 'base' });
        })
        .slice(0, maxScorers)
        .map((item) => ({
            driverId: item.driverId,
            driverName: item.driverName,
            totalPoints: item.totalPoints,
            wins: item.wins,
            podiums: item.podiums,
            starts: item.starts,
            latestSeason: item.latestSeason,
            latestConstructorId: item.latestConstructorId,
            latestConstructorName: item.latestConstructorName,
        }));

    const sortedYears = [...years].sort((a, b) => a.localeCompare(b));

    return {
        circuitId,
        totalRaces: winners.length,
        fromYear: sortedYears[0] ?? null,
        toYear: sortedYears[sortedYears.length - 1] ?? null,
        winners: winners.slice(0, maxWinners),
        topScorers,
    };
}

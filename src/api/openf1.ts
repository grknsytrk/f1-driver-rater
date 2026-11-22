export const OPENF1_MIN_SEASON = 2023;
const OPENF1_BASE_URL = 'https://api.openf1.org/v1';

const ARCHIVED_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const ACTIVE_TTL_MS = 12 * 60 * 60 * 1000;
const EMPTY_STINTS_MAP = new Map<number, TyreStint[]>();

export type TyreCompound = 'SOFT' | 'MEDIUM' | 'HARD' | 'INTERMEDIATE' | 'WET' | 'UNKNOWN';

export interface TyreStint {
    stintNumber: number;
    compound: TyreCompound;
    lapStart: number | null;
    lapEnd: number | null;
    lapCount: number | null;
    tyreAgeAtStart: number | null;
}

export interface OpenF1SessionRecord {
    session_key: number;
    date_start?: string;
    country_name?: string;
    location?: string;
    circuit_short_name?: string;
    session_name?: string;
    year?: number;
}

export interface OpenF1StintRecord {
    driver_number: number;
    stint_number: number;
    compound?: string | null;
    lap_start?: number | null;
    lap_end?: number | null;
    tyre_age_at_start?: number | null;
}

interface StoredCacheEntry<T> {
    expiresAt: number;
    value: T;
}

const sessionsMemoryCache = new Map<string, OpenF1SessionRecord[]>();
const stintsMemoryCache = new Map<number, Map<number, TyreStint[]>>();
const inFlightSessions = new Map<string, Promise<OpenF1SessionRecord[]>>();
const inFlightStints = new Map<number, Promise<Map<number, TyreStint[]>>>();

function canUseFetch(): boolean {
    if (typeof fetch !== 'function') return false;
    if (typeof import.meta !== 'undefined' && import.meta.env?.MODE === 'test') {
        return Boolean((fetch as unknown as { _isMockFunction?: boolean })._isMockFunction);
    }
    return true;
}

function readLocalCache<T>(key: string): T | null {
    if (typeof localStorage === 'undefined') return null;
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as StoredCacheEntry<T>;
        if (!parsed || typeof parsed.expiresAt !== 'number' || parsed.expiresAt < Date.now()) {
            localStorage.removeItem(key);
            return null;
        }
        return parsed.value;
    } catch {
        return null;
    }
}

function writeLocalCache<T>(key: string, value: T, ttlMs: number): void {
    if (typeof localStorage === 'undefined') return;
    try {
        const entry: StoredCacheEntry<T> = {
            expiresAt: Date.now() + ttlMs,
            value,
        };
        localStorage.setItem(key, JSON.stringify(entry));
    } catch {
        // Ignore storage quota errors cleanly
    }
}

/**
 * Normalizes raw OpenF1 compound strings into known Pirelli F1 compound identifiers.
 */
export function normalizeTyreCompound(raw: string | null | undefined): TyreCompound {
    const value = (raw ?? '').trim().toUpperCase();
    if (value === 'SOFT' || value === 'MEDIUM' || value === 'HARD' || value === 'INTERMEDIATE' || value === 'WET') {
        return value;
    }
    return 'UNKNOWN';
}

function parseUtcDayMs(dateLike: string | undefined): number | null {
    if (!dateLike) return null;
    const match = dateLike.trim().match(/^(\d{4}-\d{2}-\d{2})/);
    if (!match) return null;
    const ms = Date.parse(`${match[1]}T00:00:00Z`);
    return Number.isFinite(ms) ? ms : null;
}

/**
 * Matches an OpenF1 Race session against the calendar's race date (±1 day) or circuit/country name.
 */
export function matchOpenF1RaceSession(
    sessions: OpenF1SessionRecord[],
    raceDate: string,
    raceName: string,
): OpenF1SessionRecord | null {
    if (sessions.length === 0) return null;

    const targetDayMs = parseUtcDayMs(raceDate);
    if (targetDayMs !== null) {
        let bestMatch: OpenF1SessionRecord | null = null;
        let bestDiff = Infinity;
        const maxDiffMs = 36 * 60 * 60 * 1000;

        for (const session of sessions) {
            const sessionDayMs = parseUtcDayMs(session.date_start);
            if (sessionDayMs === null) continue;
            const diff = Math.abs(sessionDayMs - targetDayMs);
            if (diff <= maxDiffMs && diff < bestDiff) {
                bestDiff = diff;
                bestMatch = session;
            }
        }
        if (bestMatch) return bestMatch;
    }

    const normalizedRace = raceName.toLowerCase();
    for (const session of sessions) {
        const tokens = [session.country_name, session.location, session.circuit_short_name]
            .filter((t): t is string => Boolean(t && t.trim()))
            .map(t => t.trim().toLowerCase());
        if (tokens.some(token => normalizedRace.includes(token))) {
            return session;
        }
    }

    return null;
}

/**
 * Groups OpenF1 stint rows by car `driver_number`, ordered chronologically by `stint_number`.
 */
export function groupStintsByDriverNumber(records: OpenF1StintRecord[]): Map<number, TyreStint[]> {
    const grouped = new Map<number, TyreStint[]>();

    for (const record of records) {
        const driverNum = Number(record.driver_number);
        const stintNum = Number(record.stint_number);
        if (!Number.isFinite(driverNum) || driverNum <= 0 || !Number.isFinite(stintNum) || stintNum <= 0) {
            continue;
        }

        const lapStart = typeof record.lap_start === 'number' && Number.isFinite(record.lap_start)
            ? record.lap_start
            : null;
        const lapEnd = typeof record.lap_end === 'number' && Number.isFinite(record.lap_end)
            ? record.lap_end
            : null;
        const lapCount = lapStart !== null && lapEnd !== null && lapEnd >= lapStart
            ? (lapEnd - lapStart + 1)
            : null;
        const tyreAgeAtStart = typeof record.tyre_age_at_start === 'number' && Number.isFinite(record.tyre_age_at_start)
            ? record.tyre_age_at_start
            : null;

        const stint: TyreStint = {
            stintNumber: stintNum,
            compound: normalizeTyreCompound(record.compound),
            lapStart,
            lapEnd,
            lapCount,
            tyreAgeAtStart,
        };

        const list = grouped.get(driverNum);
        if (list) {
            list.push(stint);
        } else {
            grouped.set(driverNum, [stint]);
        }
    }

    for (const [driverNum, stints] of grouped) {
        const deduped = new Map<number, TyreStint>();
        for (const stint of stints) {
            deduped.set(stint.stintNumber, stint);
        }
        grouped.set(
            driverNum,
            Array.from(deduped.values()).sort((a, b) => a.stintNumber - b.stintNumber),
        );
    }

    return grouped;
}

async function fetchOpenF1RaceSessions(season: string): Promise<OpenF1SessionRecord[]> {
    const mem = sessionsMemoryCache.get(season);
    if (mem) return mem;

    const storageKey = `openf1:sessions:${season}`;
    const stored = readLocalCache<OpenF1SessionRecord[]>(storageKey);
    if (stored) {
        sessionsMemoryCache.set(season, stored);
        return stored;
    }

    const existing = inFlightSessions.get(season);
    if (existing) return existing;

    const promise = (async () => {
        try {
            const response = await fetch(
                `${OPENF1_BASE_URL}/sessions?year=${encodeURIComponent(season)}&session_name=Race`,
            );
            if (!response.ok) return [];
            const data = await response.json();
            if (!Array.isArray(data)) return [];
            const records = data as OpenF1SessionRecord[];
            if (records.length > 0) {
                const isArchived = Number.parseInt(season, 10) < new Date().getUTCFullYear();
                sessionsMemoryCache.set(season, records);
                writeLocalCache(storageKey, records, isArchived ? ARCHIVED_TTL_MS : ACTIVE_TTL_MS);
            }
            return records;
        } catch {
            return [];
        } finally {
            inFlightSessions.delete(season);
        }
    })();

    inFlightSessions.set(season, promise);
    return promise;
}

async function fetchOpenF1StintsForSession(
    sessionKey: number,
    isArchived: boolean,
): Promise<Map<number, TyreStint[]>> {
    const mem = stintsMemoryCache.get(sessionKey);
    if (mem) return mem;

    const storageKey = `openf1:stints:${sessionKey}`;
    const stored = readLocalCache<Array<[number, TyreStint[]]>>(storageKey);
    if (stored) {
        const map = new Map<number, TyreStint[]>(stored);
        stintsMemoryCache.set(sessionKey, map);
        return map;
    }

    const existing = inFlightStints.get(sessionKey);
    if (existing) return existing;

    const promise = (async () => {
        try {
            const response = await fetch(`${OPENF1_BASE_URL}/stints?session_key=${sessionKey}`);
            if (!response.ok) return EMPTY_STINTS_MAP;
            const data = await response.json();
            if (!Array.isArray(data)) return EMPTY_STINTS_MAP;
            const grouped = groupStintsByDriverNumber(data as OpenF1StintRecord[]);
            if (grouped.size > 0) {
                stintsMemoryCache.set(sessionKey, grouped);
                writeLocalCache(
                    storageKey,
                    Array.from(grouped.entries()),
                    isArchived ? ARCHIVED_TTL_MS : ACTIVE_TTL_MS,
                );
            }
            return grouped;
        } catch {
            return EMPTY_STINTS_MAP;
        } finally {
            inFlightStints.delete(sessionKey);
        }
    })();

    inFlightStints.set(sessionKey, promise);
    return promise;
}

/**
 * Fetches race tyre stints indexed by car number for 2023+ Grand Prix races from OpenF1.
 * Fails silently with an empty Map so UI rendering is never blocked.
 */
export async function getRaceTyreStints(
    season: string,
    raceDate: string,
    raceName: string,
): Promise<Map<number, TyreStint[]>> {
    const seasonNum = Number.parseInt(season, 10);
    if (!Number.isFinite(seasonNum) || seasonNum < OPENF1_MIN_SEASON) {
        return EMPTY_STINTS_MAP;
    }
    if (!canUseFetch()) {
        return EMPTY_STINTS_MAP;
    }

    const sessions = await fetchOpenF1RaceSessions(season);
    const session = matchOpenF1RaceSession(sessions, raceDate, raceName);
    if (!session?.session_key) {
        return EMPTY_STINTS_MAP;
    }

    const isArchived = seasonNum < new Date().getUTCFullYear();
    return fetchOpenF1StintsForSession(session.session_key, isArchived);
}

/** Clears OpenF1 in-memory caches. Intended for unit testing. */
export function clearOpenF1Cache(): void {
    sessionsMemoryCache.clear();
    stintsMemoryCache.clear();
    inFlightSessions.clear();
    inFlightStints.clear();
}

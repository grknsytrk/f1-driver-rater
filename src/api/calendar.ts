import type { Race, Season } from '../types';
import { getCacheEntry, getGranularTtl, markCacheHit, setCache, swrFetch } from './jolpicaCache';
import { jolpicaClient, type ApiRequestOptions } from './jolpicaClient';
import {
    getStaticRaces,
    getStaticRacesSync,
    isFetchMockedOrAvailable,
    isRoundFinished,
} from './staticSeasonData';

type RaceLike = Pick<Race, 'round' | 'date'> & Partial<Pick<Race, 'time' | 'raceName' | 'Circuit'>>;

function getRaceStartMs<T extends RaceLike>(race: T): number {
    const isoDateTime = `${race.date}T${race.time ?? '00:00:00Z'}`;
    const timestamp = new Date(isoDateTime).getTime();
    return Number.isFinite(timestamp) ? timestamp : 0;
}

function getRaceIdentityKeys<T extends RaceLike>(race: T): string[] {
    const keys = new Set<string>();

    if (race.date && race.raceName) {
        keys.add(`date-name:${race.date}::${race.raceName}`);
    }

    if (race.Circuit?.circuitId) {
        keys.add(`circuit:${race.Circuit.circuitId}`);
    }

    if (race.date) {
        keys.add(`date:${race.date}`);
    }

    if (race.raceName) {
        keys.add(`name:${race.raceName}`);
    }

    return [...keys];
}

function hasBrokenRoundSequence<T extends RaceLike>(races: T[]): boolean {
    const seen = new Set<string>();

    return races.some((race, index) => {
        const round = parseInt(race.round, 10);
        const roundKey = Number.isFinite(round) ? String(round) : '';

        if (!roundKey || seen.has(roundKey) || round !== index + 1) {
            return true;
        }

        seen.add(roundKey);
        return false;
    });
}

export function normalizeRaceCalendar<T extends RaceLike>(races: T[]): T[] {
    const chronologicallySorted = [...races].sort((a, b) => getRaceStartMs(a) - getRaceStartMs(b));

    if (!hasBrokenRoundSequence(chronologicallySorted)) {
        return chronologicallySorted;
    }

    console.warn('Detected broken round data in season calendar. Re-numbering races by date order.');

    return chronologicallySorted.map((race, index) => ({
        ...race,
        round: String(index + 1),
    }));
}

function createCanonicalRoundLookup(races: Race[]): Map<string, string> {
    const lookup = new Map<string, string>();

    normalizeRaceCalendar(races).forEach(race => {
        getRaceIdentityKeys(race).forEach(key => lookup.set(key, race.round));
    });

    return lookup;
}

export function applyCanonicalRounds<T extends RaceLike>(races: T[], calendar: Race[]): T[] {
    if (races.length === 0 || calendar.length === 0) {
        return [...races];
    }

    const canonicalRoundLookup = createCanonicalRoundLookup(calendar);

    return [...races]
        .map(race => {
            const canonicalRound = getRaceIdentityKeys(race)
                .map(key => canonicalRoundLookup.get(key))
                .find((round): round is string => typeof round === 'string' && round.length > 0);

            if (!canonicalRound || canonicalRound === race.round) {
                return race;
            }

            return {
                ...race,
                round: canonicalRound,
            };
        })
        .sort((a, b) => getRaceStartMs(a) - getRaceStartMs(b));
}

const SEASONS_FALLBACK: Season[] = [
    { season: '2026', url: '' },
    { season: '2025', url: '' },
    { season: '2024', url: '' },
    { season: '2023', url: '' },
    { season: '2022', url: '' },
    { season: '2021', url: '' },
    { season: '2020', url: '' },
    { season: '2019', url: '' },
    { season: '2018', url: '' },
];

// Fetch available seasons (2018-current)
export async function getSeasons(options?: ApiRequestOptions): Promise<Season[]> {
    const cacheKey = 'jolpica:seasons';
    return swrFetch<Season[]>(
        cacheKey,
        async (ctx) => {
            const response = await jolpicaClient.get<{ MRData?: { SeasonTable?: { Seasons?: Season[] } } }>(
                '/seasons.json?limit=20&offset=68',
                {
                    priority: ctx?.priority ?? options?.priority,
                    isBackground: ctx?.isBackground,
                    queueKey: cacheKey,
                    signal: options?.signal,
                },
            );
            const seasons = (response.data?.MRData?.SeasonTable?.Seasons ?? []) as Season[];
            // Filter to recent seasons and reverse for newest first
            return seasons.filter(s => parseInt(s.season, 10) >= 2018).reverse();
        },
        24 * 60 * 60 * 1000,
        {
            priority: options?.priority,
            signal: options?.signal,
            throwOnError: options?.throwOnError,
            fallback: SEASONS_FALLBACK,
            isValid: data => Array.isArray(data) && data.length > 0,
        },
    );
}

// Fetch all races for a season
export async function getRaces(season: string, options?: ApiRequestOptions): Promise<Race[]> {
    const cacheKey = `jolpica:races:${season}`;

    const inMemoryRaces = getStaticRacesSync(season);
    if (inMemoryRaces && inMemoryRaces.length > 0) {
        markCacheHit();
        const normalized = normalizeRaceCalendar(inMemoryRaces);
        const ttl = getGranularTtl(season, undefined, undefined, { racesCalendar: normalized });
        setCache(cacheKey, normalized, ttl, { memoryOnly: true });
        return normalized;
    }

    if (!getCacheEntry<Race[]>(cacheKey) && isFetchMockedOrAvailable()) {
        try {
            const staticRaces = await getStaticRaces(season);
            if (staticRaces && staticRaces.length > 0) {
                markCacheHit();
                const normalized = normalizeRaceCalendar(staticRaces);
                const ttl = getGranularTtl(season, undefined, undefined, { racesCalendar: normalized });
                setCache(cacheKey, normalized, ttl, { memoryOnly: true });
                return normalized;
            }
        } catch {
            // Fall back gracefully to SWR endpoint
        }
    }

    return swrFetch<Race[]>(
        cacheKey,
        async (ctx) => {
            const response = await jolpicaClient.get<{ MRData?: { RaceTable?: { Races?: Race[] } } }>(
                `/${season}.json?limit=100`,
                {
                    priority: ctx?.priority ?? options?.priority,
                    isBackground: ctx?.isBackground,
                    queueKey: cacheKey,
                    signal: options?.signal,
                },
            );
            const races = (response.data?.MRData?.RaceTable?.Races ?? []) as Race[];
            return normalizeRaceCalendar(races);
        },
        data => getGranularTtl(season, undefined, undefined, { racesCalendar: data }),
        {
            priority: options?.priority,
            signal: options?.signal,
            throwOnError: options?.throwOnError,
            fallback: [],
            isValid: data => Array.isArray(data) && data.length > 0,
        },
    );
}

// Check if a race has been completed (date + time + 3h buffer is in the past)
export function isRaceCompleted(raceDate: string, raceTime?: string): boolean {
    return isRoundFinished({ date: raceDate, time: raceTime });
}

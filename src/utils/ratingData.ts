import type { DriverRating, SeasonRatings } from '../types';

export const RACE_STORAGE_KEY = 'f1_pilot_ratings';
export const QUICK_STORAGE_KEY = 'f1_quick_ratings';
export const LOCAL_RATINGS_EVENT = 'f1:local-ratings';

export interface RatingScope {
    kind?: 'race' | 'quick';
    season?: string;
    round?: string;
    driverId?: string;
}

export interface RatingEntry {
    kind: 'race' | 'quick';
    season: string;
    round?: string;
    raceName?: string;
    raceDate?: string;
    rating: DriverRating;
}

export function isValidRating(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value)
        && value >= 0.5 && value <= 10 && Number.isInteger(value * 2);
}

export function validRatings(ratings: DriverRating[]): DriverRating[] {
    // Old exports may contain tenths. Preserve those personal scores, while new
    // explicit votes are validated separately against the half-point scale.
    return ratings.filter(rating => typeof rating.rating === 'number' && Number.isFinite(rating.rating)
        && rating.rating > 0 && rating.rating <= 10);
}

export function readStored<T>(key: string, fallback: T): T {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) as T : fallback;
    } catch {
        return fallback;
    }
}

export function entryKey(entry: RatingEntry): string {
    return JSON.stringify([entry.kind, entry.season, entry.round ?? '', entry.rating.driverId]);
}

export function matchesScope(entry: RatingEntry, scope: RatingScope): boolean {
    return (!scope.kind || entry.kind === scope.kind)
        && (!scope.season || entry.season === scope.season)
        && (!scope.round || entry.round === scope.round)
        && (!scope.driverId || entry.rating.driverId === scope.driverId);
}

export function localEntries(): RatingEntry[] {
    const races = readStored<Record<string, SeasonRatings>>(RACE_STORAGE_KEY, {});
    const quick = readStored<Record<string, DriverRating[]>>(QUICK_STORAGE_KEY, {});
    return [
        ...Object.entries(races).flatMap(([season, data]) => data.races.flatMap(race =>
            validRatings(race.ratings).map(rating => ({
                kind: 'race' as const, season, round: race.round,
                raceName: race.raceName, raceDate: race.date, rating,
            })))),
        ...Object.entries(quick).flatMap(([season, ratings]) => validRatings(ratings).map(rating => ({
            kind: 'quick' as const, season, rating,
        }))),
    ];
}

export function mergeRemoteEntry(entry: RatingEntry): void {
    if (entry.kind === 'quick') {
        const all = readStored<Record<string, DriverRating[]>>(QUICK_STORAGE_KEY, {});
        all[entry.season] = [
            ...(all[entry.season] ?? []).filter(rating => rating.driverId !== entry.rating.driverId),
            entry.rating,
        ];
        localStorage.setItem(QUICK_STORAGE_KEY, JSON.stringify(all));
    } else {
        const all = readStored<Record<string, SeasonRatings>>(RACE_STORAGE_KEY, {});
        const season = all[entry.season] ?? { season: entry.season, races: [] };
        const race = season.races.find(race => race.round === entry.round) ?? {
            round: entry.round!, raceName: entry.raceName!, date: entry.raceDate!,
            ratings: [], completed: true,
        };
        race.ratings = [...race.ratings.filter(rating => rating.driverId !== entry.rating.driverId), entry.rating];
        if (!season.races.includes(race)) season.races.push(race);
        all[entry.season] = season;
        localStorage.setItem(RACE_STORAGE_KEY, JSON.stringify(all));
    }
}

export function notifyLocalRatings(): void {
    window.dispatchEvent(new Event(LOCAL_RATINGS_EVENT));
}

import type { SeasonRatings, RaceRatings, DriverRating, AverageRating } from '../types';
import {
    queueGuestClearAll,
    queueGuestQuickSeasonDelete,
    queueGuestSeasonDelete,
    queueGuestRatingChanges,
    queueGuestRaceSeasonDelete,
} from './guestSync';
import { isValidRating, localEntries, notifyLocalRatings, validRatings } from './ratingData';

const STORAGE_KEY = 'f1_pilot_ratings';

// Get all ratings from localStorage
export function getAllRatings(): Record<string, SeasonRatings> {
    try {
        const data = localStorage.getItem(STORAGE_KEY);
        return data ? JSON.parse(data) : {};
    } catch (error) {
        console.error('Error reading ratings from storage:', error);
        return {};
    }
}

// Get ratings for a specific season
export function getSeasonRatings(season: string): SeasonRatings | null {
    const allRatings = getAllRatings();
    return allRatings[season] || null;
}

// Get ratings for a specific race
export function getRaceRatings(season: string, round: string): RaceRatings | null {
    const seasonRatings = getSeasonRatings(season);
    if (!seasonRatings) return null;
    const race = seasonRatings.races.find(r => r.round === round);
    return race ? { ...race, ratings: validRatings(race.ratings) } : null;
}

// Save ratings for a race
export function saveRaceRatings(
    season: string,
    round: string,
    raceName: string,
    date: string,
    ratings: DriverRating[]
): void {
    try {
        const before = localEntries();
        const allRatings = getAllRatings();

        // Initialize season if doesn't exist
        if (!allRatings[season]) {
            allRatings[season] = {
                season,
                races: [],
            };
        }

        // Find or create race ratings
        const existingIndex = allRatings[season].races.findIndex(r => r.round === round);
        const raceRatings: RaceRatings = {
            round,
            raceName,
            date,
            ratings: validRatings(ratings),
            completed: validRatings(ratings).length > 0,
        };

        if (existingIndex >= 0) {
            allRatings[season].races[existingIndex] = raceRatings;
        } else {
            allRatings[season].races.push(raceRatings);
        }

        localStorage.setItem(STORAGE_KEY, JSON.stringify(allRatings));
        queueGuestRatingChanges(before, localEntries());
        notifyLocalRatings();
    } catch (error) {
        console.error('Error saving ratings:', error);
    }
}

// Merge the selection into the latest storage, rather than a stale modal snapshot.
export function saveRaceDriverRating(season: string, round: string, raceName: string, date: string, rating: DriverRating): void {
    if (!isValidRating(rating.rating)) return;
    const existing = getRaceRatings(season, round)?.ratings ?? [];
    saveRaceRatings(season, round, raceName, date, [
        ...existing.filter(value => value.driverId !== rating.driverId),
        { ...rating, communityEligible: true },
    ]);
}

// Promote all existing personal scores for a race when the user explicitly
// leaves that race's rating screen. This keeps legacy scores intact while
// avoiding a driver-by-driver re-entry step.
export function markRaceRatingsCommunityEligible(season: string, round: string, raceName: string, date: string): number {
    const race = getRaceRatings(season, round);
    if (!race) return 0;
    const ratings = validRatings(race.ratings);
    const legacyCount = ratings.filter(rating => rating.communityEligible !== true).length;
    if (legacyCount === 0) return 0;
    saveRaceRatings(season, round, raceName || race.raceName, date || race.date, ratings.map(rating => ({
        ...rating,
        communityEligible: true,
    })));
    return legacyCount;
}

// Check if a race has been rated
export function isRaceRated(season: string, round: string): boolean {
    const raceRatings = getRaceRatings(season, round);
    return raceRatings?.completed || false;
}

// Get number of rated races for a season
export function getRatedRacesCount(season: string): number {
    const seasonRatings = getSeasonRatings(season);
    if (!seasonRatings) return 0;
    return seasonRatings.races.filter(r => r.completed).length;
}

// Calculate average ratings for all drivers in a season.
// A driver remains one row even when they change constructors mid-season.
export function calculateAverages(season: string): AverageRating[] {
    const seasonRatings = getSeasonRatings(season);
    const quickRatings = getQuickRatings(season);

    // If we have race-by-race ratings, calculate from those
    if (seasonRatings && seasonRatings.races.some(race => race.completed && validRatings(race.ratings).length > 0)) {
        // Process races in order so the last constructor is the current one.
        const completedRaces = [...seasonRatings.races]
            .filter(race => race.completed)
            .sort((a, b) => parseInt(a.round) - parseInt(b.round));
        const driverMap = new Map<string, AverageRating>();

        for (const race of completedRaces) {
            for (const rating of validRatings(race.ratings)) {
                if (!driverMap.has(rating.driverId)) {
                    driverMap.set(rating.driverId, {
                        driverId: rating.driverId,
                        driverName: rating.driverName,
                        constructorId: rating.constructorId,
                        constructorName: rating.constructorName,
                        averageRating: 0,
                        totalRaces: 0,
                        ratings: [],
                    });
                }

                const driverEntry = driverMap.get(rating.driverId)!;
                driverEntry.driverName = rating.driverName;
                driverEntry.constructorId = rating.constructorId;
                driverEntry.constructorName = rating.constructorName;
                driverEntry.ratings.push(rating.rating);
                driverEntry.totalRaces++;
            }
        }

        // Calculate averages
        const results: AverageRating[] = [];
        for (const driverEntry of driverMap.values()) {
            const sum = driverEntry.ratings.reduce((a, b) => a + b, 0);
            driverEntry.averageRating = parseFloat((sum / driverEntry.ratings.length).toFixed(2));
            results.push(driverEntry);
        }

        // Sort by average rating descending
        return results.sort((a, b) => b.averageRating - a.averageRating);
    }

    // Fallback to Quick Ratings if no race-by-race ratings
    if (quickRatings && quickRatings.length > 0) {
        const results: AverageRating[] = quickRatings.map(rating => ({
            driverId: rating.driverId,
            driverName: rating.driverName,
            constructorId: rating.constructorId,
            constructorName: rating.constructorName,
            averageRating: rating.rating,
            totalRaces: 1, // Quick rate counts as 1
            ratings: [rating.rating],
        }));

        return results.sort((a, b) => b.averageRating - a.averageRating);
    }

    return [];
}

// Clear all ratings for a season (both race-by-race and quick ratings)
export function clearSeasonRatings(season: string): void {
    try {
        // Clear race-by-race ratings
        const allRatings = getAllRatings();
        delete allRatings[season];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(allRatings));

        // Clear quick ratings
        const allQuickRatings = JSON.parse(localStorage.getItem(QUICK_RATINGS_KEY) || '{}');
        delete allQuickRatings[season];
        localStorage.setItem(QUICK_RATINGS_KEY, JSON.stringify(allQuickRatings));
        queueGuestSeasonDelete(season);
    } catch (error) {
        console.error('Error clearing season ratings:', error);
    }
}

// Clear all ratings
export function clearAllRatings(): void {
    try {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(QUICK_RATINGS_KEY);
        queueGuestClearAll();
    } catch (error) {
        console.error('Error clearing all ratings:', error);
    }
}

// Export ratings as JSON
export function exportRatings(season: string): string {
    const seasonRatings = getSeasonRatings(season);
    const quickRatings = getQuickRatings(season);

    const exportData = {
        version: 2,
        exportDate: new Date().toISOString(),
        season,
        raceRatings: seasonRatings,
        quickRatings: quickRatings,
    };

    return JSON.stringify(exportData, null, 2);
}

// Download ratings as JSON file
export function downloadRatingsAsJson(season: string): void {
    const jsonData = exportRatings(season);
    const blob = new Blob([jsonData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.download = `f1-ratings-${season}-${new Date().toISOString().split('T')[0]}.json`;
    link.href = url;
    link.click();

    URL.revokeObjectURL(url);
}

// Import ratings from JSON
export interface ImportResult {
    success: boolean;
    message: string;
    season?: string;
    racesImported?: number;
}

export function importRatings(jsonString: string): ImportResult {
    try {
        const data = JSON.parse(jsonString);

        // Validate structure
        if (typeof data.season !== 'string' || !/^\d{4}$/.test(data.season)) {
            return { success: false, message: 'Invalid file: missing season' };
        }

        const season = data.season;
        let racesImported = 0;

        const importedRatings = (ratings: DriverRating[]): DriverRating[] => {
            if (!Array.isArray(ratings)) throw new Error('Invalid ratings');
            const unique = new Map<string, DriverRating>();
            for (const rating of ratings) {
                if (!rating || !['driverId', 'driverName', 'constructorId', 'constructorName'].every(
                    key => typeof rating[key as keyof DriverRating] === 'string')) throw new Error('Invalid driver');
                if (rating.rating === 0) continue;
                if (!validRatings([rating]).length) throw new Error('Invalid score');
                unique.set(rating.driverId, { ...rating, communityEligible: false });
            }
            return [...unique.values()];
        };
        // Validate the entire import before changing any saved data.
        const importedRaces: RaceRatings[] | undefined = data.raceRatings?.races?.map((race: RaceRatings) => {
            if (!race || typeof race.round !== 'string' || !/^\d+$/.test(race.round)
                || typeof race.raceName !== 'string' || typeof race.date !== 'string') throw new Error('Invalid race');
            const ratings = importedRatings(race.ratings);
            return { ...race, ratings, completed: ratings.length > 0 };
        });
        const importedQuick = data.quickRatings ? importedRatings(data.quickRatings) : undefined;

        // Import race-by-race ratings
        if (importedRaces) {
            const allRatings = getAllRatings();
            allRatings[season] = { season, races: importedRaces };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(allRatings));
            queueGuestRaceSeasonDelete(season);
            queueGuestRatingChanges([], localEntries().filter(entry => entry.kind === 'race' && entry.season === season));
            racesImported = importedRaces.length;
        }

        // Import quick ratings
        if (importedQuick) {
            clearQuickRatings(season);
            saveQuickRatings(season, importedQuick);
        }
        notifyLocalRatings();

        return {
            success: true,
            message: `Successfully imported ${racesImported} races for ${season}`,
            season,
            racesImported
        };
    } catch (error) {
        console.error('Import error:', error);
        return { success: false, message: 'Invalid JSON file format' };
    }
}

// Quick Rate Storage Key
const QUICK_RATINGS_KEY = 'f1_quick_ratings';

// Save Quick Ratings for a season
export function saveQuickRatings(season: string, ratings: DriverRating[]): void {
    try {
        const before = localEntries();
        const allQuickRatings = getQuickRatingsAll();
        allQuickRatings[season] = validRatings(ratings);
        localStorage.setItem(QUICK_RATINGS_KEY, JSON.stringify(allQuickRatings));
        queueGuestRatingChanges(before, localEntries());
        notifyLocalRatings();
    } catch (error) {
        console.error('Error saving quick ratings:', error);
    }
}

export function saveQuickDriverRating(season: string, rating: DriverRating): void {
    if (!isValidRating(rating.rating)) return;
    saveQuickRatings(season, [
        ...(getQuickRatings(season) ?? []).filter(value => value.driverId !== rating.driverId),
        { ...rating, communityEligible: true },
    ]);
}

// Promote all existing personal Quick Rate scores for the season in one
// explicit action, preserving the original values.
export function markQuickRatingsCommunityEligible(season: string): number {
    const ratings = getQuickRatings(season) ?? [];
    const legacyCount = ratings.filter(rating => rating.communityEligible !== true).length;
    if (legacyCount === 0) return 0;
    saveQuickRatings(season, ratings.map(rating => ({
        ...rating,
        communityEligible: true,
    })));
    return legacyCount;
}

// Get all Quick Ratings
function getQuickRatingsAll(): Record<string, DriverRating[]> {
    try {
        const data = localStorage.getItem(QUICK_RATINGS_KEY);
        return data ? JSON.parse(data) : {};
    } catch (error) {
        console.error('Error reading quick ratings:', error);
        return {};
    }
}

// Get Quick Ratings for a season
export function getQuickRatings(season: string): DriverRating[] | null {
    const allQuickRatings = getQuickRatingsAll();
    return allQuickRatings[season] ? validRatings(allQuickRatings[season]) : null;
}

// Clear only the Quick Rate ratings for a season, including the cloud copy.
export function clearQuickRatings(season: string): void {
    try {
        const allQuickRatings = getQuickRatingsAll();
        delete allQuickRatings[season];
        localStorage.setItem(QUICK_RATINGS_KEY, JSON.stringify(allQuickRatings));
        queueGuestQuickSeasonDelete(season);
    } catch (error) {
        console.error('Error clearing quick ratings:', error);
    }
}

// Check if quick ratings exist for a season
export function hasQuickRatings(season: string): boolean {
    const ratings = getQuickRatings(season);
    return ratings !== null && ratings.length > 0;
}

function formatRaceDisplayName(raceName: string): string {
    return raceName.replace(' Grand Prix', '').replace(' GP', '');
}

// Get race-by-race matrix for GP table view
export interface RaceColumn {
    round: string;
    raceName: string;
    countryCode: string;
}

export interface DriverRow {
    driverId: string;
    driverName: string;
    constructorId: string;
    constructorName: string;
    totalAverage: number;
    raceRatings: Record<string, number>; // round -> rating
}

export interface DriverFormPoint {
    round: string;
    roundNumber: number;
    raceName: string;
    countryCode: string;
    date: string;
    rating: number | null;
    constructorId: string | null;
    constructorName: string | null;
}

export interface DriverFormSeries {
    driverId: string;
    driverName: string;
    latestConstructorId: string;
    latestConstructorName: string;
    seasonAverage: number;
    totalRatedRaces: number;
    bestRating: number | null;
    bestRaceName: string | null;
    worstRating: number | null;
    worstRaceName: string | null;
    changedTeams: boolean;
    points: DriverFormPoint[];
}

export function getRaceByRaceMatrix(season: string): { races: RaceColumn[]; drivers: DriverRow[] } {
    const seasonRatings = getSeasonRatings(season);

    if (!seasonRatings || seasonRatings.races.length === 0) {
        return { races: [], drivers: [] };
    }

    // Sort races by round number
    const sortedRaces = [...seasonRatings.races].sort((a, b) => parseInt(a.round) - parseInt(b.round));

    // Build race columns
    const races: RaceColumn[] = sortedRaces.map(race => ({
        round: race.round,
        raceName: formatRaceDisplayName(race.raceName),
        countryCode: getCountryCode(race.raceName),
    }));

    // Build driver rows
    const driverMap = new Map<string, DriverRow>();

    for (const race of sortedRaces) {
        for (const rating of validRatings(race.ratings)) {
            if (!driverMap.has(rating.driverId)) {
                driverMap.set(rating.driverId, {
                    driverId: rating.driverId,
                    driverName: rating.driverName,
                    constructorId: rating.constructorId,
                    constructorName: rating.constructorName,
                    totalAverage: 0,
                    raceRatings: {},
                });
            }
            const driverEntry = driverMap.get(rating.driverId)!;
            driverEntry.driverName = rating.driverName;
            driverEntry.constructorId = rating.constructorId;
            driverEntry.constructorName = rating.constructorName;
            driverEntry.raceRatings[race.round] = rating.rating;
        }
    }

    // Calculate averages and sort
    const drivers = Array.from(driverMap.values()).map(driver => {
        const ratings = Object.values(driver.raceRatings);
        driver.totalAverage = ratings.length > 0
            ? parseFloat((ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(2))
            : 0;
        return driver;
    }).sort((a, b) => b.totalAverage - a.totalAverage);

    return { races, drivers };
}

export function getDriverFormSeries(season: string): DriverFormSeries[] {
    const seasonRatings = getSeasonRatings(season);

    if (!seasonRatings || seasonRatings.races.length === 0) {
        return [];
    }

    const sortedRaces = [...seasonRatings.races]
        .filter(race => race.completed)
        .sort((a, b) => parseInt(a.round) - parseInt(b.round));

    if (sortedRaces.length === 0) {
        return [];
    }

    const driverMap = new Map<string, {
        driverId: string;
        driverName: string;
        latestConstructorId: string;
        latestConstructorName: string;
        teamIds: Set<string>;
        pointsByRound: Map<string, DriverFormPoint>;
        ratings: number[];
    }>();

    for (const race of sortedRaces) {
        for (const rating of validRatings(race.ratings)) {
            if (!driverMap.has(rating.driverId)) {
                driverMap.set(rating.driverId, {
                    driverId: rating.driverId,
                    driverName: rating.driverName,
                    latestConstructorId: rating.constructorId,
                    latestConstructorName: rating.constructorName,
                    teamIds: new Set<string>(),
                    pointsByRound: new Map<string, DriverFormPoint>(),
                    ratings: [],
                });
            }

            const driverEntry = driverMap.get(rating.driverId)!;
            driverEntry.latestConstructorId = rating.constructorId;
            driverEntry.latestConstructorName = rating.constructorName;
            driverEntry.teamIds.add(rating.constructorId);
            driverEntry.ratings.push(rating.rating);
            driverEntry.pointsByRound.set(race.round, {
                round: race.round,
                roundNumber: parseInt(race.round),
                raceName: race.raceName,
                countryCode: getCountryCode(race.raceName),
                date: race.date,
                rating: rating.rating,
                constructorId: rating.constructorId,
                constructorName: rating.constructorName,
            });
        }
    }

    const driverSeries = Array.from(driverMap.values())
        .map((driverEntry) => {
            const points = sortedRaces.map((race) => {
                return driverEntry.pointsByRound.get(race.round) ?? {
                    round: race.round,
                    roundNumber: parseInt(race.round),
                    raceName: race.raceName,
                    countryCode: getCountryCode(race.raceName),
                    date: race.date,
                    rating: null,
                    constructorId: null,
                    constructorName: null,
                };
            });

            const ratedPoints = points.filter((point) => point.rating !== null);
            const seasonAverage = ratedPoints.length > 0
                ? parseFloat((ratedPoints.reduce((sum, point) => sum + (point.rating ?? 0), 0) / ratedPoints.length).toFixed(2))
                : 0;
            const bestPoint = ratedPoints.reduce<DriverFormPoint | null>((best, point) => {
                if (!best || (point.rating ?? -Infinity) > (best.rating ?? -Infinity)) {
                    return point;
                }
                return best;
            }, null);
            const worstPoint = ratedPoints.reduce<DriverFormPoint | null>((worst, point) => {
                if (!worst || (point.rating ?? Infinity) < (worst.rating ?? Infinity)) {
                    return point;
                }
                return worst;
            }, null);

            return {
                driverId: driverEntry.driverId,
                driverName: driverEntry.driverName,
                latestConstructorId: driverEntry.latestConstructorId,
                latestConstructorName: driverEntry.latestConstructorName,
                seasonAverage,
                totalRatedRaces: ratedPoints.length,
                bestRating: bestPoint?.rating ?? null,
                bestRaceName: bestPoint?.raceName ?? null,
                worstRating: worstPoint?.rating ?? null,
                worstRaceName: worstPoint?.raceName ?? null,
                changedTeams: driverEntry.teamIds.size > 1,
                points,
            };
        });

    const constructorScores = new Map<string, {
        totalSeasonAverage: number;
        bestDriverAverage: number;
        constructorName: string;
    }>();

    for (const series of driverSeries) {
        const existing = constructorScores.get(series.latestConstructorId);

        if (existing) {
            existing.totalSeasonAverage += series.seasonAverage;
            existing.bestDriverAverage = Math.max(existing.bestDriverAverage, series.seasonAverage);
            continue;
        }

        constructorScores.set(series.latestConstructorId, {
            totalSeasonAverage: series.seasonAverage,
            bestDriverAverage: series.seasonAverage,
            constructorName: series.latestConstructorName,
        });
    }

    return driverSeries.sort((a, b) => {
            const aConstructor = constructorScores.get(a.latestConstructorId);
            const bConstructor = constructorScores.get(b.latestConstructorId);

            if ((bConstructor?.totalSeasonAverage ?? 0) !== (aConstructor?.totalSeasonAverage ?? 0)) {
                return (bConstructor?.totalSeasonAverage ?? 0) - (aConstructor?.totalSeasonAverage ?? 0);
            }

            if ((bConstructor?.bestDriverAverage ?? 0) !== (aConstructor?.bestDriverAverage ?? 0)) {
                return (bConstructor?.bestDriverAverage ?? 0) - (aConstructor?.bestDriverAverage ?? 0);
            }

            if (a.latestConstructorId !== b.latestConstructorId) {
                return (aConstructor?.constructorName ?? a.latestConstructorName).localeCompare(
                    bConstructor?.constructorName ?? b.latestConstructorName
                );
            }

            if (b.seasonAverage !== a.seasonAverage) {
                return b.seasonAverage - a.seasonAverage;
            }

            if (b.totalRatedRaces !== a.totalRatedRaces) {
                return b.totalRatedRaces - a.totalRatedRaces;
            }

            return a.driverName.localeCompare(b.driverName);
        });
}

// Helper to get country code from race name
export function getCountryCode(raceName: string): string {
    const mapping: Record<string, string> = {
        'Bahrain': 'BH',
        'Saudi Arabian': 'SA',
        'Australian': 'AU',
        'Japanese': 'JP',
        'Chinese': 'CN',
        'Miami': 'US',
        'Emilia Romagna': 'IT',
        'Monaco': 'MC',
        'Canadian': 'CA',
        'Spanish': 'ES',
        'Barcelona': 'ES',
        'Austrian': 'AT',
        'British': 'GB',
        'Hungarian': 'HU',
        'Belgian': 'BE',
        'Dutch': 'NL',
        'Italian': 'IT',
        'Azerbaijan': 'AZ',
        'Singapore': 'SG',
        'United States': 'US',
        'Mexico City': 'MX',
        'São Paulo': 'BR',
        'Las Vegas': 'US',
        'Qatar': 'QA',
        'Abu Dhabi': 'AE',
    };

    for (const [key, code] of Object.entries(mapping)) {
        if (raceName.includes(key)) return code;
    }
    return 'XX';
}

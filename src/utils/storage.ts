import type { SeasonRatings, RaceRatings, DriverRating, AverageRating } from '../types';

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
    return seasonRatings.races.find(r => r.round === round) || null;
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
            ratings,
            completed: true,
        };

        if (existingIndex >= 0) {
            allRatings[season].races[existingIndex] = raceRatings;
        } else {
            allRatings[season].races.push(raceRatings);
        }

        localStorage.setItem(STORAGE_KEY, JSON.stringify(allRatings));
    } catch (error) {
        console.error('Error saving ratings:', error);
    }
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

// Calculate average ratings for all drivers in a season
// Now tracks drivers PER CONSTRUCTOR to handle mid-season team changes
export function calculateAverages(season: string): AverageRating[] {
    const seasonRatings = getSeasonRatings(season);
    const quickRatings = getQuickRatings(season);

    // If we have race-by-race ratings, calculate from those
    if (seasonRatings && seasonRatings.races.length > 0) {
        // Use composite key: driverId_constructorId to track drivers per team
        const driverTeamMap = new Map<string, AverageRating>();

        for (const race of seasonRatings.races) {
            if (!race.completed) continue;

            for (const rating of race.ratings) {
                // Composite key: tracks same driver separately for each team they drove for
                const compositeKey = `${rating.driverId}_${rating.constructorId}`;

                if (!driverTeamMap.has(compositeKey)) {
                    driverTeamMap.set(compositeKey, {
                        driverId: rating.driverId,
                        driverName: rating.driverName,
                        constructorId: rating.constructorId,
                        constructorName: rating.constructorName,
                        averageRating: 0,
                        totalRaces: 0,
                        ratings: [],
                    });
                }

                const driverEntry = driverTeamMap.get(compositeKey)!;
                driverEntry.ratings.push(rating.rating);
                driverEntry.totalRaces++;
            }
        }

        // Calculate averages
        const results: AverageRating[] = [];
        for (const driverEntry of driverTeamMap.values()) {
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
    } catch (error) {
        console.error('Error clearing season ratings:', error);
    }
}

// Clear all ratings
export function clearAllRatings(): void {
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
        console.error('Error clearing all ratings:', error);
    }
}

// Export ratings as JSON
export function exportRatings(season: string): string {
    const seasonRatings = getSeasonRatings(season);
    const quickRatings = getQuickRatings(season);

    const exportData = {
        version: 1,
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
        if (!data.season) {
            return { success: false, message: 'Invalid file: missing season' };
        }

        const season = data.season;
        let racesImported = 0;

        // Import race-by-race ratings
        if (data.raceRatings && data.raceRatings.races) {
            const allRatings = getAllRatings();
            allRatings[season] = data.raceRatings;
            localStorage.setItem(STORAGE_KEY, JSON.stringify(allRatings));
            racesImported = data.raceRatings.races.length;
        }

        // Import quick ratings
        if (data.quickRatings && data.quickRatings.length > 0) {
            saveQuickRatings(season, data.quickRatings);
        }

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
        const allQuickRatings = getQuickRatingsAll();
        allQuickRatings[season] = ratings;
        localStorage.setItem(QUICK_RATINGS_KEY, JSON.stringify(allQuickRatings));
    } catch (error) {
        console.error('Error saving quick ratings:', error);
    }
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
    return allQuickRatings[season] || null;
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
        for (const rating of race.ratings) {
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
            driverMap.get(rating.driverId)!.raceRatings[race.round] = rating.rating;
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
        for (const rating of race.ratings) {
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

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
export function calculateAverages(season: string): AverageRating[] {
    const seasonRatings = getSeasonRatings(season);
    const quickRatings = getQuickRatings(season);

    // If we have race-by-race ratings, calculate from those
    if (seasonRatings && seasonRatings.races.length > 0) {
        const driverMap = new Map<string, AverageRating>();

        for (const race of seasonRatings.races) {
            if (!race.completed) continue;

            for (const rating of race.ratings) {
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

                const driver = driverMap.get(rating.driverId)!;
                driver.ratings.push(rating.rating);
                driver.totalRaces++;
            }
        }

        // Calculate averages
        const results: AverageRating[] = [];
        for (const driver of driverMap.values()) {
            const sum = driver.ratings.reduce((a, b) => a + b, 0);
            driver.averageRating = parseFloat((sum / driver.ratings.length).toFixed(2));
            results.push(driver);
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
    return JSON.stringify(seasonRatings, null, 2);
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
        raceName: race.raceName.replace(' Grand Prix', '').replace(' GP', ''),
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

// Helper to get country code from race name
function getCountryCode(raceName: string): string {
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

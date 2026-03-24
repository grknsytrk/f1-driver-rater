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

export type SeasonAwardId =
    | 'season_mvp'
    | 'consistency_king'
    | 'peak_performance'
    | 'form_surge'
    | 'toughest_slide'
    | 'hot_start'
    | 'strong_finish'
    | 'garage_boss'
    | 'best_team_pairing'
    | 'most_balanced_lineup'
    | 'late_season_charge';

export interface SeasonAwardWinner {
    subjectType: 'driver' | 'team';
    subjectName: string;
    secondaryLabel: string;
    constructorId: string;
    constructorName: string;
    metricValue: number;
    metricDisplay: string;
    detail: string;
    driverId?: string;
    driverName?: string;
}

export interface SeasonAward {
    id: SeasonAwardId;
    status: 'ready' | 'insufficient-data';
    winner: SeasonAwardWinner | null;
}

export interface SeasonAwardsSummary {
    season: string;
    ratedRaceCount: number;
    driverCount: number;
    awards: SeasonAward[];
}

interface AwardCandidate extends SeasonAwardWinner {
    tiebreakScore: number;
}

function formatAverage(value: number): string {
    return value.toFixed(2);
}

function formatRating(value: number): string {
    return value % 1 === 0 ? value.toFixed(0) : value.toFixed(1);
}

function formatRaceLabel(raceName: string): string {
    return raceName.replace(' Grand Prix', ' GP');
}

function buildDriverAwardWinner(
    series: DriverFormSeries,
    metricValue: number,
    metricDisplay: string,
    detail: string,
    secondaryLabel = series.latestConstructorName
): AwardCandidate {
    return {
        subjectType: 'driver',
        subjectName: series.driverName,
        secondaryLabel,
        constructorId: series.latestConstructorId,
        constructorName: series.latestConstructorName,
        metricValue,
        metricDisplay,
        detail,
        driverId: series.driverId,
        driverName: series.driverName,
        tiebreakScore: series.seasonAverage,
    };
}

function buildTeamAwardWinner(
    constructorId: string,
    constructorName: string,
    secondaryLabel: string,
    metricValue: number,
    metricDisplay: string,
    detail: string,
    tiebreakScore: number
): AwardCandidate {
    return {
        subjectType: 'team',
        subjectName: constructorName,
        secondaryLabel,
        constructorId,
        constructorName,
        metricValue,
        metricDisplay,
        detail,
        tiebreakScore,
    };
}

function pickAwardWinner(candidates: AwardCandidate[], direction: 'desc' | 'asc' = 'desc'): SeasonAwardWinner | null {
    if (candidates.length === 0) {
        return null;
    }

    const sorted = [...candidates].sort((a, b) => {
        if (a.metricValue !== b.metricValue) {
            return direction === 'desc'
                ? b.metricValue - a.metricValue
                : a.metricValue - b.metricValue;
        }

        if (a.tiebreakScore !== b.tiebreakScore) {
            return b.tiebreakScore - a.tiebreakScore;
        }

        return a.subjectName.localeCompare(b.subjectName);
    });

    const [winner] = sorted;
    return {
        subjectType: winner.subjectType,
        subjectName: winner.subjectName,
        secondaryLabel: winner.secondaryLabel,
        constructorId: winner.constructorId,
        constructorName: winner.constructorName,
        metricValue: winner.metricValue,
        metricDisplay: winner.metricDisplay,
        detail: winner.detail,
        driverId: winner.driverId,
        driverName: winner.driverName,
    };
}

function createAward(id: SeasonAwardId, winner: SeasonAwardWinner | null): SeasonAward {
    return {
        id,
        status: winner ? 'ready' : 'insufficient-data',
        winner,
    };
}

function calculateStandardDeviation(values: number[]): number {
    if (values.length === 0) {
        return Number.POSITIVE_INFINITY;
    }

    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / values.length;
    return Math.sqrt(variance);
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

export function getSeasonAwards(season: string): SeasonAwardsSummary {
    const seasonRatings = getSeasonRatings(season);
    const averages = calculateAverages(season);
    const formSeries = getDriverFormSeries(season);
    const sortedRaces = seasonRatings?.races
        ? [...seasonRatings.races]
            .filter(race => race.completed)
            .sort((a, b) => parseInt(a.round) - parseInt(b.round))
        : [];
    const formSeriesByDriver = new Map(formSeries.map((series) => [series.driverId, series]));
    const teamsByConstructor = new Map<string, typeof averages>();

    for (const average of averages) {
        const teamDrivers = teamsByConstructor.get(average.constructorId) ?? [];
        teamDrivers.push(average);
        teamsByConstructor.set(average.constructorId, teamDrivers);
    }

    const mvpWinner = pickAwardWinner(
        formSeries
            .filter(series => series.totalRatedRaces >= 3)
            .map(series => buildDriverAwardWinner(
                series,
                series.seasonAverage,
                `${formatAverage(series.seasonAverage)} AVG`,
                `${series.totalRatedRaces} rated races`
            ))
    );

    const consistencyWinner = pickAwardWinner(
        formSeries
            .filter(series => series.totalRatedRaces >= 4)
            .map((series) => {
                const ratings = series.points
                    .map(point => point.rating)
                    .filter((rating): rating is number => rating !== null);
                const deviation = calculateStandardDeviation(ratings);

                return buildDriverAwardWinner(
                    series,
                    deviation,
                    `σ ${deviation.toFixed(2)}`,
                    `${formatAverage(series.seasonAverage)} season avg`
                );
            }),
        'asc'
    );

    const peakPerformanceCandidates: AwardCandidate[] = [];
        for (const race of sortedRaces) {
            for (const rating of race.ratings) {
            const series = formSeriesByDriver.get(rating.driverId);
            if (!series) {
                continue;
            }

            peakPerformanceCandidates.push({
                subjectType: 'driver',
                subjectName: rating.driverName,
                secondaryLabel: rating.constructorName,
                constructorId: rating.constructorId,
                constructorName: rating.constructorName,
                metricValue: rating.rating,
                metricDisplay: `${formatRating(rating.rating)} RATING`,
                detail: formatRaceLabel(race.raceName),
                driverId: rating.driverId,
                driverName: rating.driverName,
                tiebreakScore: series.seasonAverage,
            });
        }
    }

    const peakPerformanceWinner = pickAwardWinner(peakPerformanceCandidates);

    const formSurgeWinner = pickAwardWinner(
        formSeries
            .filter(series => series.totalRatedRaces >= 3)
            .flatMap((series) => {
                const ratedPoints = series.points.filter((point) => point.rating !== null);
                const firstPoint = ratedPoints[0];
                const lastPoint = ratedPoints[ratedPoints.length - 1];

                if (!firstPoint || !lastPoint) {
                    return [];
                }

                const surge = (lastPoint.rating ?? 0) - (firstPoint.rating ?? 0);
                if (surge <= 0) {
                    return [];
                }

                return [buildDriverAwardWinner(
                    series,
                    surge,
                    `+${formatRating(surge)}`,
                    `${formatRaceLabel(firstPoint.raceName)} -> ${formatRaceLabel(lastPoint.raceName)}`
                )];
            })
    );

    const toughestSlideWinner = pickAwardWinner(
        formSeries
            .filter(series => series.totalRatedRaces >= 3)
            .flatMap((series) => {
                const ratedPoints = series.points.filter((point) => point.rating !== null);
                const firstPoint = ratedPoints[0];
                const lastPoint = ratedPoints[ratedPoints.length - 1];

                if (!firstPoint || !lastPoint) {
                    return [];
                }

                const slide = (firstPoint.rating ?? 0) - (lastPoint.rating ?? 0);
                if (slide <= 0) {
                    return [];
                }

                return [buildDriverAwardWinner(
                    series,
                    slide,
                    `-${formatRating(slide)}`,
                    `${formatRaceLabel(firstPoint.raceName)} -> ${formatRaceLabel(lastPoint.raceName)}`
                )];
            })
    );

    const hotStartWinner = pickAwardWinner(
        formSeries
            .filter(series => series.totalRatedRaces >= 3)
            .map((series) => {
                const openingThree = series.points
                    .filter((point) => point.rating !== null)
                    .slice(0, 3);
                const openingAverage = openingThree.reduce((sum, point) => sum + (point.rating ?? 0), 0) / openingThree.length;

                return buildDriverAwardWinner(
                    series,
                    openingAverage,
                    `${formatAverage(openingAverage)} AVG`,
                    'First 3 rated races'
                );
            })
    );

    const strongFinishWinner = pickAwardWinner(
        formSeries
            .filter(series => series.totalRatedRaces >= 3)
            .map((series) => {
                const closingThree = series.points
                    .filter((point) => point.rating !== null)
                    .slice(-3);
                const closingAverage = closingThree.reduce((sum, point) => sum + (point.rating ?? 0), 0) / closingThree.length;

                return buildDriverAwardWinner(
                    series,
                    closingAverage,
                    `${formatAverage(closingAverage)} AVG`,
                    'Last 3 rated races'
                );
            })
    );

    const teammateDuelMap = new Map<string, {
        driverId: string;
        driverName: string;
        constructorId: string;
        constructorName: string;
        wins: number;
        losses: number;
        ties: number;
        sharedRaces: number;
        totalGap: number;
        teammateNames: Set<string>;
    }>();

    for (const race of sortedRaces) {
        const raceTeams = new Map<string, typeof race.ratings>();
        for (const rating of race.ratings) {
            const entries = raceTeams.get(rating.constructorId) ?? [];
            entries.push(rating);
            raceTeams.set(rating.constructorId, entries);
        }

        for (const teamRatings of raceTeams.values()) {
            if (teamRatings.length !== 2) {
                continue;
            }

            const [driverA, driverB] = teamRatings;
            const pairings = [
                { driver: driverA, teammate: driverB },
                { driver: driverB, teammate: driverA },
            ];

            for (const pairing of pairings) {
                const key = `${pairing.driver.driverId}_${pairing.driver.constructorId}`;
                if (!teammateDuelMap.has(key)) {
                    teammateDuelMap.set(key, {
                        driverId: pairing.driver.driverId,
                        driverName: pairing.driver.driverName,
                        constructorId: pairing.driver.constructorId,
                        constructorName: pairing.driver.constructorName,
                        wins: 0,
                        losses: 0,
                        ties: 0,
                        sharedRaces: 0,
                        totalGap: 0,
                        teammateNames: new Set<string>(),
                    });
                }

                const duel = teammateDuelMap.get(key)!;
                duel.sharedRaces += 1;
                duel.totalGap += pairing.driver.rating - pairing.teammate.rating;
                duel.teammateNames.add(pairing.teammate.driverName);

                if (pairing.driver.rating > pairing.teammate.rating) {
                    duel.wins += 1;
                } else if (pairing.driver.rating < pairing.teammate.rating) {
                    duel.losses += 1;
                } else {
                    duel.ties += 1;
                }
            }
        }
    }

    const garageBossWinner = pickAwardWinner(
        Array.from(teammateDuelMap.values()).flatMap((duel) => {
            if (duel.sharedRaces < 3) {
                return [];
            }

            const averageGap = duel.totalGap / duel.sharedRaces;
            if (averageGap <= 0) {
                return [];
            }

            const series = formSeriesByDriver.get(duel.driverId);
            if (!series) {
                return [];
            }

            const teammateLabel = duel.teammateNames.size === 1
                ? `vs ${Array.from(duel.teammateNames)[0]}`
                : `${duel.sharedRaces} shared team races`;

            return [buildDriverAwardWinner(
                series,
                averageGap,
                `+${formatAverage(averageGap)} AVG GAP`,
                `${duel.wins}-${duel.losses}${duel.ties > 0 ? `-${duel.ties}` : ''} ${teammateLabel}`
            )];
        })
    );

    const bestTeamPairingWinner = pickAwardWinner(
        Array.from(teamsByConstructor.entries()).flatMap(([constructorId, drivers]) => {
            if (drivers.length < 2) {
                return [];
            }

            const primaryPair = [...drivers].sort((a, b) => {
                if (b.totalRaces !== a.totalRaces) {
                    return b.totalRaces - a.totalRaces;
                }
                if (b.averageRating !== a.averageRating) {
                    return b.averageRating - a.averageRating;
                }
                return a.driverName.localeCompare(b.driverName);
            }).slice(0, 2);

            if (primaryPair.length < 2) {
                return [];
            }

            const pairAverage = (primaryPair[0].averageRating + primaryPair[1].averageRating) / 2;

            return [buildTeamAwardWinner(
                constructorId,
                primaryPair[0].constructorName,
                `${primaryPair[0].driverName} + ${primaryPair[1].driverName}`,
                pairAverage,
                `${formatAverage(pairAverage)} PAIR AVG`,
                `${primaryPair[0].totalRaces}/${primaryPair[1].totalRaces} races rated`,
                pairAverage
            )];
        })
    );

    const mostBalancedLineupWinner = pickAwardWinner(
        Array.from(teamsByConstructor.entries()).flatMap(([constructorId, drivers]) => {
            if (drivers.length < 2) {
                return [];
            }

            const primaryPair = [...drivers].sort((a, b) => {
                if (b.totalRaces !== a.totalRaces) {
                    return b.totalRaces - a.totalRaces;
                }
                if (b.averageRating !== a.averageRating) {
                    return b.averageRating - a.averageRating;
                }
                return a.driverName.localeCompare(b.driverName);
            }).slice(0, 2);

            const gap = Math.abs(primaryPair[0].averageRating - primaryPair[1].averageRating);
            const pairAverage = (primaryPair[0].averageRating + primaryPair[1].averageRating) / 2;

            return [buildTeamAwardWinner(
                constructorId,
                primaryPair[0].constructorName,
                `${primaryPair[0].driverName} + ${primaryPair[1].driverName}`,
                gap,
                `Δ ${formatAverage(gap)}`,
                `Pair average ${formatAverage(pairAverage)}`,
                pairAverage
            )];
        }),
        'asc'
    );

    const lateSeasonChargeWinner = pickAwardWinner(
        Array.from(teamsByConstructor.entries()).flatMap(([constructorId, drivers]) => {
            if (drivers.length < 2 || sortedRaces.length < 3) {
                return [];
            }

            const closingRaces = sortedRaces.slice(-3);
            const closingTeamRatings = closingRaces.flatMap((race) => {
                const raceTeamRatings = race.ratings.filter((rating) => rating.constructorId === constructorId);
                if (raceTeamRatings.length === 0) {
                    return [];
                }

                const raceAverage = raceTeamRatings.reduce((sum, rating) => sum + rating.rating, 0) / raceTeamRatings.length;
                return [raceAverage];
            });

            if (closingTeamRatings.length < 3) {
                return [];
            }

            const closingAverage = closingTeamRatings.reduce((sum, value) => sum + value, 0) / closingTeamRatings.length;
            const primaryPair = [...drivers].sort((a, b) => b.totalRaces - a.totalRaces).slice(0, 2);

            return [buildTeamAwardWinner(
                constructorId,
                primaryPair[0].constructorName,
                `${primaryPair[0].driverName} + ${primaryPair[1].driverName}`,
                closingAverage,
                `${formatAverage(closingAverage)} CLOSE AVG`,
                'Last 3 completed races',
                closingAverage
            )];
        })
    );

    return {
        season,
        ratedRaceCount: sortedRaces.length,
        driverCount: formSeries.length,
        awards: [
            createAward('season_mvp', mvpWinner),
            createAward('consistency_king', consistencyWinner),
            createAward('peak_performance', peakPerformanceWinner),
            createAward('form_surge', formSurgeWinner),
            createAward('toughest_slide', toughestSlideWinner),
            createAward('hot_start', hotStartWinner),
            createAward('strong_finish', strongFinishWinner),
            createAward('garage_boss', garageBossWinner),
            createAward('best_team_pairing', bestTeamPairingWinner),
            createAward('most_balanced_lineup', mostBalancedLineupWinner),
            createAward('late_season_charge', lateSeasonChargeWinner),
        ],
    };
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

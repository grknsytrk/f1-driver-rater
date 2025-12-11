import axios from 'axios';
import type { Season, Race, RaceResult, Driver, Constructor } from '../types';

// Jolpica API - Ergast successor
const API_BASE = 'https://api.jolpi.ca/ergast/f1';

const api = axios.create({
    baseURL: API_BASE,
    timeout: 15000,
});

// Fetch available seasons (2020-current)
export async function getSeasons(): Promise<Season[]> {
    try {
        const response = await api.get('/seasons.json?limit=10&offset=70');
        const seasons = response.data.MRData.SeasonTable.Seasons as Season[];
        // Filter to recent seasons and reverse for newest first
        return seasons.filter(s => parseInt(s.season) >= 2020).reverse();
    } catch (error) {
        console.error('Error fetching seasons:', error);
        // Return fallback seasons
        return [
            { season: '2025', url: '' },
            { season: '2024', url: '' },
            { season: '2023', url: '' },
            { season: '2022', url: '' },
            { season: '2021', url: '' },
            { season: '2020', url: '' },
        ];
    }
}

// Fetch all races for a season
export async function getRaces(season: string): Promise<Race[]> {
    try {
        const response = await api.get(`/${season}.json`);
        return response.data.MRData.RaceTable.Races as Race[];
    } catch (error) {
        console.error(`Error fetching races for ${season}:`, error);
        return [];
    }
}

// Fetch race results with drivers
export async function getRaceResults(season: string, round: string): Promise<RaceResult[]> {
    try {
        const response = await api.get(`/${season}/${round}/results.json`);
        const races = response.data.MRData.RaceTable.Races as Race[];
        if (races.length > 0 && races[0].Results) {
            return races[0].Results;
        }
        return [];
    } catch (error) {
        console.error(`Error fetching results for ${season} round ${round}:`, error);
        return [];
    }
}

// Fetch all drivers for a season
export async function getDrivers(season: string): Promise<Driver[]> {
    try {
        const response = await api.get(`/${season}/drivers.json`);
        return response.data.MRData.DriverTable.Drivers as Driver[];
    } catch (error) {
        console.error(`Error fetching drivers for ${season}:`, error);
        return [];
    }
}

// Fetch all constructors for a season
export async function getConstructors(season: string): Promise<Constructor[]> {
    try {
        const response = await api.get(`/${season}/constructors.json`);
        return response.data.MRData.ConstructorTable.Constructors as Constructor[];
    } catch (error) {
        console.error(`Error fetching constructors for ${season}:`, error);
        return [];
    }
}

// Fetch driver standings
export async function getDriverStandings(season: string): Promise<any[]> {
    try {
        const response = await api.get(`/${season}/driverStandings.json`);
        return response.data.MRData.StandingsTable.StandingsLists[0]?.DriverStandings || [];
    } catch (error) {
        console.error(`Error fetching standings for ${season}:`, error);
        return [];
    }
}

// Check if a race has been completed (date is in the past)
export function isRaceCompleted(raceDate: string): boolean {
    const today = new Date();
    const race = new Date(raceDate);
    return race < today;
}

// Get drivers who participated in a specific race
export async function getRaceDrivers(season: string, round: string): Promise<Array<{
    driver: Driver;
    constructor: Constructor;
    position: string;
    time?: string;
    gap?: string;
    laps: string;
    status: string;
    grid: string;
}>> {
    const results = await getRaceResults(season, round);

    return results.map((result, index) => {
        let gap: string | undefined;

        // Check if driver was lapped (status contains "Lap" like "+1 Lap", "+2 Laps")
        if (result.status && result.status.includes('Lap')) {
            gap = result.status; // Shows "+1 Lap", "+2 Laps", etc.
        }
        // Check for DNF situations
        else if (result.status && result.status !== 'Finished' && !result.Time?.time) {
            gap = result.status; // Shows "Collision", "Engine", "Retired", etc.
        }
        // Winner - show their finish time
        else if (index === 0) {
            gap = result.Time?.time;
        }
        // Normal finishers - show gap to leader
        else if (result.Time?.time) {
            // API returns gap to leader as "+X.XXX" or "+1:XX.XXX"
            gap = result.Time.time;
        }

        return {
            driver: result.Driver,
            constructor: result.Constructor,
            position: result.position,
            time: result.Time?.time,
            gap,
            laps: result.laps,
            status: result.status,
            grid: result.grid,
        };
    });
}

// Get all drivers for a season with their constructor (for Quick Rate)
export async function getSeasonDrivers(season: string): Promise<Array<{
    driverId: string;
    givenName: string;
    familyName: string;
    constructorId: string;
    constructorName: string;
}>> {
    try {
        const standings = await getDriverStandings(season);

        return standings.map((standing: any) => ({
            driverId: standing.Driver.driverId,
            givenName: standing.Driver.givenName,
            familyName: standing.Driver.familyName,
            constructorId: standing.Constructors?.[0]?.constructorId || 'unknown',
            constructorName: standing.Constructors?.[0]?.name || 'Unknown',
        }));
    } catch (error) {
        console.error(`Error fetching season drivers for ${season}:`, error);
        return [];
    }
}

// Get driver statistics for a season (wins, poles, podiums)
export interface DriverSeasonStats {
    driverId: string;
    driverName: string;
    constructorId: string;
    constructorName: string;
    position: string;
    points: string;
    wins: number;
    poles: number;
    podiums: number;
}

// Helper function to fetch all paginated results from Jolpica API
// The API has a max limit of 100 per request, so we need pagination
async function fetchAllPaginated(endpoint: string): Promise<any[]> {
    const allRaces: any[] = [];
    let offset = 0;
    const limit = 100; // API max limit
    let hasMore = true;

    while (hasMore) {
        const response = await api.get(`${endpoint}?limit=${limit}&offset=${offset}`);
        const races = response.data.MRData.RaceTable?.Races || [];
        const total = parseInt(response.data.MRData.total) || 0;

        allRaces.push(...races);
        offset += limit;

        // Check if we've fetched all available data
        hasMore = offset < total && races.length > 0;
    }

    return allRaces;
}

export async function getDriverSeasonStats(season: string): Promise<DriverSeasonStats[]> {
    try {
        // Fetch standings (This is reliable for Points, Position and Wins)
        const standings = await getDriverStandings(season);

        // Fetch ALL race results for podiums using pagination
        const allRaces = await fetchAllPaginated(`/${season}/results.json`);

        // Fetch ALL qualifying results for poles using pagination
        const allQualifying = await fetchAllPaginated(`/${season}/qualifying.json`);

        // Map to store calculated stats
        const driverStats: Map<string, { poles: number; podiums: number }> = new Map();

        // Initialize map for all drivers in standings
        standings.forEach((standing: any) => {
            driverStats.set(standing.Driver.driverId, { poles: 0, podiums: 0 });
        });

        // Calculate Podiums (Position 1, 2, 3)
        allRaces.forEach((race: any) => {
            const results = race.Results || [];
            results.forEach((result: any) => {
                const pos = parseInt(result.position);
                if (pos >= 1 && pos <= 3) {
                    const driverId = result.Driver.driverId;
                    const stats = driverStats.get(driverId);
                    if (stats) {
                        stats.podiums += 1;
                        driverStats.set(driverId, stats);
                    }
                }
            });
        });

        // Calculate Poles (Qualifying Position 1)
        allQualifying.forEach((race: any) => {
            const qualifyingResults = race.QualifyingResults || [];
            const poleDriver = qualifyingResults.find((r: any) => r.position === '1');

            if (poleDriver) {
                const driverId = poleDriver.Driver.driverId;
                const stats = driverStats.get(driverId);
                if (stats) {
                    stats.poles += 1;
                    driverStats.set(driverId, stats);
                }
            }
        });

        // Merge reliable standings data with calculated stats
        return standings.map((standing: any) => {
            const driverId = standing.Driver.driverId;
            const stats = driverStats.get(driverId) || { poles: 0, podiums: 0 };

            return {
                driverId,
                driverName: `${standing.Driver.givenName} ${standing.Driver.familyName}`,
                constructorId: standing.Constructors?.[0]?.constructorId || 'unknown',
                constructorName: standing.Constructors?.[0]?.name || 'Unknown',
                position: standing.position,
                points: standing.points,
                wins: parseInt(standing.wins) || 0, // Trust the API for wins
                poles: stats.poles,
                podiums: stats.podiums,
            };
        });

    } catch (error) {
        console.error(`Error calculating driver stats for ${season}:`, error);
        return [];
    }
}

// Get all race results for a season (for H2H calculations)
export interface SeasonRaceResult {
    round: string;
    driverId: string;
    constructorId: string;
    position: number | null; // null = DNF/DSQ
    status: string;
}

export async function getAllSeasonResults(season: string): Promise<SeasonRaceResult[]> {
    try {
        const allRaces = await fetchAllPaginated(`/${season}/results.json`);
        const results: SeasonRaceResult[] = [];

        allRaces.forEach((race: any) => {
            race.Results?.forEach((result: any) => {
                const positionText = result.positionText;
                // R = Retired, D = Disqualified, E = Excluded, W = Withdrew, F = Failed to qualify, N = Not classified
                const isClassified = !['R', 'D', 'E', 'W', 'F', 'N'].includes(positionText);

                results.push({
                    round: race.round,
                    driverId: result.Driver.driverId,
                    constructorId: result.Constructor.constructorId,
                    position: isClassified ? parseInt(result.position) : null,
                    status: result.status
                });
            });
        });

        return results;
    } catch (error) {
        console.error(`Error fetching season results for ${season}:`, error);
        return [];
    }
}

// Get all qualifying results for a season (for H2H calculations)
export interface SeasonQualifyingResult {
    round: string;
    driverId: string;
    constructorId: string;
    position: number;
}

export async function getAllSeasonQualifying(season: string): Promise<SeasonQualifyingResult[]> {
    try {
        const allQualifying = await fetchAllPaginated(`/${season}/qualifying.json`);
        const results: SeasonQualifyingResult[] = [];

        allQualifying.forEach((race: any) => {
            race.QualifyingResults?.forEach((result: any) => {
                results.push({
                    round: race.round,
                    driverId: result.Driver.driverId,
                    constructorId: result.Constructor.constructorId,
                    position: parseInt(result.position)
                });
            });
        });

        return results;
    } catch (error) {
        console.error(`Error fetching season qualifying for ${season}:`, error);
        return [];
    }
}
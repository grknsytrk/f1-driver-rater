import type { CommunityRating } from './communityRatings';
import type { DriverRow, RaceColumn } from './storage';

export interface CommunityBreakdownDriver extends DriverRow {
    voteCounts: Record<string, number>;
}

/** Keep the personal table's races and drivers so the two views remain comparable. */
export function buildCommunityBreakdownDrivers(
    races: RaceColumn[], drivers: DriverRow[], ratings: CommunityRating[],
): CommunityBreakdownDriver[] {
    const rounds = new Set(races.map(race => race.round));
    const driverIds = new Set(drivers.map(driver => driver.driverId));
    const byDriver = new Map<string, Map<string, CommunityRating>>();

    for (const rating of ratings) {
        if (!rating.round || !rounds.has(rating.round) || !driverIds.has(rating.driverId)
            || rating.voteCount <= 0 || !Number.isFinite(rating.averageRating)) continue;
        const byRound = byDriver.get(rating.driverId) ?? new Map<string, CommunityRating>();
        byRound.set(rating.round, rating);
        byDriver.set(rating.driverId, byRound);
    }

    return drivers.map(driver => {
        const entries = [...(byDriver.get(driver.driverId)?.entries() ?? [])];
        const raceRatings = Object.fromEntries(entries.map(([round, rating]) => [round, rating.averageRating]));
        const voteCounts = Object.fromEntries(entries.map(([round, rating]) => [round, rating.voteCount]));
        const values = Object.values(raceRatings);
        return {
            ...driver,
            raceRatings,
            voteCounts,
            totalAverage: values.length ? values.reduce((sum, rating) => sum + rating, 0) / values.length : 0,
        };
    });
}

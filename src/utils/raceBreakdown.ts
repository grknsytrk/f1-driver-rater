import type { CommunityRating } from './communityRatings';
import type { DriverRow, RaceColumn } from './storage';

export type BreakdownDriverIdentity = Pick<DriverRow, 'driverId' | 'driverName' | 'constructorId' | 'constructorName'>;

export interface CommunityBreakdownDriver extends DriverRow {
    voteCounts: Record<string, number>;
}

export interface CommunityBreakdown {
    races: RaceColumn[];
    drivers: CommunityBreakdownDriver[];
}

/** Include every round with community votes, including races the viewer has not rated. */
export function buildCommunityBreakdown(
    personalRaces: RaceColumn[], personalDrivers: DriverRow[], ratings: CommunityRating[],
    calendar: RaceColumn[] = [], seasonDrivers: BreakdownDriverIdentity[] = [],
): CommunityBreakdown {
    const byDriver = new Map<string, Map<string, CommunityRating>>();
    const rounds = new Set<string>();

    for (const rating of ratings) {
        if (!rating.round || !/^[1-9][0-9]{0,2}$/.test(rating.round)
            || !Number.isSafeInteger(rating.voteCount) || rating.voteCount <= 0
            || !Number.isFinite(rating.averageRating) || rating.averageRating < 0.5 || rating.averageRating > 10) continue;
        rounds.add(rating.round);
        const byRound = byDriver.get(rating.driverId) ?? new Map<string, CommunityRating>();
        byRound.set(rating.round, rating);
        byDriver.set(rating.driverId, byRound);
    }

    const personalRaceByRound = new Map(personalRaces.map(race => [race.round, race]));
    const calendarByRound = new Map(calendar.map(race => [race.round, race]));
    const races = [...rounds].sort((a, b) => Number(a) - Number(b)).map(round =>
        calendarByRound.get(round) ?? personalRaceByRound.get(round)
        ?? { round, raceName: `Round ${round}`, countryCode: 'XX' });

    const personalDriverById = new Map(personalDrivers.map(driver => [driver.driverId, driver]));
    const seasonDriverById = new Map(seasonDrivers.map(driver => [driver.driverId, driver]));
    const drivers = [...byDriver].map(([driverId, byRound]) => {
        const identity = personalDriverById.get(driverId) ?? seasonDriverById.get(driverId);
        const entries = [...byRound];
        const raceRatings = Object.fromEntries(entries.map(([round, rating]) => [round, rating.averageRating]));
        const voteCounts = Object.fromEntries(entries.map(([round, rating]) => [round, rating.voteCount]));
        const values = Object.values(raceRatings);
        return {
            driverId,
            driverName: identity?.driverName ?? driverId.replace(/[_-]/g, ' '),
            constructorId: identity?.constructorId ?? 'unknown',
            constructorName: identity?.constructorName ?? 'Unknown team',
            raceRatings,
            voteCounts,
            totalAverage: values.reduce((sum, rating) => sum + rating, 0) / values.length,
        };
    });

    return { races, drivers };
}

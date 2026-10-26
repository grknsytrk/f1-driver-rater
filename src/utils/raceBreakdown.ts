import type { AverageRating } from '../types';
import type { CommunityRating } from './communityRatings';
import type { DriverFormPoint, DriverFormSeries, DriverRow, RaceColumn } from './storage';

export type BreakdownDriverIdentity = Pick<DriverRow, 'driverId' | 'driverName' | 'constructorId' | 'constructorName'>;

export interface CommunityBreakdownDriver extends DriverRow {
    voteCounts: Record<string, number>;
}

export interface CommunityBreakdown {
    races: RaceColumn[];
    drivers: CommunityBreakdownDriver[];
}

/** Use completed calendar races as columns, including rounds with no votes. */
export function buildCommunityBreakdown(
    personalRaces: RaceColumn[], personalDrivers: DriverRow[], ratings: CommunityRating[],
    calendar: RaceColumn[] = [], seasonDrivers: BreakdownDriverIdentity[] = [],
): CommunityBreakdown {
    const byDriver = new Map<string, Map<string, CommunityRating>>();
    const calendarByRound = new Map(calendar.map(race => [race.round, race]));
    const rounds = new Set(calendar.length ? calendarByRound.keys() : personalRaces.map(race => race.round));

    for (const rating of ratings) {
        if (!rating.round || !/^[1-9][0-9]{0,2}$/.test(rating.round)
            || !Number.isSafeInteger(rating.voteCount) || rating.voteCount <= 0
            || !Number.isFinite(rating.averageRating) || rating.averageRating < 0.5 || rating.averageRating > 10
            || (calendar.length > 0 && !calendarByRound.has(rating.round))) continue;
        rounds.add(rating.round);
        const byRound = byDriver.get(rating.driverId) ?? new Map<string, CommunityRating>();
        byRound.set(rating.round, rating);
        byDriver.set(rating.driverId, byRound);
    }

    const personalRaceByRound = new Map(personalRaces.map(race => [race.round, race]));
    const races = [...rounds].sort((a, b) => Number(a) - Number(b)).map(round =>
        calendarByRound.get(round) ?? personalRaceByRound.get(round)
        ?? { round, raceName: `Round ${round}`, countryCode: 'XX' });

    const personalDriverById = new Map(personalDrivers.map(driver => [driver.driverId, driver]));
    const seasonDriverById = new Map(seasonDrivers.map(driver => [driver.driverId, driver]));
    const driverIds = new Set([...personalDriverById.keys(), ...seasonDriverById.keys(), ...byDriver.keys()]);
    const drivers = [...driverIds].map(driverId => {
        const identity = personalDriverById.get(driverId) ?? seasonDriverById.get(driverId);
        const entries = [...(byDriver.get(driverId) ?? [])];
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
            totalAverage: values.length ? values.reduce((sum, rating) => sum + rating, 0) / values.length : 0,
        };
    });

    return { races, drivers };
}

export function buildCommunitySeasonAverages(
    communityDrivers: CommunityBreakdownDriver[],
    votedRacesCount: number,
    quickRatings: CommunityRating[] = [],
    identities: BreakdownDriverIdentity[] = [],
): AverageRating[] {
    const minimumRaces = votedRacesCount > 0 ? Math.ceil(votedRacesCount * 0.5) : 0;
    const driversWithRaces = communityDrivers.filter(driver => Object.keys(driver.raceRatings).length > 0);

    if (driversWithRaces.length > 0) {
        return [...driversWithRaces]
            .sort((a, b) => {
                const aCount = Object.keys(a.raceRatings).length;
                const bCount = Object.keys(b.raceRatings).length;
                const aQual = aCount >= minimumRaces;
                const bQual = bCount >= minimumRaces;
                if (aQual !== bQual) return aQual ? -1 : 1;
                if (b.totalAverage !== a.totalAverage) return b.totalAverage - a.totalAverage;
                return bCount - aCount;
            })
            .map(driver => {
                const ratings = Object.entries(driver.raceRatings)
                    .sort(([roundA], [roundB]) => Number(roundA) - Number(roundB))
                    .map(([, rating]) => rating);
                return {
                    driverId: driver.driverId,
                    driverName: driver.driverName,
                    constructorId: driver.constructorId,
                    constructorName: driver.constructorName,
                    averageRating: parseFloat(driver.totalAverage.toFixed(2)),
                    totalRaces: ratings.length,
                    ratings,
                };
            });
    }

    const identityById = new Map(identities.map(item => [item.driverId, item]));
    return quickRatings
        .filter(row => row.voteCount > 0 && Number.isFinite(row.averageRating))
        .sort((a, b) => b.averageRating - a.averageRating || b.voteCount - a.voteCount)
        .map(row => {
            const identity = identityById.get(row.driverId);
            return {
                driverId: row.driverId,
                driverName: identity?.driverName ?? row.driverId.replace(/[_-]/g, ' '),
                constructorId: identity?.constructorId ?? 'unknown',
                constructorName: identity?.constructorName ?? 'Unknown team',
                averageRating: parseFloat(row.averageRating.toFixed(2)),
                totalRaces: 1,
                ratings: [row.averageRating],
            };
        });
}

export function buildCommunityFormSeries(
    communityDrivers: CommunityBreakdownDriver[],
    races: Array<RaceColumn & { date?: string }>,
): DriverFormSeries[] {
    const votedRaces = races.filter(race =>
        communityDrivers.some(driver => driver.raceRatings[race.round] !== undefined),
    );
    if (votedRaces.length === 0) return [];

    const minimumRatedRaces = Math.ceil(votedRaces.length * 0.5);

    return communityDrivers
        .filter(driver => Object.keys(driver.raceRatings).length > 0)
        .map(driver => {
            const points: DriverFormPoint[] = votedRaces.map(race => {
                const rawRating = driver.raceRatings[race.round];
                const hasScore = rawRating !== undefined && rawRating > 0;
                return {
                    round: race.round,
                    roundNumber: parseInt(race.round, 10) || 0,
                    raceName: race.raceName,
                    countryCode: race.countryCode,
                    date: race.date ?? '',
                    rating: hasScore ? parseFloat(rawRating.toFixed(2)) : null,
                    constructorId: hasScore ? driver.constructorId : null,
                    constructorName: hasScore ? driver.constructorName : null,
                };
            });

            const ratedPoints = points.filter(point => point.rating !== null);
            const seasonAverage = ratedPoints.length > 0
                ? parseFloat((ratedPoints.reduce((sum, point) => sum + (point.rating ?? 0), 0) / ratedPoints.length).toFixed(2))
                : 0;
            const bestPoint = ratedPoints.reduce<DriverFormPoint | null>((best, point) => {
                if (!best || (point.rating ?? -Infinity) > (best.rating ?? -Infinity)) return point;
                return best;
            }, null);
            const worstPoint = ratedPoints.reduce<DriverFormPoint | null>((worst, point) => {
                if (!worst || (point.rating ?? Infinity) < (worst.rating ?? Infinity)) return point;
                return worst;
            }, null);

            return {
                driverId: driver.driverId,
                driverName: driver.driverName,
                latestConstructorId: driver.constructorId,
                latestConstructorName: driver.constructorName,
                seasonAverage,
                totalRatedRaces: ratedPoints.length,
                bestRating: bestPoint?.rating ?? null,
                bestRaceName: bestPoint?.raceName ?? null,
                worstRating: worstPoint?.rating ?? null,
                worstRaceName: worstPoint?.raceName ?? null,
                changedTeams: false,
                points,
            };
        })
        .sort((a, b) => {
            const aQualified = a.totalRatedRaces >= minimumRatedRaces;
            const bQualified = b.totalRatedRaces >= minimumRatedRaces;
            if (aQualified !== bQualified) return aQualified ? -1 : 1;
            if (b.seasonAverage !== a.seasonAverage) return b.seasonAverage - a.seasonAverage;
            return b.totalRatedRaces - a.totalRatedRaces;
        });
}

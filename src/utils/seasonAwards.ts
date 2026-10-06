import type { SeasonRaceResult } from '../api/f1Api';
import type { CommunityRating } from './communityRatings';

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
    completedRaceCount: number;
    driverCount: number;
    awards: SeasonAward[];
}

interface AwardCandidate extends SeasonAwardWinner {
    tiebreakScore: number;
}

interface AwardPoint {
    driverId: string;
    driverName: string;
    round: string;
    roundNumber: number;
    raceName: string;
    date: string;
    rating: number;
    constructorId: string;
    constructorName: string;
}

interface DriverSeries {
    driverId: string;
    driverName: string;
    latestConstructorId: string;
    latestConstructorName: string;
    seasonAverage: number;
    points: AwardPoint[];
}

interface RatedRace {
    round: string;
    roundNumber: number;
    raceName: string;
    date: string;
    resultsByDriver: Map<string, SeasonRaceResult>;
    ratings: AwardPoint[];
}

interface TeamDriverStats {
    driverId: string;
    driverName: string;
    constructorId: string;
    constructorName: string;
    totalRatedRaces: number;
    averageRating: number;
}

function normalizeRound(round: string): string {
    const roundNumber = Number.parseInt(round, 10);
    return Number.isFinite(roundNumber) ? String(roundNumber) : round;
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
    series: DriverSeries,
    metricValue: number,
    metricDisplay: string,
    detail: string,
    constructor = { id: series.latestConstructorId, name: series.latestConstructorName },
    secondaryLabel = constructor.name
): AwardCandidate {
    return {
        subjectType: 'driver',
        subjectName: series.driverName,
        secondaryLabel,
        constructorId: constructor.id,
        constructorName: constructor.name,
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
    if (candidates.length === 0) return null;

    const sorted = [...candidates].sort((a, b) => {
        if (a.metricValue !== b.metricValue) {
            return direction === 'desc' ? b.metricValue - a.metricValue : a.metricValue - b.metricValue;
        }
        if (a.tiebreakScore !== b.tiebreakScore) return b.tiebreakScore - a.tiebreakScore;
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
    return { id, status: winner ? 'ready' : 'insufficient-data', winner };
}

function calculateStandardDeviation(values: number[]): number {
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / values.length;
    return Math.sqrt(variance);
}

function getPrimaryPair(drivers: readonly TeamDriverStats[]): TeamDriverStats[] {
    return [...drivers]
        .sort((a, b) => b.totalRatedRaces - a.totalRatedRaces
            || b.averageRating - a.averageRating
            || a.driverName.localeCompare(b.driverName))
        .slice(0, 2);
}

/** Builds season awards exclusively from race-level community averages. */
export function buildCommunitySeasonAwards(
    season: string,
    raceResults: SeasonRaceResult[],
    communityRatings: CommunityRating[]
): SeasonAwardsSummary {
    const racesByRound = new Map<string, RatedRace>();
    for (const result of raceResults) {
        const round = normalizeRound(result.round);
        let race = racesByRound.get(round);
        if (!race) {
            race = {
                round,
                roundNumber: Number.parseInt(round, 10),
                raceName: result.raceName,
                date: result.date,
                resultsByDriver: new Map(),
                ratings: [],
            };
            racesByRound.set(round, race);
        }
        if (!race.resultsByDriver.has(result.driverId)) race.resultsByDriver.set(result.driverId, result);
    }

    const sortedRaces = [...racesByRound.values()].sort((a, b) => a.roundNumber - b.roundNumber);
    const communityRatingKeys = new Set<string>();
    for (const communityRating of communityRatings) {
        const roundValue = communityRating.round;
        if (!roundValue || !Number.isFinite(communityRating.averageRating)
            || communityRating.averageRating < 0.5 || communityRating.averageRating > 10
            || !Number.isSafeInteger(communityRating.voteCount) || communityRating.voteCount < 1) continue;

        const round = normalizeRound(roundValue);
        const race = racesByRound.get(round);
        const result = race?.resultsByDriver.get(communityRating.driverId);
        if (!race || !result) continue;

        const key = `${round}:${communityRating.driverId}`;
        if (communityRatingKeys.has(key)) continue;
        communityRatingKeys.add(key);
        race.ratings.push({
            driverId: result.driverId,
            driverName: result.driverName,
            round,
            roundNumber: race.roundNumber,
            raceName: race.raceName,
            date: race.date,
            rating: communityRating.averageRating,
            constructorId: result.constructorId,
            constructorName: result.constructorName,
        });
    }

    for (const race of sortedRaces) race.ratings.sort((a, b) => a.driverName.localeCompare(b.driverName));

    const driversById = new Map<string, DriverSeries>();
    const teamDriversByConstructor = new Map<string, Map<string, TeamDriverStats>>();
    for (const race of sortedRaces) {
        for (const rating of race.ratings) {
            const result = race.resultsByDriver.get(rating.driverId);
            if (!result) continue;
            let series = driversById.get(result.driverId);
            if (!series) {
                series = {
                    driverId: result.driverId,
                    driverName: result.driverName,
                    latestConstructorId: result.constructorId,
                    latestConstructorName: result.constructorName,
                    seasonAverage: 0,
                    points: [],
                };
                driversById.set(result.driverId, series);
            }
            series.driverName = result.driverName;
            series.latestConstructorId = result.constructorId;
            series.latestConstructorName = result.constructorName;
            series.points.push({ ...rating, driverId: result.driverId, driverName: result.driverName });

            const teamDrivers = teamDriversByConstructor.get(result.constructorId) ?? new Map<string, TeamDriverStats>();
            let teamDriver = teamDrivers.get(result.driverId);
            if (!teamDriver) {
                teamDriver = {
                    driverId: result.driverId,
                    driverName: result.driverName,
                    constructorId: result.constructorId,
                    constructorName: result.constructorName,
                    totalRatedRaces: 0,
                    averageRating: 0,
                };
                teamDrivers.set(result.driverId, teamDriver);
                teamDriversByConstructor.set(result.constructorId, teamDrivers);
            }
            teamDriver.totalRatedRaces += 1;
            teamDriver.averageRating += rating.rating;
        }
    }

    for (const series of driversById.values()) {
        series.points.sort((a, b) => a.roundNumber - b.roundNumber);
        series.seasonAverage = Number((series.points.reduce((sum, point) => sum + point.rating, 0) / series.points.length).toFixed(2));
    }
    for (const teamDrivers of teamDriversByConstructor.values()) {
        for (const driver of teamDrivers.values()) driver.averageRating /= driver.totalRatedRaces;
    }

    const formSeries = [...driversById.values()];
    const formSeriesByDriver = new Map(formSeries.map(series => [series.driverId, series]));
    const ratedRaces = sortedRaces.filter(race => race.ratings.length > 0);

    const mvpWinner = pickAwardWinner(formSeries
        .filter(series => series.points.length >= 3)
        .map(series => buildDriverAwardWinner(
            series, series.seasonAverage, `${formatAverage(series.seasonAverage)} AVG`, `${series.points.length} community-rated races`
        )));

    const consistencyWinner = pickAwardWinner(formSeries
        .filter(series => series.points.length >= 4)
        .map(series => {
            const deviation = calculateStandardDeviation(series.points.map(point => point.rating));
            return buildDriverAwardWinner(
                series, deviation, `σ ${deviation.toFixed(2)}`, `${formatAverage(series.seasonAverage)} season avg`
            );
        }), 'asc');

    const peakPerformanceWinner = pickAwardWinner(sortedRaces.flatMap(race => race.ratings.map(rating => {
        const series = formSeriesByDriver.get(rating.driverId);
        const result = race.resultsByDriver.get(rating.driverId);
        if (!series || !result) return null;
        return buildDriverAwardWinner(
            series,
            rating.rating,
            `${formatRating(rating.rating)} RATING`,
            formatRaceLabel(race.raceName),
            { id: result.constructorId, name: result.constructorName },
        );
    }).filter((candidate): candidate is AwardCandidate => candidate !== null)));

    const formSurgeWinner = pickAwardWinner(formSeries.flatMap(series => {
        if (series.points.length < 3) return [];
        const firstPoint = series.points[0];
        const lastPoint = series.points[series.points.length - 1];
        const surge = lastPoint.rating - firstPoint.rating;
        if (surge <= 0) return [];
        return [buildDriverAwardWinner(
            series, surge, `+${formatRating(surge)}`,
            `${formatRaceLabel(firstPoint.raceName)} -> ${formatRaceLabel(lastPoint.raceName)}`
        )];
    }));

    const toughestSlideWinner = pickAwardWinner(formSeries.flatMap(series => {
        if (series.points.length < 3) return [];
        const firstPoint = series.points[0];
        const lastPoint = series.points[series.points.length - 1];
        const slide = firstPoint.rating - lastPoint.rating;
        if (slide <= 0) return [];
        return [buildDriverAwardWinner(
            series, slide, `-${formatRating(slide)}`,
            `${formatRaceLabel(firstPoint.raceName)} -> ${formatRaceLabel(lastPoint.raceName)}`
        )];
    }));

    const hotStartWinner = pickAwardWinner(formSeries
        .filter(series => series.points.length >= 3)
        .map(series => {
            const firstThree = series.points.slice(0, 3);
            const average = firstThree.reduce((sum, point) => sum + point.rating, 0) / firstThree.length;
            return buildDriverAwardWinner(series, average, `${formatAverage(average)} AVG`, 'First 3 community-rated races');
        }));

    const strongFinishWinner = pickAwardWinner(formSeries
        .filter(series => series.points.length >= 3)
        .map(series => {
            const lastThree = series.points.slice(-3);
            const average = lastThree.reduce((sum, point) => sum + point.rating, 0) / lastThree.length;
            return buildDriverAwardWinner(series, average, `${formatAverage(average)} AVG`, 'Last 3 community-rated races');
        }));

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
        const raceTeams = new Map<string, AwardPoint[]>();
        for (const rating of race.ratings) {
            const teamRatings = raceTeams.get(rating.constructorId) ?? [];
            teamRatings.push(rating);
            raceTeams.set(rating.constructorId, teamRatings);
        }
        for (const [constructorId, teamRatings] of raceTeams) {
            if (teamRatings.length !== 2) continue;
            const [driverA, driverB] = teamRatings;
            for (const [driver, teammate] of [[driverA, driverB], [driverB, driverA]] as const) {
                const result = race.resultsByDriver.get(driver.driverId);
                if (!result) continue;
                const key = `${driver.driverId}_${constructorId}`;
                const duel = teammateDuelMap.get(key) ?? {
                    driverId: driver.driverId,
                    driverName: result.driverName,
                    constructorId,
                    constructorName: result.constructorName,
                    wins: 0,
                    losses: 0,
                    ties: 0,
                    sharedRaces: 0,
                    totalGap: 0,
                    teammateNames: new Set<string>(),
                };
                duel.sharedRaces += 1;
                duel.totalGap += driver.rating - teammate.rating;
                duel.teammateNames.add(race.resultsByDriver.get(teammate.driverId)?.driverName ?? teammate.driverId);
                if (driver.rating > teammate.rating) duel.wins += 1;
                else if (driver.rating < teammate.rating) duel.losses += 1;
                else duel.ties += 1;
                teammateDuelMap.set(key, duel);
            }
        }
    }

    const garageBossWinner = pickAwardWinner([...teammateDuelMap.values()].flatMap(duel => {
        if (duel.sharedRaces < 3) return [];
        const averageGap = duel.totalGap / duel.sharedRaces;
        if (averageGap <= 0) return [];
        const series = formSeriesByDriver.get(duel.driverId);
        if (!series) return [];
        const teammateLabel = duel.teammateNames.size === 1
            ? `vs ${[...duel.teammateNames][0]}`
            : `${duel.sharedRaces} shared team races`;
        return [buildDriverAwardWinner(
            series,
            averageGap,
            `+${formatAverage(averageGap)} AVG GAP`,
            `${duel.wins}-${duel.losses}${duel.ties > 0 ? `-${duel.ties}` : ''} ${teammateLabel}`,
            { id: duel.constructorId, name: duel.constructorName },
        )];
    }));

    const teamEntries = [...teamDriversByConstructor.entries()].map(([constructorId, driverMap]) => [
        constructorId,
        [...driverMap.values()],
    ] as const);

    const bestTeamPairingWinner = pickAwardWinner(teamEntries.flatMap(([constructorId, drivers]) => {
        if (drivers.length < 2) return [];
        const pair = getPrimaryPair(drivers);
        if (pair.length < 2) return [];
        const average = (pair[0].averageRating + pair[1].averageRating) / 2;
        return [buildTeamAwardWinner(
            constructorId,
            pair[0].constructorName,
            `${pair[0].driverName} + ${pair[1].driverName}`,
            average,
            `${formatAverage(average)} PAIR AVG`,
            `${pair[0].totalRatedRaces}/${pair[1].totalRatedRaces} races rated with team`,
            average,
        )];
    }));

    const mostBalancedLineupWinner = pickAwardWinner(teamEntries.flatMap(([constructorId, drivers]) => {
        if (drivers.length < 2) return [];
        const pair = getPrimaryPair(drivers);
        if (pair.length < 2) return [];
        const gap = Math.abs(pair[0].averageRating - pair[1].averageRating);
        const average = (pair[0].averageRating + pair[1].averageRating) / 2;
        return [buildTeamAwardWinner(
            constructorId,
            pair[0].constructorName,
            `${pair[0].driverName} + ${pair[1].driverName}`,
            gap,
            `Δ ${formatAverage(gap)}`,
            `Pair average ${formatAverage(average)}`,
            average,
        )];
    }), 'asc');

    const lateSeasonChargeWinner = pickAwardWinner(teamEntries.flatMap(([constructorId, drivers]) => {
        if (drivers.length < 2 || sortedRaces.length < 3) return [];
        const closingRaces = sortedRaces.slice(-3);
        const closingTeamAverages = closingRaces.flatMap(race => {
            const teamRatings = race.ratings.filter(rating => rating.constructorId === constructorId);
            return teamRatings.length
                ? [teamRatings.reduce((sum, rating) => sum + rating.rating, 0) / teamRatings.length]
                : [];
        });
        if (closingTeamAverages.length < 3) return [];
        const closingAverage = closingTeamAverages.reduce((sum, value) => sum + value, 0) / closingTeamAverages.length;
        const pair = getPrimaryPair(drivers);
        return [buildTeamAwardWinner(
            constructorId,
            pair[0].constructorName,
            `${pair[0].driverName} + ${pair[1].driverName}`,
            closingAverage,
            `${formatAverage(closingAverage)} CLOSE AVG`,
            'Last 3 completed races',
            closingAverage,
        )];
    }));

    return {
        season,
        ratedRaceCount: ratedRaces.length,
        completedRaceCount: sortedRaces.length,
        driverCount: driversById.size,
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

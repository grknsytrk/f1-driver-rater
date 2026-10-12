import type { SeasonQualifyingResult, SeasonRaceResult } from '../api/f1Api';
import type { CommunityRatingDistribution } from './communityRatingDistribution';
import { summarizeCommunityDistribution } from './communityRatingDistribution';
import type { CommunityRating } from './communityRatings';

export type SeasonAwardId =
    | 'season_mvp'
    | 'consistency_king'
    | 'peak_performance'
    | 'most_improved'
    | 'most_polarizing'
    | 'garage_boss'
    | 'most_balanced_lineup'
    | 'best_team_pairing'
    | 'longest_points_streak'
    | 'classified_finish_rate'
    | 'late_season_team_form';

export type SeasonAwardGroup = 'community' | 'track';
export type SeasonAwardStatus = 'ready' | 'insufficient-data' | 'no-positive-movement';

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
    group: SeasonAwardGroup;
    status: SeasonAwardStatus;
    winners: SeasonAwardWinner[];
}

export interface SeasonAwardsSummary {
    season: string;
    ratedRaceCount: number;
    completedRaceCount: number;
    driverCount: number;
    awards: SeasonAward[];
}

type AwardCandidate = SeasonAwardWinner;

interface AwardPoint {
    driverId: string;
    driverName: string;
    round: string;
    roundNumber: number;
    raceName: string;
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

interface SeasonRace {
    round: string;
    roundNumber: number;
    raceName: string;
    resultsByDriver: Map<string, SeasonRaceResult>;
    ratingsByDriver: Map<string, AwardPoint>;
}

interface TeamPairIdentity {
    key: string;
    constructorId: string;
    constructorName: string;
    driverAId: string;
    driverAName: string;
    driverBId: string;
    driverBName: string;
}

interface CommunityPairStats extends TeamPairIdentity {
    sharedRatedRaces: number;
    totalRatingGap: number;
    totalPairRating: number;
}

interface PerformancePairStats extends TeamPairIdentity {
    sharedStarts: number;
    doubleTopFiveFinishes: number;
    raceGapSamples: number;
    totalRaceGap: number;
    qualifyingGapSamples: number;
    totalQualifyingGap: number;
}

const TIE_EPSILON = 1e-6;
const COMMUNITY_MIN_RACES = 3;
const PAIR_MIN_SHARED_RACES = 3;

function normalizeRound(round: string): string {
    const parsed = Number.parseInt(round, 10);
    return Number.isFinite(parsed) ? String(parsed) : round;
}

function formatNumber(value: number, decimals = 2): string {
    return value.toFixed(decimals);
}

function formatRating(value: number): string {
    return value % 1 === 0 ? value.toFixed(0) : value.toFixed(1);
}

function formatRaceName(name: string): string {
    return name.replace(' Grand Prix', ' GP');
}

function median(values: number[]): number {
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
        ? (sorted[middle - 1] + sorted[middle]) / 2
        : sorted[middle];
}

function standardDeviation(values: number[]): number {
    const average = values.reduce((sum, value) => sum + value, 0) / values.length;
    return Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length);
}

function createDriverWinner(
    series: DriverSeries,
    metricValue: number,
    metricDisplay: string,
    detail: string,
    team = { id: series.latestConstructorId, name: series.latestConstructorName },
    secondaryLabel = team.name,
): AwardCandidate {
    return {
        subjectType: 'driver',
        subjectName: series.driverName,
        secondaryLabel,
        constructorId: team.id,
        constructorName: team.name,
        metricValue,
        metricDisplay,
        detail,
        driverId: series.driverId,
        driverName: series.driverName,
    };
}

function createTeamWinner(
    pair: TeamPairIdentity,
    metricValue: number,
    metricDisplay: string,
    detail: string,
): AwardCandidate {
    return {
        subjectType: 'team',
        subjectName: pair.constructorName,
        secondaryLabel: `${pair.driverAName} + ${pair.driverBName}`,
        constructorId: pair.constructorId,
        constructorName: pair.constructorName,
        metricValue,
        metricDisplay,
        detail,
    };
}

function createConstructorWinner(
    constructorId: string,
    constructorName: string,
    metricValue: number,
    metricDisplay: string,
    detail: string,
): AwardCandidate {
    return {
        subjectType: 'team',
        subjectName: constructorName,
        secondaryLabel: constructorName,
        constructorId,
        constructorName,
        metricValue,
        metricDisplay,
        detail,
    };
}

function selectByMetric(candidates: AwardCandidate[], direction: 'asc' | 'desc' = 'desc'): AwardCandidate[] {
    if (candidates.length === 0) return [];
    const bestValue = candidates.reduce((best, candidate) => direction === 'desc'
        ? Math.max(best, candidate.metricValue)
        : Math.min(best, candidate.metricValue), direction === 'desc' ? -Infinity : Infinity);
    return candidates
        .filter(candidate => Math.abs(candidate.metricValue - bestValue) <= TIE_EPSILON)
        .sort((a, b) => a.subjectName.localeCompare(b.subjectName)
            || a.secondaryLabel.localeCompare(b.secondaryLabel));
}

function selectPeakPerformance(
    races: SeasonRace[], driverSeriesById: Map<string, DriverSeries>,
): AwardCandidate[] {
    const candidates = races.flatMap(race => {
        const ratings = [...race.ratingsByDriver.values()];
        return ratings.flatMap(point => {
            const series = driverSeriesById.get(point.driverId);
            const result = race.resultsByDriver.get(point.driverId);
            if (!series || !result) return [];

            const otherRatings = ratings.filter(other => other.driverId !== point.driverId);
            const averageGap = otherRatings.length
                ? otherRatings.reduce((sum, other) => sum + point.rating - other.rating, 0) / otherRatings.length
                : null;
            const detail = averageGap === null
                ? formatRaceName(race.raceName)
                : `${formatRaceName(race.raceName)} · +${formatNumber(averageGap)} AVG GAP`;

            return [{
                winner: createDriverWinner(
                    series, point.rating, `${formatRating(point.rating)} RATING`, detail,
                    { id: result.constructorId, name: result.constructorName },
                ),
                rating: point.rating,
                averageGap,
                roundNumber: race.roundNumber,
            }];
        });
    });
    if (candidates.length === 0) return [];

    const highestRating = Math.max(...candidates.map(candidate => candidate.rating));
    const tiedAtPeak = candidates.filter(candidate => Math.abs(candidate.rating - highestRating) <= TIE_EPSILON);
    const candidatesWithComparableGap = tiedAtPeak.filter(candidate => candidate.averageGap !== null);
    const tieBreakPool = candidatesWithComparableGap.length > 0 ? candidatesWithComparableGap : tiedAtPeak;
    const highestGap = Math.max(...tieBreakPool.map(candidate => candidate.averageGap ?? -Infinity));
    const finalCandidates = tieBreakPool.filter(candidate => candidate.averageGap === null
        ? highestGap === -Infinity
        : Math.abs(candidate.averageGap - highestGap) <= TIE_EPSILON);
    finalCandidates.sort((a, b) => a.winner.subjectName.localeCompare(b.winner.subjectName)
        || (a.winner.driverId ?? '').localeCompare(b.winner.driverId ?? '')
        || a.roundNumber - b.roundNumber);

    return finalCandidates[0] ? [finalCandidates[0].winner] : [];
}

function createAward(
    id: SeasonAwardId,
    group: SeasonAwardGroup,
    winners: AwardCandidate[],
    emptyStatus: SeasonAwardStatus = 'insufficient-data',
): SeasonAward {
    return {
        id,
        group,
        status: winners.length > 0 ? 'ready' : emptyStatus,
        winners,
    };
}

function makePairIdentity(
    constructorId: string,
    constructorName: string,
    driverAId: string,
    driverAName: string,
    driverBId: string,
    driverBName: string,
): TeamPairIdentity {
    const [firstId, firstName, secondId, secondName] = driverAId.localeCompare(driverBId) <= 0
        ? [driverAId, driverAName, driverBId, driverBName]
        : [driverBId, driverBName, driverAId, driverAName];
    return {
        key: `${constructorId}:${firstId}:${secondId}`,
        constructorId,
        constructorName,
        driverAId: firstId,
        driverAName: firstName,
        driverBId: secondId,
        driverBName: secondName,
    };
}

function pairMapKey(constructorId: string, driverAId: string, driverBId: string): string {
    const [firstId, secondId] = driverAId.localeCompare(driverBId) <= 0
        ? [driverAId, driverBId]
        : [driverBId, driverAId];
    return `${constructorId}:${firstId}:${secondId}`;
}

function getExactlyTwoDrivers<T extends { driverId: string }>(drivers: T[]): [T, T] | null {
    const unique = [...new Map(drivers.map(driver => [driver.driverId, driver])).values()];
    return unique.length === 2 ? [unique[0], unique[1]] : null;
}

function collectCommunityPairStats(races: SeasonRace[]): CommunityPairStats[] {
    const stats = new Map<string, CommunityPairStats>();
    for (const race of races) {
        const ratingsByTeam = new Map<string, AwardPoint[]>();
        for (const rating of race.ratingsByDriver.values()) {
            const teamRatings = ratingsByTeam.get(rating.constructorId) ?? [];
            teamRatings.push(rating);
            ratingsByTeam.set(rating.constructorId, teamRatings);
        }
        for (const [constructorId, teamRatings] of ratingsByTeam) {
            const pair = getExactlyTwoDrivers(teamRatings);
            if (!pair) continue;
            const [first, second] = pair;
            const identity = makePairIdentity(
                constructorId, first.constructorName, first.driverId, first.driverName, second.driverId, second.driverName,
            );
            const current = stats.get(identity.key) ?? {
                ...identity, sharedRatedRaces: 0, totalRatingGap: 0, totalPairRating: 0,
            };
            current.sharedRatedRaces += 1;
            current.totalRatingGap += Math.abs(first.rating - second.rating);
            current.totalPairRating += (first.rating + second.rating) / 2;
            stats.set(identity.key, current);
        }
    }
    return [...stats.values()];
}

function collectPerformancePairStats(
    races: SeasonRace[], qualifyingResults: SeasonQualifyingResult[],
): PerformancePairStats[] {
    const stats = new Map<string, PerformancePairStats>();
    for (const race of races) {
        const resultsByTeam = new Map<string, SeasonRaceResult[]>();
        for (const result of race.resultsByDriver.values()) {
            const teamResults = resultsByTeam.get(result.constructorId) ?? [];
            teamResults.push(result);
            resultsByTeam.set(result.constructorId, teamResults);
        }
        for (const [constructorId, teamResults] of resultsByTeam) {
            const pair = getExactlyTwoDrivers(teamResults);
            if (!pair || pair.some(result => result.started === false)) continue;
            const [first, second] = pair;
            const identity = makePairIdentity(
                constructorId, first.constructorName, first.driverId, first.driverName, second.driverId, second.driverName,
            );
            const current = stats.get(identity.key) ?? {
                ...identity,
                sharedStarts: 0,
                doubleTopFiveFinishes: 0,
                raceGapSamples: 0,
                totalRaceGap: 0,
                qualifyingGapSamples: 0,
                totalQualifyingGap: 0,
            };
            current.sharedStarts += 1;
            if (first.position !== null && first.position <= 5 && second.position !== null && second.position <= 5) {
                current.doubleTopFiveFinishes += 1;
                if (typeof first.raceTimeGapSeconds === 'number' && typeof second.raceTimeGapSeconds === 'number') {
                    current.raceGapSamples += 1;
                    current.totalRaceGap += Math.abs(first.raceTimeGapSeconds - second.raceTimeGapSeconds);
                }
            }
            stats.set(identity.key, current);
        }
    }

    const qualifyingByRoundAndTeam = new Map<string, SeasonQualifyingResult[]>();
    for (const result of qualifyingResults) {
        const key = `${normalizeRound(result.round)}:${result.constructorId}`;
        const teamResults = qualifyingByRoundAndTeam.get(key) ?? [];
        teamResults.push(result);
        qualifyingByRoundAndTeam.set(key, teamResults);
    }
    for (const [scope, teamResults] of qualifyingByRoundAndTeam) {
        const pair = getExactlyTwoDrivers(teamResults);
        if (!pair) continue;
        const [round, constructorId] = scope.split(':');
        const [first, second] = pair;
        if (typeof first.bestTimeSeconds !== 'number' || typeof second.bestTimeSeconds !== 'number') continue;
        const key = pairMapKey(constructorId, first.driverId, second.driverId);
        const candidate = stats.get(key);
        if (!candidate) continue;
        // Do not count a qualifying session as part of a pairing that was not on the race grid together.
        const race = races.find(item => item.round === normalizeRound(round));
        const racePair = race && getExactlyTwoDrivers([...race.resultsByDriver.values()]
            .filter(result => result.constructorId === constructorId && result.started !== false));
        if (!racePair || pairMapKey(constructorId, racePair[0].driverId, racePair[1].driverId) !== key) continue;
        candidate.qualifyingGapSamples += 1;
        candidate.totalQualifyingGap += Math.abs(first.bestTimeSeconds - second.bestTimeSeconds);
    }
    return [...stats.values()];
}

function selectBestTeamPair(stats: PerformancePairStats[]): AwardCandidate[] {
    const candidates = stats.filter(pair => pair.sharedStarts >= PAIR_MIN_SHARED_RACES
        && pair.doubleTopFiveFinishes >= 2
        && pair.doubleTopFiveFinishes * 2 >= pair.sharedStarts
        && pair.raceGapSamples >= 2
        && pair.qualifyingGapSamples >= PAIR_MIN_SHARED_RACES);
    if (candidates.length === 0) return [];

    const smallestRaceGap = Math.min(...candidates.map(pair => pair.totalRaceGap / pair.raceGapSamples));
    const raceGapCandidates = candidates.filter(pair =>
        Math.abs(pair.totalRaceGap / pair.raceGapSamples - smallestRaceGap) <= TIE_EPSILON);
    const smallestQualifyingGap = Math.min(...raceGapCandidates.map(pair =>
        pair.totalQualifyingGap / pair.qualifyingGapSamples));
    const qualifyingGapCandidates = raceGapCandidates.filter(pair =>
        Math.abs(pair.totalQualifyingGap / pair.qualifyingGapSamples - smallestQualifyingGap) <= TIE_EPSILON);
    const mostTopFiveFinishes = Math.max(...qualifyingGapCandidates.map(pair => pair.doubleTopFiveFinishes));

    return qualifyingGapCandidates
        .filter(pair => pair.doubleTopFiveFinishes === mostTopFiveFinishes)
        .map(pair => {
            const averageRaceGap = pair.totalRaceGap / pair.raceGapSamples;
            const averageQualifyingGap = pair.totalQualifyingGap / pair.qualifyingGapSamples;
            return createTeamWinner(
                pair,
                averageRaceGap,
                `Δ ${formatNumber(averageRaceGap, 3)}s RACE GAP`,
                `${pair.doubleTopFiveFinishes}/${pair.sharedStarts} shared starts; average race gap ${formatNumber(averageRaceGap, 3)}s over ${pair.raceGapSamples} timed top-5 races; average qualifying gap ${formatNumber(averageQualifyingGap, 3)}s over ${pair.qualifyingGapSamples} sessions.`,
            );
        })
        .sort((a, b) => a.subjectName.localeCompare(b.subjectName)
            || a.secondaryLabel.localeCompare(b.secondaryLabel));
}

/** Builds the community and official-results Season Awards for a Grand Prix season. */
export function buildSeasonAwards(
    season: string,
    raceResults: SeasonRaceResult[],
    communityRatings: CommunityRating[],
    communityDistributions: CommunityRatingDistribution[] = [],
    qualifyingResults: SeasonQualifyingResult[] = [],
): SeasonAwardsSummary {
    const racesByRound = new Map<string, SeasonRace>();
    for (const result of raceResults) {
        const round = normalizeRound(result.round);
        let race = racesByRound.get(round);
        if (!race) {
            race = {
                round,
                roundNumber: Number.parseInt(round, 10),
                raceName: result.raceName,
                resultsByDriver: new Map(),
                ratingsByDriver: new Map(),
            };
            racesByRound.set(round, race);
        }
        if (!race.resultsByDriver.has(result.driverId)) race.resultsByDriver.set(result.driverId, result);
    }
    const races = [...racesByRound.values()].sort((a, b) => a.roundNumber - b.roundNumber);

    const seenRatingScopes = new Set<string>();
    for (const rating of communityRatings) {
        const ratingRound = rating.round;
        if (!ratingRound || !Number.isFinite(rating.averageRating) || rating.averageRating < 0.5
            || rating.averageRating > 10 || !Number.isSafeInteger(rating.voteCount) || rating.voteCount < 1) continue;
        const round = normalizeRound(ratingRound);
        const race = racesByRound.get(round);
        const result = race?.resultsByDriver.get(rating.driverId);
        if (!race || !result) continue;
        const scope = `${round}:${rating.driverId}`;
        if (seenRatingScopes.has(scope)) continue;
        seenRatingScopes.add(scope);
        race.ratingsByDriver.set(rating.driverId, {
            driverId: result.driverId,
            driverName: result.driverName,
            round,
            roundNumber: race.roundNumber,
            raceName: race.raceName,
            rating: rating.averageRating,
            constructorId: result.constructorId,
            constructorName: result.constructorName,
        });
    }

    const driversById = new Map<string, DriverSeries>();
    const profilesById = new Map<string, { driverName: string; constructorId: string; constructorName: string }>();
    for (const race of races) {
        for (const result of race.resultsByDriver.values()) {
            profilesById.set(result.driverId, {
                driverName: result.driverName,
                constructorId: result.constructorId,
                constructorName: result.constructorName,
            });
        }
        for (const point of race.ratingsByDriver.values()) {
            const result = race.resultsByDriver.get(point.driverId);
            if (!result) continue;
            const series = driversById.get(result.driverId) ?? {
                driverId: result.driverId,
                driverName: result.driverName,
                latestConstructorId: result.constructorId,
                latestConstructorName: result.constructorName,
                seasonAverage: 0,
                points: [],
            };
            series.driverName = result.driverName;
            series.latestConstructorId = result.constructorId;
            series.latestConstructorName = result.constructorName;
            series.points.push(point);
            driversById.set(result.driverId, series);
        }
    }
    for (const series of driversById.values()) {
        series.points.sort((a, b) => a.roundNumber - b.roundNumber);
        series.seasonAverage = series.points.reduce((sum, point) => sum + point.rating, 0) / series.points.length;
    }

    const driverSeries = [...driversById.values()];
    const driverSeriesById = new Map(driverSeries.map(series => [series.driverId, series]));
    const ratedRaces = races.filter(race => race.ratingsByDriver.size > 0);

    const seasonMvp = selectByMetric(driverSeries
        .filter(series => series.points.length >= COMMUNITY_MIN_RACES)
        .map(series => createDriverWinner(
            series, series.seasonAverage, `${formatNumber(series.seasonAverage)} AVG`,
            `${series.points.length} community-rated Grand Prix races.`,
        )));

    const eligibleConsistency = driverSeries.filter(series => series.points.length >= COMMUNITY_MIN_RACES);
    const driverMedian = driverSeries.length ? median(driverSeries.map(series => series.seasonAverage)) : null;
    const consistency = driverMedian === null ? [] : selectByMetric(eligibleConsistency
        .filter(series => series.seasonAverage >= driverMedian)
        .map(series => {
            const deviation = standardDeviation(series.points.map(point => point.rating));
            return createDriverWinner(
                series, deviation, `σ ${formatNumber(deviation)}`,
                `${formatNumber(series.seasonAverage)} season average across ${series.points.length} races.`,
            );
        }), 'asc');

    const peakPerformance = selectPeakPerformance(races, driverSeriesById);

    const improvementCandidates = driverSeries.filter(series => series.points.length >= 6).map(series => {
        const firstThree = series.points.slice(0, 3);
        const lastThree = series.points.slice(-3);
        const average = (points: AwardPoint[]) => points.reduce((sum, point) => sum + point.rating, 0) / points.length;
        const change = average(lastThree) - average(firstThree);
        return createDriverWinner(
            series, change, `${change > 0 ? '+' : ''}${formatRating(change)}`,
            `First 3 rated races ${formatNumber(average(firstThree))}; final 3 ${formatNumber(average(lastThree))}.`,
        );
    });
    const positiveImprovements = improvementCandidates.filter(candidate => candidate.metricValue > TIE_EPSILON);
    const mostImproved = selectByMetric(positiveImprovements);
    const improvedStatus: SeasonAwardStatus = improvementCandidates.length > 0 && positiveImprovements.length === 0
        ? 'no-positive-movement' : 'insufficient-data';

    const mostPolarizing = selectByMetric(communityDistributions.flatMap(distribution => {
        const summary = summarizeCommunityDistribution(distribution);
        const profile = profilesById.get(distribution.driverId);
        if (!summary || summary.agreementScore === null || !profile) return [];
        const series = driverSeriesById.get(distribution.driverId) ?? {
            driverId: distribution.driverId,
            driverName: profile.driverName,
            latestConstructorId: profile.constructorId,
            latestConstructorName: profile.constructorName,
            seasonAverage: 0,
            points: [],
        };
        return [createDriverWinner(
            series, summary.agreementScore, `${formatNumber(summary.agreementScore)}% AGREEMENT`,
            `${summary.assessedRaceCount} Grand Prix rating distributions assessed; lower agreement means opinions diverged, not that the driver scored poorly.`,
        )];
    }), 'asc');

    const garageStats = new Map<string, {
        driverId: string; constructorId: string; constructorName: string; totalGap: number;
        sharedRaces: number; wins: number; losses: number; ties: number; teammateNames: Set<string>;
    }>();
    for (const race of ratedRaces) {
        const ratingsByTeam = new Map<string, AwardPoint[]>();
        for (const point of race.ratingsByDriver.values()) {
            const teamRatings = ratingsByTeam.get(point.constructorId) ?? [];
            teamRatings.push(point);
            ratingsByTeam.set(point.constructorId, teamRatings);
        }
        for (const [constructorId, teamRatings] of ratingsByTeam) {
            const pair = getExactlyTwoDrivers(teamRatings);
            if (!pair) continue;
            const [first, second] = pair;
            for (const [driver, teammate] of [[first, second], [second, first]] as const) {
                const key = `${constructorId}:${driver.driverId}`;
                const current = garageStats.get(key) ?? {
                    driverId: driver.driverId,
                    constructorId,
                    constructorName: driver.constructorName,
                    totalGap: 0,
                    sharedRaces: 0,
                    wins: 0,
                    losses: 0,
                    ties: 0,
                    teammateNames: new Set<string>(),
                };
                const gap = driver.rating - teammate.rating;
                current.totalGap += gap;
                current.sharedRaces += 1;
                if (gap > TIE_EPSILON) current.wins += 1;
                else if (gap < -TIE_EPSILON) current.losses += 1;
                else current.ties += 1;
                current.teammateNames.add(teammate.driverName);
                garageStats.set(key, current);
            }
        }
    }
    const garageBoss = selectByMetric([...garageStats.values()].flatMap(stats => {
        const series = driverSeriesById.get(stats.driverId);
        if (!series || stats.sharedRaces < COMMUNITY_MIN_RACES) return [];
        const averageGap = stats.totalGap / stats.sharedRaces;
        if (averageGap <= TIE_EPSILON) return [];
        const teammateLabel = stats.teammateNames.size === 1
            ? `vs ${[...stats.teammateNames][0]}`
            : `${stats.sharedRaces} shared team races`;
        return [createDriverWinner(
            series, averageGap, `+${formatNumber(averageGap)} AVG GAP`,
            `${stats.wins}-${stats.losses}${stats.ties > 0 ? `-${stats.ties}` : ''} ${teammateLabel}.`,
            { id: stats.constructorId, name: stats.constructorName },
        )];
    }));

    const communityPairStats = collectCommunityPairStats(ratedRaces)
        .filter(pair => pair.sharedRatedRaces >= PAIR_MIN_SHARED_RACES)
        .map(pair => ({
            pair,
            averageGap: pair.totalRatingGap / pair.sharedRatedRaces,
            averageRating: pair.totalPairRating / pair.sharedRatedRaces,
        }));
    const pairMedian = communityPairStats.length ? median(communityPairStats.map(item => item.averageRating)) : null;
    const balancedLineup = pairMedian === null ? [] : selectByMetric(communityPairStats
        .filter(item => item.averageRating >= pairMedian)
        .map(item => createTeamWinner(
            item.pair, item.averageGap, `Δ ${formatNumber(item.averageGap)} RATING`,
            `Pair average ${formatNumber(item.averageRating)} across ${item.pair.sharedRatedRaces} shared rated races.`,
        )), 'asc');

    const performancePairStats = collectPerformancePairStats(races, qualifyingResults);
    const bestTeamPairing = selectBestTeamPair(performancePairStats);

    const completedRounds = races.map(race => race.round);
    const pointsStreaks = new Map<string, { driverName: string; constructorId: string; constructorName: string; best: number }>();
    const latestResultByDriver = new Map<string, SeasonRaceResult>();
    for (const race of races) {
        for (const result of race.resultsByDriver.values()) latestResultByDriver.set(result.driverId, result);
    }
    const driversWithResults = [...latestResultByDriver.keys()];
    for (const driverId of driversWithResults) {
        let currentStreak = 0;
        let bestStreak = 0;
        for (const round of completedRounds) {
            const result = racesByRound.get(round)?.resultsByDriver.get(driverId);
            if (result && result.started !== false && result.points > 0) {
                currentStreak += 1;
                bestStreak = Math.max(bestStreak, currentStreak);
            } else {
                currentStreak = 0;
            }
        }
        const latest = latestResultByDriver.get(driverId)!;
        pointsStreaks.set(driverId, {
            driverName: latest.driverName,
            constructorId: latest.constructorId,
            constructorName: latest.constructorName,
            best: bestStreak,
        });
    }
    const longestPointsStreak = selectByMetric([...pointsStreaks.entries()]
        .filter(([, stats]) => stats.best > 0)
        .map(([driverId, stats]) => {
            const series = driverSeriesById.get(driverId) ?? {
                driverId, driverName: stats.driverName, latestConstructorId: stats.constructorId,
                latestConstructorName: stats.constructorName, seasonAverage: 0, points: [],
            };
            return createDriverWinner(
                series, stats.best, `${stats.best} RACE STREAK`,
                'Consecutive Grand Prix races with at least one championship point.',
                { id: stats.constructorId, name: stats.constructorName },
            );
        }));

    const finishRateStats = new Map<string, {
        driverName: string; constructorId: string; constructorName: string; starts: number; classified: number;
    }>();
    for (const race of races) {
        for (const result of race.resultsByDriver.values()) {
            if (result.started === false) continue;
            const current = finishRateStats.get(result.driverId) ?? {
                driverName: result.driverName,
                constructorId: result.constructorId,
                constructorName: result.constructorName,
                starts: 0,
                classified: 0,
            };
            current.starts += 1;
            if (result.position !== null && Number.isFinite(result.position)) current.classified += 1;
            finishRateStats.set(result.driverId, current);
        }
    }
    const classifiedFinishRate = selectByMetric([...finishRateStats.entries()]
        .filter(([, stats]) => stats.starts > 0)
        .map(([driverId, stats]) => {
            const series = driverSeriesById.get(driverId) ?? {
                driverId, driverName: stats.driverName, latestConstructorId: stats.constructorId,
                latestConstructorName: stats.constructorName, seasonAverage: 0, points: [],
            };
            const rate = stats.classified / stats.starts;
            return createDriverWinner(
                series, rate, `${formatNumber(rate * 100, 1)}%`,
                `${stats.classified} classified finishes from ${stats.starts} recorded Grand Prix starts; this reflects driver and car performance together.`,
                { id: stats.constructorId, name: stats.constructorName },
            );
        }));

    const finalThirdCount = Math.ceil(races.length / 3);
    const finalThirdRounds = new Set(races.slice(-finalThirdCount).map(race => race.round));
    const lateTeamPoints = new Map<string, {
        constructorName: string; totalPoints: number; raceCount: number;
    }>();
    for (const race of races) {
        if (!finalThirdRounds.has(race.round)) continue;
        const pointsByTeam = new Map<string, { constructorName: string; points: number }>();
        for (const result of race.resultsByDriver.values()) {
            const team = pointsByTeam.get(result.constructorId) ?? { constructorName: result.constructorName, points: 0 };
            team.points += result.points;
            pointsByTeam.set(result.constructorId, team);
        }
        for (const [constructorId, team] of pointsByTeam) {
            const totals = lateTeamPoints.get(constructorId) ?? {
                constructorName: team.constructorName, totalPoints: 0, raceCount: 0,
            };
            totals.totalPoints += team.points;
            totals.raceCount += 1;
            lateTeamPoints.set(constructorId, totals);
        }
    }
    const lateSeasonTeamForm = selectByMetric([...lateTeamPoints.entries()]
        .filter(([, stats]) => stats.raceCount > 0)
        .map(([constructorId, stats]) => createConstructorWinner(
            constructorId,
            stats.constructorName,
            stats.totalPoints / stats.raceCount,
            `${formatNumber(stats.totalPoints / stats.raceCount, 1)} PTS / GP`,
            `${formatNumber(stats.totalPoints, 1)} team points across ${stats.raceCount} Grand Prix races in the season’s final third.`,
        )));

    return {
        season,
        ratedRaceCount: ratedRaces.length,
        completedRaceCount: races.length,
        driverCount: driversById.size,
        awards: [
            createAward('season_mvp', 'community', seasonMvp),
            createAward('consistency_king', 'community', consistency),
            createAward('peak_performance', 'community', peakPerformance),
            createAward('most_improved', 'community', mostImproved, improvedStatus),
            createAward('most_polarizing', 'community', mostPolarizing),
            createAward('garage_boss', 'community', garageBoss),
            createAward('most_balanced_lineup', 'community', balancedLineup),
            createAward('best_team_pairing', 'track', bestTeamPairing),
            createAward('longest_points_streak', 'track', longestPointsStreak),
            createAward('classified_finish_rate', 'track', classifiedFinishRate),
            createAward('late_season_team_form', 'track', lateSeasonTeamForm),
        ],
    };
}

import { describe, expect, it } from 'vitest';
import type { SeasonQualifyingResult, SeasonRaceResult } from '../api/f1Api';
import type { CommunityRating } from './communityRatings';
import { buildSeasonAwards } from './seasonAwards';

function raceResult(
    round: number,
    driverId: string,
    constructorId: string,
    overrides: Partial<SeasonRaceResult> = {},
): SeasonRaceResult {
    const constructorName = constructorId === 'mercedes' ? 'Mercedes' : constructorId === 'red_bull' ? 'Red Bull' : constructorId;
    return {
        round: String(round),
        raceName: `Round ${round} Grand Prix`,
        date: `2024-03-${String(round).padStart(2, '0')}`,
        driverId,
        driverName: driverId.toUpperCase(),
        constructorId,
        constructorName,
        position: 1,
        points: 25,
        status: 'Finished',
        started: true,
        raceTimeGapSeconds: 0,
        ...overrides,
    };
}

function rating(driverId: string, round: number, averageRating: number, voteCount = 1): CommunityRating {
    return { driverId, round: String(round), averageRating, voteCount };
}

function qualifying(round: number, driverId: string, constructorId: string, bestTimeSeconds: number): SeasonQualifyingResult {
    return {
        round: String(round), driverId, driverName: driverId.toUpperCase(), constructorId,
        constructorName: constructorId, position: 1, bestTimeSeconds,
    };
}

function distribution(driverId: string, votesByRound: number[][]) {
    const rounds = votesByRound.map((votes, index) => {
        const buckets = Array.from({ length: 20 }, (_, bucketIndex) => {
            const score = (bucketIndex + 1) / 2;
            return { score, count: votes.filter(vote => vote === score).length };
        });
        return { driverId, round: String(index + 1), voteCount: votes.length, buckets };
    });
    const buckets = Array.from({ length: 20 }, (_, bucketIndex) => ({
        score: (bucketIndex + 1) / 2,
        count: rounds.reduce((sum, round) => sum + round.buckets[bucketIndex].count, 0),
    }));
    return {
        driverId,
        voteCount: rounds.reduce((sum, round) => sum + round.voteCount, 0),
        buckets,
        rounds,
    };
}

function awardMap(summary: ReturnType<typeof buildSeasonAwards>) {
    return new Map(summary.awards.map(award => [award.id, award]));
}

function pairWeekend(
    round: number,
    team: string,
    driverA: string,
    driverB: string,
    doubleTopFive: boolean,
    raceGap: number,
    qualifyingGap: number,
): { races: SeasonRaceResult[]; qualifying: SeasonQualifyingResult[] } {
    return {
        races: [
            raceResult(round, driverA, team, {
                position: 1,
                raceTimeGapSeconds: 0,
                points: 25,
            }),
            raceResult(round, driverB, team, {
                position: doubleTopFive ? 5 : 6,
                raceTimeGapSeconds: raceGap,
                points: doubleTopFive ? 10 : 8,
            }),
        ],
        qualifying: [
            qualifying(round, driverA, team, 90),
            qualifying(round, driverB, team, 90 + qualifyingGap),
        ],
    };
}

function pairSeason(
    team: string,
    driverA: string,
    driverB: string,
    topFiveRounds: number[],
    raceGap: number,
    qualifyingGap: number,
) {
    const weekends = [1, 2, 3, 4].map(round => pairWeekend(
        round, team, driverA, driverB, topFiveRounds.includes(round), raceGap, qualifyingGap,
    ));
    return {
        races: weekends.flatMap(weekend => weekend.races),
        qualifying: weekends.flatMap(weekend => weekend.qualifying),
    };
}

describe('buildSeasonAwards', () => {
    it('weights each community-rated race equally and shares exact metric ties', () => {
        const results = [1, 2, 3].flatMap(round => [
            raceResult(round, 'alpha', 'mercedes'),
            raceResult(round, 'beta', 'red_bull'),
        ]);
        const ratings = [
            rating('alpha', 1, 10, 1), rating('alpha', 2, 6, 50), rating('alpha', 3, 8, 1),
            rating('beta', 1, 8, 100), rating('beta', 2, 8, 2), rating('beta', 3, 8, 100),
        ];

        const awards = awardMap(buildSeasonAwards('2024', results, ratings));

        expect(awards.get('season_mvp')?.winners.map(winner => winner.driverId).sort()).toEqual(['alpha', 'beta']);
        expect(awards.get('season_mvp')?.winners[0].metricValue).toBe(8);
        expect(awards.get('consistency_king')?.winners.map(winner => winner.driverId)).toEqual(['beta']);
        expect(awards.get('peak_performance')?.winners.map(winner => winner.driverId)).toEqual(['alpha']);
    });

    it('uses the first and final three rated races and shows no positive movement distinctly', () => {
        const results = Array.from({ length: 6 }, (_, index) => [
            raceResult(index + 1, 'rising', 'mercedes'),
            raceResult(index + 1, 'falling', 'red_bull'),
        ]).flat();
        const ratings = [1, 2, 3, 4, 5, 6].flatMap(round => [
            rating('rising', round, round <= 3 ? 5 : 9),
            rating('falling', round, round <= 3 ? 9 : 5),
        ]);
        const awards = awardMap(buildSeasonAwards('2024', results, ratings));

        expect(awards.get('most_improved')?.winners.map(winner => winner.driverId)).toEqual(['rising']);
        expect(awards.get('most_improved')?.winners[0].metricValue).toBe(4);

        const noPositive = awardMap(buildSeasonAwards(
            '2024',
            Array.from({ length: 6 }, (_, index) => raceResult(index + 1, 'falling', 'red_bull')),
            [1, 2, 3, 4, 5, 6].map(round => rating('falling', round, 10 - round)),
        )).get('most_improved');
        expect(noPositive?.status).toBe('no-positive-movement');
        expect(noPositive?.winners).toEqual([]);
    });

    it('selects the lowest season agreement score for Most Polarizing', () => {
        const results = [1, 2].flatMap(round => [
            raceResult(round, 'split', 'mercedes'),
            raceResult(round, 'agreed', 'red_bull'),
        ]);
        const distributions = [
            distribution('split', [[0.5, 10], [1, 9]]),
            distribution('agreed', [[8, 8], [9, 9]]),
        ];
        const award = awardMap(buildSeasonAwards('2024', results, [], distributions)).get('most_polarizing');

        expect(award?.winners.map(winner => winner.driverId)).toEqual(['split']);
        expect(award?.winners[0].metricValue).toBe(0);
        expect(award?.winners[0].detail).toContain('opinions diverged');
    });

    it('compares teammates in their actual shared team stints when lineups change', () => {
        const lineups = [
            { round: 1, drivers: [['russell', 'mercedes'], ['hamilton', 'mercedes'], ['verstappen', 'red_bull'], ['perez', 'red_bull']] },
            { round: 2, drivers: [['russell', 'mercedes'], ['hamilton', 'mercedes'], ['verstappen', 'red_bull'], ['perez', 'red_bull']] },
            { round: 3, drivers: [['russell', 'mercedes'], ['hamilton', 'mercedes'], ['verstappen', 'red_bull'], ['perez', 'red_bull']] },
            { round: 4, drivers: [['antonelli', 'mercedes'], ['hamilton', 'mercedes'], ['russell', 'red_bull'], ['verstappen', 'red_bull']] },
        ] as const;
        const scoreByDriver: Record<string, number[]> = {
            russell: [8, 8, 8, 10], hamilton: [6, 6, 6, 7],
            verstappen: [9, 9, 9, 9], perez: [8, 8, 8], antonelli: [6],
        };
        const results: SeasonRaceResult[] = [];
        const ratings: CommunityRating[] = [];
        for (const { round, drivers } of lineups) {
            for (const [driverId, constructorId] of drivers) {
                results.push(raceResult(round, driverId, constructorId));
                const score = scoreByDriver[driverId][round - 1];
                if (score !== undefined) ratings.push(rating(driverId, round, score));
            }
        }
        const awards = awardMap(buildSeasonAwards('2024', results, ratings));

        expect(awards.get('garage_boss')?.winners[0].driverId).toBe('russell');
        expect(awards.get('garage_boss')?.winners[0].constructorId).toBe('mercedes');
        expect(awards.get('most_balanced_lineup')?.winners[0].constructorId).toBe('red_bull');
    });

    it('shares exact metric ties across award types without repeating a peak driver', () => {
        const results: SeasonRaceResult[] = [];
        const ratings: CommunityRating[] = [];
        const qualifyingResults: SeasonQualifyingResult[] = [];
        for (let round = 1; round <= 6; round += 1) {
            const frontScore = round <= 3 ? 7 : 9;
            const secondScore = round <= 3 ? 5 : 7;
            for (const [team, frontDriver, secondDriver] of [
                ['mercedes', 'alpha', 'beta'],
                ['red_bull', 'gamma', 'delta'],
            ] as const) {
                results.push(
                    raceResult(round, frontDriver, team, {
                        position: 1, points: round >= 5 ? 10 : 2, raceTimeGapSeconds: 0,
                    }),
                    raceResult(round, secondDriver, team, {
                        position: 2, points: round >= 5 ? 8 : 2, raceTimeGapSeconds: 1,
                    }),
                );
                ratings.push(
                    rating(frontDriver, round, frontScore),
                    rating(secondDriver, round, secondScore),
                );
                qualifyingResults.push(
                    qualifying(round, frontDriver, team, 90),
                    qualifying(round, secondDriver, team, 90.2),
                );
            }
        }
        const distributions = [
            distribution('alpha', Array.from({ length: 6 }, () => [0.5, 10])),
            distribution('gamma', Array.from({ length: 6 }, () => [0.5, 10])),
            distribution('beta', Array.from({ length: 6 }, () => [5, 5])),
            distribution('delta', Array.from({ length: 6 }, () => [5, 5])),
        ];
        const awards = awardMap(buildSeasonAwards('2024', results, ratings, distributions, qualifyingResults));

        expect(awards.get('season_mvp')?.winners.map(winner => winner.driverId).sort()).toEqual(['alpha', 'gamma']);
        expect(awards.get('consistency_king')?.winners.map(winner => winner.driverId).sort()).toEqual(['alpha', 'gamma']);
        expect(awards.get('peak_performance')?.winners.map(winner => winner.driverId).sort()).toEqual(['alpha', 'gamma']);
        expect(awards.get('most_improved')?.winners.map(winner => winner.driverId).sort()).toEqual(['alpha', 'beta', 'delta', 'gamma']);
        expect(awards.get('most_polarizing')?.winners.map(winner => winner.driverId).sort()).toEqual(['alpha', 'gamma']);
        expect(awards.get('garage_boss')?.winners.map(winner => winner.driverId).sort()).toEqual(['alpha', 'gamma']);
        expect(awards.get('most_balanced_lineup')?.winners).toHaveLength(2);
        expect(awards.get('best_team_pairing')?.winners).toHaveLength(2);
        expect(awards.get('longest_points_streak')?.winners).toHaveLength(4);
        expect(awards.get('classified_finish_rate')?.winners).toHaveLength(4);
        expect(awards.get('late_season_team_form')?.winners).toHaveLength(2);
    });

    it('requires frequent double top-fives, then favors the closest race-time pairing', () => {
        const fastPair = pairSeason('mercedes', 'a', 'b', [1, 2, 3, 4], 4, 0.2);
        const closerButFewerTopFives = pairSeason('red_bull', 'c', 'd', [1, 2, 3], 0.1, 0.1);
        const rareTopFives = pairSeason('haas', 'e', 'f', [1], 0.01, 0.01);
        const award = awardMap(buildSeasonAwards(
            '2024', [...fastPair.races, ...closerButFewerTopFives.races, ...rareTopFives.races], [], [],
            [...fastPair.qualifying, ...closerButFewerTopFives.qualifying, ...rareTopFives.qualifying],
        )).get('best_team_pairing');

        expect(award?.winners.map(winner => winner.constructorId)).toEqual(['red_bull']);
        expect(award?.winners[0].metricValue).toBeCloseTo(0.1);
    });

    it('uses race-time gap before qualifying gap and shares exact pairing ties', () => {
        const closerOnTrack = pairSeason('mercedes', 'a', 'b', [1, 2, 3], 1, 0.5);
        const closerInQualifying = pairSeason('red_bull', 'c', 'd', [1, 2, 3], 2, 0.1);
        const awards = awardMap(buildSeasonAwards(
            '2024', [...closerOnTrack.races, ...closerInQualifying.races], [], [],
            [...closerOnTrack.qualifying, ...closerInQualifying.qualifying],
        ));
        expect(awards.get('best_team_pairing')?.winners.map(winner => winner.constructorId)).toEqual(['mercedes']);

        const tiedA = pairSeason('mercedes', 'a', 'b', [1, 2, 3], 1.25, 0.25);
        const tiedB = pairSeason('red_bull', 'c', 'd', [1, 2, 3], 1.25, 0.25);
        const tied = awardMap(buildSeasonAwards(
            '2024', [...tiedA.races, ...tiedB.races], [], [], [...tiedA.qualifying, ...tiedB.qualifying],
        )).get('best_team_pairing');
        expect(tied?.winners.map(winner => winner.constructorId).sort()).toEqual(['mercedes', 'red_bull']);
    });

    it('breaks points streaks on zero points and missing race results', () => {
        const results: SeasonRaceResult[] = [
            raceResult(1, 'alpha', 'mercedes', { points: 2 }),
            raceResult(2, 'alpha', 'mercedes', { points: 2 }),
            raceResult(3, 'alpha', 'mercedes', { points: 0 }),
            raceResult(4, 'alpha', 'mercedes', { points: 2 }),
            raceResult(5, 'alpha', 'mercedes', { points: 2 }),
            raceResult(1, 'beta', 'red_bull', { points: 0 }),
            raceResult(2, 'beta', 'red_bull', { points: 3 }),
            raceResult(3, 'beta', 'red_bull', { points: 3 }),
            raceResult(4, 'beta', 'red_bull', { points: 3 }),
            raceResult(5, 'beta', 'red_bull', { points: 3 }),
            raceResult(1, 'gamma', 'haas', { points: 1 }),
            raceResult(2, 'gamma', 'haas', { points: 1 }),
            // Gamma has no recorded result in round 3, so the streak must reset.
            raceResult(4, 'gamma', 'haas', { points: 1 }),
            raceResult(5, 'gamma', 'haas', { points: 1 }),
        ];
        const award = awardMap(buildSeasonAwards('2024', results, [])).get('longest_points_streak');

        expect(award?.winners.map(winner => winner.driverId)).toEqual(['beta']);
        expect(award?.winners[0].metricValue).toBe(4);
    });

    it('calculates classified finish rate from actual starts and excludes unclassified finishes', () => {
        const results = [
            raceResult(1, 'perfect', 'mercedes', { position: 8 }),
            raceResult(2, 'perfect', 'mercedes', { position: 12 }),
            raceResult(3, 'perfect', 'mercedes', { position: null, status: 'Engine' }),
            raceResult(4, 'perfect', 'mercedes', { position: null, status: 'Did not start', started: false }),
            raceResult(1, 'fragile', 'red_bull', { position: 9 }),
            raceResult(2, 'fragile', 'red_bull', { position: null, status: 'Retired' }),
        ];
        const award = awardMap(buildSeasonAwards('2024', results, [])).get('classified_finish_rate');

        expect(award?.winners.map(winner => winner.driverId)).toEqual(['perfect']);
        expect(award?.winners[0].metricValue).toBeCloseTo(2 / 3);
        expect(award?.winners[0].detail).toContain('2 classified finishes from 3 recorded Grand Prix starts');
    });

    it('sums the changing driver lineups into late-season team points per Grand Prix', () => {
        const results = [
            raceResult(1, 'red_a', 'red_bull', { points: 1 }), raceResult(1, 'red_b', 'red_bull', { points: 1 }),
            raceResult(2, 'red_a', 'red_bull', { points: 1 }), raceResult(2, 'red_b', 'red_bull', { points: 1 }),
            raceResult(3, 'red_a', 'red_bull', { points: 2 }), raceResult(3, 'red_b', 'red_bull', { points: 2 }),
            raceResult(4, 'red_a', 'red_bull', { points: 5 }), raceResult(4, 'red_c', 'red_bull', { points: 6 }),
            raceResult(1, 'merc_a', 'mercedes', { points: 1 }), raceResult(1, 'merc_b', 'mercedes', { points: 1 }),
            raceResult(2, 'merc_a', 'mercedes', { points: 1 }), raceResult(2, 'merc_b', 'mercedes', { points: 1 }),
            raceResult(3, 'merc_a', 'mercedes', { points: 25 }), raceResult(3, 'merc_b', 'mercedes', { points: 25 }),
            raceResult(4, 'merc_a', 'mercedes', { points: 3 }), raceResult(4, 'merc_b', 'mercedes', { points: 4 }),
        ];
        const award = awardMap(buildSeasonAwards('2024', results, [])).get('late_season_team_form');

        expect(award?.winners.map(winner => winner.constructorId)).toEqual(['mercedes']);
        expect(award?.winners[0].metricValue).toBe(28.5);
        expect(award?.winners[0].detail).toContain('57.0 team points across 2 Grand Prix races');
    });
});

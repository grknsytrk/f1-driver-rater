import { beforeEach, describe, expect, it } from 'vitest';
import type { SeasonRaceResult } from '../api/f1Api';
import type { CommunityRating } from './communityRatings';
import { buildCommunitySeasonAwards } from './seasonAwards';

function raceResult(round: number, driverId: string, constructorId: string, driverName = driverId): SeasonRaceResult {
    return {
        round: String(round),
        raceName: `Round ${round} Grand Prix`,
        date: `2024-03-${String(round).padStart(2, '0')}`,
        driverId,
        driverName,
        constructorId,
        constructorName: constructorId === 'mercedes' ? 'Mercedes' : 'Red Bull',
        position: 1,
        points: 25,
        status: 'Finished',
    };
}

function communityRating(driverId: string, round: number, averageRating: number, voteCount = 1): CommunityRating {
    return { driverId, round: String(round), averageRating, voteCount };
}

function awardMap(summary: ReturnType<typeof buildCommunitySeasonAwards>) {
    return new Map(summary.awards.map(award => [award.id, award]));
}

describe('buildCommunitySeasonAwards', () => {
    beforeEach(() => localStorage.clear());

    it('uses community averages regardless of personal ratings, counts one vote, and ignores unmatched rounds', () => {
        const results = [
            raceResult(1, 'alpha', 'mercedes', 'Alpha Driver'),
            raceResult(2, 'alpha', 'mercedes', 'Alpha Driver'),
            raceResult(3, 'alpha', 'mercedes', 'Alpha Driver'),
            raceResult(4, 'alpha', 'mercedes', 'Alpha Driver'),
            raceResult(2, 'beta', 'red_bull', 'Beta Driver'),
        ];
        const ratings = [
            communityRating('alpha', 1, 9, 1),
            communityRating('alpha', 3, 8, 4),
            communityRating('alpha', 4, 9, 1),
            communityRating('beta', 2, 10, 1),
            communityRating('alpha', 99, 10, 8),
        ];

        localStorage.setItem('f1_pilot_ratings', JSON.stringify({ alpha: 0.5, beta: 10 }));
        const first = buildCommunitySeasonAwards('2024', results, ratings);
        localStorage.setItem('f1_pilot_ratings', JSON.stringify({ alpha: 10, beta: 0.5 }));
        const second = buildCommunitySeasonAwards('2024', results, ratings);
        const awards = awardMap(first);

        expect(first).toEqual(second);
        expect(first.ratedRaceCount).toBe(4);
        expect(first.completedRaceCount).toBe(4);
        expect(first.driverCount).toBe(2);
        expect(awards.get('season_mvp')?.winner?.driverId).toBe('alpha');
        expect(awards.get('season_mvp')?.winner?.metricValue).toBe(8.67);
        expect(awards.get('consistency_king')?.status).toBe('insufficient-data');
        expect(awards.get('peak_performance')?.winner?.driverId).toBe('beta');
    });

    it('weights each race average equally regardless of its vote count', () => {
        const results = [1, 2, 3].flatMap(round => [
            raceResult(round, 'alpha', 'mercedes', 'Alpha Driver'),
            raceResult(round, 'beta', 'red_bull', 'Beta Driver'),
        ]);
        const ratings = [
            communityRating('alpha', 1, 10, 1), communityRating('alpha', 2, 6, 50), communityRating('alpha', 3, 8, 1),
            communityRating('beta', 1, 8, 100), communityRating('beta', 2, 8, 2), communityRating('beta', 3, 8, 100),
        ];

        const mvp = awardMap(buildCommunitySeasonAwards('2024', results, ratings)).get('season_mvp');

        expect(mvp?.winner?.driverId).toBe('alpha');
        expect(mvp?.winner?.metricValue).toBe(8);
    });

    it('uses season average to break a peak-performance tie', () => {
        const results = [
            raceResult(1, 'alpha', 'mercedes', 'Alpha Driver'),
            raceResult(1, 'beta', 'red_bull', 'Beta Driver'),
            raceResult(2, 'alpha', 'mercedes', 'Alpha Driver'),
            raceResult(3, 'alpha', 'mercedes', 'Alpha Driver'),
        ];
        const ratings = [
            communityRating('alpha', 1, 10), communityRating('alpha', 2, 8), communityRating('alpha', 3, 9),
            communityRating('beta', 1, 10),
        ];

        const awards = awardMap(buildCommunitySeasonAwards('2024', results, ratings));

        expect(awards.get('season_mvp')?.winner?.driverId).toBe('alpha');
        expect(awards.get('peak_performance')?.winner?.driverId).toBe('beta');
    });

    it('uses the constructor for each race when calculating teammate and team awards', () => {
        const lineups = [
            { round: 1, drivers: [['russell', 'mercedes'], ['hamilton', 'mercedes'], ['verstappen', 'red_bull'], ['perez', 'red_bull']] },
            { round: 2, drivers: [['russell', 'mercedes'], ['hamilton', 'mercedes'], ['verstappen', 'red_bull'], ['perez', 'red_bull']] },
            { round: 3, drivers: [['russell', 'mercedes'], ['hamilton', 'mercedes'], ['verstappen', 'red_bull'], ['perez', 'red_bull']] },
            { round: 4, drivers: [['antonelli', 'mercedes'], ['hamilton', 'mercedes'], ['russell', 'red_bull'], ['verstappen', 'red_bull']] },
        ] as const;
        const scores: Record<string, number[]> = {
            russell: [8, 8, 8, 10],
            hamilton: [6, 6, 6, 7],
            verstappen: [9, 9, 9, 9],
            perez: [8, 8, 8],
            antonelli: [6],
        };
        const results: SeasonRaceResult[] = [];
        const ratings: CommunityRating[] = [];
        for (const { round, drivers } of lineups) {
            for (const [driverId, constructorId] of drivers) {
                results.push(raceResult(round, driverId, constructorId, driverId));
                const roundScore = scores[driverId][round - 1];
                if (roundScore !== undefined) ratings.push(communityRating(driverId, round, roundScore));
            }
        }

        const awards = awardMap(buildCommunitySeasonAwards('2024', results, ratings));

        expect(awards.get('garage_boss')?.winner?.driverId).toBe('russell');
        expect(awards.get('garage_boss')?.winner?.constructorId).toBe('mercedes');
        expect(awards.get('best_team_pairing')?.winner?.constructorId).toBe('red_bull');
        expect(awards.get('most_balanced_lineup')?.winner?.constructorId).toBe('red_bull');
        expect(awards.get('late_season_charge')?.winner?.constructorId).toBe('red_bull');
    });

    it('does not award a team late-season charge when one of the last three completed rounds has no team rating', () => {
        const results = [1, 2, 3, 4].flatMap(round => [
            raceResult(round, 'alpha', 'mercedes', 'Alpha Driver'),
            raceResult(round, 'beta', 'mercedes', 'Beta Driver'),
            raceResult(round, 'gamma', 'red_bull', 'Gamma Driver'),
            raceResult(round, 'delta', 'red_bull', 'Delta Driver'),
        ]);
        const ratings = results.flatMap(result => {
            if (result.constructorId === 'mercedes' && result.round === '4') return [];
            return [communityRating(result.driverId, Number(result.round), result.driverId === 'gamma' ? 9 : 7)];
        });

        const lateSeasonCharge = awardMap(buildCommunitySeasonAwards('2024', results, ratings)).get('late_season_charge');

        expect(lateSeasonCharge?.winner?.constructorId).toBe('red_bull');
    });
});

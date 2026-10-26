import { beforeEach, describe, expect, it } from 'vitest';
import type { SeasonQualifyingResult, SeasonRaceResult, SeasonSprintResult } from '../api/f1Api';
import type { SeasonRatings } from '../types';
import type { CommunityRating } from './communityRatings';
import { getCountryCode } from './storage';
import {
    buildDriverCareerRatedSeasons,
    buildDriverSeasonRaceLog,
    buildDriverTeammateComparisons,
    buildSeasonTeammateH2HEntries,
    nextRaceLogSortState,
    sortDriverRaceLog,
    summarizeDriverBestWorstRaces,
} from './driverProfile';

const raceResults: SeasonRaceResult[] = [
    {
        round: '1',
        raceName: 'Australian Grand Prix',
        date: '2025-03-16',
        driverId: 'norris',
        driverName: 'Lando Norris',
        constructorId: 'mclaren',
        constructorName: 'McLaren',
        position: 1,
        points: 25,
        gridPosition: 1,
        status: 'Finished',
    },
    {
        round: '1',
        raceName: 'Australian Grand Prix',
        date: '2025-03-16',
        driverId: 'piastri',
        driverName: 'Oscar Piastri',
        constructorId: 'mclaren',
        constructorName: 'McLaren',
        position: 9,
        points: 2,
        gridPosition: 2,
        status: 'Finished',
    },
    {
        round: '2',
        raceName: 'Chinese Grand Prix',
        date: '2025-03-23',
        driverId: 'norris',
        driverName: 'Lando Norris',
        constructorId: 'mclaren',
        constructorName: 'McLaren',
        position: 2,
        points: 18,
        gridPosition: 3,
        status: 'Finished',
    },
    {
        round: '2',
        raceName: 'Chinese Grand Prix',
        date: '2025-03-23',
        driverId: 'piastri',
        driverName: 'Oscar Piastri',
        constructorId: 'mclaren',
        constructorName: 'McLaren',
        position: 1,
        points: 25,
        gridPosition: 1,
        status: 'Finished',
    },
];

const qualiResults: SeasonQualifyingResult[] = [
    {
        round: '1',
        driverId: 'norris',
        driverName: 'Lando Norris',
        constructorId: 'mclaren',
        constructorName: 'McLaren',
        position: 1,
    },
    {
        round: '1',
        driverId: 'piastri',
        driverName: 'Oscar Piastri',
        constructorId: 'mclaren',
        constructorName: 'McLaren',
        position: 2,
    },
    {
        round: '2',
        driverId: 'norris',
        driverName: 'Lando Norris',
        constructorId: 'mclaren',
        constructorName: 'McLaren',
        position: 3,
    },
    {
        round: '2',
        driverId: 'piastri',
        driverName: 'Oscar Piastri',
        constructorId: 'mclaren',
        constructorName: 'McLaren',
        position: 1,
    },
];

const sprintResults: SeasonSprintResult[] = [
    {
        round: '2',
        driverId: 'norris',
        driverName: 'Lando Norris',
        constructorId: 'mclaren',
        constructorName: 'McLaren',
        position: 8,
        points: 1,
        status: 'Finished',
    },
];

const personalRaces: SeasonRatings = {
    season: '2025',
    races: [
        {
            round: '1',
            raceName: 'Australian Grand Prix',
            date: '2025-03-16',
            completed: true,
            ratings: [
                {
                    driverId: 'norris',
                    driverName: 'Lando Norris',
                    constructorId: 'mclaren',
                    constructorName: 'McLaren',
                    rating: 9.5,
                    communityEligible: true,
                },
                {
                    driverId: 'piastri',
                    driverName: 'Oscar Piastri',
                    constructorId: 'mclaren',
                    constructorName: 'McLaren',
                    rating: 7.0,
                    communityEligible: true,
                },
            ],
        },
        {
            round: '2',
            raceName: 'Chinese Grand Prix',
            date: '2025-03-23',
            completed: true,
            ratings: [
                {
                    driverId: 'norris',
                    driverName: 'Lando Norris',
                    constructorId: 'mclaren',
                    constructorName: 'McLaren',
                    rating: 8.0,
                    communityEligible: true,
                },
                {
                    driverId: 'piastri',
                    driverName: 'Oscar Piastri',
                    constructorId: 'mclaren',
                    constructorName: 'McLaren',
                    rating: 9.0,
                    communityEligible: true,
                },
            ],
        },
    ],
};

const communityRatings: CommunityRating[] = [
    {
        driverId: 'norris',
        round: '1',
        averageRating: 9.1,
        voteCount: 25,
    },
    {
        driverId: 'piastri',
        round: '1',
        averageRating: 7.2,
        voteCount: 25,
    },
    {
        driverId: 'norris',
        round: '2',
        averageRating: 8.2,
        voteCount: 30,
    },
    {
        driverId: 'piastri',
        round: '2',
        averageRating: 9.3,
        voteCount: 30,
    },
];

describe('driverProfile utilities', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('builds teammate comparisons with Race, Quali, Personal Rating, and Community Rating H2H', () => {
        const battles = buildDriverTeammateComparisons(
            'norris',
            raceResults,
            qualiResults,
            personalRaces,
            communityRatings,
            'race',
        );

        expect(battles).toHaveLength(1);
        const battle = battles[0];
        expect(battle.teammateId).toBe('piastri');
        expect(battle.constructorId).toBe('mclaren');
        expect(battle.raceWinsDriver).toBe(1);
        expect(battle.raceWinsTeammate).toBe(1);
        expect(battle.qualiWinsDriver).toBe(1);
        expect(battle.qualiWinsTeammate).toBe(1);
        expect(battle.driverPersonalAvg).toBe(8.75);
        expect(battle.teammatePersonalAvg).toBe(8.0);
        expect(battle.driverCommunityAvg).toBe(8.65);
        expect(battle.teammateCommunityAvg).toBe(8.25);
        expect(battle.personalRatingH2H.winsA).toBe(1);
        expect(battle.personalRatingH2H.winsB).toBe(1);
        expect(battle.communityRatingH2H.winsA).toBe(1);
        expect(battle.communityRatingH2H.winsB).toBe(1);
    });

    it('builds chronological race log with sprint points, delta, and best/worst summary', () => {
        const log = buildDriverSeasonRaceLog(
            'norris',
            [],
            raceResults,
            qualiResults,
            sprintResults,
            personalRaces,
            communityRatings,
            { constructorId: 'mclaren', constructorName: 'McLaren' },
        );

        expect(log).toHaveLength(2);
        expect(log[0]).toMatchObject({
            round: '1',
            gridPosition: 1,
            finishPosition: 1,
            points: 25,
            sprintPoints: 0,
            myRating: 9.5,
            communityRating: 9.1,
            communityVotes: 25,
            ratingDelta: 0.4,
        });
        expect(log[1]).toMatchObject({
            round: '2',
            gridPosition: 3,
            finishPosition: 2,
            points: 19,
            sprintPoints: 1,
            myRating: 8.0,
            communityRating: 8.2,
            communityVotes: 30,
            ratingDelta: -0.2,
        });

        const personalSummary = summarizeDriverBestWorstRaces(log, 'personal');
        expect(personalSummary.best).toEqual({
            round: '1',
            raceName: 'Australian Grand Prix',
            rating: 9.5,
        });
        expect(personalSummary.worst).toEqual({
            round: '2',
            raceName: 'Chinese Grand Prix',
            rating: 8.0,
        });
    });

    it('scans career rated seasons across both race ratings and quick ratings in localStorage', () => {
        localStorage.setItem('f1_pilot_ratings', JSON.stringify({ '2025': personalRaces }));
        localStorage.setItem('f1_quick_ratings', JSON.stringify({
            '2024': [
                {
                    driverId: 'norris',
                    driverName: 'Lando Norris',
                    constructorId: 'mclaren',
                    constructorName: 'McLaren',
                    rating: 9.0,
                },
            ],
        }));

        const career = buildDriverCareerRatedSeasons('norris');
        expect(career).toHaveLength(2);
        expect(career[0]).toMatchObject({
            season: '2025',
            averageRating: 8.75,
            ratedRaces: 2,
            source: 'race',
        });
        expect(career[1]).toMatchObject({
            season: '2024',
            averageRating: 9.0,
            ratedRaces: 1,
            source: 'quick',
        });
    });

    it('cycles race log sort state (desc -> asc -> null) and keeps unrated rows at the bottom', () => {
        const s1 = nextRaceLogSortState(null, 'myRating');
        expect(s1).toEqual({ key: 'myRating', direction: 'desc' });

        const s2 = nextRaceLogSortState(s1, 'myRating');
        expect(s2).toEqual({ key: 'myRating', direction: 'asc' });

        const s3 = nextRaceLogSortState(s2, 'myRating');
        expect(s3).toBeNull();

        const switchCol = nextRaceLogSortState(s2, 'communityRating');
        expect(switchCol).toEqual({ key: 'communityRating', direction: 'desc' });

        const log = buildDriverSeasonRaceLog(
            'norris',
            [
                {
                    season: '2025',
                    round: '3',
                    raceName: 'Japanese Grand Prix',
                    date: '2025-04-06',
                    Circuit: {
                        circuitId: 'suzuka',
                        circuitName: 'Suzuka',
                        url: '',
                        Location: { locality: 'Suzuka', country: 'Japan' },
                    },
                },
            ],
            [
                ...raceResults,
                {
                    round: '3',
                    raceName: 'Japanese Grand Prix',
                    date: '2025-04-06',
                    driverId: 'norris',
                    driverName: 'Lando Norris',
                    constructorId: 'mclaren',
                    constructorName: 'McLaren',
                    position: 4,
                    points: 12,
                    gridPosition: 4,
                    status: 'Finished',
                },
            ],
            qualiResults,
            sprintResults,
            personalRaces,
            communityRatings,
            { constructorId: 'mclaren', constructorName: 'McLaren' },
        );

        const descMy = sortDriverRaceLog(log, { key: 'myRating', direction: 'desc' });
        expect(descMy.map(r => r.round)).toEqual(['1', '2', '3']);

        const ascMy = sortDriverRaceLog(log, { key: 'myRating', direction: 'asc' });
        // Round 3 has myRating: null, so it stays at the bottom even in ascending sort
        expect(ascMy.map(r => r.round)).toEqual(['2', '1', '3']);

        const normal = sortDriverRaceLog(log, null);
        expect(normal.map(r => r.round)).toEqual(['1', '2', '3']);
    });

    it('builds career season teammate H2H entries with vertical round-by-round qualifying and race breakdowns', () => {
        const entries = buildSeasonTeammateH2HEntries(
            '2025',
            'mclaren',
            'McLaren',
            'norris',
            [
                ...raceResults,
                {
                    round: '3',
                    raceName: 'Japanese Grand Prix',
                    date: '2025-04-06',
                    driverId: 'norris',
                    driverName: 'Lando Norris',
                    constructorId: 'mclaren',
                    constructorName: 'McLaren',
                    position: 2,
                    points: 18,
                    gridPosition: 2,
                    status: 'Finished',
                },
                {
                    round: '3',
                    raceName: 'Japanese Grand Prix',
                    date: '2025-04-06',
                    driverId: 'piastri',
                    driverName: 'Oscar Piastri',
                    constructorId: 'mclaren',
                    constructorName: 'McLaren',
                    position: null,
                    points: 0,
                    gridPosition: 4,
                    status: 'Retired',
                },
            ],
            qualiResults,
        );

        expect(entries).toHaveLength(1);
        const h2h = entries[0];
        expect(h2h.season).toBe('2025');
        expect(h2h.teammateName).toBe('Oscar Piastri');
        expect(h2h.qualiWinsDriver).toBe(1);
        expect(h2h.qualiWinsTeammate).toBe(1);
        expect(h2h.qualiWinPctDriver).toBe(50);
        expect(h2h.qualiRounds).toHaveLength(2);
        expect(h2h.qualiRounds[0].winner).toBe('driver');
        expect(h2h.qualiRounds[1].winner).toBe('teammate');

        // Round 3 has Piastri DNF (position: null), so it appears as 'unclassified' in raceRounds
        // and does not increment the classified raceWinsDriver/raceWinsTeammate counts
        expect(h2h.raceWinsDriver).toBe(1);
        expect(h2h.raceWinsTeammate).toBe(1);
        expect(h2h.raceRounds).toHaveLength(3);
        expect(h2h.raceRounds[2]).toMatchObject({
            round: '3',
            driverPosition: 2,
            teammatePosition: null,
            winner: 'unclassified',
        });
    });

    it('resolves country flag codes for historical and special Grand Prix names', () => {
        expect(getCountryCode('Portuguese Grand Prix')).toBe('PT');
        expect(getCountryCode('French Grand Prix')).toBe('FR');
        expect(getCountryCode('Styrian Grand Prix')).toBe('AT');
        expect(getCountryCode('Russian Grand Prix')).toBe('RU');
        expect(getCountryCode('Turkish Grand Prix')).toBe('TR');
        expect(getCountryCode('German Grand Prix')).toBe('DE');
        expect(getCountryCode('Eifel Grand Prix')).toBe('DE');
        expect(getCountryCode('Tuscan Grand Prix')).toBe('IT');
        expect(getCountryCode('Sakhir Grand Prix')).toBe('BH');
        expect(getCountryCode('70th Anniversary Grand Prix')).toBe('GB');
        expect(getCountryCode('Mexican Grand Prix')).toBe('MX');
        expect(getCountryCode('Brazilian Grand Prix')).toBe('BR');
    });

    it('resolves complete multi-season career H2H for Alonso (2001-2025) and Hamilton (2007-2025) from static historical dataset', async () => {
        const {
            extractHistoricalConstructorSeasonH2H,
            extractHistoricalDriverStints,
        } = await import('./historicalH2H');
        const rawData = await import('../../public/data/historical-h2h-v1.json');
        const payload = (rawData.default ?? rawData) as unknown as import('./historicalH2H').CompactHistoricalH2HPayload;

        const alonsoStints = extractHistoricalDriverStints(payload, 'alonso');
        const alonsoSeasons = [...new Set(alonsoStints.map(s => s.season))];
        expect(alonsoSeasons).toEqual([
            '2001', '2003', '2004', '2005', '2006', '2007', '2008', '2009',
            '2010', '2011', '2012', '2013', '2014', '2015', '2016', '2017',
            '2018', '2021', '2022', '2023', '2024', '2025',
        ]);

        // Verify 2015-2024 stints for Alonso produce non-empty teammate H2H entries
        for (const stint of alonsoStints) {
            const h2hRaw = extractHistoricalConstructorSeasonH2H(
                payload,
                stint.season,
                stint.constructorId,
                stint.constructorName,
            );
            expect(h2hRaw).not.toBeNull();
            const entries = buildSeasonTeammateH2HEntries(
                stint.season,
                stint.constructorId,
                h2hRaw!.constructorName,
                'alonso',
                h2hRaw!.raceResults,
                h2hRaw!.qualiResults,
            );
            expect(entries.length).toBeGreaterThan(0);
        }

        const hamiltonStints = extractHistoricalDriverStints(payload, 'hamilton');
        const hamiltonSeasons = [...new Set(hamiltonStints.map(s => s.season))];
        expect(hamiltonSeasons).toEqual([
            '2007', '2008', '2009', '2010', '2011', '2012', '2013', '2014',
            '2015', '2016', '2017', '2018', '2019', '2020', '2021', '2022',
            '2023', '2024', '2025',
        ]);
    });
});

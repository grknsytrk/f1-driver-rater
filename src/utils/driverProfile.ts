import type {
    SeasonQualifyingResult,
    SeasonRaceResult,
    SeasonSprintResult,
} from '../api/f1Api';
import type { Race, SeasonRatings } from '../types';
import type { CommunityRating } from './communityRatings';
import { validRatings } from './ratingData';
import {
    getAllRatings,
    getCountryCode,
    getQuickRatings,
} from './storage';
import {
    buildTeammateCommunityAverages,
    calculateTeammateRatingH2H,
    type TeammateRatingH2H,
} from './teamVersus';

export interface DriverTeammateBattle {
    teammateId: string;
    teammateName: string;
    constructorId: string;
    constructorName: string;
    sharedRacesCount: number;
    raceWinsDriver: number;
    raceWinsTeammate: number;
    totalClassifiedSharedRaces: number;
    qualiWinsDriver: number;
    qualiWinsTeammate: number;
    totalSharedQualis: number;
    driverPersonalAvg: number | null;
    teammatePersonalAvg: number | null;
    driverCommunityAvg: number | null;
    teammateCommunityAvg: number | null;
    personalRatingH2H: TeammateRatingH2H;
    communityRatingH2H: TeammateRatingH2H;
}

export interface DriverRaceLogEntry {
    round: string;
    raceName: string;
    date: string;
    countryCode: string;
    constructorId: string;
    constructorName: string;
    gridPosition: number | null;
    qualiPosition: number | null;
    finishPosition: number | null;
    status: string;
    points: number;
    sprintPoints: number;
    myRating: number | null;
    communityRating: number | null;
    communityVotes: number;
    ratingDelta: number | null;
}

export interface DriverCareerSeasonSummary {
    season: string;
    constructorId: string;
    constructorName: string;
    averageRating: number;
    ratedRaces: number;
    source: 'race' | 'quick';
    bestRating: number | null;
    bestRaceName: string | null;
    worstRating: number | null;
    worstRaceName: string | null;
}

export interface DriverBestWorstSummary {
    best: { round: string; raceName: string; rating: number } | null;
    worst: { round: string; raceName: string; rating: number } | null;
}

export interface TeammateRoundComparison {
    round: string;
    raceName: string;
    countryCode: string;
    driverPosition: number | null;
    teammatePosition: number | null;
    driverStatus?: string;
    teammateStatus?: string;
    winner: 'driver' | 'teammate' | 'unclassified';
}

export interface CareerSeasonTeammateH2H {
    id: string;
    season: string;
    constructorId: string;
    constructorName: string;
    teammateId: string;
    teammateName: string;
    qualiWinsDriver: number;
    qualiWinsTeammate: number;
    qualiTotal: number;
    qualiWinPctDriver: number;
    qualiRounds: TeammateRoundComparison[];
    raceWinsDriver: number;
    raceWinsTeammate: number;
    raceTotal: number;
    raceWinPctDriver: number;
    raceRounds: TeammateRoundComparison[];
}

export type RaceLogSortKey = 'myRating' | 'communityRating';
export type RaceLogSortDirection = 'desc' | 'asc';

export interface RaceLogSortState {
    key: RaceLogSortKey;
    direction: RaceLogSortDirection;
}

function roundTo2(value: number): number {
    return parseFloat(value.toFixed(2));
}

function normalizeRound(round: string): string {
    const parsed = Number.parseInt(round, 10);
    return Number.isFinite(parsed) ? String(parsed) : round;
}

/**
 * Compute per-(driverId, constructorId) personal race averages for a season.
 */
function buildPersonalTeamAverages(personalRaces: SeasonRatings | null): Map<string, number> {
    const scoresByKey = new Map<string, number[]>();
    for (const race of personalRaces?.races ?? []) {
        if (!race.completed) continue;
        for (const rating of validRatings(race.ratings)) {
            const key = `${rating.driverId}_${rating.constructorId}`;
            const list = scoresByKey.get(key) ?? [];
            list.push(rating.rating);
            scoresByKey.set(key, list);
        }
    }

    const averages = new Map<string, number>();
    scoresByKey.forEach((scores, key) => {
        if (scores.length > 0) {
            const sum = scores.reduce((acc, v) => acc + v, 0);
            averages.set(key, roundTo2(sum / scores.length));
        }
    });
    return averages;
}

/**
 * Find all teammates a driver shared a constructor with during the season and compute
 * Race H2H, Quali H2H, Personal Rating H2H, and Community Rating H2H.
 */
export function buildDriverTeammateComparisons(
    driverId: string,
    raceResults: SeasonRaceResult[],
    qualiResults: SeasonQualifyingResult[],
    personalRaces: SeasonRatings | null,
    communityRatings: CommunityRating[],
    communitySource: 'race' | 'quick' = 'race',
): DriverTeammateBattle[] {
    const driverTeams = new Map<string, string>(); // constructorId -> constructorName
    const teammatesByTeam = new Map<string, Map<string, string>>(); // constructorId -> (teammateId -> teammateName)

    for (const r of raceResults) {
        if (r.driverId === driverId) {
            driverTeams.set(r.constructorId, r.constructorName);
        }
    }
    for (const q of qualiResults) {
        if (q.driverId === driverId && !driverTeams.has(q.constructorId)) {
            driverTeams.set(q.constructorId, q.constructorName);
        }
    }
    for (const race of personalRaces?.races ?? []) {
        if (!race.completed) continue;
        for (const rating of validRatings(race.ratings)) {
            if (rating.driverId === driverId && !driverTeams.has(rating.constructorId)) {
                driverTeams.set(rating.constructorId, rating.constructorName);
            }
        }
    }

    const registerTeammate = (teamId: string, otherId: string, otherName: string) => {
        if (otherId === driverId || !driverTeams.has(teamId)) return;
        const map = teammatesByTeam.get(teamId) ?? new Map<string, string>();
        if (!map.has(otherId)) {
            map.set(otherId, otherName);
        }
        teammatesByTeam.set(teamId, map);
    };

    for (const r of raceResults) {
        registerTeammate(r.constructorId, r.driverId, r.driverName);
    }
    for (const q of qualiResults) {
        registerTeammate(q.constructorId, q.driverId, q.driverName);
    }
    for (const race of personalRaces?.races ?? []) {
        if (!race.completed) continue;
        for (const rating of validRatings(race.ratings)) {
            registerTeammate(rating.constructorId, rating.driverId, rating.driverName);
        }
    }

    const personalTeamAvg = buildPersonalTeamAverages(personalRaces);
    const communityTeamAvg = buildTeammateCommunityAverages(
        communityRatings,
        communitySource,
        raceResults,
        qualiResults,
    );

    const battles: DriverTeammateBattle[] = [];

    driverTeams.forEach((constructorName, constructorId) => {
        const teamTeammates = teammatesByTeam.get(constructorId);
        if (!teamTeammates) return;

        teamTeammates.forEach((teammateName, teammateId) => {
            let raceWinsDriver = 0;
            let raceWinsTeammate = 0;
            let totalClassifiedSharedRaces = 0;
            let qualiWinsDriver = 0;
            let qualiWinsTeammate = 0;
            let totalSharedQualis = 0;

            const rounds = new Set<string>();
            for (const r of raceResults) {
                if (r.constructorId === constructorId && (r.driverId === driverId || r.driverId === teammateId)) {
                    rounds.add(normalizeRound(r.round));
                }
            }
            for (const q of qualiResults) {
                if (q.constructorId === constructorId && (q.driverId === driverId || q.driverId === teammateId)) {
                    rounds.add(normalizeRound(q.round));
                }
            }

            let sharedRacesCount = 0;

            rounds.forEach(normRound => {
                const raceD = raceResults.find(
                    r => normalizeRound(r.round) === normRound && r.driverId === driverId && r.constructorId === constructorId,
                );
                const raceT = raceResults.find(
                    r => normalizeRound(r.round) === normRound && r.driverId === teammateId && r.constructorId === constructorId,
                );

                if (raceD && raceT) {
                    sharedRacesCount++;
                    if (raceD.position !== null && raceT.position !== null) {
                        totalClassifiedSharedRaces++;
                        if (raceD.position < raceT.position) raceWinsDriver++;
                        else if (raceT.position < raceD.position) raceWinsTeammate++;
                    }
                }

                const qualiD = qualiResults.find(
                    q => normalizeRound(q.round) === normRound && q.driverId === driverId && q.constructorId === constructorId,
                );
                const qualiT = qualiResults.find(
                    q => normalizeRound(q.round) === normRound && q.driverId === teammateId && q.constructorId === constructorId,
                );

                if (qualiD && qualiT) {
                    totalSharedQualis++;
                    if (qualiD.position < qualiT.position) qualiWinsDriver++;
                    else if (qualiT.position < qualiD.position) qualiWinsTeammate++;
                }
            });

            const personalRatingH2H = calculateTeammateRatingH2H(
                driverId,
                teammateId,
                constructorId,
                'personal',
                personalRaces,
                communityRatings,
                raceResults,
            );
            const communityRatingH2H = calculateTeammateRatingH2H(
                driverId,
                teammateId,
                constructorId,
                'community',
                personalRaces,
                communityRatings,
                raceResults,
            );

            if (
                sharedRacesCount === 0
                && totalSharedQualis === 0
                && personalRatingH2H.totalSharedRaces === 0
                && communityRatingH2H.totalSharedRaces === 0
            ) {
                return;
            }

            battles.push({
                teammateId,
                teammateName,
                constructorId,
                constructorName,
                sharedRacesCount: Math.max(sharedRacesCount, totalSharedQualis, personalRatingH2H.totalSharedRaces, communityRatingH2H.totalSharedRaces),
                raceWinsDriver,
                raceWinsTeammate,
                totalClassifiedSharedRaces,
                qualiWinsDriver,
                qualiWinsTeammate,
                totalSharedQualis,
                driverPersonalAvg: personalTeamAvg.get(`${driverId}_${constructorId}`) ?? null,
                teammatePersonalAvg: personalTeamAvg.get(`${teammateId}_${constructorId}`) ?? null,
                driverCommunityAvg: communityTeamAvg.get(`${driverId}_${constructorId}`) ?? null,
                teammateCommunityAvg: communityTeamAvg.get(`${teammateId}_${constructorId}`) ?? null,
                personalRatingH2H,
                communityRatingH2H,
            });
        });
    });

    return battles.sort((a, b) => b.sharedRacesCount - a.sharedRacesCount);
}

/**
 * Build detailed vertical Qualifying H2H and Race H2H entries (including round-by-round breakdown)
 * for a driver in a specific season and constructor stint.
 */
export function buildSeasonTeammateH2HEntries(
    season: string,
    constructorId: string,
    constructorName: string,
    driverId: string,
    raceResults: SeasonRaceResult[],
    qualiResults: SeasonQualifyingResult[],
): CareerSeasonTeammateH2H[] {
    const teammates = new Map<string, string>(); // teammateId -> teammateName

    for (const r of raceResults) {
        if (r.constructorId === constructorId && r.driverId !== driverId) {
            if (!teammates.has(r.driverId)) {
                teammates.set(r.driverId, r.driverName);
            }
        }
    }
    for (const q of qualiResults) {
        if (q.constructorId === constructorId && q.driverId !== driverId) {
            if (!teammates.has(q.driverId)) {
                teammates.set(q.driverId, q.driverName);
            }
        }
    }

    const entries: CareerSeasonTeammateH2H[] = [];

    teammates.forEach((teammateName, teammateId) => {
        const allRoundsSet = new Set<string>();
        for (const r of raceResults) {
            if (r.constructorId === constructorId && (r.driverId === driverId || r.driverId === teammateId)) {
                allRoundsSet.add(normalizeRound(r.round));
            }
        }
        for (const q of qualiResults) {
            if (q.constructorId === constructorId && (q.driverId === driverId || q.driverId === teammateId)) {
                allRoundsSet.add(normalizeRound(q.round));
            }
        }

        const sortedRounds = [...allRoundsSet].sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10));

        let qualiWinsDriver = 0;
        let qualiWinsTeammate = 0;
        let qualiTotal = 0;
        const qualiRounds: TeammateRoundComparison[] = [];

        let raceWinsDriver = 0;
        let raceWinsTeammate = 0;
        let raceTotal = 0;
        const raceRounds: TeammateRoundComparison[] = [];

        for (const normRound of sortedRounds) {
            const raceD = raceResults.find(
                r => normalizeRound(r.round) === normRound && r.driverId === driverId && r.constructorId === constructorId,
            );
            const raceT = raceResults.find(
                r => normalizeRound(r.round) === normRound && r.driverId === teammateId && r.constructorId === constructorId,
            );
            const qualiD = qualiResults.find(
                q => normalizeRound(q.round) === normRound && q.driverId === driverId && q.constructorId === constructorId,
            );
            const qualiT = qualiResults.find(
                q => normalizeRound(q.round) === normRound && q.driverId === teammateId && q.constructorId === constructorId,
            );

            const driverInRound = Boolean(raceD || qualiD);
            const teammateInRound = Boolean(raceT || qualiT);
            if (!driverInRound || !teammateInRound) continue;

            const raceName = raceD?.raceName || raceT?.raceName || qualiD?.raceName || qualiT?.raceName || `Round ${normRound}`;
            const countryCode = getCountryCode(raceName);

            // Qualifying round comparison
            if (qualiD || qualiT) {
                const dPos = qualiD?.position ?? null;
                const tPos = qualiT?.position ?? null;
                let winner: 'driver' | 'teammate' | 'unclassified' = 'unclassified';

                if (dPos !== null && tPos !== null) {
                    qualiTotal++;
                    if (dPos < tPos) {
                        qualiWinsDriver++;
                        winner = 'driver';
                    } else if (tPos < dPos) {
                        qualiWinsTeammate++;
                        winner = 'teammate';
                    }
                }

                qualiRounds.push({
                    round: normRound,
                    raceName,
                    countryCode,
                    driverPosition: dPos,
                    teammatePosition: tPos,
                    winner,
                });
            }

            // Race round comparison
            if (raceD || raceT) {
                const dPos = raceD?.position ?? null;
                const tPos = raceT?.position ?? null;
                let winner: 'driver' | 'teammate' | 'unclassified' = 'unclassified';

                if (dPos !== null && tPos !== null) {
                    raceTotal++;
                    if (dPos < tPos) {
                        raceWinsDriver++;
                        winner = 'driver';
                    } else if (tPos < dPos) {
                        raceWinsTeammate++;
                        winner = 'teammate';
                    }
                }

                raceRounds.push({
                    round: normRound,
                    raceName,
                    countryCode,
                    driverPosition: dPos,
                    teammatePosition: tPos,
                    driverStatus: raceD?.status,
                    teammateStatus: raceT?.status,
                    winner,
                });
            }
        }

        if (qualiRounds.length === 0 && raceRounds.length === 0) return;

        const qualiDecided = qualiWinsDriver + qualiWinsTeammate;
        const raceDecided = raceWinsDriver + raceWinsTeammate;

        entries.push({
            id: `${season}_${constructorId}_${teammateId}`,
            season,
            constructorId,
            constructorName,
            teammateId,
            teammateName,
            qualiWinsDriver,
            qualiWinsTeammate,
            qualiTotal,
            qualiWinPctDriver: qualiDecided > 0 ? roundTo2((qualiWinsDriver / qualiDecided) * 100) : 0,
            qualiRounds,
            raceWinsDriver,
            raceWinsTeammate,
            raceTotal,
            raceWinPctDriver: raceDecided > 0 ? roundTo2((raceWinsDriver / raceDecided) * 100) : 0,
            raceRounds,
        });
    });

    return entries.sort((a, b) => b.raceRounds.length - a.raceRounds.length);
}

/**
 * Build chronological race-by-race telemetry log for a driver in a season.
 */
export function buildDriverSeasonRaceLog(
    driverId: string,
    calendar: Race[],
    raceResults: SeasonRaceResult[],
    qualiResults: SeasonQualifyingResult[],
    sprintResults: SeasonSprintResult[],
    personalRaces: SeasonRatings | null,
    communityRatings: CommunityRating[],
    fallbackConstructor: { constructorId: string; constructorName: string },
): DriverRaceLogEntry[] {
    const raceResultByRound = new Map<string, SeasonRaceResult>();
    for (const r of raceResults) {
        if (r.driverId === driverId) {
            raceResultByRound.set(normalizeRound(r.round), r);
        }
    }

    const qualiByRound = new Map<string, SeasonQualifyingResult>();
    for (const q of qualiResults) {
        if (q.driverId === driverId) {
            qualiByRound.set(normalizeRound(q.round), q);
        }
    }

    const sprintByRound = new Map<string, SeasonSprintResult>();
    for (const s of sprintResults) {
        if (s.driverId === driverId) {
            sprintByRound.set(normalizeRound(s.round), s);
        }
    }

    const personalByRound = new Map<string, { rating: number; raceName: string; date: string; constructorId: string; constructorName: string }>();
    for (const race of personalRaces?.races ?? []) {
        if (!race.completed) continue;
        const found = validRatings(race.ratings).find(r => r.driverId === driverId);
        if (found) {
            personalByRound.set(normalizeRound(race.round), {
                rating: found.rating,
                raceName: race.raceName,
                date: race.date,
                constructorId: found.constructorId,
                constructorName: found.constructorName,
            });
        }
    }

    const communityByRound = new Map<string, { averageRating: number; voteCount: number }>();
    for (const rating of communityRatings) {
        if (
            rating.driverId === driverId
            && rating.round
            && Number.isFinite(rating.averageRating)
            && rating.averageRating >= 0.5
            && rating.averageRating <= 10
            && rating.voteCount > 0
        ) {
            communityByRound.set(normalizeRound(rating.round), {
                averageRating: roundTo2(rating.averageRating),
                voteCount: rating.voteCount,
            });
        }
    }

    const calendarByRound = new Map<string, Race>();
    for (const race of calendar) {
        calendarByRound.set(normalizeRound(race.round), race);
    }

    const allRounds = new Set<string>([
        ...raceResultByRound.keys(),
        ...qualiByRound.keys(),
        ...personalByRound.keys(),
        ...communityByRound.keys(),
    ]);

    const sortedRounds = [...allRounds].sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10));

    return sortedRounds.map(round => {
        const raceRes = raceResultByRound.get(round);
        const qualiRes = qualiByRound.get(round);
        const sprintRes = sprintByRound.get(round);
        const personal = personalByRound.get(round);
        const comm = communityByRound.get(round);
        const cal = calendarByRound.get(round);

        const raceName = raceRes?.raceName || cal?.raceName || personal?.raceName || `Round ${round}`;
        const date = raceRes?.date || cal?.date || personal?.date || '';
        const constructorId = raceRes?.constructorId || qualiRes?.constructorId || personal?.constructorId || fallbackConstructor.constructorId;
        const constructorName = raceRes?.constructorName || qualiRes?.constructorName || personal?.constructorName || fallbackConstructor.constructorName;

        const gridPosition = raceRes?.gridPosition ?? qualiRes?.position ?? null;
        const qualiPosition = qualiRes?.position ?? null;
        const finishPosition = raceRes ? raceRes.position : null;
        const status = raceRes?.status ?? (personal || comm ? 'Rated' : '—');
        const sprintPoints = sprintRes?.points ?? 0;
        const points = (raceRes?.points ?? 0) + sprintPoints;
        const myRating = personal?.rating ?? null;
        const communityRating = comm?.averageRating ?? null;
        const communityVotes = comm?.voteCount ?? 0;
        const ratingDelta = myRating !== null && communityRating !== null
            ? roundTo2(myRating - communityRating)
            : null;

        return {
            round,
            raceName,
            date,
            countryCode: getCountryCode(raceName),
            constructorId,
            constructorName,
            gridPosition,
            qualiPosition,
            finishPosition,
            status,
            points,
            sprintPoints,
            myRating,
            communityRating,
            communityVotes,
            ratingDelta,
        };
    });
}

/**
 * Find best and worst rated races for a driver from the race log in either 'personal' or 'community' mode.
 */
export function summarizeDriverBestWorstRaces(
    raceLog: DriverRaceLogEntry[],
    mode: 'personal' | 'community',
): DriverBestWorstSummary {
    const scored = raceLog
        .map(entry => ({
            round: entry.round,
            raceName: entry.raceName,
            rating: mode === 'community' ? entry.communityRating : entry.myRating,
        }))
        .filter((item): item is { round: string; raceName: string; rating: number } => item.rating !== null);

    if (scored.length === 0) {
        return { best: null, worst: null };
    }

    let best = scored[0];
    let worst = scored[0];
    for (const item of scored) {
        if (item.rating > best.rating) best = item;
        if (item.rating < worst.rating) worst = item;
    }

    return { best, worst };
}

/**
 * Cycle sort state for Race-by-Race Telemetry columns:
 * 1st click -> 'desc' (highest to lowest)
 * 2nd click -> 'asc' (lowest to highest)
 * 3rd click -> null (normal chronological round order)
 */
export function nextRaceLogSortState(
    current: RaceLogSortState | null,
    clickedKey: RaceLogSortKey,
): RaceLogSortState | null {
    if (!current || current.key !== clickedKey) {
        return { key: clickedKey, direction: 'desc' };
    }
    if (current.direction === 'desc') {
        return { key: clickedKey, direction: 'asc' };
    }
    return null;
}

/**
 * Sort driver race log by My Rating or Community Avg while keeping unrated (null) rows at the bottom.
 * When sort is null, returns the original chronological order.
 */
export function sortDriverRaceLog(
    raceLog: DriverRaceLogEntry[],
    sort: RaceLogSortState | null,
): DriverRaceLogEntry[] {
    if (!sort) return raceLog;

    return [...raceLog].sort((a, b) => {
        const valA = sort.key === 'myRating' ? a.myRating : a.communityRating;
        const valB = sort.key === 'myRating' ? b.myRating : b.communityRating;

        if (valA === null && valB === null) {
            return Number.parseInt(a.round, 10) - Number.parseInt(b.round, 10);
        }
        if (valA === null) return 1;
        if (valB === null) return -1;

        const diff = sort.direction === 'desc' ? valB - valA : valA - valB;
        if (diff !== 0) return diff;

        return Number.parseInt(a.round, 10) - Number.parseInt(b.round, 10);
    });
}

/**
 * Build a multi-season summary of all seasons where the user has rated this driver in localStorage.
 */
export function buildDriverCareerRatedSeasons(driverId: string): DriverCareerSeasonSummary[] {
    const allRaceRatings = getAllRatings();
    const seasonsSet = new Set<string>(Object.keys(allRaceRatings));

    try {
        const quickRaw = localStorage.getItem('f1_quick_ratings');
        if (quickRaw) {
            const parsed = JSON.parse(quickRaw) as Record<string, unknown>;
            Object.keys(parsed).forEach(season => seasonsSet.add(season));
        }
    } catch {
        // ignore storage errors
    }

    const summaries: DriverCareerSeasonSummary[] = [];

    for (const season of seasonsSet) {
        const seasonData = allRaceRatings[season];
        const completedRaces = (seasonData?.races ?? [])
            .filter(r => r.completed)
            .sort((a, b) => Number.parseInt(a.round, 10) - Number.parseInt(b.round, 10));

        const raceScores: Array<{ rating: number; raceName: string; constructorId: string; constructorName: string }> = [];
        for (const race of completedRaces) {
            const match = validRatings(race.ratings).find(r => r.driverId === driverId);
            if (match) {
                raceScores.push({
                    rating: match.rating,
                    raceName: race.raceName,
                    constructorId: match.constructorId,
                    constructorName: match.constructorName,
                });
            }
        }

        if (raceScores.length > 0) {
            const latest = raceScores[raceScores.length - 1];
            const sum = raceScores.reduce((acc, item) => acc + item.rating, 0);
            let best = raceScores[0];
            let worst = raceScores[0];
            for (const item of raceScores) {
                if (item.rating > best.rating) best = item;
                if (item.rating < worst.rating) worst = item;
            }

            summaries.push({
                season,
                constructorId: latest.constructorId,
                constructorName: latest.constructorName,
                averageRating: roundTo2(sum / raceScores.length),
                ratedRaces: raceScores.length,
                source: 'race',
                bestRating: best.rating,
                bestRaceName: best.raceName,
                worstRating: worst.rating,
                worstRaceName: worst.raceName,
            });
            continue;
        }

        const quick = getQuickRatings(season);
        const quickMatch = quick?.find(r => r.driverId === driverId);
        if (quickMatch) {
            summaries.push({
                season,
                constructorId: quickMatch.constructorId,
                constructorName: quickMatch.constructorName,
                averageRating: roundTo2(quickMatch.rating),
                ratedRaces: 1,
                source: 'quick',
                bestRating: null,
                bestRaceName: null,
                worstRating: null,
                worstRaceName: null,
            });
        }
    }

    return summaries.sort((a, b) => Number.parseInt(b.season, 10) - Number.parseInt(a.season, 10));
}

import type { Race } from '../types';
import { isRaceCompleted } from '../api/f1Api';
import { getRatedRacesCount } from './storage';

export interface SeasonProgressSnapshot {
    season: string;
    ratedCount: number;
    completedCount: number;
    remainingCount: number;
    unlocked: boolean;
    hasCompletedRaces: boolean;
    progressPercent: number;
}

export function getSeasonProgressFromRaces(season: string, races: Race[]): SeasonProgressSnapshot {
    const completedCount = races.filter((race) => isRaceCompleted(race.date)).length;
    const ratedCount = Math.min(getRatedRacesCount(season), completedCount);
    const hasCompletedRaces = completedCount > 0;

    return {
        season,
        ratedCount,
        completedCount,
        remainingCount: Math.max(completedCount - ratedCount, 0),
        unlocked: hasCompletedRaces && ratedCount === completedCount,
        hasCompletedRaces,
        progressPercent: completedCount > 0 ? (ratedCount / completedCount) * 100 : 0,
    };
}

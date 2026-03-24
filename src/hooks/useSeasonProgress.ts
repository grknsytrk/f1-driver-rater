import { useEffect, useState } from 'react';
import { getRaces } from '../api/f1Api';
import { getRatedRacesCount } from '../utils/storage';
import { getSeasonProgressFromRaces, type SeasonProgressSnapshot } from '../utils/seasonProgress';

function createEmptyProgress(season: string): SeasonProgressSnapshot {
    return {
        season,
        ratedCount: getRatedRacesCount(season),
        completedCount: 0,
        remainingCount: 0,
        unlocked: false,
        hasCompletedRaces: false,
        progressPercent: 0,
    };
}

export function useSeasonProgress(season?: string, enabled = true) {
    const [progress, setProgress] = useState<SeasonProgressSnapshot | null>(
        season ? createEmptyProgress(season) : null
    );
    const [loading, setLoading] = useState(Boolean(season && enabled));

    useEffect(() => {
        if (!season) {
            setProgress(null);
            setLoading(false);
            return;
        }

        if (!enabled) {
            setProgress(createEmptyProgress(season));
            setLoading(false);
            return;
        }

        const activeSeason = season;
        let cancelled = false;
        setLoading(true);

        async function loadProgress() {
            try {
                const races = await getRaces(activeSeason);
                if (cancelled) return;
                setProgress(getSeasonProgressFromRaces(activeSeason, races));
            } catch (error) {
                console.error('Error loading season progress:', error);
                if (!cancelled) {
                    setProgress(createEmptyProgress(activeSeason));
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        }

        void loadProgress();

        return () => {
            cancelled = true;
        };
    }, [enabled, season]);

    return { progress, loading };
}

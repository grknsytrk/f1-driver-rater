import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { getRaces } from '../api/f1Api';
import { RatingModal } from '../components/RatingModal';
import { SEOHead } from '../components/SEOHead';
import type { Race } from '../types';
import type { RaceRouteLocationState, RaceRouteSnapshot } from './modalRouteState';

function createPlaceholderRace(season: string, round: string): RaceRouteSnapshot {
    return {
        season,
        round,
        raceName: `Race ${round}`,
        date: '',
    };
}

function createSnapshot(race: Race): RaceRouteSnapshot {
    return {
        season: race.season,
        round: race.round,
        raceName: race.raceName,
        date: race.date,
    };
}

export default function RaceRatingRoute() {
    const { season, round } = useParams<{ season: string; round: string }>();
    const navigate = useNavigate();
    const location = useLocation();

    const routeSnapshot = useMemo(() => {
        if (!season || !round) return null;

        const routeState = location.state as RaceRouteLocationState | null;
        const snapshot = routeState?.raceSnapshot;
        if (!snapshot) return null;

        return snapshot.season === season && snapshot.round === round ? snapshot : null;
    }, [location.state, round, season]);

    const [raceSnapshot, setRaceSnapshot] = useState<RaceRouteSnapshot | null>(() => (
        season && round ? routeSnapshot ?? createPlaceholderRace(season, round) : null
    ));
    const [metadataResolved, setMetadataResolved] = useState(Boolean(routeSnapshot));

    useEffect(() => {
        if (!season || !round) return;
        const resolvedSeason = season;
        const resolvedRound = round;

        if (routeSnapshot) {
            setRaceSnapshot(routeSnapshot);
            setMetadataResolved(true);
            return;
        }

        let isActive = true;
        setRaceSnapshot(createPlaceholderRace(resolvedSeason, resolvedRound));
        setMetadataResolved(false);

        async function loadRaceMetadata() {
            try {
                const races = await getRaces(resolvedSeason);
                if (!isActive) return;

                const selectedRace = races.find((race) => race.round === resolvedRound);
                if (selectedRace) {
                    setRaceSnapshot(createSnapshot(selectedRace));
                    setMetadataResolved(true);
                }
            } catch (error) {
                console.error('Error loading race metadata:', error);
            }
        }

        void loadRaceMetadata();

        return () => {
            isActive = false;
        };
    }, [round, routeSnapshot, season]);

    if (!season || !round || !raceSnapshot) return null;

    return (
        <>
            <SEOHead
                title={`Rate Race ${round} - F1 ${season}`}
                description={`Rate driver performances for round ${round} of the ${season} F1 season.`}
                path={`/${season}/race/${round}`}
                noindex
            />
            <RatingModal
                race={raceSnapshot}
                season={season}
                metadataResolved={metadataResolved}
                onClose={() => navigate(`/${season}`)}
                onSave={() => navigate(`/${season}`)}
            />
        </>
    );
}

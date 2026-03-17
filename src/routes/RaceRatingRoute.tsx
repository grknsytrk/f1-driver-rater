import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getRaces } from '../api/f1Api';
import { RatingModal } from '../components/RatingModal';
import { RatingModalRouteFallback } from '../components/RouteFallbacks';
import { SEOHead } from '../components/SEOHead';
import { fetchWithMinDelay } from '../utils/delay';
import type { Race } from '../types';

const MIN_LOADING_TIME = 800;

export default function RaceRatingRoute() {
    const { season, round } = useParams<{ season: string; round: string }>();
    const [races, setRaces] = useState<Race[]>([]);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        async function loadRaces() {
            if (!season) return;

            setLoading(true);
            const data = await fetchWithMinDelay(() => getRaces(season), MIN_LOADING_TIME);
            setRaces(data);
            setLoading(false);
        }

        void loadRaces();
    }, [season]);

    if (!season || !round) return null;

    const selectedRace = races.find((race) => race.round === round);

    return (
        <>
            <SEOHead
                title={`Rate Race ${round} - F1 ${season}`}
                description={`Rate driver performances for round ${round} of the ${season} F1 season.`}
                path={`/${season}/race/${round}`}
                noindex
            />
            {loading || !selectedRace ? (
                <RatingModalRouteFallback />
            ) : (
                <RatingModal
                    race={selectedRace}
                    season={season}
                    onClose={() => navigate(`/${season}`)}
                    onSave={() => navigate(`/${season}`)}
                />
            )}
        </>
    );
}

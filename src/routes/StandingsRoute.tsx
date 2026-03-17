import { motion } from 'framer-motion';
import { useNavigate, useParams } from 'react-router-dom';
import { SEOHead } from '../components/SEOHead';
import { StandingsPage } from '../components/StandingsPage';

export default function StandingsRoute() {
    const { season } = useParams<{ season: string }>();
    const navigate = useNavigate();

    if (!season) return null;

    return (
        <motion.div
            key="standings"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
        >
            <SEOHead
                title={`F1 ${season} Standings - Driver & Constructor Rankings`}
                description={`F1 ${season} driver and constructor championship standings. Track points, wins, and positions throughout the Formula 1 ${season} season.`}
                path={`/${season}/standings`}
                keywords={`f1 ${season} standings, f1 ${season} championship, driver standings ${season}, constructor standings ${season}, f1 points ${season}, formula 1 ${season} rankings, f1 ${season} driver rating`}
            />
            <StandingsPage
                season={season}
                onBack={() => navigate(`/${season}`)}
            />
        </motion.div>
    );
}

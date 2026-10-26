import { motion } from 'framer-motion';
import { useNavigate, useParams } from 'react-router-dom';
import { SEOHead } from '../components/SEOHead';
import { DriverProfilePage } from '../components/DriverProfilePage';

export default function DriverProfileRoute() {
    const { season, driverId } = useParams<{ season: string; driverId: string }>();
    const navigate = useNavigate();

    if (!season || !driverId) return null;

    const readableDriver = driverId.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

    return (
        <motion.div
            key={`driver-profile-${season}-${driverId}`}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
        >
            <SEOHead
                title={`${readableDriver} - F1 ${season} Driver Profile & Ratings`}
                description={`View ${readableDriver}'s F1 ${season} driver ratings, teammate head-to-head battles, race-by-race telemetry, and community score distribution.`}
                path={`/${season}/driver/${driverId}`}
            />
            <DriverProfilePage
                season={season}
                driverId={driverId}
                onSelectDriver={nextDriverId => navigate(`/${season}/driver/${nextDriverId}`)}
                onSelectSeason={nextSeason => navigate(`/${nextSeason}/driver/${driverId}`)}
                onSelectRace={(round, raceName, date) => navigate(`/${season}/race/${round}`, {
                    state: {
                        raceSnapshot: {
                            season,
                            round,
                            raceName,
                            date,
                        },
                    },
                })}
            />
        </motion.div>
    );
}

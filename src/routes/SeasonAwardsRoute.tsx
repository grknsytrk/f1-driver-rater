import { motion } from 'framer-motion';
import { useParams } from 'react-router-dom';
import { SEOHead } from '../components/SEOHead';
import { SeasonAwardsPage } from '../components/SeasonAwardsPage';

export default function SeasonAwardsRoute() {
    const { season } = useParams<{ season: string }>();

    if (!season) return null;

    return (
        <motion.div
            key="season-awards"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
        >
            <SEOHead
                title={`Season Awards - F1 ${season}`}
                description={`View your personal F1 ${season} season awards and wrapped-style summary.`}
                path={`/${season}/awards`}
                noindex
            />
            <SeasonAwardsPage season={season} />
        </motion.div>
    );
}

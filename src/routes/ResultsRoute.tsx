import { motion } from 'framer-motion';
import { useNavigate, useParams } from 'react-router-dom';
import { ResultsDashboard } from '../components/ResultsDashboard';
import { SEOHead } from '../components/SEOHead';

export default function ResultsRoute() {
    const { season } = useParams<{ season: string }>();
    const navigate = useNavigate();

    if (!season) return null;

    return (
        <motion.div
            key="results"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
        >
            <SEOHead
                title={`My Results - F1 ${season}`}
                description={`View your personal F1 ${season} driver rating results and standings.`}
                path={`/${season}/results`}
                noindex
            />
            <ResultsDashboard
                season={season}
                onReset={() => navigate(`/${season}`)}
            />
        </motion.div>
    );
}

import { motion } from 'framer-motion';
import { useNavigate, useParams } from 'react-router-dom';
import { SEOHead } from '../components/SEOHead';
import { TeammateWars } from '../components/TeammateWars';

export default function TeammateWarsRoute() {
    const { season } = useParams<{ season: string }>();
    const navigate = useNavigate();

    if (!season) return null;

    return (
        <motion.div
            key="teammate-wars"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.3 }}
        >
            <SEOHead
                title={`F1 ${season} Teammate Wars - Head-to-Head Comparison`}
                description={`F1 ${season} teammate head-to-head battle. Compare qualifying pace, race results, and overall ratings between teammates. Who won the intra-team war?`}
                path={`/${season}/teammate-wars`}
                keywords={`f1 ${season} teammates, f1 teammate comparison, head to head f1 ${season}, teammate battle, f1 intra-team rivalry, who is better f1 ${season}, f1 ${season} driver ratings`}
            />
            <TeammateWars
                season={season}
                onBack={() => navigate(`/${season}`)}
            />
        </motion.div>
    );
}

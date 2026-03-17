import { useNavigate, useParams } from 'react-router-dom';
import { QuickRateModal } from '../components/QuickRateModal';
import { SEOHead } from '../components/SEOHead';

export default function QuickRateRoute() {
    const { season } = useParams<{ season: string }>();
    const navigate = useNavigate();

    if (!season) return null;

    return (
        <>
            <SEOHead
                title={`Quick Rate - F1 ${season}`}
                description={`Quickly rate all drivers from the ${season} F1 season.`}
                path={`/${season}/quick-rate`}
                noindex
            />
            <QuickRateModal
                season={season}
                onClose={() => navigate(`/${season}`)}
                onSave={() => navigate(`/${season}`)}
            />
        </>
    );
}

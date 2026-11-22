import { useParams } from 'react-router-dom';
import { NotFoundPage } from '../components/NotFoundPage';
import { ShareSnapshotPage } from '../components/ShareSnapshotPage';

export default function ShareSnapshotRoute() {
    const { id } = useParams<{ id: string }>();

    if (!id) {
        return <NotFoundPage />;
    }

    return <ShareSnapshotPage shareId={id} />;
}

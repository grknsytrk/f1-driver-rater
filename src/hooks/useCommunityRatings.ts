import { useEffect, useState, useSyncExternalStore } from 'react';
import { COMMUNITY_CHANGE_EVENT } from '../utils/guestSync';
import { LOCAL_RATINGS_EVENT, QUICK_STORAGE_KEY, RACE_STORAGE_KEY, type RatingScope } from '../utils/ratingData';
import { communityClient, queryKey, scopeAffectsQuery, type CommunityQuery, type CommunityState } from '../utils/communityRatings';

const subscribeLocal = (listener: () => void) => {
    window.addEventListener(LOCAL_RATINGS_EVENT, listener);
    window.addEventListener('storage', listener);
    return () => { window.removeEventListener(LOCAL_RATINGS_EVENT, listener); window.removeEventListener('storage', listener); };
};
const localSnapshot = () => `${localStorage.getItem(RACE_STORAGE_KEY) ?? ''}|${localStorage.getItem(QUICK_STORAGE_KEY) ?? ''}`;
export function useRatingStorage() {
    return useSyncExternalStore(subscribeLocal, localSnapshot, () => '');
}

export function useCommunityRatings(kind: CommunityQuery['kind'], season: string, round?: string): CommunityState {
    const key = queryKey({ kind, season, round });
    const [result, setResult] = useState<{ key: string; state: CommunityState } | null>(null);
    useEffect(() => {
        if (!communityClient.configured) return;
        const query = { kind, season, round };
        let active = true;
        let revision = 0;
        async function refresh() {
            const request = ++revision;
            await Promise.resolve();
            if (!active || request !== revision) return;
            setResult(previous => ({ key, state: { status: 'loading', ratings: previous?.key === key ? previous.state.ratings : [] } }));
            try {
                const ratings = await communityClient.load(query);
                if (active && request === revision) setResult({ key, state: { status: 'ready', ratings } });
            } catch {
                if (active && request === revision) setResult({ key, state: { status: 'unavailable', ratings: [] } });
            }
        }
        const onChange = (event: Event) => {
            const scopes = (event as CustomEvent<RatingScope[]>).detail;
            if (scopes.some(scope => scopeAffectsQuery(scope, query))) void refresh();
        };
        const onOnline = () => { void refresh(); };
        window.addEventListener(COMMUNITY_CHANGE_EVENT, onChange);
        window.addEventListener('online', onOnline);
        void refresh();
        return () => {
            active = false;
            window.removeEventListener(COMMUNITY_CHANGE_EVENT, onChange);
            window.removeEventListener('online', onOnline);
        };
    }, [key, kind, season, round]);
    if (!communityClient.configured) return { status: 'disabled', ratings: [] };
    return result?.key === key ? result.state : { status: 'loading', ratings: [] };
}

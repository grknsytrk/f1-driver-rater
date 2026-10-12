import { useEffect, useState, useSyncExternalStore } from 'react';
import { COMMUNITY_CHANGE_EVENT, GUEST_SYNC_ISSUE_EVENT, type GuestSyncIssue } from '../utils/guestSync';
import { LOCAL_RATINGS_EVENT, QUICK_STORAGE_KEY, RACE_STORAGE_KEY, type RatingScope } from '../utils/ratingData';
import {
    communityClient, queryKey, scopeAffectsQuery,
    type CommunityDistributionQuery, type CommunityQuery, type CommunityState,
} from '../utils/communityRatings';
import type { CommunityRatingDistribution } from '../utils/communityRatingDistribution';

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
        const onGuestSyncIssue = (event: Event) => {
            if ((event as CustomEvent<GuestSyncIssue>).detail === null) void refresh();
        };
        window.addEventListener(COMMUNITY_CHANGE_EVENT, onChange);
        window.addEventListener('online', onOnline);
        window.addEventListener(GUEST_SYNC_ISSUE_EVENT, onGuestSyncIssue);
        void refresh();
        return () => {
            active = false;
            window.removeEventListener(COMMUNITY_CHANGE_EVENT, onChange);
            window.removeEventListener('online', onOnline);
            window.removeEventListener(GUEST_SYNC_ISSUE_EVENT, onGuestSyncIssue);
        };
    }, [key, kind, season, round]);
    if (!communityClient.configured) return { status: 'disabled', ratings: [] };
    return result?.key === key ? result.state : { status: 'loading', ratings: [] };
}

export type CommunityDistributionStatus = 'idle' | 'disabled' | 'loading' | 'ready' | 'unavailable';
export interface CommunityDistributionState {
    status: CommunityDistributionStatus;
    distribution: CommunityRatingDistribution | null;
}
export interface CommunityDistributionsState {
    status: CommunityDistributionStatus;
    distributions: CommunityRatingDistribution[];
}

export function useCommunityRatingDistributions(
    kind: CommunityDistributionQuery['kind'], season: string, enabled = true,
): CommunityDistributionsState {
    const key = JSON.stringify([kind, season]);
    const [result, setResult] = useState<{ key: string; state: CommunityDistributionsState } | null>(null);
    useEffect(() => {
        if (!enabled) return;
        if (!communityClient.configured) {
            setResult({ key, state: { status: 'disabled', distributions: [] } });
            return;
        }
        const query: CommunityDistributionQuery = { kind, season };
        let active = true;
        let revision = 0;
        async function refresh() {
            const request = ++revision;
            await Promise.resolve();
            if (!active || request !== revision) return;
            setResult({ key, state: { status: 'loading', distributions: [] } });
            try {
                const distributions = await communityClient.loadDistribution(query);
                if (active && request === revision) {
                    setResult({ key, state: { status: 'ready', distributions } });
                }
            } catch {
                if (active && request === revision) {
                    setResult({ key, state: { status: 'unavailable', distributions: [] } });
                }
            }
        }
        const onChange = (event: Event) => {
            const scopes = (event as CustomEvent<RatingScope[]>).detail;
            if (scopes.some(scope => scopeAffectsQuery(scope, query))) void refresh();
        };
        const onOnline = () => { void refresh(); };
        const onGuestSyncIssue = (event: Event) => {
            if ((event as CustomEvent<GuestSyncIssue>).detail === null) void refresh();
        };
        window.addEventListener(COMMUNITY_CHANGE_EVENT, onChange);
        window.addEventListener('online', onOnline);
        window.addEventListener(GUEST_SYNC_ISSUE_EVENT, onGuestSyncIssue);
        void refresh();
        return () => {
            active = false;
            window.removeEventListener(COMMUNITY_CHANGE_EVENT, onChange);
            window.removeEventListener('online', onOnline);
            window.removeEventListener(GUEST_SYNC_ISSUE_EVENT, onGuestSyncIssue);
        };
    }, [key, kind, season, enabled]);

    if (!enabled) return { status: 'idle', distributions: [] };
    if (!communityClient.configured) return { status: 'disabled', distributions: [] };
    return result?.key === key ? result.state : { status: 'loading', distributions: [] };
}

export function useCommunityRatingDistribution(
    kind: CommunityDistributionQuery['kind'], season: string, driverId: string | null,
): CommunityDistributionState {
    const state = useCommunityRatingDistributions(kind, season, driverId !== null);
    if (!driverId) return { status: 'idle', distribution: null };
    return {
        status: state.status,
        distribution: state.distributions.find(item => item.driverId === driverId) ?? null,
    };
}

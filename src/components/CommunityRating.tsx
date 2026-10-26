import { useEffect, useState } from 'react';
import type { CommunityRating, CommunityStatus } from '../utils/communityRatings';
import {
    COMMUNITY_CHANGE_EVENT,
    COMMUNITY_RATING_MONITORING_EVENT,
    GUEST_SYNC_ISSUE_EVENT,
    getCommunityRatingMonitoringUntil,
    getGuestSyncIssue,
    type GuestSyncIssue,
} from '../utils/guestSync';
import { getRatingColor } from '../utils/ratingColor';

function normalizeActiveMonitoringUntil(value: string | null): string | null {
    if (!value) return null;
    const expiration = Date.parse(value);
    return Number.isFinite(expiration) && expiration > Date.now() ? value : null;
}

function getInitialActiveMonitoringUntil(): string | null {
    return normalizeActiveMonitoringUntil(getCommunityRatingMonitoringUntil());
}

export function CommunityNotice({ status, legacy = false }: { status: CommunityStatus; legacy?: boolean }) {
    const [issue, setIssue] = useState<GuestSyncIssue>(getGuestSyncIssue);
    const [monitoringUntil, setMonitoringUntil] = useState<string | null>(getInitialActiveMonitoringUntil);

    useEffect(() => {
        const handleIssue = (event: Event) => {
            setIssue((event as CustomEvent<GuestSyncIssue>).detail);
        };
        const handleMonitoring = (event: Event) => {
            setMonitoringUntil(normalizeActiveMonitoringUntil((event as CustomEvent<string | null>).detail));
        };
        window.addEventListener(GUEST_SYNC_ISSUE_EVENT, handleIssue);
        window.addEventListener(COMMUNITY_RATING_MONITORING_EVENT, handleMonitoring);
        return () => {
            window.removeEventListener(GUEST_SYNC_ISSUE_EVENT, handleIssue);
            window.removeEventListener(COMMUNITY_RATING_MONITORING_EVENT, handleMonitoring);
        };
    }, []);

    useEffect(() => {
        if (!monitoringUntil) return;
        const expiration = Date.parse(monitoringUntil);
        const delayMs = Number.isFinite(expiration) ? Math.max(0, expiration - Date.now() + 100) : 0;
        const timeout = window.setTimeout(() => {
            setMonitoringUntil(null);
            window.dispatchEvent(new CustomEvent(COMMUNITY_CHANGE_EVENT, { detail: [{}] }));
        }, delayMs);
        return () => window.clearTimeout(timeout);
    }, [monitoringUntil]);

    const rateLimited = issue === 'anonymous-rate-limited';
    const communitySuspended = issue === 'community-suspended';
    const underNewAccountMonitoring = monitoringUntil !== null;
    const showRateLimitCard = rateLimited;

    return (
        <div className="space-y-1 font-oxanium text-[10px] leading-relaxed text-[var(--text-muted)]">
            {showRateLimitCard && (
                <section
                    role="status"
                    aria-live="polite"
                    className="mb-3 border border-[var(--accent-yellow)]/30 border-l-2 border-l-[var(--accent-yellow)] bg-[var(--accent-yellow)]/[0.04] p-3 md:p-4"
                >
                    <div className="flex items-start gap-3">
                        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center border border-[var(--accent-yellow)]/30 bg-[var(--bg-darker)] text-[var(--accent-yellow)]">
                            <span aria-hidden="true" className="font-display text-xl font-bold leading-none">!</span>
                        </span>
                        <div className="min-w-0 flex-1">
                            <h3 className="font-display text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--accent-yellow)] md:text-xs">
                                KEEPING COMMUNITY RATINGS FAIR
                            </h3>
                            <p className="mt-1 font-oxanium text-[10px] leading-relaxed text-[var(--text-secondary)] md:text-xs">
                                We’ve detected high account activity from this internet connection recently. To prevent multi-account manipulation and keep scores fair, ratings from this connection are{' '}
                                <strong>temporarily excluded from community averages</strong>. Shared networks can trigger this limit too, and it will reset automatically after a short cooldown. Your ratings remain saved on this device. Please try again later.
                            </p>
                        </div>
                    </div>
                </section>
            )}
            {underNewAccountMonitoring && !communitySuspended && (
                <section
                    role="status"
                    aria-live="polite"
                    className="mb-3 border border-sky-400/30 border-l-2 border-l-sky-400 bg-sky-500/[0.04] p-3 md:p-4"
                >
                    <div className="flex items-start gap-3">
                        <span aria-hidden="true" className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center border border-sky-400/30 bg-[var(--bg-darker)] font-display text-xl font-bold leading-none text-sky-300">i</span>
                        <div className="min-w-0 flex-1">
                            <h3 className="font-display text-[10px] font-bold uppercase tracking-[0.12em] text-sky-300 md:text-xs">
                                NEW ACCOUNT NOTICE
                            </h3>
                            <p className="mt-1 font-display text-[8px] font-bold uppercase tracking-[0.12em] text-sky-300/80 md:text-[9px]">
                                24-HOUR MONITORING
                            </p>
                            <p className="mt-2 font-oxanium text-[10px] leading-relaxed text-[var(--text-secondary)] md:text-xs">
                                To protect community ratings from manipulation, ratings from new accounts are excluded from community averages during their first 24 hours. Your ratings are saved to your account during this period. If no suspicious activity is identified, eligible ratings will be added automatically after the 24-hour period.
                            </p>
                            <p className="mt-2 font-oxanium text-[10px] leading-relaxed text-[var(--text-secondary)] md:text-xs">
                                Review bombing, creating multiple accounts to manipulate results, and deliberately submitting unfair ratings are strictly prohibited. Accounts found engaging in this behavior will be permanently suspended from community rating, and their ratings will be excluded from community averages.
                            </p>
                        </div>
                    </div>
                </section>
            )}
            {communitySuspended && (
                <section
                    role="status"
                    aria-live="polite"
                    className="mb-3 border border-[var(--accent-red)]/30 border-l-2 border-l-[var(--accent-red)] bg-[var(--accent-red)]/[0.04] p-3 md:p-4"
                >
                    <div className="flex items-start gap-3">
                        <span aria-hidden="true" className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center border border-[var(--accent-red)]/30 bg-[var(--bg-darker)] font-display text-xl font-bold leading-none text-[var(--accent-red)]">!</span>
                        <div className="min-w-0 flex-1">
                            <h3 className="font-display text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--accent-red)] md:text-xs">
                                COMMUNITY RATING ACCESS SUSPENDED
                            </h3>
                            <p className="mt-1 font-oxanium text-[10px] leading-relaxed text-[var(--text-secondary)] md:text-xs">
                                A pattern of rating manipulation has been detected on this account. This behavior violates our fair play policy and undermines the integrity of community scores. Your access to community rating has been suspended indefinitely, and your scores have been excluded from community averages. Attempts to bypass this restriction may result in further action.
                            </p>
                        </div>
                    </div>
                </section>
            )}
            {status === 'unavailable' && !showRateLimitCard && <p role="status" className="mb-2">COMMUNITY UNAVAILABLE · Your ratings are saved locally.</p>}
            {status !== 'disabled' && legacy && <p className="mb-2">Previous ratings are preserved. Reopen the rating screen and close it once to include saved scores in the community average.</p>}
        </div>
    );
}

export function CommunityValue({ rating, status, label = 'COMMUNITY AVG', showVotes = true }: {
    rating?: Pick<CommunityRating, 'averageRating' | 'voteCount'>;
    status: CommunityStatus;
    label?: string;
    showVotes?: boolean;
}) {
    if (status === 'disabled' || status === 'unavailable') return null;
    return (
        <div className="min-w-0 text-right font-oxanium" aria-label={label}>
            <div className="whitespace-nowrap text-[8px] leading-tight tracking-wide text-[var(--text-muted)] md:text-[9px]">{label}</div>
            {status === 'loading' && !rating ? (
                <span role="status" className="mt-1 inline-block animate-pulse text-sm text-[var(--text-muted)]">LOADING…</span>
            ) : rating ? (
                <>
                    <div className="mt-1 text-sm font-normal leading-none tabular-nums md:text-lg" style={{ color: getRatingColor(rating.averageRating) }}>{rating.averageRating.toFixed(2)}</div>
                    <div className="text-[8px] leading-tight text-[var(--text-muted)] md:text-[9px]">
                        {rating.voteCount < 5 && <span>EARLY DATA{showVotes ? ' · ' : ''}</span>}
                        {showVotes && <span>{rating.voteCount} VOTES</span>}
                    </div>
                </>
            ) : <div className="mt-1 text-[8px] text-[var(--text-muted)] md:text-[9px]">NO COMMUNITY DATA</div>}
        </div>
    );
}

export function PersonalRatingValue({ value, season = false }: { value: number; season?: boolean }) {
    return (
        <div className="min-w-0 font-oxanium">
            <div className="whitespace-nowrap text-[8px] leading-tight tracking-wide text-[var(--text-muted)] md:text-[9px]">
                {season ? 'YOUR SEASON RATING' : 'YOUR RATING'}
            </div>
            <div className="mt-1 text-sm font-normal leading-none tabular-nums md:text-lg" style={{ color: getRatingColor(value) }}>
                {value > 0 ? value.toFixed(2) : '—'}
            </div>
        </div>
    );
}

export function RatingComparison({ value, community, status, season = false }: {
    value: number; community?: CommunityRating; status: CommunityStatus; season?: boolean;
}) {
    return (
        <div className="flex min-h-12 items-start justify-between gap-3 py-1">
            <div className="font-oxanium">
                <div className="text-[8px] tracking-wide text-[var(--text-muted)] md:text-[9px]">{season ? 'YOUR SEASON RATING' : 'YOUR RATING'}</div>
                <div className="text-sm font-normal leading-none tabular-nums md:text-lg" style={{ color: getRatingColor(value) }}>
                    {value > 0 ? value.toFixed(2) : '—'}
                </div>
            </div>
            <CommunityValue rating={community} status={status} label={season ? 'COMMUNITY SEASON AVG' : 'COMMUNITY AVG'} />
        </div>
    );
}

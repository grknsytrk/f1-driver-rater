import { useEffect, useState } from 'react';
import { Clock, Info, ShieldAlert, ShieldCheck, ShieldOff, WifiOff } from 'lucide-react';
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

function formatRemainingMonitoring(untilIso: string): string | null {
    const remainingMs = Date.parse(untilIso) - Date.now();
    if (!Number.isFinite(remainingMs) || remainingMs <= 0) return null;
    const totalMinutes = Math.ceil(remainingMs / 60_000);
    if (totalMinutes < 60) {
        return `${totalMinutes}M LEFT`;
    }
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return minutes > 0 && hours < 12 ? `${hours}H ${minutes}M LEFT` : `${hours}H LEFT`;
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
    const remainingMonitoringLabel = monitoringUntil ? formatRemainingMonitoring(monitoringUntil) : null;

    const hasVisibleNotice = showRateLimitCard
        || (underNewAccountMonitoring && !communitySuspended)
        || communitySuspended
        || (status === 'unavailable' && !showRateLimitCard)
        || (status !== 'disabled' && legacy);

    if (!hasVisibleNotice) return null;

    return (
        <div className="mb-3 space-y-2.5 font-oxanium text-xs leading-relaxed text-[var(--text-muted)]">
            {showRateLimitCard && (
                <section
                    role="status"
                    aria-live="polite"
                    className="relative overflow-hidden border border-[var(--accent-yellow)]/30 border-l-2 border-l-[var(--accent-yellow)] bg-gradient-to-r from-[var(--accent-yellow)]/[0.08] via-[var(--bg-panel)] to-[var(--bg-panel)] p-3.5 md:p-4"
                >
                    <div className="flex items-start gap-3">
                        <span
                            aria-hidden="true"
                            className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center border border-[var(--accent-yellow)]/35 bg-[var(--bg-darker)] text-[var(--accent-yellow)]"
                        >
                            <ShieldAlert size={18} />
                        </span>
                        <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                                <h3 className="font-display-condensed text-sm font-bold uppercase tracking-wider text-[var(--accent-yellow)] md:text-base">
                                    KEEPING COMMUNITY RATINGS FAIR
                                </h3>
                                <span className="border border-[var(--accent-yellow)]/35 bg-[var(--accent-yellow)]/10 px-2 py-0.5 font-oxanium text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--accent-yellow)]">
                                    COOLDOWN ACTIVE
                                </span>
                            </div>
                            <p className="mt-1.5 font-oxanium text-[11px] leading-relaxed text-[var(--text-secondary)] md:text-xs">
                                We’ve detected high account activity from this internet connection recently. To prevent multi-account manipulation and keep scores fair, ratings from this connection are{' '}
                                <strong className="font-semibold text-white">temporarily excluded from community averages</strong>. Shared networks can trigger this limit too, and it resets automatically after a short cooldown.
                            </p>
                            <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-[var(--accent-yellow)]/15 pt-2 text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                                <span className="inline-flex items-center gap-1.5 text-[var(--accent-yellow)]/90">
                                    <ShieldCheck size={12} aria-hidden="true" />
                                    YOUR RATINGS REMAIN SAVED ON THIS DEVICE
                                </span>
                            </div>
                        </div>
                    </div>
                </section>
            )}

            {underNewAccountMonitoring && !communitySuspended && (
                <section
                    role="status"
                    aria-live="polite"
                    className="relative overflow-hidden border border-sky-400/30 border-l-2 border-l-sky-400 bg-gradient-to-r from-sky-500/[0.08] via-[var(--bg-panel)] to-[var(--bg-panel)] p-3.5 md:p-4"
                >
                    <div className="flex items-start gap-3">
                        <span
                            aria-hidden="true"
                            className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center border border-sky-400/35 bg-[var(--bg-darker)] text-sky-300"
                        >
                            <Clock size={18} />
                        </span>
                        <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                                <h3 className="font-display-condensed text-sm font-bold uppercase tracking-wider text-sky-300 md:text-base">
                                    NEW ACCOUNT NOTICE
                                </h3>
                                <span className="border border-sky-400/35 bg-sky-500/10 px-2 py-0.5 font-oxanium text-[9px] font-bold uppercase tracking-[0.16em] text-sky-200">
                                    24-HOUR MONITORING{remainingMonitoringLabel ? ` · ${remainingMonitoringLabel}` : ''}
                                </span>
                            </div>
                            <p className="mt-1.5 font-oxanium text-[11px] leading-relaxed text-[var(--text-secondary)] md:text-xs">
                                To protect community ratings from manipulation, ratings from new accounts are held out of community averages during their first 24 hours. Your ratings are saved to your account immediately and will be included automatically after the review period if no suspicious activity is identified.
                            </p>
                            <div className="mt-2.5 flex items-start gap-2 border-t border-sky-400/15 pt-2 font-oxanium text-[10px] leading-relaxed text-[var(--text-muted)] md:text-[11px]">
                                <ShieldCheck size={13} aria-hidden="true" className="mt-0.5 shrink-0 text-sky-300/80" />
                                <span>
                                    Review bombing, creating multiple accounts to manipulate results, and deliberately submitting unfair ratings are strictly prohibited and result in permanent suspension from community averages.
                                </span>
                            </div>
                        </div>
                    </div>
                </section>
            )}

            {communitySuspended && (
                <section
                    role="status"
                    aria-live="polite"
                    className="relative overflow-hidden border border-[var(--accent-red)]/35 border-l-2 border-l-[var(--accent-red)] bg-gradient-to-r from-[var(--accent-red)]/[0.09] via-[var(--bg-panel)] to-[var(--bg-panel)] p-3.5 md:p-4"
                >
                    <div className="flex items-start gap-3">
                        <span
                            aria-hidden="true"
                            className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center border border-[var(--accent-red)]/40 bg-[var(--bg-darker)] text-[var(--accent-red)]"
                        >
                            <ShieldOff size={18} />
                        </span>
                        <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                                <h3 className="font-display-condensed text-sm font-bold uppercase tracking-wider text-[var(--accent-red)] md:text-base">
                                    COMMUNITY RATING ACCESS SUSPENDED
                                </h3>
                                <span className="border border-[var(--accent-red)]/40 bg-[var(--accent-red)]/10 px-2 py-0.5 font-oxanium text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--accent-red)]">
                                    RESTRICTED
                                </span>
                            </div>
                            <p className="mt-1.5 font-oxanium text-[11px] leading-relaxed text-[var(--text-secondary)] md:text-xs">
                                A pattern of rating manipulation has been detected on this account. This behavior violates our fair play policy and undermines the integrity of community scores. Your access to community rating has been suspended indefinitely, and your scores have been excluded from community averages. Attempts to bypass this restriction may result in further action.
                            </p>
                        </div>
                    </div>
                </section>
            )}

            {status === 'unavailable' && !showRateLimitCard && (
                <div
                    role="status"
                    className="flex items-center gap-2 border border-[var(--border-color)] bg-[var(--bg-darker)]/80 px-3 py-2 text-[11px] text-[var(--text-secondary)]"
                >
                    <WifiOff size={13} aria-hidden="true" className="shrink-0 text-[var(--text-muted)]" />
                    <span>
                        <strong className="font-semibold uppercase tracking-wider text-white">COMMUNITY UNAVAILABLE</strong> · Your ratings are saved locally.
                    </span>
                </div>
            )}

            {status !== 'disabled' && legacy && (
                <div className="flex items-start gap-2 border border-[var(--border-color)] bg-[var(--bg-darker)]/80 px-3 py-2 text-[11px] text-[var(--text-secondary)]">
                    <Info size={13} aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--accent-yellow)]" />
                    <span>
                        Previous ratings are preserved. Reopen the rating screen and close it once to include saved scores in the community average.
                    </span>
                </div>
            )}
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

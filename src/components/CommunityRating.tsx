import { useEffect, useState } from 'react';
import { RefreshCw, ShieldAlert } from 'lucide-react';
import type { CommunityRating, CommunityStatus } from '../utils/communityRatings';
import {
    GUEST_SYNC_ISSUE_EVENT,
    getGuestSyncIssue,
    initializeGuestSync,
    type GuestSyncIssue,
} from '../utils/guestSync';
import { getRatingColor } from '../utils/ratingColor';

export function CommunityNotice({ status, legacy = false }: { status: CommunityStatus; legacy?: boolean }) {
    const [issue, setIssue] = useState<GuestSyncIssue>(getGuestSyncIssue);
    const [retrying, setRetrying] = useState(false);

    useEffect(() => {
        const handleIssue = (event: Event) => {
            setIssue((event as CustomEvent<GuestSyncIssue>).detail);
        };
        window.addEventListener(GUEST_SYNC_ISSUE_EVENT, handleIssue);
        return () => window.removeEventListener(GUEST_SYNC_ISSUE_EVENT, handleIssue);
    }, []);

    async function retrySync() {
        setRetrying(true);
        try {
            await initializeGuestSync();
        } finally {
            setRetrying(false);
        }
    }

    const rateLimited = issue === 'anonymous-rate-limited';
    const showRateLimitCard = rateLimited || (retrying && status === 'unavailable');

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
                            <ShieldAlert size={15} aria-hidden="true" />
                        </span>
                        <div className="min-w-0 flex-1">
                            <h3 className="font-display text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--accent-yellow)] md:text-xs">
                                {retrying ? 'SYNCING YOUR RATINGS' : 'KEEPING COMMUNITY RATINGS FAIR'}
                            </h3>
                            <p className="mt-1 font-oxanium text-[10px] leading-relaxed text-[var(--text-secondary)] md:text-xs">
                                {retrying
                                    ? 'Please wait while we try again.'
                                    : 'We’ve received too many rating attempts from this internet connection. To keep community ratings fair, new ratings are temporarily limited. Your ratings are saved on this device.'}
                            </p>
                            {!retrying && (
                                <button
                                    type="button"
                                    onClick={() => void retrySync()}
                                    className="mt-3 inline-flex items-center gap-2 border border-[var(--accent-yellow)]/50 px-3 py-2 font-oxanium text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--accent-yellow)] transition-colors hover:bg-[var(--accent-yellow)]/10 hover:text-white disabled:cursor-wait disabled:opacity-60"
                                    disabled={retrying}
                                >
                                    <RefreshCw size={12} aria-hidden="true" />
                                    TRY AGAIN
                                </button>
                            )}
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

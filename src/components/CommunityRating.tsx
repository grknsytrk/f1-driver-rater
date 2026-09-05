import type { CommunityRating, CommunityStatus } from '../utils/communityRatings';

function ratingColor(value: number): string {
    if (value <= 0) return 'var(--text-muted)';
    const t = Math.max(0, Math.min(1, (value - 0.5) / 9.5));
    if (t < 0.4) {
        const localT = t / 0.4;
        return `rgb(225, ${Math.round(6 + localT * 101)}, 0)`;
    }
    if (t < 0.7) {
        const localT = (t - 0.4) / 0.3;
        return `rgb(${Math.round(225 + localT * 17)}, ${Math.round(107 + localT * 102)}, ${Math.round(localT * 61)})`;
    }
    const localT = (t - 0.7) / 0.3;
    return `rgb(${Math.round(242 - localT * 242)}, ${Math.round(209 + localT * 46)}, ${Math.round(61 + localT * 75)})`;
}

export function CommunityNotice({ status, legacy = false }: { status: CommunityStatus; legacy?: boolean }) {
    return (
        <div className="space-y-1 font-oxanium text-[10px] leading-relaxed text-[var(--text-muted)]">
            {status === 'unavailable' && <p role="status" className="mb-2">COMMUNITY UNAVAILABLE · Your ratings are saved locally.</p>}
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
            <div className="text-[8px] leading-tight tracking-wide text-[var(--text-muted)] md:text-[9px]">{label}</div>
            {status === 'loading' && !rating ? (
                <span role="status" className="inline-block animate-pulse text-sm text-[var(--text-muted)]">LOADING…</span>
            ) : rating ? (
                <>
                    <div className="text-lg font-bold leading-tight tabular-nums text-[var(--accent-yellow)] md:text-xl">{rating.averageRating.toFixed(2)}</div>
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
            <div className="text-[8px] leading-tight tracking-wide text-[var(--text-muted)] md:text-[9px]">
                {season ? 'YOUR SEASON RATING' : 'YOUR RATING'}
            </div>
            <div className="text-base font-bold leading-tight tabular-nums md:text-2xl" style={{ color: ratingColor(value) }}>
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
            <div className="text-base font-bold leading-tight tabular-nums md:text-2xl" style={{ color: ratingColor(value) }}>
                {value > 0 ? value.toFixed(2) : '—'}
            </div>
            </div>
            <CommunityValue rating={community} status={status} label={season ? 'COMMUNITY SEASON AVG' : 'COMMUNITY AVG'} />
        </div>
    );
}

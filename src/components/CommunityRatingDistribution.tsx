import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { CommunityDistributionStatus } from '../hooks/useCommunityRatings';
import {
    COMMUNITY_DISTRIBUTION_MIN_VOTES,
    summarizeCommunityDistribution,
    type CommunityRatingDistribution as Distribution,
} from '../utils/communityRatingDistribution';
import type { CommunityStatus } from '../utils/communityRatings';
import { getRatingColor } from '../utils/ratingColor';

const AGREEMENT_LABELS = {
    consensus: 'CONSENSUS',
    mixed: 'MIXED',
    polarizing: 'POLARIZING',
} as const;

const AGREEMENT_COLORS = {
    consensus: 'text-[var(--accent-yellow)] border-[var(--accent-yellow)]/50',
    mixed: 'text-white border-white/30',
    polarizing: 'text-[var(--accent-red)] border-[var(--accent-red)]/50',
} as const;

interface CommunityRatingDistributionProps {
    driverName: string;
    communityStatus: CommunityStatus;
    distributionStatus: CommunityDistributionStatus;
    distribution: Distribution | null;
    voteCount: number;
}

export function CommunityRatingDistribution({
    driverName, communityStatus, distributionStatus, distribution, voteCount,
}: CommunityRatingDistributionProps) {
    if (communityStatus === 'loading' && voteCount === 0) {
        return <p role="status" className="font-oxanium text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Loading community ratings…</p>;
    }
    if (voteCount === 0) {
        return <p className="font-oxanium text-[10px] uppercase tracking-wider text-[var(--text-muted)]">No community data for this driver.</p>;
    }

    const disclosure = (
        <p className="mt-3 font-oxanium text-[9px] leading-relaxed text-[var(--text-muted)]">
            Selected ratings may be included in this community data.
        </p>
    );

    if (voteCount < COMMUNITY_DISTRIBUTION_MIN_VOTES) {
        return (
            <div>
                <p role="status" className="font-oxanium text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                    Early data · {voteCount}/{COMMUNITY_DISTRIBUTION_MIN_VOTES} votes
                </p>
                {disclosure}
            </div>
        );
    }
    if (distributionStatus === 'loading') {
        return (
            <div>
                <p role="status" className="font-oxanium text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Loading rating distribution…</p>
                {disclosure}
            </div>
        );
    }
    if (distributionStatus === 'unavailable' || distributionStatus === 'disabled' || !distribution) {
        return (
            <div>
                <p role="status" className="font-oxanium text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Community distribution unavailable.</p>
                {disclosure}
            </div>
        );
    }

    const summary = summarizeCommunityDistribution(distribution);
    if (!summary) {
        return (
            <div>
                <p role="status" className="font-oxanium text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Community distribution unavailable.</p>
                {disclosure}
            </div>
        );
    }

    return (
        <div>
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
                    <div className="font-oxanium">
                        <div className="text-[8px] tracking-wide text-[var(--text-muted)]">POOLED AVG</div>
                        <div className="mt-1 text-lg leading-none tabular-nums text-white">{summary.averageRating.toFixed(2)}</div>
                    </div>
                    <div className="font-oxanium">
                        <div className="text-[8px] tracking-wide text-[var(--text-muted)]">VOTES</div>
                        <div className="mt-1 text-lg leading-none tabular-nums text-white">{distribution.voteCount}</div>
                    </div>
                    <div className="font-oxanium">
                        <div className="text-[8px] tracking-wide text-[var(--text-muted)]">SPREAD (σ)</div>
                        <div className="mt-1 text-lg leading-none tabular-nums text-white">{summary.standardDeviation.toFixed(2)}</div>
                    </div>
                </div>
                <span className={`border px-2 py-1 font-oxanium text-[9px] tracking-widest ${AGREEMENT_COLORS[summary.agreement]}`}>
                    {AGREEMENT_LABELS[summary.agreement]}
                </span>
            </div>

            <div
                role="img"
                aria-label={`${driverName} community rating distribution histogram`}
                className="h-40 w-full"
            >
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={distribution.buckets} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
                        <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                        <XAxis
                            dataKey="score"
                            interval={1}
                            tickFormatter={(score: number) => Number.isInteger(score) ? String(score) : ''}
                            tick={{ fill: '#8E9196', fontSize: 9, fontFamily: 'Oxanium' }}
                            axisLine={{ stroke: '#34363a' }}
                            tickLine={false}
                        />
                        <YAxis
                            allowDecimals={false}
                            width={32}
                            tick={{ fill: '#8E9196', fontSize: 9, fontFamily: 'Oxanium' }}
                            axisLine={false}
                            tickLine={false}
                        />
                        <Tooltip
                            cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                            formatter={(count: number) => [count, 'Votes']}
                            labelFormatter={(score: number) => `${Number(score).toFixed(1)} rating`}
                            contentStyle={{ background: '#050608', border: '1px solid #34363a', fontFamily: "'Formula1', 'Titillium Web', sans-serif", fontSize: 11 }}
                            labelStyle={{ color: '#fff', fontFamily: "'Formula1', 'Titillium Web', sans-serif" }}
                            itemStyle={{ color: '#8E9196', fontFamily: "'Formula1', 'Titillium Web', sans-serif", fontSize: 10 }}
                        />
                        <Bar dataKey="count" isAnimationActive={false}>
                            {distribution.buckets.map(bucket => (
                                <Cell key={bucket.score} fill={getRatingColor(bucket.score)} />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>
            {disclosure}
        </div>
    );
}

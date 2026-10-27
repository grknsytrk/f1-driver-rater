import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { CommunityDistributionStatus } from '../hooks/useCommunityRatings';
import {
    COMMUNITY_AGREEMENT_MIN_ASSESSED_RACES,
    COMMUNITY_AGREEMENT_MIN_QUICK_VOTES,
    COMMUNITY_DISTRIBUTION_MIN_VOTES,
    summarizeCommunityDistribution,
    type CommunityRatingDistribution as Distribution,
} from '../utils/communityRatingDistribution';
import type { CommunityStatus } from '../utils/communityRatings';
import { getRatingColor } from '../utils/ratingColor';

const AGREEMENT_LABELS = {
    consensus: 'VERY SIMILAR RATINGS',
    mostlyAgreed: 'SIMILAR RATINGS',
    mixed: 'MIXED RATINGS',
    lowAgreement: 'VERY DIFFERENT RATINGS',
} as const;

const AGREEMENT_COLORS = {
    consensus: 'text-[var(--accent-yellow)] border-[var(--accent-yellow)]/50',
    mostlyAgreed: 'text-emerald-400 border-emerald-400/50',
    mixed: 'text-white border-white/30',
    lowAgreement: 'text-[var(--accent-red)] border-[var(--accent-red)]/50',
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
                    Too early to tell · {voteCount}/{COMMUNITY_DISTRIBUTION_MIN_VOTES} votes
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
                        <div className="text-[8px] tracking-wide text-[var(--text-muted)]">AGREEMENT</div>
                        <div className="mt-1 text-lg leading-none tabular-nums text-white">
                            {summary.agreementScore === null ? '—' : <>
                                {summary.agreementScore.toFixed(1)}
                                <span className="ml-0.5 text-[10px] text-[var(--text-muted)]">/100</span>
                            </>}
                        </div>
                        {summary.raceCount > 0 && (
                            <div className="mt-1 text-[8px] text-[var(--text-muted)]">
                                {summary.assessedRaceCount}/{summary.raceCount} RACES WITH 2+ VOTES
                            </div>
                        )}
                        {summary.agreementStabilityInterval && (
                            <div className="mt-1 text-[8px] text-[var(--text-muted)]">
                                ESTIMATE RANGE {summary.agreementStabilityInterval.lower.toFixed(1)}–{summary.agreementStabilityInterval.upper.toFixed(1)}
                            </div>
                        )}
                        {summary.agreementStability === 'borderline' && (
                            <div className="mt-1 text-[8px] text-amber-300">LABEL MAY CHANGE</div>
                        )}
                    </div>
                </div>
                <span className={`border px-2 py-1 font-oxanium text-[9px] tracking-widest ${summary.agreement
                    ? AGREEMENT_COLORS[summary.agreement] : 'text-[var(--text-muted)] border-white/30'}`}>
                    {summary.agreement ? AGREEMENT_LABELS[summary.agreement] : 'TOO EARLY TO TELL'}
                </span>
            </div>

            <details className="mb-3 font-oxanium text-[9px] leading-relaxed text-[var(--text-muted)]">
                <summary className="cursor-pointer hover:text-white">About agreement</summary>
                <p className="mt-1">
                    {summary.raceCount > 0
                        ? `The score reflects the average gap between pairs of ratings: 100 means the ratings match, while 0 means the biggest possible gap. Each race with at least 2 votes counts equally; a label appears after ${COMMUNITY_AGREEMENT_MIN_ASSESSED_RACES} races meet that requirement.`
                        : `The score reflects the average gap between pairs of ratings: 100 means the ratings match, while 0 means the biggest possible gap. A label appears after ${COMMUNITY_AGREEMENT_MIN_QUICK_VOTES} Quick Rate votes.`}
                    {summary.agreementStabilityInterval && ' The estimate range shows how the score shifts when the available races and votes are resampled.'}
                </p>
            </details>

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

export const COMMUNITY_DISTRIBUTION_MIN_VOTES = 5;

export interface CommunityRatingBucket {
    score: number;
    count: number;
}

export interface CommunityRatingDistribution {
    driverId: string;
    voteCount: number;
    buckets: CommunityRatingBucket[];
}

export type CommunityAgreement = 'consensus' | 'mixed' | 'polarizing';

export interface CommunityDistributionSummary {
    averageRating: number;
    standardDeviation: number;
    agreement: CommunityAgreement;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

export function normalizeCommunityDistributionRow(value: unknown): CommunityRatingDistribution | null {
    if (!isRecord(value)) return null;
    const driverId = value.driver_id;
    const voteCount = Number(value.vote_count);
    const rawBuckets = value.rating_distribution;
    if (typeof driverId !== 'string' || !driverId || !Number.isSafeInteger(voteCount)
        || voteCount < COMMUNITY_DISTRIBUTION_MIN_VOTES || !Array.isArray(rawBuckets) || rawBuckets.length !== 20) {
        return null;
    }

    const buckets: CommunityRatingBucket[] = [];
    for (let index = 0; index < 20; index += 1) {
        const bucket = rawBuckets[index];
        if (!isRecord(bucket)) return null;
        const score = Number(bucket.score);
        const count = Number(bucket.count);
        if (score !== (index + 1) / 2 || !Number.isSafeInteger(count) || count < 0) return null;
        buckets.push({ score, count });
    }
    if (buckets.reduce((total, bucket) => total + bucket.count, 0) !== voteCount) return null;

    return { driverId, voteCount, buckets };
}

export function getCommunityAgreement(standardDeviation: number): CommunityAgreement | null {
    if (!Number.isFinite(standardDeviation) || standardDeviation < 0) return null;
    if (standardDeviation < 1) return 'consensus';
    if (standardDeviation < 2) return 'mixed';
    return 'polarizing';
}

export function summarizeCommunityDistribution(
    distribution: CommunityRatingDistribution,
): CommunityDistributionSummary | null {
    if (distribution.voteCount < COMMUNITY_DISTRIBUTION_MIN_VOTES
        || distribution.buckets.reduce((total, bucket) => total + bucket.count, 0) !== distribution.voteCount) return null;

    const weightedTotal = distribution.buckets.reduce((total, bucket) => total + bucket.score * bucket.count, 0);
    const averageRating = weightedTotal / distribution.voteCount;
    const variance = distribution.buckets.reduce(
        (total, bucket) => total + (bucket.score - averageRating) ** 2 * bucket.count,
        0,
    ) / distribution.voteCount;
    const standardDeviation = Math.sqrt(variance);
    const agreement = getCommunityAgreement(standardDeviation);
    return agreement ? { averageRating, standardDeviation, agreement } : null;
}

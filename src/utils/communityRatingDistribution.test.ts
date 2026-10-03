import { describe, expect, it } from 'vitest';
import {
    COMMUNITY_DISTRIBUTION_MIN_VOTES,
    getCommunityAgreement,
    normalizeCommunityDistributionRow,
    summarizeCommunityDistribution,
} from './communityRatingDistribution';

function bucketCounts(values: number[]) {
    return Array.from({ length: 20 }, (_, index) => {
        const score = (index + 1) / 2;
        return { score, count: values.filter(value => value === score).length };
    });
}

describe('community rating distribution', () => {
    it('normalizes all 20 half-point buckets and derives a vote-weighted summary', () => {
        const distribution = normalizeCommunityDistributionRow({
            driver_id: 'norris', vote_count: '5',
            rating_distribution: bucketCounts([0.5, 1, 5, 9.5, 10]),
        });

        expect(distribution).not.toBeNull();
        expect(distribution?.buckets).toHaveLength(20);
        expect(distribution?.buckets[1]).toEqual({ score: 1, count: 1 });
        expect(distribution?.buckets[2]).toEqual({ score: 1.5, count: 0 });
        expect(summarizeCommunityDistribution(distribution!)).toMatchObject({
            averageRating: 5.2,
            agreement: 'polarizing',
        });
    });

    it('rejects incomplete, inconsistent, and under-threshold aggregate results', () => {
        const validBuckets = bucketCounts([5, 5, 5, 5, 5]);
        expect(normalizeCommunityDistributionRow({
            driver_id: 'norris', vote_count: COMMUNITY_DISTRIBUTION_MIN_VOTES - 1,
            rating_distribution: validBuckets,
        })).toBeNull();
        expect(normalizeCommunityDistributionRow({ driver_id: 'norris', vote_count: 5, rating_distribution: validBuckets.slice(1) })).toBeNull();
        expect(normalizeCommunityDistributionRow({ driver_id: 'norris', vote_count: 6, rating_distribution: validBuckets })).toBeNull();
    });

    it('labels agreement at the specified standard deviation boundaries', () => {
        expect(getCommunityAgreement(0)).toBe('consensus');
        expect(getCommunityAgreement(0.999)).toBe('consensus');
        expect(getCommunityAgreement(1)).toBe('mixed');
        expect(getCommunityAgreement(1.999)).toBe('mixed');
        expect(getCommunityAgreement(2)).toBe('polarizing');
        expect(getCommunityAgreement(Number.NaN)).toBeNull();
    });

    it('does not summarize a malformed distribution', () => {
        expect(summarizeCommunityDistribution({
            driverId: 'norris', voteCount: 5, buckets: bucketCounts([5, 5, 5, 5]),
        })).toBeNull();
    });
});

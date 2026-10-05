import { describe, expect, it } from 'vitest';
import {
    getCommunityAgreement,
    normalizeCommunityDistributionRow,
    normalizeCommunityDistributions,
    summarizeCommunityDistribution,
} from './communityRatingDistribution';

function bucketCounts(values: number[]) {
    return Array.from({ length: 20 }, (_, index) => {
        const score = (index + 1) / 2;
        return { score, count: values.filter(value => value === score).length };
    });
}

function rpcRow(values: number[], round: string | null = '1', driverId = 'norris') {
    return { driver_id: driverId, round, vote_count: values.length, rating_distribution: bucketCounts(values) };
}

function summary(rows: ReturnType<typeof rpcRow>[], kind: 'race' | 'quick' = 'race') {
    return summarizeCommunityDistribution(normalizeCommunityDistributions(rows, kind)[0])!;
}

describe('community rating distribution', () => {
    it('normalizes numeric strings and keeps every half-point bucket', () => {
        const row = normalizeCommunityDistributionRow({ ...rpcRow([0.5, 1, 5, 9.5, 10]), vote_count: '5' });
        expect(row).toMatchObject({ driverId: 'norris', round: '1', voteCount: 5 });
        expect(row?.buckets).toHaveLength(20);
        expect(row?.buckets[1]).toEqual({ score: 1, count: 1 });
        expect(row?.buckets[2]).toEqual({ score: 1.5, count: 0 });
        expect(summary([rpcRow([0.5, 1, 5, 9.5, 10])]).averageRating).toBe(5.2);
    });

    it.each([
        [7.5, 100], [8, 100], [8.5, 75], [9, 50], [9.5, 25], [10, 0],
    ])('assesses two votes and gradually scores the difference between 7 and %s', (rating, expected) => {
        expect(summary([rpcRow([7, rating])])).toMatchObject({ agreementScore: expected, assessedRaceCount: 1, raceCount: 1 });
    });

    it('does not mistake good and bad races with unanimous opinions for disagreement', () => {
        expect(summary([rpcRow([4, 4], '1'), rpcRow([9, 9, 9], '2')])).toEqual({
            averageRating: 7, agreementScore: 100, agreement: 'consensus', assessedRaceCount: 2, raceCount: 2,
        });
    });

    it('gives races equal weight even when their vote counts differ', () => {
        const result = summary([rpcRow(Array(20).fill(8), '1'), rpcRow([0.5, 10], '2')]);
        expect(result).toMatchObject({ averageRating: 7.75, agreementScore: 50, agreement: 'lowAgreement', assessedRaceCount: 2 });
    });

    it.each([
        [1, 90, 'consensus'], [2, 81.0526315789, 'mostlyAgreed'], [4, 66.3157894737, 'mixed'],
    ])('retains %s extreme votes without letting their distance dominate agreement', (outliers, score, agreement) => {
        const result = summary([rpcRow([...Array(20 - outliers).fill(8.5), ...Array(outliers).fill(0.5)])]);
        expect(result.agreementScore).toBeCloseTo(score);
        expect(result.agreement).toBe(agreement);
    });

    it('recognizes substantial disagreement between equally sized distant groups', () => {
        const result = summary([rpcRow([...Array(10).fill(3), ...Array(10).fill(9)])]);
        expect(result.agreementScore).toBeCloseTo(47.3684210526);
        expect(result.agreement).toBe('lowAgreement');
    });

    it('keeps single-vote races in the histogram but excludes them from agreement', () => {
        const result = summary([rpcRow([8, 8.5], '1'), rpcRow([0.5], '2')]);
        expect(result.averageRating).toBeCloseTo(17 / 3);
        expect(result).toMatchObject({ agreementScore: 100, assessedRaceCount: 1, raceCount: 2 });
    });

    it('does not create consensus by comparing single votes across different races', () => {
        expect(summary([rpcRow([8], '1'), rpcRow([8], '2'), rpcRow([8], '3')])).toEqual({
            averageRating: 8, agreementScore: null, agreement: null, assessedRaceCount: 0, raceCount: 3,
        });
    });

    it('assesses Quick Rate votes directly without inventing race coverage', () => {
        expect(summary([rpcRow([7, 8], null)], 'quick')).toEqual({
            averageRating: 7.5, agreementScore: 100, agreement: 'consensus', assessedRaceCount: 0, raceCount: 0,
        });
    });

    it('keeps drivers separate when rebuilding their season histograms', () => {
        const drivers = normalizeCommunityDistributions([
            rpcRow([8, 9]), rpcRow([3, 3], '2', 'piastri'), rpcRow([0.5], '2'),
        ], 'race');
        expect(drivers).toHaveLength(2);
        expect(drivers[0].voteCount).toBe(3);
        expect(drivers[0].buckets[0].count).toBe(1);
        expect(drivers[1].voteCount).toBe(2);
    });

    it('rejects incomplete, inconsistent, and invalid scope rows', () => {
        const row = rpcRow([5, 5]);
        expect(normalizeCommunityDistributionRow({ ...row, vote_count: 0 })).toBeNull();
        expect(normalizeCommunityDistributionRow({ ...row, vote_count: 3 })).toBeNull();
        expect(normalizeCommunityDistributionRow({ ...row, rating_distribution: row.rating_distribution.slice(1) })).toBeNull();
        expect(normalizeCommunityDistributionRow({ ...row, round: undefined })).toBeNull();
        expect(normalizeCommunityDistributionRow({ ...row, round: '0' })).toBeNull();
        expect(normalizeCommunityDistributionRow({ ...row, rating_distribution: bucketCounts([5, 5]).map(bucket => ({ ...bucket, count: -1 })) })).toBeNull();
    });

    it('rejects partial, duplicate, and mixed-source responses instead of claiming agreement', () => {
        expect(() => normalizeCommunityDistributions([rpcRow([5, 5]), {}], 'race')).toThrow('Invalid');
        expect(() => normalizeCommunityDistributions([rpcRow([5, 5]), rpcRow([5, 5])], 'race')).toThrow('Duplicate');
        expect(() => normalizeCommunityDistributions([rpcRow([5, 5], null)], 'race')).toThrow('scope');
        expect(() => normalizeCommunityDistributions([rpcRow([5, 5])], 'quick')).toThrow('scope');
        expect(() => normalizeCommunityDistributions([rpcRow([5])], 'race')).toThrow('Insufficient');
        expect(() => normalizeCommunityDistributions(null, 'race')).toThrow('Invalid');
    });

    it('labels agreement at the exact score boundaries', () => {
        expect(getCommunityAgreement(100)).toBe('consensus');
        expect(getCommunityAgreement(90)).toBe('consensus');
        expect(getCommunityAgreement(89.999)).toBe('mostlyAgreed');
        expect(getCommunityAgreement(75)).toBe('mostlyAgreed');
        expect(getCommunityAgreement(74.999)).toBe('mixed');
        expect(getCommunityAgreement(55)).toBe('mixed');
        expect(getCommunityAgreement(54.999)).toBe('lowAgreement');
        expect(getCommunityAgreement(0)).toBe('lowAgreement');
        expect(getCommunityAgreement(-1)).toBeNull();
        expect(getCommunityAgreement(101)).toBeNull();
        expect(getCommunityAgreement(Number.NaN)).toBeNull();
    });

    it('does not summarize a pooled histogram inconsistent with its race data', () => {
        const distribution = normalizeCommunityDistributions([rpcRow([5, 5])], 'race')[0];
        distribution.buckets = bucketCounts([3, 3]);
        expect(summarizeCommunityDistribution(distribution)).toBeNull();
    });
});

export const COMMUNITY_DISTRIBUTION_MIN_VOTES = 2;

export interface CommunityRatingBucket {
    score: number;
    count: number;
}

export interface CommunityRatingRoundDistribution {
    driverId: string;
    round: string | null;
    voteCount: number;
    buckets: CommunityRatingBucket[];
}

export interface CommunityRatingDistribution {
    driverId: string;
    voteCount: number;
    buckets: CommunityRatingBucket[];
    rounds: CommunityRatingRoundDistribution[];
}

export type CommunityAgreement = 'consensus' | 'mostlyAgreed' | 'mixed' | 'lowAgreement';

export interface CommunityDistributionSummary {
    averageRating: number;
    agreementScore: number | null;
    agreement: CommunityAgreement | null;
    assessedRaceCount: number;
    raceCount: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function validBuckets(buckets: CommunityRatingBucket[], voteCount: number): boolean {
    return Number.isSafeInteger(voteCount) && voteCount > 0 && buckets.length === 20
        && buckets.every((bucket, index) => bucket.score === (index + 1) / 2
            && Number.isSafeInteger(bucket.count) && bucket.count >= 0)
        && buckets.reduce((total, bucket) => total + bucket.count, 0) === voteCount;
}

export function normalizeCommunityDistributionRow(value: unknown): CommunityRatingRoundDistribution | null {
    if (!isRecord(value)) return null;
    const driverId = value.driver_id;
    const round = value.round;
    const voteCount = Number(value.vote_count);
    const rawBuckets = value.rating_distribution;
    if (typeof driverId !== 'string' || !driverId
        || (round !== null && (typeof round !== 'string' || !/^[1-9][0-9]{0,2}$/.test(round)))
        || !Array.isArray(rawBuckets) || rawBuckets.length !== 20) return null;

    const buckets: CommunityRatingBucket[] = [];
    for (const bucket of rawBuckets) {
        if (!isRecord(bucket)) return null;
        buckets.push({ score: Number(bucket.score), count: Number(bucket.count) });
    }
    return validBuckets(buckets, voteCount) ? { driverId, round, voteCount, buckets } : null;
}

export function normalizeCommunityDistributions(
    values: unknown, kind: 'race' | 'quick',
): CommunityRatingDistribution[] {
    if (!Array.isArray(values)) throw new Error('Invalid community distribution response');
    const drivers = new Map<string, CommunityRatingDistribution>();
    for (const value of values) {
        const row = normalizeCommunityDistributionRow(value);
        if (!row || (kind === 'quick') !== (row.round === null)) {
            throw new Error('Invalid community distribution scope');
        }
        let driver = drivers.get(row.driverId);
        if (!driver) {
            driver = {
                driverId: row.driverId, voteCount: 0, rounds: [],
                buckets: row.buckets.map(bucket => ({ score: bucket.score, count: 0 })),
            };
            drivers.set(row.driverId, driver);
        }
        if (driver.rounds.some(scope => scope.round === row.round)) {
            throw new Error('Duplicate community distribution scope');
        }
        driver.rounds.push(row);
        driver.voteCount += row.voteCount;
        row.buckets.forEach((bucket, index) => { driver.buckets[index].count += bucket.count; });
    }
    if ([...drivers.values()].some(driver => driver.voteCount < COMMUNITY_DISTRIBUTION_MIN_VOTES)) {
        throw new Error('Insufficient community distribution votes');
    }
    return [...drivers.values()];
}

export function getCommunityAgreement(agreementScore: number): CommunityAgreement | null {
    if (!Number.isFinite(agreementScore) || agreementScore < 0 || agreementScore > 100) return null;
    if (agreementScore >= 90) return 'consensus';
    if (agreementScore >= 75) return 'mostlyAgreed';
    if (agreementScore >= 55) return 'mixed';
    return 'lowAgreement';
}

function roundAgreement(scope: CommunityRatingRoundDistribution): number {
    let disagreement = 0;
    // Equal-score pairs contribute zero disagreement. Cross-bucket pairs are
    // counted once; ratings never need to be expanded into individual votes.
    for (let left = 0; left < scope.buckets.length; left += 1) {
        for (let right = left + 1; right < scope.buckets.length; right += 1) {
            const a = scope.buckets[left];
            const b = scope.buckets[right];
            const distance = Math.abs(a.score - b.score);
            disagreement += a.count * b.count * Math.min(1, Math.max(0, (distance - 1) / 2));
        }
    }
    const pairs = scope.voteCount * (scope.voteCount - 1) / 2;
    return Math.max(0, Math.min(100, 100 * (1 - disagreement / pairs)));
}

export function summarizeCommunityDistribution(
    distribution: CommunityRatingDistribution,
): CommunityDistributionSummary | null {
    if (distribution.voteCount < COMMUNITY_DISTRIBUTION_MIN_VOTES
        || !validBuckets(distribution.buckets, distribution.voteCount)
        || distribution.rounds.length === 0
        || distribution.rounds.some(scope => scope.driverId !== distribution.driverId
            || !validBuckets(scope.buckets, scope.voteCount))
        || distribution.rounds.reduce((sum, scope) => sum + scope.voteCount, 0) !== distribution.voteCount
        || new Set(distribution.rounds.map(scope => scope.round)).size !== distribution.rounds.length
        || (distribution.rounds.some(scope => scope.round === null) && distribution.rounds.length !== 1)
        || distribution.buckets.some((bucket, index) => bucket.count !== distribution.rounds.reduce(
            (sum, scope) => sum + scope.buckets[index].count, 0,
        ))) return null;

    const weightedTotal = distribution.buckets.reduce((total, bucket) => total + bucket.score * bucket.count, 0);
    const assessed = distribution.rounds.filter(scope => scope.voteCount >= COMMUNITY_DISTRIBUTION_MIN_VOTES);
    const agreementScore = assessed.length
        ? assessed.reduce((sum, scope) => sum + roundAgreement(scope), 0) / assessed.length : null;
    return {
        averageRating: weightedTotal / distribution.voteCount,
        agreementScore,
        agreement: agreementScore === null ? null : getCommunityAgreement(agreementScore),
        assessedRaceCount: assessed.filter(scope => scope.round !== null).length,
        raceCount: distribution.rounds.filter(scope => scope.round !== null).length,
    };
}

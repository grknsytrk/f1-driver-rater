export const COMMUNITY_DISTRIBUTION_MIN_VOTES = 2;
export const COMMUNITY_AGREEMENT_MIN_ASSESSED_RACES = 5;
export const COMMUNITY_AGREEMENT_MIN_QUICK_VOTES = 5;
export const COMMUNITY_AGREEMENT_BOOTSTRAP_RESAMPLES = 10_000;

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
    agreementStabilityInterval: { lower: number; upper: number } | null;
    agreementStability: 'stable' | 'borderline' | null;
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

function pairwiseAgreement(scores: number[], counts: number[], voteCount: number): number {
    const pairs = voteCount * (voteCount - 1) / 2;
    if (pairs <= 0) return 0;

    let totalPairwiseGap = 0;
    let previousCount = 0;
    let previousWeightedScore = 0;
    for (let left = 0; left < scores.length; left += 1) {
        const count = counts[left];
        totalPairwiseGap += count * (scores[left] * previousCount - previousWeightedScore);
        previousCount += count;
        previousWeightedScore += count * scores[left];
    }

    const maxRatingGap = 9.5; // Ratings run from 0.5 to 10.
    return Math.max(0, Math.min(100, 100 * (1 - totalPairwiseGap / (pairs * maxRatingGap))));
}

function roundAgreement(scope: CommunityRatingRoundDistribution): number {
    return pairwiseAgreement(
        scope.buckets.map(bucket => bucket.score),
        scope.buckets.map(bucket => bucket.count),
        scope.voteCount,
    );
}

function createSeededRandom(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        let value = state += 0x6D2B79F5;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
}

function getDistributionSeed(
    driverId: string,
    scopes: CommunityRatingRoundDistribution[],
): number {
    let hash = 2166136261;
    const add = (value: string) => {
        for (let index = 0; index < value.length; index += 1) {
            hash ^= value.charCodeAt(index);
            hash = Math.imul(hash, 16777619);
        }
    };

    add(driverId);
    for (const scope of scopes) {
        add(scope.round ?? 'quick');
        add(String(scope.voteCount));
        scope.buckets.forEach(bucket => add(String(bucket.count)));
    }

    return hash >>> 0 || 0x6D2B79F5;
}

interface PreparedBootstrapScope {
    voteCount: number;
    scores: number[];
    observedValues: number[];
}

function prepareBootstrapScope(scope: CommunityRatingRoundDistribution): PreparedBootstrapScope {
    const observedValues: number[] = [];
    for (const bucket of scope.buckets) {
        for (let vote = 0; vote < bucket.count; vote += 1) observedValues.push(bucket.score);
    }

    return {
        voteCount: scope.voteCount,
        scores: scope.buckets.map(bucket => bucket.score),
        observedValues,
    };
}

function resampleScopeAgreement(scope: PreparedBootstrapScope, random: () => number): number {
    const counts = new Array<number>(scope.scores.length).fill(0);
    for (let vote = 0; vote < scope.voteCount; vote += 1) {
        const score = scope.observedValues[Math.floor(random() * scope.observedValues.length)];
        const index = scope.scores.indexOf(score);
        counts[index] += 1;
    }
    return pairwiseAgreement(scope.scores, counts, scope.voteCount);
}

function getAgreementStabilityInterval(
    distribution: CommunityRatingDistribution,
    assessedScopes: CommunityRatingRoundDistribution[],
): { lower: number; upper: number } | null {
    const isQuickRate = distribution.rounds.length === 1 && distribution.rounds[0].round === null;
    if (!isQuickRate && assessedScopes.length < 2) return null;
    if (isQuickRate && assessedScopes[0]?.voteCount < COMMUNITY_DISTRIBUTION_MIN_VOTES) return null;

    const orderedScopes = [...assessedScopes].sort((a, b) =>
        (Number.parseInt(a.round ?? '0', 10) || 0) - (Number.parseInt(b.round ?? '0', 10) || 0),
    );
    const preparedScopes = orderedScopes.map(prepareBootstrapScope);
    const random = createSeededRandom(getDistributionSeed(distribution.driverId, orderedScopes));
    const estimates = new Array<number>(COMMUNITY_AGREEMENT_BOOTSTRAP_RESAMPLES);

    for (let sample = 0; sample < estimates.length; sample += 1) {
        if (isQuickRate) {
            estimates[sample] = resampleScopeAgreement(preparedScopes[0], random);
            continue;
        }

        let scoreTotal = 0;
        for (let race = 0; race < preparedScopes.length; race += 1) {
            const selectedScope = preparedScopes[Math.floor(random() * preparedScopes.length)];
            scoreTotal += resampleScopeAgreement(selectedScope, random);
        }
        estimates[sample] = scoreTotal / preparedScopes.length;
    }

    estimates.sort((a, b) => a - b);
    return {
        lower: estimates[Math.floor(0.025 * (estimates.length - 1))],
        upper: estimates[Math.floor(0.975 * (estimates.length - 1))],
    };
}

export function summarizeCommunityDistribution(
    distribution: CommunityRatingDistribution,
    options: { includeStabilityInterval?: boolean } = {},
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
    const isQuickRate = distribution.rounds.length === 1 && distribution.rounds[0].round === null;
    const agreementScore = assessed.length
        ? assessed.reduce((sum, scope) => sum + roundAgreement(scope), 0) / assessed.length
        : null;
    const hasEnoughEvidence = isQuickRate
        ? distribution.voteCount >= COMMUNITY_AGREEMENT_MIN_QUICK_VOTES
        : assessed.filter(scope => scope.round !== null).length >= COMMUNITY_AGREEMENT_MIN_ASSESSED_RACES;
    const agreementStabilityInterval = agreementScore === null || options.includeStabilityInterval === false
        ? null
        : getAgreementStabilityInterval(distribution, assessed);
    const agreement = agreementScore === null || !hasEnoughEvidence
        ? null
        : getCommunityAgreement(agreementScore);
    const agreementStability = agreement && agreementStabilityInterval
        ? getCommunityAgreement(agreementStabilityInterval.lower) === getCommunityAgreement(agreementStabilityInterval.upper)
            ? 'stable'
            : 'borderline'
        : null;
    return {
        averageRating: weightedTotal / distribution.voteCount,
        agreementScore,
        agreement,
        agreementStabilityInterval,
        agreementStability,
        assessedRaceCount: assessed.filter(scope => scope.round !== null).length,
        raceCount: distribution.rounds.filter(scope => scope.round !== null).length,
    };
}

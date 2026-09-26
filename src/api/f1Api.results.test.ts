import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAllSeasonResults, getAllSeasonSprints } from './f1Api';

const apiGet = vi.hoisted(() => vi.fn());
vi.mock('axios', () => ({
    default: { create: () => ({ get: apiGet }), isAxiosError: () => false },
}));

beforeEach(() => {
    apiGet.mockReset();
    localStorage.clear();
    vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe.each([
    ['GP', getAllSeasonResults],
    ['sprint', getAllSeasonSprints],
] as const)('%s result availability', (_label, fetchResults) => {
    it('surfaces failed requests for the points tracker instead of returning zero results', async () => {
        const networkError = new Error('Network unavailable');
        apiGet.mockRejectedValue(networkError);
        await expect(fetchResults('2024', { throwOnError: true })).rejects.toBe(networkError);
    });

    it('preserves the existing fallback for callers that did not request strict errors', async () => {
        apiGet.mockRejectedValue(new Error('Network unavailable'));
        await expect(fetchResults('2024')).resolves.toEqual([]);
    });

    it('accepts a successful response with no published results', async () => {
        apiGet.mockResolvedValue({ data: { MRData: { total: '0', RaceTable: { Races: [] } } } });
        await expect(fetchResults('2024', { throwOnError: true })).resolves.toEqual([]);
    });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    API_BASE,
    JolpicaHttpError,
    getRateLimitBackoffMs,
    isRateLimitError,
    jolpicaClient,
} from './jolpicaClient';
import { jolpicaQueue, resetJolpicaQueue } from './jolpicaQueue';

describe('jolpicaClient', () => {
    const originalFetch = globalThis.fetch;

    beforeEach(() => {
        resetJolpicaQueue(true);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        globalThis.fetch = originalFetch;
        resetJolpicaQueue(true);
    });

    it('uses native fetch with Accept: application/json and resolves parsed JSON data', async () => {
        const payload = { MRData: { RaceTable: { Races: [] } } };
        const fetchMock = vi.fn().mockResolvedValue(
            new Response(JSON.stringify(payload), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            }),
        );
        globalThis.fetch = fetchMock as unknown as typeof fetch;

        const result = await jolpicaClient.get('/2026.json');

        expect(result).toEqual({ data: payload });
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledWith(
            `${API_BASE}/2026.json`,
            expect.objectContaining({
                method: 'GET',
                headers: { Accept: 'application/json' },
            }),
        );
    });

    it('throws JolpicaHttpError on 429, respects Retry-After, and notifies jolpicaQueue', async () => {
        const handleRateLimitSpy = vi.spyOn(jolpicaQueue, 'handleRateLimit');
        const fetchMock = vi.fn().mockResolvedValue(
            new Response('Too Many Requests', {
                status: 429,
                headers: { 'Retry-After': '3' },
            }),
        );
        globalThis.fetch = fetchMock as unknown as typeof fetch;

        let caughtError: unknown;
        try {
            await jolpicaClient.get('/2026/results.json');
        } catch (err) {
            caughtError = err;
        }

        expect(caughtError).toBeInstanceOf(JolpicaHttpError);
        expect((caughtError as JolpicaHttpError).status).toBe(429);
        expect(isRateLimitError(caughtError)).toBe(true);
        expect(getRateLimitBackoffMs(caughtError, 0)).toBe(3500);
        expect(handleRateLimitSpy).toHaveBeenCalledWith(3500);
    });

    it('throws JolpicaHttpError on non-429 HTTP error responses', async () => {
        const handleRateLimitSpy = vi.spyOn(jolpicaQueue, 'handleRateLimit');
        const fetchMock = vi.fn().mockResolvedValue(
            new Response('Internal Server Error', { status: 500 }),
        );
        globalThis.fetch = fetchMock as unknown as typeof fetch;

        let caughtError: unknown;
        try {
            await jolpicaClient.get('/2026/qualifying.json');
        } catch (err) {
            caughtError = err;
        }

        expect(caughtError).toBeInstanceOf(JolpicaHttpError);
        expect((caughtError as JolpicaHttpError).status).toBe(500);
        expect(isRateLimitError(caughtError)).toBe(false);
        expect(handleRateLimitSpy).not.toHaveBeenCalled();
    });
});

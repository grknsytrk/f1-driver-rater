// Utility hook for delayed state updates
// Ensures minimum loading time for better UX on network requests while skipping
// artificial delays when data resolves immediately from cache.

export const FAST_CACHE_THRESHOLD_MS = 50;

/**
 * Creates a promise that resolves after a specified delay
 */
export function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Wraps an async function to ensure minimum execution time only when a real
 * asynchronous/network wait occurred (> fastThresholdMs). When data resolves
 * nearly instantaneously from cache (<= fastThresholdMs), returns immediately
 * without any artificial delay.
 */
export async function withMinimumDelay<T>(
    asyncFn: () => Promise<T>,
    minimumMs: number = 800,
    fastThresholdMs: number = FAST_CACHE_THRESHOLD_MS,
): Promise<T> {
    const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const startTime = now();
    const result = await asyncFn();
    const elapsed = now() - startTime;

    if (elapsed <= fastThresholdMs) {
        return result;
    }

    if (elapsed < minimumMs) {
        await delay(Math.ceil(minimumMs - elapsed));
    }

    return result;
}

/**
 * Fetches data with a smart minimum loading time (skipped on fast cache hits)
 * Usage: const data = await fetchWithMinDelay(() => api.get('/endpoint'), 800);
 */
export async function fetchWithMinDelay<T>(
    fetcher: () => Promise<T>,
    minimumMs: number = 800,
    fastThresholdMs: number = FAST_CACHE_THRESHOLD_MS,
): Promise<T> {
    return withMinimumDelay(fetcher, minimumMs, fastThresholdMs);
}

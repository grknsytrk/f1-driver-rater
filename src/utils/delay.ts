// Utility hook for delayed state updates
// Ensures minimum loading time for better UX

/**
 * Creates a promise that resolves after a specified delay
 */
export function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Wraps an async function to ensure minimum execution time
 * This prevents jarring UI transitions when data loads too quickly
 */
export async function withMinimumDelay<T>(
    asyncFn: () => Promise<T>,
    minimumMs: number = 800
): Promise<T> {
    const startTime = Date.now();
    const result = await asyncFn();
    const elapsed = Date.now() - startTime;

    if (elapsed < minimumMs) {
        await delay(minimumMs - elapsed);
    }

    return result;
}

/**
 * Fetches data with a minimum loading time
 * Usage: const data = await fetchWithMinDelay(() => api.get('/endpoint'), 1000);
 */
export async function fetchWithMinDelay<T>(
    fetcher: () => Promise<T>,
    minimumMs: number = 800
): Promise<T> {
    return withMinimumDelay(fetcher, minimumMs);
}

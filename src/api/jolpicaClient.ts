import { markNetworkRequest } from './jolpicaCache';
import { jolpicaQueue, type RequestPriority } from './jolpicaQueue';

export const API_BASE = 'https://api.jolpi.ca/ergast/f1';
const REQUEST_TIMEOUT_MS = 15_000;

export class RateLimitError extends Error {
    status = 429 as const;
    constructor(message = 'Too Many Requests') {
        super(message);
        this.name = 'RateLimitError';
    }
}

export class JolpicaHttpError extends Error {
    status: number;
    response: {
        status: number;
        headers: Record<string, string>;
    };

    constructor(status: number, message: string, headers: Record<string, string> = {}) {
        super(message);
        this.name = 'JolpicaHttpError';
        this.status = status;
        this.response = { status, headers };
    }
}

export interface ApiRequestOptions {
    priority?: RequestPriority;
    signal?: AbortSignal;
    throwOnError?: boolean;
}

export interface JolpicaRequestConfig {
    priority?: RequestPriority;
    queueKey?: string;
    isBackground?: boolean;
    signal?: AbortSignal;
}

export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export function isRateLimitError(error: unknown): boolean {
    if (error instanceof RateLimitError) return true;
    if (error instanceof JolpicaHttpError && error.status === 429) return true;
    if (!error || typeof error !== 'object') return false;
    const err = error as { status?: unknown; response?: { status?: unknown } };
    return err.status === 429 || err.response?.status === 429;
}

export function getRateLimitBackoffMs(error: unknown, attempt: number): number {
    if (error && typeof error === 'object') {
        const headers = (error as { response?: { headers?: Record<string, unknown> } }).response?.headers;
        const retryAfterHeader = headers?.['retry-after'] ?? headers?.['Retry-After'];
        const headerValue = typeof retryAfterHeader === 'string' || typeof retryAfterHeader === 'number'
            ? String(retryAfterHeader)
            : '';
        const parsedSeconds = Number.parseFloat(headerValue);
        if (Number.isFinite(parsedSeconds) && parsedSeconds > 0) {
            return Math.ceil(parsedSeconds * 1000) + 500;
        }
        const retryAt = Date.parse(headerValue);
        if (Number.isFinite(retryAt) && retryAt > Date.now()) return retryAt - Date.now() + 500;
    }
    return Math.round(2000 * Math.pow(1.7, attempt)) + Math.floor(Math.random() * 500);
}

function createTimeoutSignal(callerSignal?: AbortSignal): { signal: AbortSignal; cleanup: () => void } {
    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
        const timeoutSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
        if (callerSignal && typeof AbortSignal.any === 'function') {
            return { signal: AbortSignal.any([callerSignal, timeoutSignal]), cleanup: () => undefined };
        }
        if (!callerSignal) {
            return { signal: timeoutSignal, cleanup: () => undefined };
        }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error('Request timed out')), REQUEST_TIMEOUT_MS);
    const onCallerAbort = () => controller.abort(callerSignal?.reason);
    if (callerSignal) {
        if (callerSignal.aborted) {
            controller.abort(callerSignal.reason);
        } else {
            callerSignal.addEventListener('abort', onCallerAbort, { once: true });
        }
    }
    return {
        signal: controller.signal,
        cleanup: () => {
            clearTimeout(timer);
            callerSignal?.removeEventListener('abort', onCallerAbort);
        },
    };
}

function extractHeadersRecord(headers?: Headers): Record<string, string> {
    const result: Record<string, string> = {};
    if (!headers || typeof headers.forEach !== 'function') return result;
    headers.forEach((value, key) => {
        result[key.toLowerCase()] = value;
    });
    return result;
}

export const jolpicaClient = {
    async get<T = unknown>(endpoint: string, config?: JolpicaRequestConfig): Promise<{ data: T }> {
        const isBackground = Boolean(config?.isBackground || config?.priority === 'low');
        const priority: RequestPriority = config?.priority ?? (isBackground ? 'low' : 'high');

        await jolpicaQueue.acquireSlot({
            priority,
            key: config?.queueKey,
            signal: config?.signal,
        });

        markNetworkRequest({ isBackground });

        const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;
        const { signal, cleanup } = createTimeoutSignal(config?.signal);

        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: { Accept: 'application/json' },
                signal,
            });

            if (response.status === 429) {
                const headers = extractHeadersRecord(response.headers);
                const err = new JolpicaHttpError(429, 'Too Many Requests', headers);
                const backoffMs = getRateLimitBackoffMs(err, 0);
                jolpicaQueue.handleRateLimit(backoffMs);
                throw err;
            }

            if (!response.ok) {
                const headers = extractHeadersRecord(response.headers);
                throw new JolpicaHttpError(
                    response.status,
                    `Request failed with status code ${response.status}`,
                    headers,
                );
            }

            const data = (await response.json()) as T;
            return { data };
        } finally {
            cleanup();
        }
    },
};

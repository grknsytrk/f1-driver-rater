/**
 * Dual-tier priority request queue engine for Jolpica API requests.
 * Manages rate-limiting (750ms interval), user-first priority scheduling,
 * priority promotion, prefetch queue bounding, and 429 backoff isolation.
 */

export type RequestPriority = 'high' | 'low';

export interface AcquireSlotOptions {
    priority?: RequestPriority;
    key?: string;
    signal?: AbortSignal;
}

export type EnqueueOptions = AcquireSlotOptions;

export interface JolpicaQueueOptions {
    intervalMs?: number;
    maxLowQueueSize?: number;
    isTestEnv?: boolean;
}

export interface QueuedSlot<T = unknown> {
    id: string;
    key?: string;
    priority: RequestPriority;
    resolve: () => void;
    reject: (err: unknown) => void;
    enqueuedAt: number;
    signal?: AbortSignal;
    fetcher?: () => Promise<T>;
    resultPromise?: Promise<T>;
    resolveResult?: (value: T) => void;
    rejectResult?: (reason?: unknown) => void;
}

export const MIN_JOLPICA_REQUEST_INTERVAL_MS = 750;
export const MAX_LOW_QUEUE_SIZE = 4;

export class QueueEvictionError extends Error {
    constructor(message = 'Prefetch request evicted from queue') {
        super(message);
        this.name = 'QueueEvictionError';
        Object.setPrototypeOf(this, QueueEvictionError.prototype);
    }
}

export class RateLimitFlushError extends Error {
    constructor(message = 'Prefetch cancelled due to rate limit cooldown') {
        super(message);
        this.name = 'RateLimitFlushError';
        Object.setPrototypeOf(this, RateLimitFlushError.prototype);
    }
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export class JolpicaPriorityQueue {
    private highQueue: QueuedSlot[] = [];
    private lowQueue: QueuedSlot[] = [];
    private inFlightByKey = new Map<string, Promise<unknown>>();
    private isProcessing = false;
    private pumpScheduled = false;
    private rateLimitCooldownUntil = 0;
    private nextAllowedRequestAt = 0;
    private readonly intervalMs: number;
    private readonly maxLowQueueSize: number;
    private isTestEnv: boolean;

    constructor(
        optionsOrInterval: JolpicaQueueOptions | number = {},
        maxLowQueueSize?: number,
        isTestEnv?: boolean,
    ) {
        if (typeof optionsOrInterval === 'number') {
            this.intervalMs = optionsOrInterval;
            this.maxLowQueueSize = maxLowQueueSize ?? MAX_LOW_QUEUE_SIZE;
            this.isTestEnv = isTestEnv ?? false;
        } else {
            this.intervalMs = optionsOrInterval.intervalMs ?? MIN_JOLPICA_REQUEST_INTERVAL_MS;
            this.maxLowQueueSize = optionsOrInterval.maxLowQueueSize ?? MAX_LOW_QUEUE_SIZE;
            this.isTestEnv = optionsOrInterval.isTestEnv ?? false;
        }
    }

    public setTestEnv(isTest: boolean): void {
        this.isTestEnv = isTest;
    }

    public isCoolingDown(): boolean {
        return Date.now() < this.rateLimitCooldownUntil;
    }

    public getCooldownRemainingMs(): number {
        return Math.max(0, this.rateLimitCooldownUntil - Date.now());
    }

    /**
     * Promotes any pending slot matching `key` in lowQueue to the front of highQueue.
     * Returns true if a slot was found and promoted.
     */
    public promoteKey(key: string): boolean {
        if (!key) return false;
        const index = this.lowQueue.findIndex(s => s.key === key);
        if (index !== -1) {
            const [slot] = this.lowQueue.splice(index, 1);
            slot.priority = 'high';
            this.highQueue.unshift(slot); // Place at head of high queue for immediate next dispatch
            return true;
        }
        return false;
    }

    /**
     * Records a 429 rate limit cooldown period and flushes all pending low-priority requests.
     */
    public handleRateLimit(backoffMs: number): void {
        this.rateLimitCooldownUntil = Math.max(this.rateLimitCooldownUntil, Date.now() + backoffMs);
        this.flushLowQueue('Prefetch cancelled due to rate limit cooldown');
    }

    public notifyRateLimit(backoffMs: number): void {
        this.handleRateLimit(backoffMs);
    }

    /**
     * Flushes all pending items in lowQueue, rejecting their promises.
     */
    public flushLowQueue(reason = 'Prefetch queue flushed'): void {
        const flushed = this.lowQueue.splice(0, this.lowQueue.length);
        for (const slot of flushed) {
            slot.resultPromise?.catch(() => {});
            slot.reject(new RateLimitFlushError(reason));
        }
    }

    /**
     * Acquires an execution slot according to priority rules and rate pacing.
     * Resolves when the caller is cleared to transmit the network request.
     */
    public acquireSlot(options: AcquireSlotOptions = {}): Promise<void> {
        const priority: RequestPriority = options.priority ?? 'high';
        const key = options.key;
        const signal = options.signal;

        if (signal?.aborted) {
            return Promise.reject(new Error('Request aborted'));
        }

        // Test environment bypass: bypass timer pacing
        if (this.isTestEnv) {
            return Promise.resolve();
        }

        // If a high-priority request arrives with a key already pending in lowQueue, promote it!
        if (priority === 'high' && key) {
            this.promoteKey(key);
        }

        // Drop incoming low-priority requests if currently in 429 cooldown
        if (priority === 'low' && this.isCoolingDown()) {
            return Promise.reject(new RateLimitFlushError('Prefetch cancelled due to rate limit cooldown'));
        }

        // Enforce bounded prefetch capacity: evict oldest low item if capacity exceeded
        if (priority === 'low' && this.lowQueue.length >= this.maxLowQueueSize) {
            const evicted = this.lowQueue.shift();
            if (evicted) {
                evicted.resultPromise?.catch(() => {});
                evicted.reject(new QueueEvictionError('Prefetch request evicted from queue'));
            }
        }

        return new Promise<void>((resolve, reject) => {
            const slot: QueuedSlot = {
                id: Math.random().toString(36).substring(2, 9),
                key,
                priority,
                resolve,
                reject,
                enqueuedAt: Date.now(),
                signal,
            };

            const abortHandler = () => {
                this.removeSlot(slot.id);
                reject(new Error('Request aborted'));
            };

            if (signal) {
                signal.addEventListener('abort', abortHandler, { once: true });
            }

            const originalResolve = slot.resolve;
            slot.resolve = () => {
                if (signal) {
                    signal.removeEventListener('abort', abortHandler);
                }
                originalResolve();
            };

            if (priority === 'high') {
                this.highQueue.push(slot);
            } else {
                this.lowQueue.push(slot);
            }

            void this.pump();
        });
    }

    /**
     * Higher-level execution wrapper that executes `fetcher` once the slot is acquired,
     * deduplicating by key across queued and in-flight executions.
     */
    public enqueue<T>(fetcher: () => Promise<T>, options: AcquireSlotOptions = {}): Promise<T> {
        const priority: RequestPriority = options.priority ?? 'high';
        const key = options.key;
        const signal = options.signal;

        if (signal?.aborted) {
            return Promise.reject(new Error('Request aborted'));
        }

        // Check if an in-flight execution already exists for this key
        if (key && this.inFlightByKey.has(key)) {
            return this.inFlightByKey.get(key) as Promise<T>;
        }

        // Check if a queued slot already exists for this key in highQueue
        if (key) {
            const existingHigh = this.highQueue.find(s => s.key === key);
            if (existingHigh && existingHigh.resultPromise) {
                return existingHigh.resultPromise as Promise<T>;
            }

            // Check if a queued slot exists in lowQueue
            const existingLow = this.lowQueue.find(s => s.key === key);
            if (existingLow && existingLow.resultPromise) {
                if (priority === 'high') {
                    this.promoteKey(key);
                }
                return existingLow.resultPromise as Promise<T>;
            }
        }

        // Drop incoming low-priority requests if currently in 429 cooldown
        if (priority === 'low' && this.isCoolingDown()) {
            return Promise.reject(new RateLimitFlushError('Prefetch cancelled due to rate limit cooldown'));
        }

        // Enforce bounded prefetch capacity: evict oldest low item if capacity exceeded
        if (priority === 'low' && this.lowQueue.length >= this.maxLowQueueSize) {
            const evicted = this.lowQueue.shift();
            if (evicted) {
                evicted.resultPromise?.catch(() => {});
                evicted.reject(new QueueEvictionError('Prefetch request evicted from queue'));
            }
        }

        if (this.isTestEnv) {
            if (key) {
                const requestPromise = fetcher().finally(() => {
                    if (this.inFlightByKey.get(key) === requestPromise) {
                        this.inFlightByKey.delete(key);
                    }
                });
                this.inFlightByKey.set(key, requestPromise);
                return requestPromise;
            }
            return fetcher();
        }

        let resolveResult!: (value: T) => void;
        let rejectResult!: (reason?: unknown) => void;
        const resultPromise = new Promise<T>((res, rej) => {
            resolveResult = res;
            rejectResult = rej;
        });

        const slot: QueuedSlot<T> = {
            id: Math.random().toString(36).substring(2, 9),
            key,
            priority,
            resolve: () => {},
            reject: (err) => rejectResult(err),
            fetcher,
            resultPromise,
            resolveResult,
            rejectResult,
            enqueuedAt: Date.now(),
            signal,
        };

        const abortHandler = () => {
            this.removeSlot(slot.id);
            rejectResult(new Error('Request aborted'));
        };

        if (signal) {
            signal.addEventListener('abort', abortHandler, { once: true });
        }

        if (priority === 'high') {
            this.highQueue.push(slot as QueuedSlot);
        } else {
            this.lowQueue.push(slot as QueuedSlot);
        }

        this.schedulePump();
        return resultPromise;
    }

    /**
     * Returns current queue lengths and state.
     */
    public getQueueStatus(): {
        highCount: number;
        highQueueLength: number;
        lowCount: number;
        lowQueueLength: number;
        isCoolingDown: boolean;
        cooldownRemainingMs: number;
        nextAllowedRequestAt: number;
    } {
        const now = Date.now();
        return {
            highCount: this.highQueue.length,
            highQueueLength: this.highQueue.length,
            lowCount: this.lowQueue.length,
            lowQueueLength: this.lowQueue.length,
            isCoolingDown: now < this.rateLimitCooldownUntil,
            cooldownRemainingMs: Math.max(0, this.rateLimitCooldownUntil - now),
            nextAllowedRequestAt: this.nextAllowedRequestAt,
        };
    }

    /**
     * Resets queue state (used in test teardown).
     */
    public clear(): void {
        this.flushLowQueue('Queue cleared');
        const flushedHigh = this.highQueue.splice(0, this.highQueue.length);
        for (const slot of flushedHigh) {
            slot.resultPromise?.catch(() => {});
            slot.reject(new Error('Queue cleared'));
        }
        this.rateLimitCooldownUntil = 0;
        this.nextAllowedRequestAt = 0;
        this.isProcessing = false;
        this.pumpScheduled = false;
        this.inFlightByKey.clear();
    }

    private removeSlot(id: string): void {
        this.highQueue = this.highQueue.filter(s => s.id !== id);
        this.lowQueue = this.lowQueue.filter(s => s.id !== id);
    }

    private schedulePump(): void {
        if (this.isProcessing || this.pumpScheduled) return;
        this.pumpScheduled = true;
        queueMicrotask(() => {
            this.pumpScheduled = false;
            void this.pump();
        });
    }

    /**
     * Main dispatch loop. Always drains highQueue before lowQueue.
     * Evaluates next slot AFTER sleeping to ensure newly arrived high requests
     * preempt pending low requests.
     */
    private async pump(): Promise<void> {
        if (this.isProcessing) return;
        this.isProcessing = true;

        try {
            while (this.highQueue.length > 0 || this.lowQueue.length > 0) {
                const now = Date.now();
                const targetTime = Math.max(now, this.rateLimitCooldownUntil, this.nextAllowedRequestAt);
                const delayMs = targetTime - now;

                if (delayMs > 0) {
                    await sleep(delayMs);
                    // Re-evaluate targetTime and queues after sleep because state may have changed during sleep!
                    continue;
                }

                // High priority requests ALWAYS shift before low priority requests
                const slot = this.highQueue.shift() ?? this.lowQueue.shift();
                if (!slot) continue;

                this.nextAllowedRequestAt = Date.now() + this.intervalMs;

                slot.resolve();

                if (slot.fetcher && slot.resolveResult && slot.rejectResult) {
                    let fetcherPromise: Promise<unknown> | null = null;
                    fetcherPromise = (async () => {
                        try {
                            const result = await slot.fetcher!();
                            slot.resolveResult!(result);
                            return result;
                        } catch (err) {
                            slot.rejectResult!(err);
                            throw err;
                        } finally {
                            if (slot.key && this.inFlightByKey.get(slot.key) === fetcherPromise) {
                                this.inFlightByKey.delete(slot.key);
                            }
                        }
                    })();
                    // Avoid unhandled rejection on internal promise tracking
                    fetcherPromise.catch(() => {});
                    if (slot.key) {
                        this.inFlightByKey.set(slot.key, fetcherPromise);
                    }
                }
            }
        } finally {
            this.isProcessing = false;
            // Catch any items enqueued during the exit edge
            if (this.highQueue.length > 0 || this.lowQueue.length > 0) {
                this.schedulePump();
            }
        }
    }
}

// Global singleton instance for the app.
// Defaults to testEnv bypass when running in test mode, can be adjusted via setJolpicaTestMode / resetJolpicaQueue.
export const jolpicaQueue = new JolpicaPriorityQueue({
    isTestEnv: typeof import.meta !== 'undefined' && import.meta.env?.MODE === 'test',
});

export function enqueueJolpicaRequest<T>(
    fetcher: () => Promise<T>,
    options?: AcquireSlotOptions,
): Promise<T> {
    return jolpicaQueue.enqueue(fetcher, options);
}

export function notifyJolpicaRateLimit(backoffMs: number): void {
    jolpicaQueue.handleRateLimit(backoffMs);
}

export function resetJolpicaQueue(isTestEnv = false): void {
    jolpicaQueue.clear();
    jolpicaQueue.setTestEnv(isTestEnv);
}

export function getJolpicaQueueStatus() {
    return jolpicaQueue.getQueueStatus();
}

export function setJolpicaTestMode(isTest: boolean): void {
    jolpicaQueue.setTestEnv(isTest);
}

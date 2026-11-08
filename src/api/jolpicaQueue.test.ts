import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    enqueueJolpicaRequest,
    getJolpicaQueueStatus,
    JolpicaPriorityQueue,
    MAX_LOW_QUEUE_SIZE,
    MIN_JOLPICA_REQUEST_INTERVAL_MS,
    notifyJolpicaRateLimit,
    QueueEvictionError,
    RateLimitFlushError,
    resetJolpicaQueue,
} from './jolpicaQueue';

describe('Jolpica Priority Request Queue (src/api/jolpicaQueue.test.ts)', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        resetJolpicaQueue(false);
    });

    afterEach(() => {
        resetJolpicaQueue(false);
        vi.useRealTimers();
    });

    describe('1. Pacing & Dispatch Intervals (750ms)', () => {
        it('bypasses pacing when isTestEnv is true', async () => {
            const queue = new JolpicaPriorityQueue({ isTestEnv: true, intervalMs: 750 });
            let resolved = false;

            const slotPromise = queue.acquireSlot({ priority: 'high' }).then(() => {
                resolved = true;
            });

            await slotPromise;
            expect(resolved).toBe(true);
        });

        it('dispatches the first request immediately when queue is idle', async () => {
            const fetcher = vi.fn().mockResolvedValue('data-1');
            const promise = enqueueJolpicaRequest(fetcher);

            // Microtask flush
            await vi.advanceTimersByTimeAsync(0);

            expect(fetcher).toHaveBeenCalledTimes(1);
            const result = await promise;
            expect(result).toBe('data-1');
        });

        it('paces consecutive dispatches with at least 750ms interval', async () => {
            const timestamps: number[] = [];
            const createFetcher = (label: string) => vi.fn().mockImplementation(async () => {
                timestamps.push(Date.now());
                return label;
            });

            const f1 = createFetcher('req-1');
            const f2 = createFetcher('req-2');
            const f3 = createFetcher('req-3');

            const p1 = enqueueJolpicaRequest(f1);
            const p2 = enqueueJolpicaRequest(f2);
            const p3 = enqueueJolpicaRequest(f3);

            // At t = 0ms: First request dispatched immediately
            await vi.advanceTimersByTimeAsync(0);
            expect(f1).toHaveBeenCalledTimes(1);
            expect(f2).not.toHaveBeenCalled();
            expect(f3).not.toHaveBeenCalled();

            // At t = 500ms: Still within 750ms window
            await vi.advanceTimersByTimeAsync(500);
            expect(f2).not.toHaveBeenCalled();

            // At t = 750ms: Second request dispatched
            await vi.advanceTimersByTimeAsync(250);
            expect(f2).toHaveBeenCalledTimes(1);
            expect(f3).not.toHaveBeenCalled();

            // At t = 1500ms: Third request dispatched
            await vi.advanceTimersByTimeAsync(750);
            expect(f3).toHaveBeenCalledTimes(1);

            const results = await Promise.all([p1, p2, p3]);
            expect(results).toEqual(['req-1', 'req-2', 'req-3']);
            expect(timestamps[1] - timestamps[0]).toBeGreaterThanOrEqual(MIN_JOLPICA_REQUEST_INTERVAL_MS);
            expect(timestamps[2] - timestamps[1]).toBeGreaterThanOrEqual(MIN_JOLPICA_REQUEST_INTERVAL_MS);
        });

        it('dispatches immediately after queue has been idle for >750ms', async () => {
            const f1 = vi.fn().mockResolvedValue('first');
            await enqueueJolpicaRequest(f1);
            await vi.advanceTimersByTimeAsync(0);

            // Advance past the 750ms window to simulate user idle period
            await vi.advanceTimersByTimeAsync(2000);

            const f2 = vi.fn().mockResolvedValue('second');
            const p2 = enqueueJolpicaRequest(f2);
            await vi.advanceTimersByTimeAsync(0);

            // Dispatches immediately without waiting 750ms
            expect(f2).toHaveBeenCalledTimes(1);
            expect(await p2).toBe('second');
        });

        it('handles long-running fetcher while preserving dispatch spacing', async () => {
            // First fetcher takes 1200ms to resolve over simulated network
            const f1 = vi.fn().mockImplementation(async () => {
                await vi.advanceTimersByTimeAsync(1200);
                return 'slow-1';
            });
            const f2 = vi.fn().mockResolvedValue('fast-2');

            enqueueJolpicaRequest(f1);
            enqueueJolpicaRequest(f2);

            await vi.advanceTimersByTimeAsync(0);
            expect(f1).toHaveBeenCalledTimes(1);

            // At t = 750ms: Next dispatch slot opens even if f1 is still computing
            await vi.advanceTimersByTimeAsync(750);
            expect(f2).toHaveBeenCalledTimes(1);
        });
    });

    describe('2. Strict Priority Dispatch', () => {
        it('dispatches pending high-priority requests ahead of queued low-priority requests', async () => {
            const dispatchOrder: string[] = [];

            const createWorker = (id: string) => async () => {
                dispatchOrder.push(id);
                return id;
            };

            // Enqueue active slot
            enqueueJolpicaRequest(createWorker('initial'), { priority: 'high' });
            await vi.advanceTimersByTimeAsync(0);

            // While initial is occupying slot 0..750ms, queue up low requests
            enqueueJolpicaRequest(createWorker('low-1'), { priority: 'low' });
            enqueueJolpicaRequest(createWorker('low-2'), { priority: 'low' });

            // Now a critical user click arrives
            enqueueJolpicaRequest(createWorker('high-user-click'), { priority: 'high' });

            // Next dispatch at t = 750ms MUST be high-user-click
            await vi.advanceTimersByTimeAsync(750);
            expect(dispatchOrder).toEqual(['initial', 'high-user-click']);

            // Subsequent dispatches drain low queue
            await vi.advanceTimersByTimeAsync(750);
            expect(dispatchOrder).toEqual(['initial', 'high-user-click', 'low-1']);

            await vi.advanceTimersByTimeAsync(750);
            expect(dispatchOrder).toEqual(['initial', 'high-user-click', 'low-1', 'low-2']);
        });

        it('maintains strict FIFO order within high-priority queue', async () => {
            const order: string[] = [];
            const createHigh = (id: string) => async () => {
                order.push(id);
                return id;
            };

            enqueueJolpicaRequest(createHigh('H0'), { priority: 'high' });
            await vi.advanceTimersByTimeAsync(0);

            enqueueJolpicaRequest(createHigh('H1'), { priority: 'high' });
            enqueueJolpicaRequest(createHigh('H2'), { priority: 'high' });
            enqueueJolpicaRequest(createHigh('H3'), { priority: 'high' });

            await vi.advanceTimersByTimeAsync(750);
            expect(order).toEqual(['H0', 'H1']);

            await vi.advanceTimersByTimeAsync(750);
            expect(order).toEqual(['H0', 'H1', 'H2']);

            await vi.advanceTimersByTimeAsync(750);
            expect(order).toEqual(['H0', 'H1', 'H2', 'H3']);
        });

        it('interleaves multiple high and low bursts correctly', async () => {
            const log: string[] = [];
            const task = (id: string) => async () => {
                log.push(id);
                return id;
            };

            enqueueJolpicaRequest(task('active'), { priority: 'high' });
            await vi.advanceTimersByTimeAsync(0);

            enqueueJolpicaRequest(task('L1'), { priority: 'low' });
            enqueueJolpicaRequest(task('H1'), { priority: 'high' });
            enqueueJolpicaRequest(task('L2'), { priority: 'low' });
            enqueueJolpicaRequest(task('H2'), { priority: 'high' });

            // Dispatches: active (0ms) -> H1 (750ms) -> H2 (1500ms) -> L1 (2250ms) -> L2 (3000ms)
            await vi.advanceTimersByTimeAsync(750);
            expect(log).toEqual(['active', 'H1']);

            await vi.advanceTimersByTimeAsync(750);
            expect(log).toEqual(['active', 'H1', 'H2']);

            await vi.advanceTimersByTimeAsync(750);
            expect(log).toEqual(['active', 'H1', 'H2', 'L1']);

            await vi.advanceTimersByTimeAsync(750);
            expect(log).toEqual(['active', 'H1', 'H2', 'L1', 'L2']);
        });

        it('enforces strict priority via acquireSlot', async () => {
            const queue = new JolpicaPriorityQueue({ isTestEnv: false, intervalMs: 100 });
            const executionOrder: string[] = [];

            // Enqueue 2 low priority requests
            void queue.acquireSlot({ priority: 'low' }).then(() => executionOrder.push('low-1'));
            void queue.acquireSlot({ priority: 'low' }).then(() => executionOrder.push('low-2'));

            // Enqueue 1 high priority request
            void queue.acquireSlot({ priority: 'high' }).then(() => executionOrder.push('high-1'));

            // Advance timers to dispatch slot 1 (low-1 was popped immediately as first slot)
            await vi.advanceTimersByTimeAsync(0);
            expect(executionOrder).toEqual(['low-1']);

            // Advance timer for slot 2: high-1 MUST execute before low-2!
            await vi.advanceTimersByTimeAsync(100);
            expect(executionOrder).toEqual(['low-1', 'high-1']);

            // Advance timer for slot 3: low-2 executes
            await vi.advanceTimersByTimeAsync(100);
            expect(executionOrder).toEqual(['low-1', 'high-1', 'low-2']);
        });
    });

    describe('3. Bounded Capacity & Low Queue Eviction (MAX_LOW_QUEUE_SIZE = 4)', () => {
        it('evicts the oldest pending low-priority request when capacity 4 is exceeded', async () => {
            const executed: string[] = [];
            const task = (id: string) => async () => {
                executed.push(id);
                return id;
            };

            // Hold dispatcher busy with active slot
            enqueueJolpicaRequest(task('active'), { priority: 'high' });
            await vi.advanceTimersByTimeAsync(0);

            // Queue 4 low-priority items (filling capacity to 4)
            const p1 = enqueueJolpicaRequest(task('L1'), { priority: 'low' });
            const p2 = enqueueJolpicaRequest(task('L2'), { priority: 'low' });
            const p3 = enqueueJolpicaRequest(task('L3'), { priority: 'low' });
            const p4 = enqueueJolpicaRequest(task('L4'), { priority: 'low' });

            expect(getJolpicaQueueStatus().lowQueueLength).toBe(MAX_LOW_QUEUE_SIZE);

            // Enqueue 5th low item -> MUST evict L1 (oldest pending)
            const p5 = enqueueJolpicaRequest(task('L5'), { priority: 'low' });

            // L1 must immediately reject with eviction error
            await expect(p1).rejects.toThrow('Prefetch request evicted from queue');
            expect(getJolpicaQueueStatus().lowQueueLength).toBe(MAX_LOW_QUEUE_SIZE);

            // Remaining items L2, L3, L4, L5 execute successfully in FIFO order
            await vi.advanceTimersByTimeAsync(750);
            expect(executed).toEqual(['active', 'L2']);

            await vi.advanceTimersByTimeAsync(750);
            expect(executed).toEqual(['active', 'L2', 'L3']);

            await vi.advanceTimersByTimeAsync(750);
            expect(executed).toEqual(['active', 'L2', 'L3', 'L4']);

            await vi.advanceTimersByTimeAsync(750);
            expect(executed).toEqual(['active', 'L2', 'L3', 'L4', 'L5']);

            await expect(Promise.all([p2, p3, p4, p5])).resolves.toEqual(['L2', 'L3', 'L4', 'L5']);
        });

        it('never evicts high-priority requests even under high volume', async () => {
            enqueueJolpicaRequest(async () => 'active', { priority: 'high' });
            await vi.advanceTimersByTimeAsync(0);

            // Enqueue 8 high-priority requests
            const promises = Array.from({ length: 8 }, (_, i) =>
                enqueueJolpicaRequest(async () => `high-${i}`, { priority: 'high' })
            );

            expect(getJolpicaQueueStatus().highQueueLength).toBe(8);

            // Advance through all 8 slots
            for (let i = 0; i < 8; i++) {
                await vi.advanceTimersByTimeAsync(750);
            }

            const results = await Promise.all(promises);
            expect(results).toHaveLength(8);
            expect(getJolpicaQueueStatus().highQueueLength).toBe(0);
        });

        it('evicts multiple oldest items in sequence during rapid hover sweep', async () => {
            enqueueJolpicaRequest(async () => 'active', { priority: 'high' });
            await vi.advanceTimersByTimeAsync(0);

            // User moves mouse across 7 race cards rapidly
            const promises = Array.from({ length: 7 }, (_, i) =>
                enqueueJolpicaRequest(async () => `hover-${i}`, { priority: 'low' })
            );

            // Slots 0, 1, 2 must have been evicted (7 items - capacity 4 = 3 evicted)
            await expect(promises[0]).rejects.toThrow(QueueEvictionError);
            await expect(promises[1]).rejects.toThrow(QueueEvictionError);
            await expect(promises[2]).rejects.toThrow(QueueEvictionError);

            // Slots 3, 4, 5, 6 remain valid
            expect(getJolpicaQueueStatus().lowQueueLength).toBe(4);

            for (let i = 0; i < 4; i++) {
                await vi.advanceTimersByTimeAsync(750);
            }

            await expect(Promise.all(promises.slice(3))).resolves.toEqual([
                'hover-3', 'hover-4', 'hover-5', 'hover-6'
            ]);
        });
    });

    describe('4. Priority Promotion (Key Collision Elevation)', () => {
        it('promotes pending low-priority request to high priority on matching key', async () => {
            const dispatchLog: string[] = [];
            const fetcherMock = vi.fn().mockImplementation(async () => {
                dispatchLog.push('round-4-data');
                return { round: '4', results: [] };
            });

            // Occupy dispatcher
            enqueueJolpicaRequest(async () => 'busy', { priority: 'high' });
            await vi.advanceTimersByTimeAsync(0);

            // Low prefetch for round-4
            const prefetchPromise = enqueueJolpicaRequest(fetcherMock, {
                priority: 'low',
                key: 'jolpica:race:2024:4',
            });

            // Unrelated low prefetch for round-5
            enqueueJolpicaRequest(async () => 'round-5-data', {
                priority: 'low',
                key: 'jolpica:race:2024:5',
            });

            expect(getJolpicaQueueStatus().lowQueueLength).toBe(2);
            expect(getJolpicaQueueStatus().highQueueLength).toBe(0);

            // User clicks round-4 -> High priority enqueue with matching key
            const clickPromise = enqueueJolpicaRequest(fetcherMock, {
                priority: 'high',
                key: 'jolpica:race:2024:4',
            });

            // Promotion verification: round-4 moved to high queue!
            expect(getJolpicaQueueStatus().lowQueueLength).toBe(1);
            expect(getJolpicaQueueStatus().highQueueLength).toBe(1);

            // At next slot (750ms), round-4 MUST dispatch immediately
            await vi.advanceTimersByTimeAsync(750);
            expect(dispatchLog).toEqual(['round-4-data']);

            // Both callers resolve to the exact same response
            const [prefetchRes, clickRes] = await Promise.all([prefetchPromise, clickPromise]);
            expect(prefetchRes).toBe(clickRes);
            expect(fetcherMock).toHaveBeenCalledTimes(1); // Deduped, single network execution!
        });

        it('promoted request is immune to subsequent low-queue eviction', async () => {
            enqueueJolpicaRequest(async () => 'busy', { priority: 'high' });
            await vi.advanceTimersByTimeAsync(0);

            // Enqueue low item and immediately promote it
            const promotedPromise = enqueueJolpicaRequest(async () => 'promoted-item', {
                priority: 'low',
                key: 'key-important',
            });
            enqueueJolpicaRequest(async () => 'promoted-item', {
                priority: 'high',
                key: 'key-important',
            });

            // Burst 5 new low requests
            for (let i = 0; i < 5; i++) {
                enqueueJolpicaRequest(async () => `flood-${i}`, { priority: 'low' }).catch(() => {});
            }

            // Promoted item must NOT have been evicted because it resides in highQueue
            await vi.advanceTimersByTimeAsync(750);
            const result = await promotedPromise;
            expect(result).toBe('promoted-item');
        });

        it('attaches to in-flight request when high request matches running low request', async () => {
            let resolveNetwork!: (val: string) => void;
            const inFlightFetcher = vi.fn().mockImplementation(() => new Promise<string>(res => {
                resolveNetwork = res;
            }));

            // Dispatch low request immediately
            const lowPromise = enqueueJolpicaRequest(inFlightFetcher, {
                priority: 'low',
                key: 'in-flight-key',
            });
            await vi.advanceTimersByTimeAsync(0);
            expect(inFlightFetcher).toHaveBeenCalledTimes(1);

            // While request is in-flight on the wire, user clicks the same item
            const highPromise = enqueueJolpicaRequest(inFlightFetcher, {
                priority: 'high',
                key: 'in-flight-key',
            });

            // Must NOT queue a redundant second request
            expect(getJolpicaQueueStatus().highQueueLength).toBe(0);

            // Resolve network response
            resolveNetwork('wire-payload');
            await vi.advanceTimersByTimeAsync(0);

            const [lowResult, highResult] = await Promise.all([lowPromise, highPromise]);
            expect(lowResult).toBe('wire-payload');
            expect(highResult).toBe('wire-payload');
            expect(inFlightFetcher).toHaveBeenCalledTimes(1);
        });

        it('promotes low priority slot via acquireSlot and promoteKey', async () => {
            const queue = new JolpicaPriorityQueue({ isTestEnv: false, intervalMs: 100 });
            const executionOrder: string[] = [];

            // Slot 1: initial item
            void queue.acquireSlot({ priority: 'low', key: 'key-1' }).then(() => executionOrder.push('slot-1'));
            await vi.advanceTimersByTimeAsync(0);
            expect(executionOrder).toEqual(['slot-1']);

            // Enqueue low-priority key-2 and low-priority key-3
            void queue.acquireSlot({ priority: 'low', key: 'key-2' }).then(() => executionOrder.push('key-2'));
            void queue.acquireSlot({ priority: 'low', key: 'key-3' }).then(() => executionOrder.push('key-3'));

            // Now high priority arrives for key-3: should promote key-3 ahead of key-2!
            const promoted = queue.promoteKey('key-3');
            expect(promoted).toBe(true);

            // Advance 100ms for slot 2
            await vi.advanceTimersByTimeAsync(100);
            expect(executionOrder).toEqual(['slot-1', 'key-3']);

            // Advance 100ms for slot 3
            await vi.advanceTimersByTimeAsync(100);
            expect(executionOrder).toEqual(['slot-1', 'key-3', 'key-2']);
        });
    });

    describe('5. HTTP 429 Flush Isolation & Backoff Handling', () => {
        it('flushes and rejects all pending low-priority requests immediately on 429 error', async () => {
            void enqueueJolpicaRequest(async () => 'L1', { priority: 'low' });
            await vi.advanceTimersByTimeAsync(0);

            // While L1 is in flight, queue L2, L3, L4
            const low2 = enqueueJolpicaRequest(async () => 'L2', { priority: 'low' });
            const low3 = enqueueJolpicaRequest(async () => 'L3', { priority: 'low' });
            const low4 = enqueueJolpicaRequest(async () => 'L4', { priority: 'low' });

            notifyJolpicaRateLimit(3000); // 3-second cooldown

            // Low requests MUST reject immediately without waiting 3000ms
            await expect(low2).rejects.toThrow(RateLimitFlushError);
            await expect(low3).rejects.toThrow(RateLimitFlushError);
            await expect(low4).rejects.toThrow(RateLimitFlushError);

            expect(getJolpicaQueueStatus().lowQueueLength).toBe(0);
        });

        it('preserves pending high-priority requests through 429 cooldown', async () => {
            // Active request
            enqueueJolpicaRequest(async () => 'active', { priority: 'high' });
            await vi.advanceTimersByTimeAsync(0);

            // Enqueue both a user click and a low prefetch
            const userClick = enqueueJolpicaRequest(async () => 'user-success', { priority: 'high' });
            const prefetch = enqueueJolpicaRequest(async () => 'prefetch', { priority: 'low' });

            // Trigger 429 with 4000ms cooldown
            notifyJolpicaRateLimit(4000);

            // Prefetch is flushed immediately
            await expect(prefetch).rejects.toThrow('Prefetch cancelled due to rate limit cooldown');

            // High-priority user request stays in queue
            expect(getJolpicaQueueStatus().highQueueLength).toBe(1);

            // Advance through 3900ms -> Still in cooldown, user request has not run yet
            await vi.advanceTimersByTimeAsync(3900);
            expect(getJolpicaQueueStatus().highQueueLength).toBe(1);

            // Advance past 4000ms cooldown -> User request executes and resolves!
            await vi.advanceTimersByTimeAsync(200);
            expect(await userClick).toBe('user-success');
            expect(getJolpicaQueueStatus().highQueueLength).toBe(0);
        });

        it('rejects new low-priority requests arriving during an active 429 cooldown', async () => {
            notifyJolpicaRateLimit(5000);

            // New prefetch enqueued during cooldown
            const prefetch = enqueueJolpicaRequest(async () => 'should-not-run', { priority: 'low' });

            // Must reject immediately without queueing
            await expect(prefetch).rejects.toThrow(RateLimitFlushError);
            expect(getJolpicaQueueStatus().lowQueueLength).toBe(0);

            // User click enqueued during cooldown is accepted into high queue
            const click = enqueueJolpicaRequest(async () => 'click-after-cooldown', { priority: 'high' });
            expect(getJolpicaQueueStatus().highQueueLength).toBe(1);

            await vi.advanceTimersByTimeAsync(5100);
            expect(await click).toBe('click-after-cooldown');
        });
    });

    describe('6. Cancellation & Queue Lifecycle', () => {
        it('cancels pending queued request when AbortSignal triggers', async () => {
            enqueueJolpicaRequest(async () => 'active', { priority: 'high' });
            await vi.advanceTimersByTimeAsync(0);

            const controller = new AbortController();
            const abortedPromise = enqueueJolpicaRequest(async () => 'aborted', {
                priority: 'high',
                signal: controller.signal,
            });

            expect(getJolpicaQueueStatus().highQueueLength).toBe(1);

            // Abort before dispatch slot
            controller.abort();

            await expect(abortedPromise).rejects.toThrow('Request aborted');
            expect(getJolpicaQueueStatus().highQueueLength).toBe(0);
        });

        it('clear() empties all queues and cancels pending requests cleanly', async () => {
            enqueueJolpicaRequest(async () => 'active', { priority: 'high' });
            await vi.advanceTimersByTimeAsync(0);

            const p1 = enqueueJolpicaRequest(async () => 'H1', { priority: 'high' });
            const p2 = enqueueJolpicaRequest(async () => 'L1', { priority: 'low' });

            resetJolpicaQueue(false);

            await expect(p1).rejects.toThrow();
            await expect(p2).rejects.toThrow();
            expect(getJolpicaQueueStatus().highQueueLength).toBe(0);
            expect(getJolpicaQueueStatus().lowQueueLength).toBe(0);
        });

        it('supports standalone instance of JolpicaPriorityQueue with custom configuration', async () => {
            // Instantiate standalone queue with 200ms pacing and capacity 2
            const customQueue = new JolpicaPriorityQueue(200, 2);

            const p1 = customQueue.enqueue(async () => 'c1', { priority: 'low' });
            const p2 = customQueue.enqueue(async () => 'c2', { priority: 'low' });
            const p3 = customQueue.enqueue(async () => 'c3', { priority: 'low' });

            // p1 evicted because capacity is 2
            await expect(p1).rejects.toThrow(QueueEvictionError);

            await vi.advanceTimersByTimeAsync(200);
            expect(await p2).toBe('c2');

            await vi.advanceTimersByTimeAsync(200);
            expect(await p3).toBe('c3');
        });
    });
});

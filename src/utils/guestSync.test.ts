import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { COMMUNITY_CHANGE_EVENT, createGuestSync, OUTBOX_KEY } from './guestSync';
import { clearQuickRatings, getQuickRatings, saveQuickDriverRating } from './storage';
import { QUICK_STORAGE_KEY, readStored } from './ratingData';

type Row = Record<string, unknown>;
const driver = { driverId: 'norris', driverName: 'Lando Norris', constructorId: 'mclaren', constructorName: 'McLaren', rating: 8 };
const cloud = (rating = 8): Row => ({ user_id: 'guest-a', season: '2026', driver_id: 'norris', driver_name: 'Lando Norris', constructor_id: 'mclaren', constructor_name: 'McLaren', rating, community_eligible: false });
function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>(done => { resolve = done; });
    return { promise, resolve };
}

function fakeDatabase() {
    const rows: Record<string, Row[]> = { user_quick_ratings: [], user_race_ratings: [] };
    const writes: Row[][] = [];
    const control = { failWrites: false, beforeRead: null as (() => Promise<void>) | null, beforeWrite: null as (() => Promise<void>) | null };
    const from = vi.fn((table: string) => {
        let action = 'select';
        let payload: Row[] = [];
        const filters: [string, unknown][] = [];
        let start = 0, end = 999;
        const match = (row: Row) => filters.every(([key, value]) => row[key] === value);
        const builder = {
            select() { return builder; },
            order() { return builder; },
            range(a: number, b: number) { start = a; end = b; return builder; },
            eq(key: string, value: unknown) { filters.push([key, value]); return builder; },
            upsert(value: Row[]) { action = 'upsert'; payload = value; return builder; },
            delete() { action = 'delete'; return builder; },
            async abortSignal() {
                if (action === 'select') {
                    const snapshot = structuredClone(rows[table].filter(match).slice(start, end + 1));
                    if (control.beforeRead) { const gate = control.beforeRead; control.beforeRead = null; await gate(); }
                    return { data: snapshot, error: null };
                }
                if (control.beforeWrite) { const gate = control.beforeWrite; control.beforeWrite = null; await gate(); }
                if (control.failWrites) return { data: null, error: new Error('offline') };
                if (action === 'delete') rows[table] = rows[table].filter(row => !match(row));
                else {
                    writes.push(structuredClone(payload));
                    for (const row of payload) {
                        const index = rows[table].findIndex(old => ['user_id', 'season', 'round', 'driver_id'].every(key => old[key] === row[key]));
                        if (index < 0) rows[table].push(row); else rows[table][index] = row;
                    }
                }
                return { data: null, error: null };
            },
        };
        return builder;
    });
    const client = { from, auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: 'guest-a' } } }, error: null }) } } as unknown as SupabaseClient;
    return { rows, writes, control, client };
}

beforeEach(() => { localStorage.clear(); vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('persistent guest sync journal', () => {
    it('bootstraps historical scores without opting them into community', async () => {
        localStorage.setItem(QUICK_STORAGE_KEY, JSON.stringify({ '2026': [driver] }));
        const db = fakeDatabase();
        await createGuestSync(db.client).sync();
        expect(db.rows.user_quick_ratings[0]).toMatchObject({ rating: 8, community_eligible: false });
        expect(readStored(OUTBOX_KEY, [])).toEqual([]);
    });
    it('keeps failed writes across reloads and invalidates community only after success', async () => {
        const db = fakeDatabase();
        db.control.failWrites = true;
        saveQuickDriverRating('2026', driver);
        const onChange = vi.fn();
        window.addEventListener(COMMUNITY_CHANGE_EVENT, onChange);
        await createGuestSync(db.client).sync();
        expect(getQuickRatings('2026')?.[0].rating).toBe(8);
        expect(readStored<unknown[]>(OUTBOX_KEY, [])).toHaveLength(1);
        expect(onChange).not.toHaveBeenCalled();
        db.control.failWrites = false;
        await createGuestSync(db.client).sync();
        expect(db.rows.user_quick_ratings).toHaveLength(1);
        expect(db.rows.user_quick_ratings[0].community_eligible).toBe(true);
        expect(readStored(OUTBOX_KEY, [])).toEqual([]);
        expect(onChange).toHaveBeenCalled();
        window.removeEventListener(COMMUNITY_CHANGE_EVENT, onChange);
    });
    it('never resurrects a season deleted offline during remote hydration', async () => {
        const db = fakeDatabase();
        db.rows.user_quick_ratings = [cloud(), { ...cloud(9), season: '2025' }];
        localStorage.setItem(QUICK_STORAGE_KEY, JSON.stringify({ '2026': [driver] }));
        clearQuickRatings('2026');
        db.control.failWrites = true;
        await createGuestSync(db.client).sync();
        expect(getQuickRatings('2026')).toBeNull();
        db.control.failWrites = false;
        await createGuestSync(db.client).sync();
        expect(db.rows.user_quick_ratings.map(row => row.season)).toEqual(['2025']);
        expect(getQuickRatings('2026')).toBeNull();
    });
    it('protects a new local selection while old remote rows are being read', async () => {
        const db = fakeDatabase();
        db.rows.user_quick_ratings = [cloud(5)];
        const gate = deferred(), started = deferred();
        db.control.beforeRead = async () => { started.resolve(); await gate.promise; };
        const task = createGuestSync(db.client).sync();
        await started.promise;
        saveQuickDriverRating('2026', { ...driver, rating: 9 });
        gate.resolve();
        await task;
        expect(getQuickRatings('2026')?.[0]).toMatchObject({ rating: 9, communityEligible: true });
        expect(db.rows.user_quick_ratings[0].rating).toBe(9);
    });
    it('does not acknowledge away a newer selection made while an upsert is pending', async () => {
        const db = fakeDatabase();
        saveQuickDriverRating('2026', driver);
        const gate = deferred(), started = deferred();
        db.control.beforeWrite = async () => { started.resolve(); await gate.promise; };
        const task = createGuestSync(db.client).sync();
        await started.promise;
        saveQuickDriverRating('2026', { ...driver, rating: 10 });
        gate.resolve();
        await task;
        expect(db.writes.map(batch => batch[0].rating)).toEqual([8, 10]);
        expect(db.rows.user_quick_ratings).toHaveLength(1);
        expect(getQuickRatings('2026')?.[0].rating).toBe(10);
        expect(readStored(OUTBOX_KEY, [])).toEqual([]);
    });
    it('orders clear then re-rate correctly even while an earlier write is pending', async () => {
        const db = fakeDatabase();
        saveQuickDriverRating('2026', driver);
        const gate = deferred(), started = deferred();
        db.control.beforeWrite = async () => { started.resolve(); await gate.promise; };
        const task = createGuestSync(db.client).sync();
        await started.promise;
        clearQuickRatings('2026');
        saveQuickDriverRating('2026', { ...driver, rating: 6.5 });
        gate.resolve();
        await task;
        expect(db.rows.user_quick_ratings).toHaveLength(1);
        expect(db.rows.user_quick_ratings[0].rating).toBe(6.5);
        expect(getQuickRatings('2026')?.[0].rating).toBe(6.5);
    });
    it('keeps offline local data and queued changes when Supabase is unconfigured', async () => {
        saveQuickDriverRating('2026', driver);
        await createGuestSync(null).sync();
        expect(readStored<unknown[]>(OUTBOX_KEY, [])).toHaveLength(1);
        expect(getQuickRatings('2026')?.[0].rating).toBe(8);
    });
});

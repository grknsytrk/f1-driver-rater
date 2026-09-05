import type { SupabaseClient, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';
import {
    entryKey, validRatings, localEntries, matchesScope, mergeRemoteEntry,
    notifyLocalRatings, readStored, type RatingEntry, type RatingScope,
} from './ratingData';

export const COMMUNITY_CHANGE_EVENT = 'f1:community-change';
export const OUTBOX_KEY = 'f1_rating_outbox_v2';
type Mutation = { id: string } & (
    { operation: 'upsert'; entry: RatingEntry } | { operation: 'delete'; scope: RatingScope }
);
interface CloudRating {
    user_id: string; season: string; round?: string; race_name?: string; race_date?: string;
    driver_id: string; driver_name: string; constructor_id: string; constructor_name: string;
    rating: number; community_eligible?: boolean;
}

function toCloud(entry: RatingEntry, userId: string): CloudRating {
    return {
        user_id: userId, season: entry.season,
        ...(entry.kind === 'race' ? { round: entry.round, race_name: entry.raceName, race_date: entry.raceDate } : {}),
        driver_id: entry.rating.driverId, driver_name: entry.rating.driverName,
        constructor_id: entry.rating.constructorId, constructor_name: entry.rating.constructorName,
        rating: entry.rating.rating, community_eligible: entry.rating.communityEligible === true,
    };
}

function fromCloud(row: CloudRating, kind: RatingEntry['kind']): RatingEntry {
    return {
        kind, season: row.season, round: row.round, raceName: row.race_name, raceDate: row.race_date,
        rating: {
            driverId: row.driver_id, driverName: row.driver_name,
            constructorId: row.constructor_id, constructorName: row.constructor_name,
            rating: Number(row.rating), communityEligible: row.community_eligible === true,
        },
    };
}

// Persistent operations retain offline edits/deletes across reloads. Injecting the
// client lets tests exercise real journal and merge behavior with controlled I/O.
export function createGuestSync(client: SupabaseClient | null) {
    let userPromise: Promise<User> | null = null;
    let running: Promise<void> | null = null;
    let hydrated = false;
    let listening = false;
    let scheduled: ReturnType<typeof setTimeout> | null = null;
    let reportedError = false;
    const outbox = () => readStored<Mutation[]>(OUTBOX_KEY, []);
    const persist = (mutations: Mutation[]) => localStorage.setItem(OUTBOX_KEY, JSON.stringify(mutations));
    const protects = (entry: RatingEntry, mutations: Mutation[]) => mutations.some(mutation =>
        mutation.operation === 'delete' ? matchesScope(entry, mutation.scope) : entryKey(entry) === entryKey(mutation.entry));

    async function ensureUser(): Promise<User> {
        if (!client) throw new Error('Cloud sync is not configured.');
        if (!userPromise) {
            userPromise = (async () => {
                const { data, error } = await client.auth.getSession();
                if (error) throw error;
                if (data.session?.user) return data.session.user;
                const anonymous = await client.auth.signInAnonymously();
                if (anonymous.error) throw anonymous.error;
                if (!anonymous.data.user) throw new Error('Guest session unavailable.');
                return anonymous.data.user;
            })().catch(error => { userPromise = null; throw error; });
        }
        return userPromise;
    }

    function changed(scopes: RatingScope[]) {
        window.dispatchEvent(new CustomEvent(COMMUNITY_CHANGE_EVENT, { detail: scopes }));
    }

    async function hydrate(userId: string) {
        const remote: RatingEntry[] = [];
        for (const kind of ['race', 'quick'] as const) {
            for (let offset = 0; ; offset += 1000) {
                let query = client!.from(kind === 'race' ? 'user_race_ratings' : 'user_quick_ratings')
                    .select('*').eq('user_id', userId).order('season').order('driver_id');
                if (kind === 'race') query = query.order('round');
                const { data, error } = await query.range(offset, offset + 999).abortSignal(AbortSignal.timeout(8000));
                if (error) throw error;
                remote.push(...((data ?? []) as CloudRating[]).map(row => fromCloud(row, kind))
                    .filter(entry => validRatings([entry.rating]).length > 0));
                if (!data || data.length < 1000) break;
            }
        }
        // Read after I/O: the user may have changed local values while it was pending.
        const pending = outbox();
        const remoteKeys = new Set(remote.map(entryKey));
        for (const entry of localEntries()) {
            if (!remoteKeys.has(entryKey(entry)) && !protects(entry, pending)) {
                pending.push({ id: crypto.randomUUID(), operation: 'upsert', entry });
            }
        }
        persist(pending);
        for (const entry of remote) {
            if (!protects(entry, pending)) mergeRemoteEntry(entry);
        }
        hydrated = true;
        notifyLocalRatings();
        window.dispatchEvent(new Event('f1:guest-sync'));
    }

    async function flush() {
        const user = await ensureUser();
        if (!hydrated) await hydrate(user.id);
        for (;;) {
            const pending = outbox();
            const first = pending[0];
            if (!first) break;
            let sent: Mutation[];
            const scopes: RatingScope[] = [];
            if (first.operation === 'upsert') {
                sent = [];
                const entries: RatingEntry[] = [];
                for (const mutation of pending.slice(0, 200)) {
                    if (mutation.operation !== 'upsert' || mutation.entry.kind !== first.entry.kind) break;
                    sent.push(mutation);
                    entries.push(mutation.entry);
                }
                const kind = first.entry.kind;
                const { error } = await client!.from(kind === 'race' ? 'user_race_ratings' : 'user_quick_ratings')
                    .upsert(entries.map(entry => toCloud(entry, user.id)), {
                        onConflict: kind === 'race' ? 'user_id,season,round,driver_id' : 'user_id,season,driver_id',
                    }).abortSignal(AbortSignal.timeout(8000));
                if (error) throw error;
                scopes.push(...entries.map(entry => ({ kind: entry.kind, season: entry.season, round: entry.round })));
            } else {
                sent = [first];
                const scope = first.scope;
                for (const kind of scope.kind ? [scope.kind] : ['race', 'quick'] as const) {
                    let query = client!.from(kind === 'race' ? 'user_race_ratings' : 'user_quick_ratings')
                        .delete().eq('user_id', user.id);
                    if (scope.season) query = query.eq('season', scope.season);
                    if (scope.round && kind === 'race') query = query.eq('round', scope.round);
                    if (scope.driverId) query = query.eq('driver_id', scope.driverId);
                    const { error } = await query.abortSignal(AbortSignal.timeout(8000));
                    if (error) throw error;
                    changed([{ ...scope, kind }]);
                }
                scopes.push(scope);
            }
            // Acknowledge by operation ID, preserving newer changes to the same driver.
            const ids = new Set(sent.map(mutation => mutation.id));
            persist(outbox().filter(mutation => !ids.has(mutation.id)));
            changed(scopes);
        }
        reportedError = false;
        window.dispatchEvent(new Event('f1:guest-sync'));
    }

    function sync(): Promise<void> {
        if (!client) return Promise.resolve();
        if (running) return running;
        running = flush().catch(() => {
            userPromise = null;
            if (!reportedError) console.warn('Guest cloud sync is unavailable; local changes are saved for retry.');
            reportedError = true;
        }).finally(() => { running = null; });
        return running;
    }

    function schedule() {
        if (!client || scheduled !== null) return;
        scheduled = setTimeout(() => { scheduled = null; void sync(); }, 150);
    }

    function queueChanges(before: RatingEntry[], after: RatingEntry[]) {
        let pending = outbox();
        const oldEntries = new Map(before.map(entry => [entryKey(entry), entry]));
        const newKeys = new Set(after.map(entryKey));
        for (const entry of after) {
            const old = oldEntries.get(entryKey(entry));
            if (old && JSON.stringify(toCloud(old, '')) === JSON.stringify(toCloud(entry, ''))) continue;
            pending = pending.filter(mutation => mutation.operation !== 'upsert' || entryKey(mutation.entry) !== entryKey(entry));
            pending.push({ id: crypto.randomUUID(), operation: 'upsert', entry });
        }
        for (const entry of before) {
            if (newKeys.has(entryKey(entry))) continue;
            pending = pending.filter(mutation => mutation.operation !== 'upsert' || entryKey(mutation.entry) !== entryKey(entry));
            pending.push({ id: crypto.randomUUID(), operation: 'delete', scope: {
                kind: entry.kind, season: entry.season, round: entry.round, driverId: entry.rating.driverId,
            } });
        }
        persist(pending);
        schedule();
    }

    function queueDelete(scope: RatingScope) {
        const pending = outbox().filter(mutation => mutation.operation !== 'upsert' || !matchesScope(mutation.entry, scope));
        pending.push({ id: crypto.randomUUID(), operation: 'delete', scope });
        persist(pending);
        notifyLocalRatings();
        schedule();
    }

    function initialize() {
        if (!listening && client) {
            listening = true;
            window.addEventListener('online', schedule);
            window.addEventListener('storage', event => { if (event.key === OUTBOX_KEY) schedule(); });
        }
        return sync();
    }
    return { initialize, sync, ensureUser, queueChanges, queueDelete };
}

const guestSync = createGuestSync(supabase);
export const initializeGuestSync = guestSync.initialize;
export const ensureGuestUser = guestSync.ensureUser;
export const queueGuestRatingChanges = guestSync.queueChanges;
export const queueGuestSeasonDelete = (season: string) => guestSync.queueDelete({ season });
export const queueGuestRaceSeasonDelete = (season: string) => guestSync.queueDelete({ kind: 'race', season });
export const queueGuestQuickSeasonDelete = (season: string) => guestSync.queueDelete({ kind: 'quick', season });
export const queueGuestClearAll = () => guestSync.queueDelete({});

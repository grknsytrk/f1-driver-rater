import { type SupabaseClient, type User } from '@supabase/supabase-js';
import type { DriverRating, RaceRatings, SeasonRatings } from '../types';
import { supabase } from '../lib/supabaseClient';

const RATINGS_STORAGE_KEY = 'f1_pilot_ratings';
const QUICK_RATINGS_STORAGE_KEY = 'f1_quick_ratings';
const STORAGE_SYNC_EVENT = 'f1:guest-sync';

interface CloudRaceRating {
    user_id: string;
    season: string;
    round: string;
    race_name: string;
    race_date: string;
    driver_id: string;
    driver_name: string;
    constructor_id: string;
    constructor_name: string;
    rating: number;
}

interface CloudQuickRating {
    user_id: string;
    season: string;
    driver_id: string;
    driver_name: string;
    constructor_id: string;
    constructor_name: string;
    rating: number;
}

let guestUserPromise: Promise<User> | null = null;
let syncQueue = Promise.resolve();
let initialSyncPromise: Promise<void> | null = null;
let hasReportedSyncError = false;
let scheduledSyncTimer: ReturnType<typeof setTimeout> | null = null;

function readLocalStorage<T>(key: string, fallback: T): T {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) as T : fallback;
    } catch {
        return fallback;
    }
}

function writeLocalStorage<T>(key: string, value: T): void {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch {
        // Keep local storage failures from interrupting the rating flow.
    }
}

function notifyStorageSync(): void {
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event(STORAGE_SYNC_EVENT));
    }
}

function reportSyncError(error: unknown): void {
    if (hasReportedSyncError) return;

    hasReportedSyncError = true;
    const details = error instanceof Error
        ? `${error.name}: ${error.message}`
        : typeof error === 'object' && error !== null
            ? JSON.stringify(error)
            : String(error);
    console.warn('Guest cloud sync is unavailable; continuing with local ratings.', details);
}

function enqueueSync(task: () => Promise<void>): Promise<void> {
    syncQueue = syncQueue
        .then(task)
        .catch(reportSyncError);

    return syncQueue;
}

async function getGuestUser(client: SupabaseClient): Promise<User> {
    if (guestUserPromise) {
        return guestUserPromise;
    }

    const pendingUser = (async () => {
        const { data, error } = await client.auth.getSession();
        if (error) throw error;

        if (data.session?.user) {
            return data.session.user;
        }

        const { data: anonymousData, error: anonymousError } = await client.auth.signInAnonymously();
        if (anonymousError) throw anonymousError;
        if (!anonymousData.user) throw new Error('Supabase did not return a guest user.');

        return anonymousData.user;
    })();

    guestUserPromise = pendingUser.catch((error) => {
        guestUserPromise = null;
        throw error;
    });

    return guestUserPromise;
}

function mergeRaceRatings(
    localRatings: Record<string, SeasonRatings>,
    remoteRows: CloudRaceRating[]
): Record<string, SeasonRatings> {
    const merged = Object.fromEntries(
        Object.entries(localRatings).map(([season, seasonRatings]) => [season, {
            ...seasonRatings,
            races: seasonRatings.races.map((race) => ({
                ...race,
                ratings: [...race.ratings],
            })),
        }])
    ) as Record<string, SeasonRatings>;
    const racesByKey = new Map<string, RaceRatings>();

    Object.values(merged).forEach((seasonRatings) => {
        seasonRatings.races.forEach((race) => {
            racesByKey.set(`${seasonRatings.season}:${race.round}`, race);
        });
    });

    remoteRows.forEach((row) => {
        const seasonRatings = merged[row.season] ?? {
            season: row.season,
            races: [],
        };
        merged[row.season] = seasonRatings;

        const raceKey = `${row.season}:${row.round}`;
        let race = racesByKey.get(raceKey);
        if (!race) {
            race = {
                round: row.round,
                raceName: row.race_name,
                date: row.race_date,
                ratings: [],
                completed: true,
            };
            seasonRatings.races.push(race);
            racesByKey.set(raceKey, race);
        }

        const hasLocalRating = race.ratings.some((rating) => rating.driverId === row.driver_id);
        if (!hasLocalRating) {
            race.ratings.push({
                driverId: row.driver_id,
                driverName: row.driver_name,
                constructorId: row.constructor_id,
                constructorName: row.constructor_name,
                rating: Number(row.rating),
            });
        }
    });

    return merged;
}

function mergeQuickRatings(
    localRatings: Record<string, DriverRating[]>,
    remoteRows: CloudQuickRating[]
): Record<string, DriverRating[]> {
    const merged = Object.fromEntries(
        Object.entries(localRatings).map(([season, ratings]) => [season, [...ratings]])
    ) as Record<string, DriverRating[]>;

    remoteRows.forEach((row) => {
        const seasonRatings = merged[row.season] ?? [];
        if (!seasonRatings.some((rating) => rating.driverId === row.driver_id)) {
            seasonRatings.push({
                driverId: row.driver_id,
                driverName: row.driver_name,
                constructorId: row.constructor_id,
                constructorName: row.constructor_name,
                rating: Number(row.rating),
            });
        }
        merged[row.season] = seasonRatings;
    });

    return merged;
}

function flattenRaceRatings(
    ratings: Record<string, SeasonRatings>,
    userId: string
): CloudRaceRating[] {
    return Object.entries(ratings).flatMap(([season, seasonRatings]) =>
        seasonRatings.races
            .filter((race) => race.completed)
            .flatMap((race) => race.ratings.map((rating) => ({
                user_id: userId,
                season,
                round: race.round,
                race_name: race.raceName,
                race_date: race.date,
                driver_id: rating.driverId,
                driver_name: rating.driverName,
                constructor_id: rating.constructorId,
                constructor_name: rating.constructorName,
                rating: rating.rating,
            })))
    );
}

function flattenQuickRatings(
    ratings: Record<string, DriverRating[]>,
    userId: string
): CloudQuickRating[] {
    return Object.entries(ratings).flatMap(([season, seasonRatings]) =>
        seasonRatings.map((rating) => ({
            user_id: userId,
            season,
            driver_id: rating.driverId,
            driver_name: rating.driverName,
            constructor_id: rating.constructorId,
            constructor_name: rating.constructorName,
            rating: rating.rating,
        }))
    );
}

async function syncLocalData(client: SupabaseClient, userId: string): Promise<void> {
    const localRaceRatings = readLocalStorage<Record<string, SeasonRatings>>(RATINGS_STORAGE_KEY, {});
    const localQuickRatings = readLocalStorage<Record<string, DriverRating[]>>(QUICK_RATINGS_STORAGE_KEY, {});

    const [raceResult, quickResult] = await Promise.all([
        client.from('user_race_ratings').select('*').eq('user_id', userId),
        client.from('user_quick_ratings').select('*').eq('user_id', userId),
    ]);

    if (raceResult.error) throw raceResult.error;
    if (quickResult.error) throw quickResult.error;

    const mergedRaceRatings = mergeRaceRatings(
        localRaceRatings,
        (raceResult.data ?? []) as CloudRaceRating[]
    );
    const mergedQuickRatings = mergeQuickRatings(
        localQuickRatings,
        (quickResult.data ?? []) as CloudQuickRating[]
    );

    writeLocalStorage(RATINGS_STORAGE_KEY, mergedRaceRatings);
    writeLocalStorage(QUICK_RATINGS_STORAGE_KEY, mergedQuickRatings);

    const raceRows = flattenRaceRatings(mergedRaceRatings, userId);
    const quickRows = flattenQuickRatings(mergedQuickRatings, userId);

    if (raceRows.length > 0) {
        const { error } = await client
            .from('user_race_ratings')
            .upsert(raceRows, { onConflict: 'user_id,season,round,driver_id' });
        if (error) throw error;
    }

    if (quickRows.length > 0) {
        const { error } = await client
            .from('user_quick_ratings')
            .upsert(quickRows, { onConflict: 'user_id,season,driver_id' });
        if (error) throw error;
    }
}

export function initializeGuestSync(): Promise<void> {
    const client = supabase;
    if (!client) return Promise.resolve();
    if (initialSyncPromise) return initialSyncPromise;

    initialSyncPromise = enqueueSync(async () => {
        const user = await getGuestUser(client);
        await syncLocalData(client, user.id);
        notifyStorageSync();
    });

    return initialSyncPromise;
}

export function queueGuestSync(): void {
    const client = supabase;
    if (!client) return;

    // Coalesce a burst of rating clicks into one cloud sync while keeping the
    // localStorage write synchronous in the calling save function.
    if (scheduledSyncTimer !== null) return;

    scheduledSyncTimer = setTimeout(() => {
        scheduledSyncTimer = null;
        void enqueueSync(async () => {
            const user = await getGuestUser(client);
            await syncLocalData(client, user.id);
            notifyStorageSync();
        });
    }, 150);
}

export function queueGuestSeasonDelete(season: string): void {
    const client = supabase;
    if (!client) return;

    void enqueueSync(async () => {
        const user = await getGuestUser(client);
        const [raceResult, quickResult] = await Promise.all([
            client.from('user_race_ratings').delete().eq('user_id', user.id).eq('season', season),
            client.from('user_quick_ratings').delete().eq('user_id', user.id).eq('season', season),
        ]);

        if (raceResult.error) throw raceResult.error;
        if (quickResult.error) throw quickResult.error;
        notifyStorageSync();
    });
}

export function queueGuestQuickSeasonDelete(season: string): void {
    const client = supabase;
    if (!client) return;

    void enqueueSync(async () => {
        const user = await getGuestUser(client);
        const { error } = await client
            .from('user_quick_ratings')
            .delete()
            .eq('user_id', user.id)
            .eq('season', season);

        if (error) throw error;
        notifyStorageSync();
    });
}

export function queueGuestClearAll(): void {
    const client = supabase;
    if (!client) return;

    void enqueueSync(async () => {
        const user = await getGuestUser(client);
        const [raceResult, quickResult] = await Promise.all([
            client.from('user_race_ratings').delete().eq('user_id', user.id),
            client.from('user_quick_ratings').delete().eq('user_id', user.id),
        ]);

        if (raceResult.error) throw raceResult.error;
        if (quickResult.error) throw quickResult.error;
        notifyStorageSync();
    });
}

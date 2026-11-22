import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabaseClient';

export const SHARE_TOKEN_PREFIX = 'v1.';
const SHORT_ID_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const SHORT_ID_RE = /^[A-Za-z0-9_-]{6,16}$/;
const SEASON_RE = /^\d{4}$/;
const DEFAULT_ORIGIN = 'https://f1-driver-rater.vercel.app';

export interface ShareSnapshotDriver {
    driverId: string;
    driverName: string;
    constructorId: string;
    constructorName: string;
    averageRating: number;
    totalRaces: number;
}

export interface ShareSnapshot {
    version: 1;
    season: string;
    mode: 'personal' | 'community';
    source: 'race' | 'quick';
    ratedRaces: number;
    title?: string;
    createdAt: string;
    drivers: ShareSnapshotDriver[];
}

export interface CreateShareInput {
    season: string;
    mode: 'personal' | 'community';
    source: 'race' | 'quick';
    ratedRaces: number;
    title?: string;
    drivers: ShareSnapshotDriver[];
}

export interface CreateShareResult {
    id: string;
    url: string;
    storage: 'supabase' | 'token';
    snapshot: ShareSnapshot;
}

interface CompactSharePayloadV1 {
    v: 1;
    s: string;
    m: 'p' | 'c';
    src: 'r' | 'q';
    r: number;
    t?: string;
    c?: string;
    d: Array<[string, string, string, string, number, number]>;
}

interface ShareSnapshotRow {
    id: string;
    season: string;
    mode: string;
    source: string;
    rated_races: number;
    title: string | null;
    payload: unknown;
    created_at: string;
}

function clampRating(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.round(Math.min(10, Math.max(0, value)) * 100) / 100;
}

function normalizeDrivers(drivers: ShareSnapshotDriver[]): ShareSnapshotDriver[] {
    return drivers
        .filter((d) => d && typeof d.driverId === 'string' && d.driverId.trim().length > 0)
        .slice(0, 25)
        .map((d) => ({
            driverId: d.driverId.trim(),
            driverName: (d.driverName || d.driverId).trim().slice(0, 64),
            constructorId: (d.constructorId || 'unknown').trim(),
            constructorName: (d.constructorName || d.constructorId || 'Unknown').trim().slice(0, 48),
            averageRating: clampRating(d.averageRating),
            totalRaces: Math.max(0, Math.min(40, Math.round(d.totalRaces || 0))),
        }));
}

function bytesToBase64Url(bytes: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < bytes.length; i += 1) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(encoded: string): Uint8Array | null {
    try {
        const padded = encoded.replace(/-/g, '+').replace(/_/g, '/');
        const remainder = padded.length % 4;
        const normalized = remainder === 0 ? padded : `${padded}${'='.repeat(4 - remainder)}`;
        const binary = atob(normalized);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    } catch {
        return null;
    }
}

export function isStatelessShareToken(id: string): boolean {
    return typeof id === 'string' && id.startsWith(SHARE_TOKEN_PREFIX);
}

export function isShortShareId(id: string): boolean {
    return typeof id === 'string' && !isStatelessShareToken(id) && SHORT_ID_RE.test(id);
}

export function generateShortShareId(length = 8): string {
    const chars: string[] = [];
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
        const random = new Uint32Array(length);
        crypto.getRandomValues(random);
        for (let i = 0; i < length; i += 1) {
            chars.push(SHORT_ID_ALPHABET[random[i] % SHORT_ID_ALPHABET.length]);
        }
        return chars.join('');
    }
    for (let i = 0; i < length; i += 1) {
        chars.push(SHORT_ID_ALPHABET[Math.floor(Math.random() * SHORT_ID_ALPHABET.length)]);
    }
    return chars.join('');
}

export function buildShareUrl(id: string, origin?: string): string {
    const resolvedOrigin = origin
        || (typeof window !== 'undefined' && window.location?.origin ? window.location.origin : DEFAULT_ORIGIN);
    return `${resolvedOrigin.replace(/\/$/, '')}/share/${encodeURIComponent(id)}`;
}

/**
 * Encodes a season rating snapshot into a compact URL-safe stateless token (`v1.<base64url>`).
 */
export function encodeShareToken(snapshot: ShareSnapshot): string {
    const compact: CompactSharePayloadV1 = {
        v: 1,
        s: snapshot.season,
        m: snapshot.mode === 'community' ? 'c' : 'p',
        src: snapshot.source === 'quick' ? 'q' : 'r',
        r: Math.max(0, Math.min(40, Math.round(snapshot.ratedRaces || 0))),
        ...(snapshot.title ? { t: snapshot.title.trim().slice(0, 60) } : {}),
        c: snapshot.createdAt.slice(0, 10),
        d: normalizeDrivers(snapshot.drivers).map((driver) => [
            driver.driverId,
            driver.driverName,
            driver.constructorId,
            driver.constructorName,
            driver.averageRating,
            driver.totalRaces,
        ]),
    };

    const json = JSON.stringify(compact);
    const bytes = new TextEncoder().encode(json);
    return `${SHARE_TOKEN_PREFIX}${bytesToBase64Url(bytes)}`;
}

/**
 * Decodes and validates a stateless `v1.<base64url>` share token back into a `ShareSnapshot`.
 */
export function decodeShareToken(token: string): ShareSnapshot | null {
    if (!isStatelessShareToken(token)) return null;
    const rawEncoded = token.slice(SHARE_TOKEN_PREFIX.length).trim();
    if (!rawEncoded) return null;

    const bytes = base64UrlToBytes(rawEncoded);
    if (!bytes) return null;

    try {
        const parsed = JSON.parse(new TextDecoder().decode(bytes)) as Partial<CompactSharePayloadV1>;
        if (!parsed || parsed.v !== 1 || typeof parsed.s !== 'string' || !SEASON_RE.test(parsed.s)) {
            return null;
        }
        if (!Array.isArray(parsed.d) || parsed.d.length === 0 || parsed.d.length > 30) {
            return null;
        }

        const drivers: ShareSnapshotDriver[] = [];
        for (const tuple of parsed.d) {
            if (!Array.isArray(tuple) || tuple.length < 5) return null;
            const [driverId, driverName, constructorId, constructorName, avgRaw, racesRaw] = tuple;
            if (typeof driverId !== 'string' || !driverId.trim() || typeof avgRaw !== 'number' || !Number.isFinite(avgRaw)) {
                return null;
            }
            if (avgRaw < 0 || avgRaw > 10) return null;

            drivers.push({
                driverId: driverId.trim(),
                driverName: typeof driverName === 'string' && driverName.trim() ? driverName.trim() : driverId.trim(),
                constructorId: typeof constructorId === 'string' && constructorId.trim() ? constructorId.trim() : 'unknown',
                constructorName: typeof constructorName === 'string' && constructorName.trim() ? constructorName.trim() : 'Unknown',
                averageRating: clampRating(avgRaw),
                totalRaces: typeof racesRaw === 'number' && Number.isFinite(racesRaw) ? Math.max(0, Math.round(racesRaw)) : 0,
            });
        }

        if (drivers.length === 0) return null;

        return {
            version: 1,
            season: parsed.s,
            mode: parsed.m === 'c' ? 'community' : 'personal',
            source: parsed.src === 'q' ? 'quick' : 'race',
            ratedRaces: typeof parsed.r === 'number' && Number.isFinite(parsed.r) ? Math.max(0, Math.round(parsed.r)) : 0,
            ...(typeof parsed.t === 'string' && parsed.t.trim() ? { title: parsed.t.trim().slice(0, 60) } : {}),
            createdAt: typeof parsed.c === 'string' && parsed.c ? parsed.c : new Date().toISOString().slice(0, 10),
            drivers,
        };
    } catch {
        return null;
    }
}

/**
 * Persists a shareable season ranking snapshot (short Supabase ID when available, stateless URL token fallback).
 */
export async function createShareSnapshot(
    input: CreateShareInput,
    origin?: string,
): Promise<CreateShareResult> {
    const normalizedDrivers = normalizeDrivers(input.drivers);
    const snapshot: ShareSnapshot = {
        version: 1,
        season: input.season,
        mode: input.mode,
        source: input.source,
        ratedRaces: Math.max(0, Math.round(input.ratedRaces || 0)),
        ...(input.title?.trim() ? { title: input.title.trim().slice(0, 60) } : {}),
        createdAt: new Date().toISOString(),
        drivers: normalizedDrivers,
    };

    if (isSupabaseConfigured && normalizedDrivers.length > 0) {
        try {
            const client = await getSupabaseClient();
            if (client) {
                const shortId = generateShortShareId(8);
                const { error } = await client.from('rating_share_snapshots').insert({
                    id: shortId,
                    season: snapshot.season,
                    mode: snapshot.mode,
                    source: snapshot.source,
                    rated_races: snapshot.ratedRaces,
                    title: snapshot.title ?? null,
                    payload: snapshot.drivers,
                });
                if (!error) {
                    return {
                        id: shortId,
                        url: buildShareUrl(shortId, origin),
                        storage: 'supabase',
                        snapshot,
                    };
                }
            }
        } catch {
            // Fall through cleanly to stateless token
        }
    }

    const token = encodeShareToken(snapshot);
    return {
        id: token,
        url: buildShareUrl(token, origin),
        storage: 'token',
        snapshot,
    };
}

/**
 * Resolves a share snapshot by either stateless `v1.` URL token or Supabase short ID.
 */
export async function loadShareSnapshot(id: string): Promise<ShareSnapshot | null> {
    if (!id) return null;
    const trimmed = id.trim();

    if (isStatelessShareToken(trimmed)) {
        return decodeShareToken(trimmed);
    }

    if (!isShortShareId(trimmed) || !isSupabaseConfigured) {
        return null;
    }

    try {
        const client = await getSupabaseClient();
        if (!client) return null;

        const { data, error } = await client
            .from('rating_share_snapshots')
            .select('id, season, mode, source, rated_races, title, payload, created_at')
            .eq('id', trimmed)
            .maybeSingle();

        if (error || !data) return null;
        const row = data as ShareSnapshotRow;
        if (!Array.isArray(row.payload) || row.payload.length === 0) return null;

        const drivers = normalizeDrivers(row.payload as ShareSnapshotDriver[]);
        if (drivers.length === 0) return null;

        return {
            version: 1,
            season: row.season,
            mode: row.mode === 'community' ? 'community' : 'personal',
            source: row.source === 'quick' ? 'quick' : 'race',
            ratedRaces: Number.isFinite(row.rated_races) ? row.rated_races : 0,
            ...(row.title ? { title: row.title } : {}),
            createdAt: row.created_at,
            drivers,
        };
    } catch {
        return null;
    }
}

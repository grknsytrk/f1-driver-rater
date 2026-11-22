export const SITE_URL = 'https://f1-driver-rater.vercel.app';
export const SHARE_TOKEN_PREFIX = 'v1.';

export const TEAM_COLORS = {
    red_bull: '#1e41ff',
    ferrari: '#dc0000',
    mercedes: '#00d2be',
    mclaren: '#ff8700',
    aston_martin: '#006f62',
    alpine: '#0090ff',
    williams: '#005aff',
    rb: '#2b4562',
    racing_bulls: '#2b4562',
    audi: '#bb0a30',
    cadillac: '#c5a26a',
    sauber: '#52e252',
    haas: '#b6babd',
    alphatauri: '#2b4562',
    alfa: '#900000',
    racing_point: '#f596c8',
    renault: '#fff500',
    force_india: '#f596c8',
    toro_rosso: '#469bff',
};

export function getTeamColor(constructorId) {
    return TEAM_COLORS[constructorId] || '#888888';
}

export function escapeHtml(input) {
    return String(input ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function decodeShareToken(token) {
    if (typeof token !== 'string' || !token.startsWith(SHARE_TOKEN_PREFIX)) return null;
    const raw = token.slice(SHARE_TOKEN_PREFIX.length).trim();
    if (!raw) return null;

    try {
        const padded = raw.replace(/-/g, '+').replace(/_/g, '/');
        const rem = padded.length % 4;
        const normalized = rem === 0 ? padded : `${padded}${'='.repeat(4 - rem)}`;
        const binary = atob(normalized);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) {
            bytes[i] = binary.charCodeAt(i);
        }
        const parsed = JSON.parse(new TextDecoder().decode(bytes));
        if (!parsed || parsed.v !== 1 || typeof parsed.s !== 'string' || !/^\d{4}$/.test(parsed.s)) {
            return null;
        }
        if (!Array.isArray(parsed.d) || parsed.d.length === 0 || parsed.d.length > 30) {
            return null;
        }

        const drivers = [];
        for (const tuple of parsed.d) {
            if (!Array.isArray(tuple) || tuple.length < 5) return null;
            const [driverId, driverName, constructorId, constructorName, avgRaw, racesRaw] = tuple;
            if (typeof driverId !== 'string' || typeof avgRaw !== 'number' || !Number.isFinite(avgRaw)) {
                return null;
            }
            drivers.push({
                driverId: driverId.trim(),
                driverName: String(driverName || driverId).trim(),
                constructorId: String(constructorId || 'unknown').trim(),
                constructorName: String(constructorName || 'Unknown').trim(),
                averageRating: Math.round(Math.min(10, Math.max(0, avgRaw)) * 100) / 100,
                totalRaces: Number.isFinite(racesRaw) ? Math.max(0, Math.round(racesRaw)) : 0,
            });
        }

        return {
            version: 1,
            season: parsed.s,
            mode: parsed.m === 'c' ? 'community' : 'personal',
            source: parsed.src === 'q' ? 'quick' : 'race',
            ratedRaces: Number.isFinite(parsed.r) ? Math.max(0, Math.round(parsed.r)) : 0,
            title: typeof parsed.t === 'string' && parsed.t.trim() ? parsed.t.trim().slice(0, 60) : undefined,
            createdAt: typeof parsed.c === 'string' ? parsed.c : '',
            drivers,
        };
    } catch {
        return null;
    }
}

export async function resolveShareSnapshot(rawId) {
    if (!rawId || typeof rawId !== 'string') return null;
    const id = decodeURIComponent(rawId).trim();

    if (id.startsWith(SHARE_TOKEN_PREFIX)) {
        return decodeShareToken(id);
    }

    if (!/^[A-Za-z0-9_-]{6,16}$/.test(id)) {
        return null;
    }

    const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
    const supabaseKey = (
        process.env.SUPABASE_PUBLISHABLE_KEY
        || process.env.VITE_SUPABASE_PUBLISHABLE_KEY
        || process.env.VITE_SUPABASE_ANON_KEY
        || ''
    ).trim();

    if (!supabaseUrl || !supabaseKey) {
        return null;
    }

    try {
        const endpoint = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/rating_share_snapshots?id=eq.${encodeURIComponent(id)}&select=id,season,mode,source,rated_races,title,payload,created_at&limit=1`;
        const res = await fetch(endpoint, {
            headers: {
                apikey: supabaseKey,
                Authorization: `Bearer ${supabaseKey}`,
                Accept: 'application/json',
            },
        });
        if (!res.ok) return null;
        const rows = await res.json();
        if (!Array.isArray(rows) || rows.length === 0) return null;
        const row = rows[0];
        if (!row || !Array.isArray(row.payload) || row.payload.length === 0) return null;

        return {
            version: 1,
            season: String(row.season),
            mode: row.mode === 'community' ? 'community' : 'personal',
            source: row.source === 'quick' ? 'quick' : 'race',
            ratedRaces: Number.isFinite(row.rated_races) ? row.rated_races : 0,
            title: row.title || undefined,
            createdAt: row.created_at || '',
            drivers: row.payload.slice(0, 25),
        };
    } catch {
        return null;
    }
}

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT_PATH = resolve(ROOT, 'public/data/historical-h2h-v1.json');
const API_BASE = 'https://api.jolpi.ca/ergast/f1';
const PAGE_SIZE = 100;
const MIN_REQUEST_INTERVAL_MS = 1000;
const UNCLASSIFIED_POSITION_TEXT = new Set(['R', 'D', 'E', 'W', 'F', 'N']);

let nextRequestAt = 0;
let requestQueue = Promise.resolve();

function sleep(ms) {
    return new Promise(resolveSleep => setTimeout(resolveSleep, ms));
}

function retryAfterMs(response, attempt) {
    const value = response.headers.get('retry-after') ?? '';
    const seconds = Number.parseFloat(value);
    if (Number.isFinite(seconds) && seconds > 0) return Math.ceil(seconds * 1000) + 500;
    const retryAt = Date.parse(value);
    if (Number.isFinite(retryAt) && retryAt > Date.now()) return retryAt - Date.now() + 500;
    return Math.round(2000 * (1.7 ** attempt)) + Math.floor(Math.random() * 500);
}

async function waitForRequestSlot() {
    const slot = requestQueue.then(async () => {
        while (Date.now() < nextRequestAt) await sleep(nextRequestAt - Date.now());
        nextRequestAt = Date.now() + MIN_REQUEST_INTERVAL_MS;
    });
    requestQueue = slot.catch(() => undefined);
    return slot;
}

async function getJson(url) {
    for (let attempt = 0; attempt <= 5; attempt += 1) {
        await waitForRequestSlot();
        const response = await fetch(url, { headers: { accept: 'application/json' } });
        if (response.status === 429 && attempt < 5) {
            nextRequestAt = Math.max(nextRequestAt, Date.now() + retryAfterMs(response, attempt));
            console.warn(`Jolpica returned 429; waiting before retry ${attempt + 1}/5.`);
            continue;
        }
        if (!response.ok) {
            throw new Error(`Jolpica request failed (${response.status}) for ${url}`);
        }
        return response.json();
    }
    throw new Error(`Jolpica request retry limit reached for ${url}`);
}

async function fetchSeasonTable(season, endpoint) {
    const recordsByRound = new Map();
    let offset = 0;
    let total = Number.POSITIVE_INFINITY;

    while (offset < total) {
        const url = `${API_BASE}/${season}/${endpoint}.json?limit=${PAGE_SIZE}&offset=${offset}`;
        const payload = await getJson(url);
        const metadata = payload.MRData;
        const races = metadata.RaceTable?.Races ?? [];
        total = Number.parseInt(metadata.total, 10) || 0;

        for (const race of races) {
            const key = String(race.round);
            const record = recordsByRound.get(key) ?? {
                round: key,
                raceName: race.raceName ?? `Round ${key}`,
                date: race.date ?? '',
                results: [],
                qualifying: [],
            };
            record.results.push(...(race.Results ?? []));
            record.qualifying.push(...(race.QualifyingResults ?? []));
            recordsByRound.set(key, record);
        }

        offset += PAGE_SIZE;
        if (races.length === 0 && offset < total) {
            throw new Error(`Jolpica returned an empty ${endpoint} page for ${season} at offset ${offset - PAGE_SIZE}`);
        }
    }

    return recordsByRound;
}

function newPayload() {
    return { version: 1, drivers: [], constructors: [], statuses: [], seasons: {} };
}

async function readExistingPayload(merge) {
    if (!merge) return newPayload();
    try {
        const existing = JSON.parse(await readFile(OUTPUT_PATH, 'utf8'));
        if (existing.version !== 1 || !existing.seasons) throw new Error('Unsupported historical H2H file version.');
        return existing;
    } catch (error) {
        if (error.code === 'ENOENT') return newPayload();
        throw error;
    }
}

function ensureIndex(items, byId, id, name) {
    let index = byId.get(id);
    if (index === undefined) {
        index = items.length;
        items.push([id, name]);
        byId.set(id, index);
    } else if (!items[index][1] && name) {
        items[index][1] = name;
    }
    return index;
}

function ensureStatusIndex(payload, byStatus, status) {
    let index = byStatus.get(status);
    if (index === undefined) {
        index = payload.statuses.length;
        payload.statuses.push(status);
        byStatus.set(status, index);
    }
    return index;
}

function parsePosition(value) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
}

function hasClassifiedFinishStatus(status) {
    return /^(finished|lapped|\+\s*\d+\s*lap(?:s)?)$/i.test(status.trim());
}

function toCompactSeason(payload, raceTable, qualifyingTable) {
    const driverIndexes = new Map(payload.drivers.map(([id], index) => [id, index]));
    const constructorIndexes = new Map(payload.constructors.map(([id], index) => [id, index]));
    const statusIndexes = new Map(payload.statuses.map((status, index) => [status, index]));
    const roundIds = new Set([...raceTable.keys(), ...qualifyingTable.keys()]);

    return [...roundIds]
        .sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10))
        .map(round => {
            const race = raceTable.get(round);
            const qualifying = qualifyingTable.get(round);
            const raceEntries = new Map();

            for (const result of race?.results ?? []) {
                const driverId = result.Driver?.driverId;
                const constructorId = result.Constructor?.constructorId;
                if (!driverId || !constructorId) continue;
                const driverName = `${result.Driver.givenName ?? ''} ${result.Driver.familyName ?? ''}`.trim();
                const constructorName = result.Constructor.name ?? constructorId;
                const driverIdx = ensureIndex(payload.drivers, driverIndexes, driverId, driverName);
                const constructorIdx = ensureIndex(payload.constructors, constructorIndexes, constructorId, constructorName);
                const status = result.status || 'Finished';
                const statusIdx = ensureStatusIndex(payload, statusIndexes, status);
                const positionText = result.positionText ?? '';
                const numericPosition = parsePosition(result.position);
                const racePosition = !UNCLASSIFIED_POSITION_TEXT.has(positionText)
                    && hasClassifiedFinishStatus(status)
                    && numericPosition !== null
                    ? numericPosition
                    : null;
                const started = !/^(did not start|did not qualify|not started|withdrawn|dns)\b/i.test(status.trim());

                raceEntries.set(`${driverId}::${constructorId}`, {
                    driverIdx,
                    constructorIdx,
                    gridPosition: parsePosition(result.grid),
                    racePosition,
                    points: Number.parseFloat(result.points) || 0,
                    statusIdx,
                    started: started ? 1 : 0,
                    qualifyingPosition: null,
                });
            }

            for (const result of qualifying?.qualifying ?? []) {
                const driverId = result.Driver?.driverId;
                const constructorId = result.Constructor?.constructorId;
                if (!driverId || !constructorId) continue;
                const driverName = `${result.Driver.givenName ?? ''} ${result.Driver.familyName ?? ''}`.trim();
                const constructorName = result.Constructor.name ?? constructorId;
                const driverIdx = ensureIndex(payload.drivers, driverIndexes, driverId, driverName);
                const constructorIdx = ensureIndex(payload.constructors, constructorIndexes, constructorId, constructorName);
                const key = `${driverId}::${constructorId}`;
                const entry = raceEntries.get(key) ?? {
                    driverIdx,
                    constructorIdx,
                    gridPosition: null,
                    racePosition: null,
                    points: 0,
                    statusIdx: ensureStatusIndex(payload, statusIndexes, 'Did not start'),
                    started: 0,
                    qualifyingPosition: null,
                };
                entry.qualifyingPosition = parsePosition(result.position);
                raceEntries.set(key, entry);
            }

            const raceMeta = race ?? qualifying;
            const entries = [...raceEntries.values()]
                .sort((a, b) => (a.racePosition ?? Number.MAX_SAFE_INTEGER) - (b.racePosition ?? Number.MAX_SAFE_INTEGER))
                .map(entry => [
                    entry.driverIdx,
                    entry.constructorIdx,
                    entry.gridPosition,
                    entry.racePosition,
                    entry.points,
                    entry.statusIdx,
                    entry.started,
                    entry.qualifyingPosition,
                ]);

            return [round, raceMeta?.raceName ?? `Round ${round}`, raceMeta?.date ?? '', entries];
        });
}

async function generateSeason(payload, season) {
    console.log(`Fetching ${season} race results...`);
    const raceTable = await fetchSeasonTable(season, 'results');
    console.log(`Fetching ${season} qualifying results...`);
    const qualifyingTable = await fetchSeasonTable(season, 'qualifying');
    const compactSeason = toCompactSeason(payload, raceTable, qualifyingTable);
    if (compactSeason.length === 0) throw new Error(`No H2H data returned for season ${season}.`);
    payload.seasons[season] = compactSeason;
    console.log(`${season}: ${compactSeason.length} rounds compacted.`);
}

const args = process.argv.slice(2);
const seasonArgument = args.indexOf('--season');
const allSeasons = args.includes('--all');
const selectedSeason = seasonArgument >= 0 ? args[seasonArgument + 1] : null;

if (allSeasons === Boolean(selectedSeason) || (selectedSeason && !/^\d{4}$/.test(selectedSeason))) {
    console.error('Usage: node scripts/generate-historical-h2h.mjs --season 2000');
    console.error('       node scripts/generate-historical-h2h.mjs --all');
    process.exitCode = 1;
} else if (args.includes('--replace') && !allSeasons) {
    console.error('Use --all to replace the full archive. A single --season run always replaces that season and keeps the others.');
    process.exitCode = 1;
} else {
    const payload = await readExistingPayload(!allSeasons);
    const seasons = allSeasons
        ? Array.from({ length: 26 }, (_, index) => String(2000 + index))
        : [selectedSeason];

    for (const season of seasons) await generateSeason(payload, season);

    const sortedSeasons = Object.fromEntries(
        Object.entries(payload.seasons).sort(([a], [b]) => Number.parseInt(a, 10) - Number.parseInt(b, 10)),
    );
    payload.seasons = sortedSeasons;
    await writeFile(OUTPUT_PATH, `${JSON.stringify(payload)}\n`, 'utf8');
    console.log(`Wrote ${OUTPUT_PATH}`);
}

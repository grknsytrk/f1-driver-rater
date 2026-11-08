#!/usr/bin/env node
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT_DIR = resolve(ROOT, 'public/data/seasons');
const MANIFEST_PATH = resolve(OUTPUT_DIR, 'manifest.json');
const API_BASE = 'https://api.jolpi.ca/ergast/f1';
const PAGE_SIZE = 100;
const MIN_REQUEST_INTERVAL_MS = 750;
const UNCLASSIFIED_POSITION_TEXT = new Set(['R', 'D', 'E', 'W', 'F', 'N']);

let nextRequestAt = 0;
let requestQueue = Promise.resolve();

function sleep(ms) {
    return new Promise(resolveSleep => setTimeout(resolveSleep, ms));
}

function parseF1TimeSeconds(value) {
    if (!value) return null;
    const normalized = String(value).trim().replace(/^\+/, '');
    if (!normalized || !/^[0-9:.]+$/.test(normalized)) return null;

    const parts = normalized.split(':');
    if (parts.length > 3 || parts.some(part => part.length === 0)) return null;
    const secondsPart = Number(parts[parts.length - 1]);
    if (!Number.isFinite(secondsPart) || secondsPart < 0) return null;

    if (parts.length === 1) return secondsPart;

    const wholeParts = parts.slice(0, -1).map(Number);
    if (wholeParts.some(part => !Number.isSafeInteger(part) || part < 0)) return null;

    if (parts.length === 2) {
        if (secondsPart >= 60) return null;
        return wholeParts[0] * 60 + secondsPart;
    }

    if (wholeParts[1] >= 60 || secondsPart >= 60) return null;
    return wholeParts[0] * 3600 + wholeParts[1] * 60 + secondsPart;
}

function retryAfterMs(response, attempt) {
    const value = response.headers?.get?.('retry-after') ?? '';
    const seconds = Number.parseFloat(value);
    if (Number.isFinite(seconds) && seconds > 0) return Math.ceil(seconds * 1000) + 500;
    const retryAt = Date.parse(value);
    if (Number.isFinite(retryAt) && retryAt > Date.now()) return retryAt - Date.now() + 500;
    return Math.round(2000 * (1.7 ** attempt)) + Math.floor(Math.random() * 500);
}

async function waitForRequestSlot() {
    const slot = requestQueue.then(async () => {
        while (Date.now() < nextRequestAt) {
            await sleep(nextRequestAt - Date.now());
        }
        nextRequestAt = Date.now() + MIN_REQUEST_INTERVAL_MS;
    });
    requestQueue = slot.catch(() => undefined);
    return slot;
}

async function getJson(url) {
    for (let attempt = 0; attempt <= 5; attempt += 1) {
        await waitForRequestSlot();
        try {
            const response = await fetch(url, { headers: { accept: 'application/json' } });
            if (response.status === 429 && attempt < 5) {
                const backoff = retryAfterMs(response, attempt);
                nextRequestAt = Math.max(nextRequestAt, Date.now() + backoff);
                console.warn(`[Jolpica] 429 rate limit hit; waiting ${backoff}ms before retry ${attempt + 1}/5.`);
                continue;
            }
            if (!response.ok) {
                if (attempt < 5 && response.status >= 500) {
                    const backoff = Math.round(1500 * (1.5 ** attempt)) + 300;
                    console.warn(`[Jolpica] HTTP ${response.status}; retrying in ${backoff}ms (${attempt + 1}/5)...`);
                    await sleep(backoff);
                    continue;
                }
                throw new Error(`Jolpica request failed (${response.status}) for ${url}`);
            }
            return await response.json();
        } catch (error) {
            if (attempt < 5 && (error.code === 'ECONNRESET' || error.message.includes('fetch failed'))) {
                const backoff = Math.round(1500 * (1.5 ** attempt)) + 300;
                console.warn(`[Jolpica] Network error (${error.message}); retrying in ${backoff}ms...`);
                await sleep(backoff);
                continue;
            }
            throw error;
        }
    }
    throw new Error(`Jolpica request retry limit reached for ${url}`);
}

async function fetchAllPaginated(urlPrefix) {
    const records = [];
    let offset = 0;
    let total = Number.POSITIVE_INFINITY;

    while (offset < total) {
        const separator = urlPrefix.includes('?') ? '&' : '?';
        const url = `${urlPrefix}${separator}limit=${PAGE_SIZE}&offset=${offset}`;
        const payload = await getJson(url);
        const metadata = payload.MRData ?? {};
        const races = metadata.RaceTable?.Races ?? [];
        total = Number.parseInt(metadata.total, 10) || 0;

        records.push(...races);
        offset += PAGE_SIZE;

        if (races.length === 0 && offset < total) {
            break;
        }
    }

    return records;
}

function stripUrls(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) {
        return obj.map(stripUrls);
    }
    const clean = {};
    for (const [key, value] of Object.entries(obj)) {
        if (key === 'url') {
            clean[key] = '';
        } else if (value && typeof value === 'object') {
            clean[key] = stripUrls(value);
        } else {
            clean[key] = value;
        }
    }
    return clean;
}

function isClassifiedRaceResult(result) {
    const positionText = (result.positionText || '').trim().toUpperCase();
    const status = (result.status || '').trim();
    const hasClassifiedStatus = !status || /^(finished|lapped|\+\s*\d+\s*lap(?:s)?)$/i.test(status);
    return !UNCLASSIFIED_POSITION_TEXT.has(positionText)
        && hasClassifiedStatus
        && Number.isFinite(Number.parseInt(result.position, 10));
}

function didStartRace(result) {
    return !/^(did not start|did not qualify|not started|withdrawn|dns)\b/i.test((result.status || '').trim());
}

function getWinnerElapsedSeconds(results) {
    const winner = results.find(result => Number.parseInt(result.position, 10) === 1);
    if (!winner) return null;
    const millis = winner.Time?.millis ? Number(winner.Time.millis) : Number.NaN;
    if (Number.isFinite(millis) && millis >= 0) return millis / 1000;
    return parseF1TimeSeconds(winner.Time?.time);
}

function getRaceTimeGapSeconds(result, winnerElapsedSeconds) {
    const ownMillis = result.Time?.millis ? Number(result.Time.millis) : Number.NaN;
    if (Number.isFinite(ownMillis) && ownMillis >= 0 && winnerElapsedSeconds !== null) {
        return Math.max(0, ownMillis / 1000 - winnerElapsedSeconds);
    }
    if (Number.parseInt(result.position, 10) === 1) return 0;
    const officialTime = result.Time?.time?.trim();
    if (!officialTime) return null;
    if (officialTime.startsWith('+')) return parseF1TimeSeconds(officialTime.slice(1));
    const ownElapsedSeconds = parseF1TimeSeconds(officialTime);
    if (ownElapsedSeconds === null || winnerElapsedSeconds === null) return null;
    return Math.max(0, ownElapsedSeconds - winnerElapsedSeconds);
}

function buildMockSeasonBundle(seasonStr) {
    const season = String(seasonStr);
    const is2026 = season === '2026';
    const totalRounds = is2026 ? 23 : (season === '2020' ? 17 : 24);
    const lastCompletedRound = is2026 ? 19 : totalRounds;
    const isArchived = !is2026;

    const mockDrivers = [
        { driverId: 'verstappen', givenName: 'Max', familyName: 'Verstappen', code: 'VER', permanentNumber: '1', url: '' },
        { driverId: 'norris', givenName: 'Lando', familyName: 'Norris', code: 'NOR', permanentNumber: '4', url: '' },
        { driverId: 'leclerc', givenName: 'Charles', familyName: 'Leclerc', code: 'LEC', permanentNumber: '16', url: '' },
        { driverId: 'piastri', givenName: 'Oscar', familyName: 'Piastri', code: 'PIA', permanentNumber: '81', url: '' },
        { driverId: 'russell', givenName: 'George', familyName: 'Russell', code: 'RUS', permanentNumber: '63', url: '' },
    ];

    const mockConstructors = [
        { constructorId: 'mclaren', name: 'McLaren', url: '' },
        { constructorId: 'ferrari', name: 'Ferrari', url: '' },
        { constructorId: 'red_bull', name: 'Red Bull', url: '' },
        { constructorId: 'mercedes', name: 'Mercedes', url: '' },
    ];

    const races = [];
    const results = [];
    const qualifying = [];
    const sprints = [];
    const roundResults = {};
    const roundQualifying = {};

    for (let r = 1; r <= totalRounds; r += 1) {
        const roundStr = String(r);
        const raceDate = `${season}-${String(Math.min(12, Math.ceil(r / 2))).padStart(2, '0')}-15`;
        const race = {
            season,
            round: roundStr,
            raceName: `Grand Prix Round ${roundStr}`,
            Circuit: {
                circuitId: `circuit_${roundStr}`,
                circuitName: `Circuit ${roundStr}`,
                url: '',
                Location: { locality: 'City', country: 'Country' },
            },
            date: raceDate,
        };
        races.push(race);

        if (r <= lastCompletedRound) {
            const rawRoundResults = [];
            const rawRoundQuali = [];

            mockDrivers.forEach((driver, idx) => {
                const constr = mockConstructors[idx % mockConstructors.length];
                const pos = idx + 1;
                const points = [25, 18, 15, 12, 10][idx] || 0;

                const raceResult = {
                    number: driver.permanentNumber,
                    position: String(pos),
                    positionText: String(pos),
                    points: String(points),
                    Driver: driver,
                    Constructor: constr,
                    grid: String(pos),
                    laps: '50',
                    status: 'Finished',
                    Time: { millis: String(5400000 + idx * 2500), time: `1:30:0${idx}.000` },
                };
                rawRoundResults.push(raceResult);

                results.push({
                    round: roundStr,
                    raceName: race.raceName,
                    date: race.date,
                    driverId: driver.driverId,
                    driverName: `${driver.givenName} ${driver.familyName}`,
                    constructorId: constr.constructorId,
                    constructorName: constr.name,
                    gridPosition: pos,
                    position: pos,
                    positionText: String(pos),
                    points,
                    status: 'Finished',
                    started: true,
                    raceTimeGapSeconds: idx * 2.5,
                });

                const qResult = {
                    position: String(pos),
                    Driver: driver,
                    Constructor: constr,
                    Q1: '1:29.500',
                    Q2: '1:28.900',
                    Q3: `1:28.00${idx}`,
                };
                rawRoundQuali.push(qResult);

                qualifying.push({
                    round: roundStr,
                    raceName: race.raceName,
                    date: race.date,
                    driverId: driver.driverId,
                    driverName: `${driver.givenName} ${driver.familyName}`,
                    constructorId: constr.constructorId,
                    constructorName: constr.name,
                    position: pos,
                    bestTimeSeconds: 88 + idx * 0.1,
                });
            });

            roundResults[roundStr] = rawRoundResults;
            roundQualifying[roundStr] = rawRoundQuali;
        }
    }

    const driverStandings = mockDrivers.map((driver, idx) => ({
        position: String(idx + 1),
        positionText: String(idx + 1),
        points: String((lastCompletedRound * (25 - idx * 5))),
        wins: String(idx === 0 ? Math.ceil(lastCompletedRound / 2) : 1),
        Driver: driver,
        Constructors: [mockConstructors[idx % mockConstructors.length]],
    }));

    const constructorStandings = mockConstructors.map((constr, idx) => ({
        constructorId: constr.constructorId,
        constructorName: constr.name,
        position: idx + 1,
        points: lastCompletedRound * (40 - idx * 10),
        wins: idx === 0 ? Math.ceil(lastCompletedRound / 2) : 1,
    }));

    return {
        season,
        version: 1,
        generatedAt: new Date().toISOString(),
        isArchived,
        lastCompletedRound,
        lastResultsRound: lastCompletedRound,
        lastQualifyingRound: lastCompletedRound,
        lastSprintsRound: lastCompletedRound,
        lastDriverStandingsRound: lastCompletedRound,
        lastConstructorStandingsRound: lastCompletedRound,
        totalRounds,
        races,
        results,
        qualifying,
        sprints,
        driverStandings,
        constructorStandings,
        roundResults,
        roundQualifying,
    };
}

async function generateSeasonBundle(seasonStr, options = {}) {
    const season = String(seasonStr);
    console.log(`\n========================================`);
    console.log(`Generating season bundle for ${season}...`);
    console.log(`========================================`);

    if (options.mock) {
        console.log(`[Mock Mode] Synthesizing mock season bundle for ${season}...`);
        return buildMockSeasonBundle(season);
    }

    // 1. Fetch Calendar
    console.log(`[1/5] Fetching race calendar for ${season}...`);
    const calendarPayload = await getJson(`${API_BASE}/${season}.json?limit=100`);
    const rawRaces = calendarPayload.MRData?.RaceTable?.Races ?? [];
    if (rawRaces.length === 0) {
        throw new Error(`No races found for season ${season}`);
    }
    const races = stripUrls(rawRaces);
    const totalRounds = races.length;
    console.log(`  Found ${totalRounds} scheduled races.`);

    // 2. Fetch Race Results
    console.log(`[2/5] Fetching race results for ${season}...`);
    const rawResultsRaces = await fetchAllPaginated(`${API_BASE}/${season}/results.json`);
    const resultsRaces = stripUrls(rawResultsRaces);

    const currentYear = String(new Date().getUTCFullYear());
    const isCurrentSeason = Number.parseInt(season, 10) >= Number.parseInt(currentYear, 10);
    // Jolpica only publishes results/qualifying/sprints for sessions that have actually occurred.
    const maxAllowedRound = totalRounds;

    // Group race chunks by round
    const racesByRound = new Map();
    let maxCompletedRound = 0;

    resultsRaces.forEach(race => {
        const roundNum = Number.parseInt(race.round, 10);
        if (!Number.isFinite(roundNum) || roundNum > maxAllowedRound) {
            return;
        }

        if (roundNum > maxCompletedRound) {
            maxCompletedRound = roundNum;
        }

        const roundKey = String(race.round);
        if (!racesByRound.has(roundKey)) {
            racesByRound.set(roundKey, {
                ...race,
                Results: [],
            });
        }

        const entry = racesByRound.get(roundKey);
        const existingDriverIds = new Set(entry.Results.map(r => r.Driver?.driverId).filter(Boolean));
        for (const res of (race.Results ?? [])) {
            const dId = res.Driver?.driverId;
            if (!dId || !existingDriverIds.has(dId)) {
                if (dId) existingDriverIds.add(dId);
                entry.Results.push(res);
            }
        }
    });

    const roundResults = {};
    const results = [];

    const sortedRounds = Array.from(racesByRound.keys()).sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10));
    sortedRounds.forEach(roundKey => {
        const race = racesByRound.get(roundKey);
        race.Results.sort((a, b) => {
            const posA = Number.parseInt(a.position, 10);
            const posB = Number.parseInt(b.position, 10);
            if (Number.isFinite(posA) && Number.isFinite(posB)) return posA - posB;
            if (Number.isFinite(posA)) return -1;
            if (Number.isFinite(posB)) return 1;
            return 0;
        });

        const raceEntries = race.Results;
        roundResults[roundKey] = raceEntries;

        const winnerElapsedSeconds = getWinnerElapsedSeconds(raceEntries);
        raceEntries.forEach(result => {
            const isClassified = isClassifiedRaceResult(result);
            const parsedPosition = Number.parseInt(result.position, 10);
            const parsedGridPosition = Number.parseInt(result.grid, 10);

            results.push({
                round: race.round,
                raceName: race.raceName ?? `Round ${race.round}`,
                date: race.date ?? '',
                driverId: result.Driver?.driverId ?? 'unknown',
                driverName: `${result.Driver?.givenName ?? ''} ${result.Driver?.familyName ?? ''}`.trim(),
                constructorId: result.Constructor?.constructorId ?? 'unknown',
                constructorName: result.Constructor?.name ?? 'Unknown',
                gridPosition: Number.isFinite(parsedGridPosition) ? parsedGridPosition : null,
                position: isClassified && Number.isFinite(parsedPosition) ? parsedPosition : null,
                positionText: result.positionText ?? '',
                points: parseFloat(result.points) || 0,
                status: result.status ?? '',
                started: didStartRace(result),
                raceTimeGapSeconds: getRaceTimeGapSeconds(result, winnerElapsedSeconds),
            });
        });
    });

    console.log(`  Processed ${results.length} race results across ${Object.keys(roundResults).length} rounds.`);

    // Determine archive & completed status
    const isArchived = !isCurrentSeason && maxCompletedRound >= totalRounds;
    const lastCompletedRound = maxCompletedRound > 0 ? maxCompletedRound : null;

    // 3. Fetch Qualifying Results
    console.log(`[3/5] Fetching qualifying results for ${season}...`);
    const rawQualifyingRaces = await fetchAllPaginated(`${API_BASE}/${season}/qualifying.json`);
    const qualifyingRaces = stripUrls(rawQualifyingRaces);

    const qualifyingByRound = new Map();
    qualifyingRaces.forEach(race => {
        const roundNum = Number.parseInt(race.round, 10);
        if (Number.isFinite(roundNum) && roundNum > maxAllowedRound) {
            return;
        }

        const roundKey = String(race.round);
        if (!qualifyingByRound.has(roundKey)) {
            qualifyingByRound.set(roundKey, {
                ...race,
                QualifyingResults: [],
            });
        }

        const entry = qualifyingByRound.get(roundKey);
        const existingDriverIds = new Set(entry.QualifyingResults.map(r => r.Driver?.driverId).filter(Boolean));
        for (const res of (race.QualifyingResults ?? [])) {
            const dId = res.Driver?.driverId;
            if (!dId || !existingDriverIds.has(dId)) {
                if (dId) existingDriverIds.add(dId);
                entry.QualifyingResults.push(res);
            }
        }
    });

    const roundQualifying = {};
    const qualifying = [];

    const sortedQualiRounds = Array.from(qualifyingByRound.keys()).sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10));
    sortedQualiRounds.forEach(roundKey => {
        const race = qualifyingByRound.get(roundKey);
        race.QualifyingResults.sort((a, b) => {
            const posA = Number.parseInt(a.position, 10);
            const posB = Number.parseInt(b.position, 10);
            if (Number.isFinite(posA) && Number.isFinite(posB)) return posA - posB;
            if (Number.isFinite(posA)) return -1;
            if (Number.isFinite(posB)) return 1;
            return 0;
        });

        const qualiEntries = race.QualifyingResults;
        roundQualifying[roundKey] = qualiEntries;

        qualiEntries.forEach(result => {
            const bestTime = [result.Q1, result.Q2, result.Q3]
                .map(time => parseF1TimeSeconds(time))
                .filter(time => time !== null)
                .reduce((best, time) => best === null || time < best ? time : best, null);

            qualifying.push({
                round: race.round,
                raceName: race.raceName ?? `Round ${race.round}`,
                date: race.date ?? '',
                driverId: result.Driver?.driverId ?? 'unknown',
                driverName: `${result.Driver?.givenName ?? ''} ${result.Driver?.familyName ?? ''}`.trim(),
                constructorId: result.Constructor?.constructorId ?? 'unknown',
                constructorName: result.Constructor?.name ?? 'Unknown',
                position: parseInt(result.position, 10) || 0,
                bestTimeSeconds: bestTime,
            });
        });
    });

    console.log(`  Processed ${qualifying.length} qualifying entries across ${Object.keys(roundQualifying).length} rounds.`);

    // 4. Fetch Sprint Results (Seasons 2021+)
    console.log(`[4/5] Fetching sprint results for ${season}...`);
    const sprints = [];
    let maxSprintRound = 0;
    if (Number.parseInt(season, 10) >= 2021) {
        try {
            const rawSprintRaces = await fetchAllPaginated(`${API_BASE}/${season}/sprint.json`);
            const sprintRaces = stripUrls(rawSprintRaces);

            const sprintsByRound = new Map();
            sprintRaces.forEach(race => {
                const roundNum = Number.parseInt(race.round, 10);
                if (Number.isFinite(roundNum) && roundNum > maxAllowedRound) {
                    return;
                }

                const roundKey = String(race.round);
                if (!sprintsByRound.has(roundKey)) {
                    sprintsByRound.set(roundKey, {
                        ...race,
                        SprintResults: [],
                    });
                }

                const entry = sprintsByRound.get(roundKey);
                const existingDriverIds = new Set(entry.SprintResults.map(r => r.Driver?.driverId).filter(Boolean));
                for (const res of (race.SprintResults ?? [])) {
                    const dId = res.Driver?.driverId;
                    if (!dId || !existingDriverIds.has(dId)) {
                        if (dId) existingDriverIds.add(dId);
                        entry.SprintResults.push(res);
                    }
                }
            });

            const sortedSprintRounds = Array.from(sprintsByRound.keys()).sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10));
            if (sortedSprintRounds.length > 0) {
                maxSprintRound = Number.parseInt(sortedSprintRounds[sortedSprintRounds.length - 1], 10) || 0;
            }
            sortedSprintRounds.forEach(roundKey => {
                const race = sprintsByRound.get(roundKey);
                race.SprintResults.sort((a, b) => {
                    const posA = Number.parseInt(a.position, 10);
                    const posB = Number.parseInt(b.position, 10);
                    if (Number.isFinite(posA) && Number.isFinite(posB)) return posA - posB;
                    if (Number.isFinite(posA)) return -1;
                    if (Number.isFinite(posB)) return 1;
                    return 0;
                });

                race.SprintResults.forEach(result => {
                    const positionText = result.positionText ?? '';
                    const isClassified = !['R', 'D', 'E', 'W', 'F', 'N'].includes(positionText.toUpperCase());

                    sprints.push({
                        round: race.round,
                        driverId: result.Driver?.driverId ?? 'unknown',
                        driverName: `${result.Driver?.givenName ?? ''} ${result.Driver?.familyName ?? ''}`.trim(),
                        constructorId: result.Constructor?.constructorId ?? 'unknown',
                        constructorName: result.Constructor?.name ?? 'Unknown',
                        position: isClassified ? parseInt(result.position, 10) : null,
                        positionText,
                        points: parseFloat(result.points) || 0,
                        status: result.status ?? '',
                    });
                });
            });
            console.log(`  Processed ${sprints.length} sprint results across ${sortedSprintRounds.length} rounds.`);
        } catch (sprintErr) {
            console.warn(`  Warning: sprint fetch failed for ${season}: ${sprintErr.message}`);
        }
    } else {
        console.log(`  Season ${season} has no sprints.`);
    }

    // 5. Fetch Standings
    console.log(`[5/5] Fetching championship standings for ${season}...`);
    let driverStandings = [];
    let constructorStandings = [];
    let driverStandingsRound = 0;
    let constrStandingsRound = 0;

    try {
        const driverStandingsPayload = await getJson(`${API_BASE}/${season}/driverStandings.json`);
        const standingsList = driverStandingsPayload.MRData?.StandingsTable?.StandingsLists?.[0];
        const rawDriverStandings = standingsList?.DriverStandings ?? [];
        driverStandingsRound = Number.parseInt(standingsList?.round ?? '', 10) || 0;
        driverStandings = stripUrls(rawDriverStandings);
    } catch (driverStandingsErr) {
        console.warn(`  Warning: driver standings fetch failed for ${season}: ${driverStandingsErr.message}`);
    }

    try {
        const constrStandingsPayload = await getJson(`${API_BASE}/${season}/constructorStandings.json`);
        const constrList = constrStandingsPayload.MRData?.StandingsTable?.StandingsLists?.[0];
        const rawConstrStandings = constrList?.ConstructorStandings ?? [];
        constrStandingsRound = Number.parseInt(constrList?.round ?? '', 10) || 0;
        constructorStandings = rawConstrStandings.map(s => ({
            constructorId: s.Constructor?.constructorId ?? 'unknown',
            constructorName: s.Constructor?.name ?? 'Unknown',
            position: parseInt(s.position, 10) || 0,
            points: parseFloat(s.points) || 0,
            wins: parseInt(s.wins, 10) || 0,
        }));
    } catch (constrStandingsErr) {
        console.warn(`  Warning: constructor standings fetch failed for ${season}: ${constrStandingsErr.message}`);
    }

    console.log(`  Processed ${driverStandings.length} driver standings, ${constructorStandings.length} constructor standings.`);

    const maxQualifyingRound = sortedQualiRounds.length > 0 ? Number.parseInt(sortedQualiRounds[sortedQualiRounds.length - 1], 10) : 0;

    return {
        season,
        version: 1,
        generatedAt: new Date().toISOString(),
        isArchived,
        lastCompletedRound,
        lastResultsRound: maxCompletedRound > 0 ? maxCompletedRound : null,
        lastQualifyingRound: maxQualifyingRound > 0 ? maxQualifyingRound : null,
        lastSprintsRound: maxSprintRound > 0 ? maxSprintRound : null,
        lastDriverStandingsRound: Number.isFinite(driverStandingsRound) && driverStandingsRound > 0 ? driverStandingsRound : lastCompletedRound,
        lastConstructorStandingsRound: Number.isFinite(constrStandingsRound) && constrStandingsRound > 0 ? constrStandingsRound : lastCompletedRound,
        totalRounds,
        races,
        results,
        qualifying,
        sprints,
        driverStandings,
        constructorStandings,
        roundResults,
        roundQualifying,
    };
}

function validateSeasonBundle(bundle) {
    const issues = [];
    const roundResultsKeys = Object.keys(bundle.roundResults || {});
    for (const round of roundResultsKeys) {
        const roundRes = bundle.roundResults[round] || [];
        const aggRes = bundle.results.filter(r => String(r.round) === String(round));
        if (roundRes.length !== aggRes.length) {
            issues.push(`Round ${round} roundResults count (${roundRes.length}) !== aggregate count (${aggRes.length})`);
        }
        const hasP1 = roundRes.some(r => String(r.position) === '1');
        if (!hasP1 && roundRes.length > 0) {
            issues.push(`Round ${round} roundResults is missing position 1 (winner)`);
        }
    }

    const roundQualiKeys = Object.keys(bundle.roundQualifying || {});
    for (const round of roundQualiKeys) {
        const roundQuali = bundle.roundQualifying[round] || [];
        const aggQuali = bundle.qualifying.filter(q => String(q.round) === String(round));
        if (roundQuali.length !== aggQuali.length) {
            issues.push(`Round ${round} roundQualifying count (${roundQuali.length}) !== aggregate count (${aggQuali.length})`);
        }
        const hasP1 = roundQuali.some(q => String(q.position) === '1');
        if (!hasP1 && roundQuali.length > 0) {
            issues.push(`Round ${round} roundQualifying is missing position 1 (pole)`);
        }
    }

    const sprintRounds = [...new Set((bundle.sprints || []).map(s => String(s.round)))];
    for (const round of sprintRounds) {
        const sprintEntries = (bundle.sprints || []).filter(s => String(s.round) === String(round));
        const hasP1 = sprintEntries.some(s => String(s.position) === '1');
        if (!hasP1 && sprintEntries.length > 0) {
            issues.push(`Round ${round} sprints is missing position 1`);
        }
    }

    if (issues.length > 0) {
        console.error(`[Validation Failed] Season ${bundle.season} has ${issues.length} data integrity issues:\n  - ` + issues.join('\n  - '));
        throw new Error(`Season bundle validation failed for ${bundle.season}: ${issues.join('; ')}`);
    } else {
        console.log(`  [Validation Passed] Season ${bundle.season} passed all integrity checks (${roundResultsKeys.length} result rounds, ${roundQualiKeys.length} quali rounds, ${sprintRounds.length} sprint rounds).`);
    }
}

async function writeBundleAtomic(season, bundle, dryRun = false) {
    validateSeasonBundle(bundle);
    const filename = `${season}.json`;
    const targetPath = resolve(OUTPUT_DIR, filename);
    const tempPath = resolve(OUTPUT_DIR, `${filename}.tmp`);

    const jsonStr = JSON.stringify(bundle);
    const sizeKb = (Buffer.byteLength(jsonStr, 'utf8') / 1024).toFixed(1);

    if (dryRun) {
        console.log(`[Dry Run] Would write ${targetPath} (${sizeKb} KB)`);
        return;
    }

    await mkdir(OUTPUT_DIR, { recursive: true });
    await writeFile(tempPath, jsonStr, 'utf8');
    await rename(tempPath, targetPath);
    console.log(`[Success] Written ${targetPath} (${sizeKb} KB)`);
}

async function writeManifest(manifestData, dryRun = false) {
    const jsonStr = JSON.stringify(manifestData, null, 2);
    if (dryRun) {
        console.log(`[Dry Run] Would write manifest to ${MANIFEST_PATH}`);
        return;
    }
    const tempPath = `${MANIFEST_PATH}.tmp`;
    await mkdir(OUTPUT_DIR, { recursive: true });
    await writeFile(tempPath, jsonStr, 'utf8');
    await rename(tempPath, MANIFEST_PATH);
    console.log(`[Success] Manifest updated at ${MANIFEST_PATH}`);
}

async function main() {
    const args = process.argv.slice(2);
    const force = args.includes('--force');
    const dryRun = args.includes('--dry-run');
    const mock = args.includes('--mock');

    const seasonArgIdx = args.indexOf('--season');
    const specificSeason = seasonArgIdx !== -1 ? args[seasonArgIdx + 1] : null;

    const currentYearNum = new Date().getUTCFullYear();
    const maxSeasonNum = Math.max(2026, currentYearNum);
    const allSeasons = [];
    for (let y = 2020; y <= maxSeasonNum; y += 1) {
        allSeasons.push(String(y));
    }
    const targetSeasons = specificSeason ? [specificSeason] : allSeasons;

    console.log(`F1 Static Season Data Generator`);
    console.log(`Target seasons: ${targetSeasons.join(', ')}`);
    console.log(`Options: force=${force}, dryRun=${dryRun}, mock=${mock}`);

    // Read existing manifest if available
    let existingManifest = { version: 1, generatedAt: new Date().toISOString(), seasons: {} };
    try {
        const manifestContent = await readFile(MANIFEST_PATH, 'utf8');
        existingManifest = JSON.parse(manifestContent);
    } catch {
        // no manifest yet
    }

    const manifestSeasons = { ...existingManifest.seasons };

    for (const season of targetSeasons) {
        const bundlePath = resolve(OUTPUT_DIR, `${season}.json`);
        let existingBundle = null;
        try {
            const raw = await readFile(bundlePath, 'utf8');
            const parsed = JSON.parse(raw);
            if (parsed.season === season && Array.isArray(parsed.results)) {
                existingBundle = parsed;
            }
        } catch {
            existingBundle = null;
        }

        // Incremental check: If season is archived and bundle exists and not --force, skip
        if (existingBundle && existingBundle.isArchived && !force) {
            console.log(`Skipping season ${season} (already generated and archived; use --force to overwrite)`);
            manifestSeasons[season] = {
                season,
                isArchived: existingBundle.isArchived,
                lastCompletedRound: existingBundle.lastCompletedRound,
                totalRounds: existingBundle.totalRounds,
                generatedAt: existingBundle.generatedAt,
                bundleUrl: `/data/seasons/${season}.json?v=${encodeURIComponent(existingBundle.generatedAt)}`,
            };
            continue;
        }

        const bundle = await generateSeasonBundle(season, { mock });
        await writeBundleAtomic(season, bundle, dryRun);

        manifestSeasons[season] = {
            season,
            isArchived: bundle.isArchived,
            lastCompletedRound: bundle.lastCompletedRound,
            totalRounds: bundle.totalRounds,
            generatedAt: bundle.generatedAt,
            bundleUrl: `/data/seasons/${season}.json?v=${encodeURIComponent(bundle.generatedAt)}`,
        };
    }

    // Write updated manifest
    const finalManifest = {
        version: 1,
        generatedAt: new Date().toISOString(),
        seasons: manifestSeasons,
    };
    await writeManifest(finalManifest, dryRun);

    console.log(`\nAll done! Static season pipeline complete.`);
}

main().catch(err => {
    console.error('Fatal generator error:', err);
    process.exit(1);
});

import { getStaticSeasonBundle, type CompactSeasonBundle } from '../api/staticSeasonData';
import { getTeamColor } from '../types';

export const COMMAND_SEARCH_SEASONS = [
    '2026',
    '2025',
    '2024',
    '2023',
    '2022',
    '2021',
    '2020',
    '2019',
    '2018',
] as const;

export const DEFAULT_ACTIVE_SEASON = '2026';

export type CommandCategory = 'all' | 'drivers' | 'teams' | 'races' | 'seasons' | 'pages';
export type CommandItemKind = Exclude<CommandCategory, 'all'>;

export interface CommandSearchItem {
    id: string;
    kind: CommandItemKind;
    title: string;
    subtitle: string;
    to: string;
    accentColor?: string;
    badge?: string;
    seasons?: string[];
    entityId?: string;
    raceSeason?: string;
    keywords: string[];
    priority: number;
}

const SUPPORTED_SEASON_SET = new Set<string>(COMMAND_SEARCH_SEASONS);

const CIRCUIT_SEARCH_ALIASES: Record<string, string[]> = {
    albert_park: ['melbourne', 'australia', 'albert park'],
    shanghai: ['china', 'shanghai'],
    suzuka: ['japan', 'suzuka'],
    bahrain: ['sakhir', 'bahrain'],
    jeddah: ['saudi', 'jeddah', 'corniche'],
    miami: ['miami', 'usa', 'hard rock'],
    imola: ['emilia romagna', 'imola', 'san marino'],
    monaco: ['monte carlo', 'monaco'],
    villeneuve: ['canada', 'montreal', 'gilles villeneuve'],
    catalunya: ['spain', 'barcelona', 'montmelo', 'catalunya'],
    red_bull_ring: ['austria', 'spielberg', 'red bull ring'],
    silverstone: ['uk', 'great britain', 'britain', 'silverstone'],
    spa: ['belgium', 'spa', 'francorchamps', 'spa francorchamps'],
    hungaroring: ['hungary', 'budapest', 'hungaroring'],
    zandvoort: ['netherlands', 'dutch', 'zandvoort'],
    monza: ['italy', 'monza', 'temple of speed'],
    madring: ['madrid', 'spain', 'madring'],
    baku: ['azerbaijan', 'baku'],
    marina_bay: ['singapore', 'marina bay'],
    americas: ['cota', 'austin', 'usa', 'texas'],
    rodriguez: ['mexico', 'hermanos rodriguez', 'mexico city'],
    interlagos: ['brazil', 'sao paulo', 'interlagos'],
    vegas: ['las vegas', 'vegas', 'usa'],
    losail: ['lusail', 'qatar', 'losail'],
    yas_marina: ['abu dhabi', 'yas marina', 'uae'],
    paul_ricard: ['france', 'le castellet', 'paul ricard'],
    hockenheimring: ['germany', 'hockenheim'],
    sochi: ['russia', 'sochi'],
    mugello: ['tuscany', 'mugello'],
    nurburgring: ['eifel', 'nurburgring', 'germany'],
    portimao: ['portugal', 'algarve', 'portimao'],
    istanbul: ['turkey', 'istanbul park'],
    ricardo_tormo: ['valencia'],
};

let cachedBundles: CompactSeasonBundle[] | null = null;
let inFlightBundlesPromise: Promise<CompactSeasonBundle[]> | null = null;

/** Normalizes text for accent-insensitive, punctuation-tolerant search matching. */
export function normalizeSearchText(input: string): string {
    return input
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function formatSeasonSpan(seasons: string[]): string {
    if (seasons.length === 0) return '';
    if (seasons.length === 1) return seasons[0];
    const newest = seasons[0];
    const oldest = seasons[seasons.length - 1];
    return `${oldest}–${newest}`;
}

function resolveTargetSeason(currentSeason: string | null): string {
    if (currentSeason && SUPPORTED_SEASON_SET.has(currentSeason)) {
        return currentSeason;
    }
    return DEFAULT_ACTIVE_SEASON;
}

/**
 * Builds instantaneous navigation items (season pages and championship years) with zero network latency.
 */
export function buildInstantCommandItems(currentSeason: string | null): CommandSearchItem[] {
    const targetSeason = resolveTargetSeason(currentSeason);

    const pages: CommandSearchItem[] = [
        {
            id: 'page:races',
            kind: 'pages',
            title: 'Races Calendar',
            subtitle: `${targetSeason} Season Schedule & Ratings`,
            to: `/${targetSeason}`,
            accentColor: '#e10600',
            badge: 'PAGE',
            keywords: ['races', 'calendar', 'schedule', 'grid', 'home', targetSeason],
            priority: 95,
        },
        {
            id: 'page:standings',
            kind: 'pages',
            title: 'Championship Standings',
            subtitle: `${targetSeason} WDC & WCC Leaderboard`,
            to: `/${targetSeason}/standings`,
            accentColor: '#ffd700',
            badge: 'WDC',
            keywords: ['standings', 'wdc', 'wcc', 'championship', 'points', 'leaderboard', targetSeason],
            priority: 94,
        },
        {
            id: 'page:teammate-wars',
            kind: 'pages',
            title: 'Teammate Wars',
            subtitle: `${targetSeason} Qualifying & Race H2H`,
            to: `/${targetSeason}/teammate-wars`,
            accentColor: '#e10600',
            badge: 'H2H',
            keywords: ['teammate', 'wars', 'head to head', 'h2h', 'versus', 'vs', targetSeason],
            priority: 93,
        },
        {
            id: 'page:driver-vs',
            kind: 'pages',
            title: 'Driver VS Comparison',
            subtitle: `${targetSeason} Cross-Season & Grid Comparison`,
            to: `/${targetSeason}/teammate-wars?mode=driver-vs`,
            accentColor: '#e10600',
            badge: 'VS',
            keywords: ['driver vs', 'compare drivers', 'cross season', 'versus', 'vs', 'h2h', targetSeason],
            priority: 92,
        },
        {
            id: 'page:team-vs',
            kind: 'pages',
            title: 'Team VS Comparison',
            subtitle: `${targetSeason} Constructor Head-to-Head`,
            to: `/${targetSeason}/teammate-wars?mode=teams`,
            accentColor: '#00d2be',
            badge: 'WCC',
            keywords: ['team vs', 'constructors', 'compare teams', 'versus', 'wcc', targetSeason],
            priority: 91,
        },
        {
            id: 'page:awards',
            kind: 'pages',
            title: 'Season Awards',
            subtitle: `${targetSeason} Community & Performance Honors`,
            to: `/${targetSeason}/awards`,
            accentColor: '#ffd700',
            badge: 'MVP',
            keywords: ['awards', 'mvp', 'qualifying king', 'consistent', 'overtaker', 'honors', targetSeason],
            priority: 90,
        },
        {
            id: 'page:quick-rate',
            kind: 'pages',
            title: 'Quick Rate Grid',
            subtitle: `${targetSeason} Bulk Season Rating Mode`,
            to: `/${targetSeason}/quick-rate`,
            accentColor: '#ffd700',
            badge: 'RATE',
            keywords: ['quick rate', 'bulk rate', 'season rating', 'tier', 'rate drivers', targetSeason],
            priority: 89,
        },
        {
            id: 'page:results',
            kind: 'pages',
            title: 'Season Results & Summary',
            subtitle: `${targetSeason} Ratings Averages & Breakdown`,
            to: `/${targetSeason}/results`,
            accentColor: '#e10600',
            badge: 'DATA',
            keywords: ['results', 'ratings', 'summary', 'averages', 'breakdown', 'dashboard', targetSeason],
            priority: 88,
        },
    ];

    const seasons: CommandSearchItem[] = COMMAND_SEARCH_SEASONS.map((year, index) => {
        const isCurrent = year === DEFAULT_ACTIVE_SEASON;
        return {
            id: `season:${year}`,
            kind: 'seasons',
            title: `${year} Season`,
            subtitle: isCurrent ? 'Current FIA World Championship' : 'Archived Championship & Telemetry',
            to: `/${year}`,
            accentColor: isCurrent ? '#e10600' : undefined,
            badge: isCurrent ? 'LIVE' : year,
            seasons: [year],
            entityId: year,
            keywords: ['season', 'year', 'championship', year, isCurrent ? 'current live' : 'archive'],
            priority: 85 - index,
        };
    });

    return [...pages, ...seasons];
}

interface DriverAccumulator {
    driverId: string;
    fullName: string;
    familyName: string;
    code: string;
    permanentNumber: string;
    nationality: string;
    seasons: string[];
    constructorBySeason: Map<string, { constructorId: string; constructorName: string }>;
    constructorNames: Set<string>;
    constructorIds: Set<string>;
    bestPosition: number;
}

interface TeamAccumulator {
    constructorId: string;
    name: string;
    nationality: string;
    seasons: string[];
    bestPosition: number;
}

function registerDriverEntry(
    driversMap: Map<string, DriverAccumulator>,
    season: string,
    driverId: string,
    info: {
        fullName: string;
        familyName?: string;
        code?: string;
        permanentNumber?: string;
        nationality?: string;
        constructorId?: string;
        constructorName?: string;
        standingPosition?: number;
    },
): void {
    if (!driverId || driverId === 'unknown') return;
    let entry = driversMap.get(driverId);
    if (!entry) {
        entry = {
            driverId,
            fullName: info.fullName || driverId,
            familyName: info.familyName || '',
            code: info.code || '',
            permanentNumber: info.permanentNumber || '',
            nationality: info.nationality || '',
            seasons: [],
            constructorBySeason: new Map(),
            constructorNames: new Set(),
            constructorIds: new Set(),
            bestPosition: 999,
        };
        driversMap.set(driverId, entry);
    }

    if (info.fullName && info.fullName.length > entry.fullName.length) {
        entry.fullName = info.fullName;
    }
    if (info.familyName && !entry.familyName) {
        entry.familyName = info.familyName;
    }
    if (info.code && !entry.code) {
        entry.code = info.code.toUpperCase();
    }
    if (info.permanentNumber && !entry.permanentNumber) {
        entry.permanentNumber = info.permanentNumber;
    }
    if (info.nationality && !entry.nationality) {
        entry.nationality = info.nationality;
    }
    if (!entry.seasons.includes(season)) {
        entry.seasons.push(season);
    }
    if (info.constructorId && info.constructorId !== 'unknown') {
        entry.constructorIds.add(info.constructorId);
        if (info.constructorName) {
            entry.constructorNames.add(info.constructorName);
        }
        if (!entry.constructorBySeason.has(season)) {
            entry.constructorBySeason.set(season, {
                constructorId: info.constructorId,
                constructorName: info.constructorName || info.constructorId,
            });
        }
    }
    if (typeof info.standingPosition === 'number' && Number.isFinite(info.standingPosition)) {
        entry.bestPosition = Math.min(entry.bestPosition, info.standingPosition);
    }
}

function registerTeamEntry(
    teamsMap: Map<string, TeamAccumulator>,
    season: string,
    constructorId: string,
    info: { name?: string; nationality?: string; standingPosition?: number },
): void {
    if (!constructorId || constructorId === 'unknown') return;
    let entry = teamsMap.get(constructorId);
    if (!entry) {
        entry = {
            constructorId,
            name: info.name || constructorId,
            nationality: info.nationality || '',
            seasons: [],
            bestPosition: 999,
        };
        teamsMap.set(constructorId, entry);
    }
    if (info.name && (entry.name === constructorId || info.name.length > entry.name.length)) {
        entry.name = info.name;
    }
    if (info.nationality && !entry.nationality) {
        entry.nationality = info.nationality;
    }
    if (!entry.seasons.includes(season)) {
        entry.seasons.push(season);
    }
    if (typeof info.standingPosition === 'number' && Number.isFinite(info.standingPosition)) {
        entry.bestPosition = Math.min(entry.bestPosition, info.standingPosition);
    }
}

/**
 * Indexes drivers, constructors, and Grand Prix events from loaded 2018–2026 static season bundles.
 */
export function buildBundleCommandItems(
    bundles: CompactSeasonBundle[],
    currentSeason: string | null,
): CommandSearchItem[] {
    const targetSeason = resolveTargetSeason(currentSeason);
    const sortedBundles = [...bundles].sort(
        (a, b) => Number.parseInt(b.season, 10) - Number.parseInt(a.season, 10),
    );

    const driversMap = new Map<string, DriverAccumulator>();
    const teamsMap = new Map<string, TeamAccumulator>();
    const raceItems: CommandSearchItem[] = [];

    for (const bundle of sortedBundles) {
        const { season } = bundle;

        for (const standing of bundle.driverStandings ?? []) {
            const driver = standing.Driver;
            if (!driver?.driverId) continue;
            const latestConstructor = standing.Constructors?.[standing.Constructors.length - 1];
            const pos = Number.parseInt(standing.position, 10);
            registerDriverEntry(driversMap, season, driver.driverId, {
                fullName: `${driver.givenName ?? ''} ${driver.familyName ?? ''}`.trim(),
                familyName: driver.familyName,
                code: driver.code,
                permanentNumber: driver.permanentNumber,
                nationality: driver.nationality,
                constructorId: latestConstructor?.constructorId,
                constructorName: latestConstructor?.name,
                standingPosition: Number.isFinite(pos) ? pos : undefined,
            });
            for (const ctor of standing.Constructors ?? []) {
                registerTeamEntry(teamsMap, season, ctor.constructorId, {
                    name: ctor.name,
                    nationality: ctor.nationality,
                });
            }
        }

        for (const roundEntries of Object.values(bundle.roundResults ?? {})) {
            for (const entry of roundEntries) {
                if (entry.Driver?.driverId) {
                    registerDriverEntry(driversMap, season, entry.Driver.driverId, {
                        fullName: `${entry.Driver.givenName ?? ''} ${entry.Driver.familyName ?? ''}`.trim(),
                        familyName: entry.Driver.familyName,
                        code: entry.Driver.code,
                        permanentNumber: entry.Driver.permanentNumber,
                        nationality: entry.Driver.nationality,
                        constructorId: entry.Constructor?.constructorId,
                        constructorName: entry.Constructor?.name,
                    });
                }
                if (entry.Constructor?.constructorId) {
                    registerTeamEntry(teamsMap, season, entry.Constructor.constructorId, {
                        name: entry.Constructor.name,
                        nationality: entry.Constructor.nationality,
                    });
                }
            }
        }

        for (const row of bundle.results ?? []) {
            registerDriverEntry(driversMap, season, row.driverId, {
                fullName: row.driverName,
                constructorId: row.constructorId,
                constructorName: row.constructorName,
            });
            registerTeamEntry(teamsMap, season, row.constructorId, {
                name: row.constructorName,
            });
        }

        if (bundle.drivers) {
            for (const driver of Object.values(bundle.drivers)) {
                registerDriverEntry(driversMap, season, driver.driverId, {
                    fullName: `${driver.givenName ?? ''} ${driver.familyName ?? ''}`.trim(),
                    familyName: driver.familyName,
                    code: driver.code,
                    permanentNumber: driver.permanentNumber,
                    nationality: driver.nationality,
                });
            }
        }

        for (const standing of bundle.constructorStandings ?? []) {
            registerTeamEntry(teamsMap, season, standing.constructorId, {
                name: standing.constructorName,
                standingPosition: standing.position,
            });
        }

        if (bundle.constructors) {
            for (const ctor of Object.values(bundle.constructors)) {
                registerTeamEntry(teamsMap, season, ctor.constructorId, {
                    name: ctor.name,
                    nationality: ctor.nationality,
                });
            }
        }

        for (const race of bundle.races ?? []) {
            const roundNum = Number.parseInt(race.round, 10);
            const isCompleted = bundle.isArchived
                || (bundle.lastCompletedRound !== null && Number.isFinite(roundNum) && roundNum <= bundle.lastCompletedRound);
            const circuitId = race.Circuit?.circuitId ?? '';
            const circuitName = race.Circuit?.circuitName ?? '';
            const locality = race.Circuit?.Location?.locality ?? '';
            const country = race.Circuit?.Location?.country ?? '';
            const aliases = CIRCUIT_SEARCH_ALIASES[circuitId] ?? [];

            raceItems.push({
                id: `race:${season}:${race.round}`,
                kind: 'races',
                title: race.raceName,
                subtitle: `${circuitName} · ${locality}, ${country} · ${season}${isCompleted ? '' : ' (Upcoming)'}`,
                to: isCompleted ? `/${season}/race/${race.round}` : `/${season}`,
                accentColor: isCompleted ? '#ffd700' : '#00d2be',
                badge: `R${race.round}`,
                seasons: [season],
                raceSeason: season,
                keywords: [
                    race.raceName,
                    circuitName,
                    circuitId.replace(/_/g, ' '),
                    locality,
                    country,
                    `round ${race.round}`,
                    `r${race.round}`,
                    season,
                    ...aliases,
                ],
                priority: (season === targetSeason ? 82 : 55) - (Number.isFinite(roundNum) ? roundNum * 0.1 : 0),
            });
        }
    }

    const driverItems: CommandSearchItem[] = [];
    for (const driver of driversMap.values()) {
        driver.seasons.sort((a, b) => Number.parseInt(b, 10) - Number.parseInt(a, 10));
        const preferredSeason = driver.seasons.includes(targetSeason)
            ? targetSeason
            : driver.seasons[0] ?? DEFAULT_ACTIVE_SEASON;
        const preferredCtor = driver.constructorBySeason.get(preferredSeason)
            ?? driver.constructorBySeason.get(driver.seasons[0]);
        const ctorId = preferredCtor?.constructorId ?? '';
        const ctorName = preferredCtor?.constructorName ?? 'Formula 1 Driver';
        const fallbackCode = driver.familyName
            ? driver.familyName.slice(0, 3).toUpperCase()
            : driver.fullName.split(/\s+/).pop()?.slice(0, 3).toUpperCase() ?? 'DRV';
        const badge = driver.code || fallbackCode;
        const hasTargetSeason = driver.seasons.includes(targetSeason);
        const positionBoost = driver.bestPosition < 999 ? Math.max(0, 25 - driver.bestPosition) * 0.2 : 0;

        driverItems.push({
            id: `driver:${driver.driverId}`,
            kind: 'drivers',
            title: driver.fullName,
            subtitle: `${ctorName} · ${formatSeasonSpan(driver.seasons)}`,
            to: `/${preferredSeason}/driver/${driver.driverId}`,
            accentColor: ctorId ? getTeamColor(ctorId) : undefined,
            badge,
            seasons: driver.seasons,
            entityId: driver.driverId,
            keywords: [
                driver.fullName,
                driver.driverId.replace(/_/g, ' '),
                badge,
                driver.permanentNumber ? `#${driver.permanentNumber}` : '',
                driver.permanentNumber,
                driver.nationality,
                ...driver.constructorNames,
                ...Array.from(driver.constructorIds).map(id => id.replace(/_/g, ' ')),
                ...driver.seasons,
            ].filter(Boolean),
            priority: (hasTargetSeason ? 80 : 62) + positionBoost,
        });
    }

    const teamItems: CommandSearchItem[] = [];
    for (const team of teamsMap.values()) {
        team.seasons.sort((a, b) => Number.parseInt(b, 10) - Number.parseInt(a, 10));
        const preferredSeason = team.seasons.includes(targetSeason)
            ? targetSeason
            : team.seasons[0] ?? DEFAULT_ACTIVE_SEASON;
        const hasTargetSeason = team.seasons.includes(targetSeason);
        const positionBoost = team.bestPosition < 999 ? Math.max(0, 12 - team.bestPosition) * 0.3 : 0;

        teamItems.push({
            id: `team:${team.constructorId}`,
            kind: 'teams',
            title: team.name,
            subtitle: `Constructor · ${formatSeasonSpan(team.seasons)}`,
            to: `/${preferredSeason}/teammate-wars?mode=teams&a=${encodeURIComponent(team.constructorId)}`,
            accentColor: getTeamColor(team.constructorId),
            badge: 'TEAM',
            seasons: team.seasons,
            entityId: team.constructorId,
            keywords: [
                team.name,
                team.constructorId.replace(/_/g, ' '),
                team.nationality,
                ...team.seasons,
            ].filter(Boolean),
            priority: (hasTargetSeason ? 75 : 58) + positionBoost,
        });
    }

    return [...driverItems, ...teamItems, ...raceItems];
}

function applyExplicitYear(
    item: CommandSearchItem,
    explicitYear: string | null,
    targetSeason: string,
): CommandSearchItem {
    if (!explicitYear) return item;

    if (item.kind === 'drivers' && item.entityId && item.seasons?.includes(explicitYear)) {
        const teamLabel = item.subtitle.split(' · ')[0] || 'Driver';
        return {
            ...item,
            to: `/${explicitYear}/driver/${item.entityId}`,
            subtitle: `${teamLabel} · ${explicitYear} Season`,
        };
    }

    if (item.kind === 'teams' && item.entityId && item.seasons?.includes(explicitYear)) {
        return {
            ...item,
            to: `/${explicitYear}/teammate-wars?mode=teams&a=${encodeURIComponent(item.entityId)}`,
            subtitle: `Constructor · ${explicitYear} Season`,
        };
    }

    if (item.kind === 'pages') {
        const prefix = `/${targetSeason}`;
        if (item.to.startsWith(prefix)) {
            return {
                ...item,
                to: `/${explicitYear}${item.to.slice(prefix.length)}`,
                subtitle: item.subtitle.replace(targetSeason, explicitYear),
            };
        }
    }

    return item;
}

function scoreTokenMatch(
    token: string,
    normTitle: string,
    titleWords: string[],
    normBadge: string,
    normSubtitle: string,
    normKeywords: string,
): number {
    if (normBadge && normBadge === token) return 140;
    if (normTitle === token) return 130;
    if (normTitle.startsWith(token)) return 105;
    if (titleWords.some(word => word.startsWith(token))) return 90;
    if (normTitle.includes(token)) return 75;
    if (normKeywords.split(/\s+/).some(word => word.startsWith(token))) return 60;
    if (normKeywords.includes(token)) return 45;
    if (normSubtitle.includes(token)) return 35;
    return -1;
}

/**
 * Filters and ranks command palette items by category, active season context, and query tokens.
 */
export function searchCommandItems(
    items: CommandSearchItem[],
    query: string,
    category: CommandCategory,
    currentSeason: string | null,
    limit = 24,
): CommandSearchItem[] {
    const targetSeason = resolveTargetSeason(currentSeason);
    const normalizedQuery = normalizeSearchText(query);
    const rawTokens = normalizedQuery ? normalizedQuery.split(' ').filter(Boolean) : [];

    const explicitYear = rawTokens.find(token => SUPPORTED_SEASON_SET.has(token)) ?? null;
    const textTokens = rawTokens.filter(token => token !== explicitYear);

    const categoryFiltered = items.filter((item) => {
        if (category !== 'all' && item.kind !== category) return false;
        if (item.kind === 'races' && item.raceSeason) {
            if (explicitYear) {
                return item.raceSeason === explicitYear;
            }
            if (textTokens.length === 0) {
                return item.raceSeason === targetSeason;
            }
        }
        return true;
    });

    if (rawTokens.length === 0) {
        if (category === 'all') {
            const pages = categoryFiltered.filter(i => i.kind === 'pages').slice(0, 5);
            const drivers = categoryFiltered
                .filter(i => i.kind === 'drivers')
                .sort((a, b) => b.priority - a.priority)
                .slice(0, 6);
            const races = categoryFiltered
                .filter(i => i.kind === 'races')
                .sort((a, b) => b.priority - a.priority)
                .slice(0, 3);
            const teams = categoryFiltered
                .filter(i => i.kind === 'teams')
                .sort((a, b) => b.priority - a.priority)
                .slice(0, 3);
            const seasons = categoryFiltered.filter(i => i.kind === 'seasons').slice(0, 4);

            return [...pages, ...drivers, ...races, ...teams, ...seasons].slice(0, limit);
        }

        return [...categoryFiltered]
            .sort((a, b) => b.priority - a.priority)
            .slice(0, limit);
    }

    const scored: Array<{ item: CommandSearchItem; score: number }> = [];

    for (const rawItem of categoryFiltered) {
        const item = applyExplicitYear(rawItem, explicitYear, targetSeason);
        if (explicitYear && item.seasons && !item.seasons.includes(explicitYear)) {
            continue;
        }

        const normTitle = normalizeSearchText(item.title);
        const titleWords = normTitle.split(' ').filter(Boolean);
        const normBadge = normalizeSearchText(item.badge ?? '');
        const normSubtitle = normalizeSearchText(item.subtitle);
        const normKeywords = normalizeSearchText(item.keywords.join(' '));

        if (textTokens.length === 0 && explicitYear) {
            const yearScore = item.kind === 'seasons' && item.entityId === explicitYear
                ? 500
                : item.kind === 'races'
                    ? 220
                    : item.kind === 'pages'
                        ? 180
                        : 140;
            scored.push({ item, score: yearScore + item.priority });
            continue;
        }

        let totalScore = 0;
        let matchesAll = true;
        for (const token of textTokens) {
            const tokenScore = scoreTokenMatch(
                token,
                normTitle,
                titleWords,
                normBadge,
                normSubtitle,
                normKeywords,
            );
            if (tokenScore < 0) {
                matchesAll = false;
                break;
            }
            totalScore += tokenScore;
        }

        if (!matchesAll) continue;

        if (explicitYear && item.seasons?.includes(explicitYear)) {
            totalScore += 45;
        }
        if (item.seasons?.includes(targetSeason)) {
            totalScore += 25;
        }
        if (item.kind === 'races' && item.raceSeason) {
            totalScore += Number.parseInt(item.raceSeason, 10) * 0.01;
        }

        scored.push({
            item,
            score: totalScore + item.priority * 0.25,
        });
    }

    scored.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.item.title.localeCompare(b.item.title);
    });

    const deduped: CommandSearchItem[] = [];
    const seenRaceKeys = new Set<string>();
    for (const entry of scored) {
        if (entry.item.kind === 'races' && !explicitYear) {
            const raceKey = normalizeSearchText(entry.item.title);
            if (seenRaceKeys.has(raceKey)) continue;
            seenRaceKeys.add(raceKey);
        }
        deduped.push(entry.item);
        if (deduped.length >= limit) break;
    }

    return deduped;
}

/**
 * Loads all 2018–2026 static season bundles once and caches them in memory for instant search.
 */
export async function loadAllStaticSearchBundles(): Promise<CompactSeasonBundle[]> {
    if (cachedBundles) {
        return cachedBundles;
    }
    if (inFlightBundlesPromise) {
        return inFlightBundlesPromise;
    }

    inFlightBundlesPromise = (async () => {
        const settled = await Promise.allSettled(
            COMMAND_SEARCH_SEASONS.map(season => getStaticSeasonBundle(season)),
        );
        const loaded = settled
            .filter((result): result is PromiseFulfilledResult<CompactSeasonBundle | null> => result.status === 'fulfilled')
            .map(result => result.value)
            .filter((bundle): bundle is CompactSeasonBundle => bundle !== null);

        if (loaded.length > 0) {
            cachedBundles = loaded;
        }
        inFlightBundlesPromise = null;
        return loaded;
    })();

    return inFlightBundlesPromise;
}

/** Clears the cached search bundle list. Intended for unit tests. */
export function clearCommandSearchCache(): void {
    cachedBundles = null;
    inFlightBundlesPromise = null;
}

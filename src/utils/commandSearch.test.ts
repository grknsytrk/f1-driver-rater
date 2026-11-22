import { afterEach, describe, expect, it } from 'vitest';
import type { CompactSeasonBundle } from '../api/staticSeasonData';
import {
    buildBundleCommandItems,
    buildInstantCommandItems,
    clearCommandSearchCache,
    COMMAND_SEARCH_SEASONS,
    normalizeSearchText,
    searchCommandItems,
} from './commandSearch';

function createFixtureBundles(): CompactSeasonBundle[] {
    const bundle2019: CompactSeasonBundle = {
        season: '2019',
        version: 2,
        generatedAt: '2026-01-01T00:00:00Z',
        isArchived: true,
        lastCompletedRound: 21,
        totalRounds: 21,
        races: [
            {
                season: '2019',
                round: '11',
                raceName: 'German Grand Prix',
                date: '2019-07-28',
                Circuit: {
                    circuitId: 'hockenheimring',
                    circuitName: 'Hockenheimring',
                    url: '',
                    Location: { locality: 'Hockenheim', country: 'Germany' },
                },
            },
            {
                season: '2019',
                round: '14',
                raceName: 'Italian Grand Prix',
                date: '2019-09-08',
                Circuit: {
                    circuitId: 'monza',
                    circuitName: 'Autodromo Nazionale di Monza',
                    url: '',
                    Location: { locality: 'Monza', country: 'Italy' },
                },
            },
        ],
        results: [],
        qualifying: [],
        sprints: [],
        driverStandings: [
            {
                position: '1',
                positionText: '1',
                points: '413',
                wins: '11',
                Driver: {
                    driverId: 'hamilton',
                    code: 'HAM',
                    permanentNumber: '44',
                    givenName: 'Lewis',
                    familyName: 'Hamilton',
                    nationality: 'British',
                    url: '',
                },
                Constructors: [
                    { constructorId: 'mercedes', name: 'Mercedes', nationality: 'German', url: '' },
                ],
            },
        ],
        constructorStandings: [
            { constructorId: 'mercedes', constructorName: 'Mercedes', position: 1, points: 739, wins: 15 },
            { constructorId: 'ferrari', constructorName: 'Ferrari', position: 2, points: 504, wins: 3 },
        ],
        roundResults: {},
        roundQualifying: {},
    };

    const bundle2026: CompactSeasonBundle = {
        season: '2026',
        version: 2,
        generatedAt: '2026-11-01T00:00:00Z',
        isArchived: false,
        lastCompletedRound: 16,
        totalRounds: 24,
        races: [
            {
                season: '2026',
                round: '16',
                raceName: 'Italian Grand Prix',
                date: '2026-09-06',
                Circuit: {
                    circuitId: 'monza',
                    circuitName: 'Autodromo Nazionale di Monza',
                    url: '',
                    Location: { locality: 'Monza', country: 'Italy' },
                },
            },
            {
                season: '2026',
                round: '22',
                raceName: 'Qatar Grand Prix',
                date: '2026-11-29',
                Circuit: {
                    circuitId: 'losail',
                    circuitName: 'Lusail International Circuit',
                    url: '',
                    Location: { locality: 'Lusail', country: 'Qatar' },
                },
            },
        ],
        results: [],
        qualifying: [],
        sprints: [],
        driverStandings: [
            {
                position: '1',
                positionText: '1',
                points: '340',
                wins: '7',
                Driver: {
                    driverId: 'max_verstappen',
                    code: 'VER',
                    permanentNumber: '1',
                    givenName: 'Max',
                    familyName: 'Verstappen',
                    nationality: 'Dutch',
                    url: '',
                },
                Constructors: [
                    { constructorId: 'red_bull', name: 'Red Bull', nationality: 'Austrian', url: '' },
                ],
            },
            {
                position: '2',
                positionText: '2',
                points: '310',
                wins: '5',
                Driver: {
                    driverId: 'hamilton',
                    code: 'HAM',
                    permanentNumber: '44',
                    givenName: 'Lewis',
                    familyName: 'Hamilton',
                    nationality: 'British',
                    url: '',
                },
                Constructors: [
                    { constructorId: 'ferrari', name: 'Ferrari', nationality: 'Italian', url: '' },
                ],
            },
            {
                position: '10',
                positionText: '10',
                points: '48',
                wins: '0',
                Driver: {
                    driverId: 'hulkenberg',
                    code: 'HUL',
                    permanentNumber: '27',
                    givenName: 'Nico',
                    familyName: 'Hülkenberg',
                    nationality: 'German',
                    url: '',
                },
                Constructors: [
                    { constructorId: 'audi', name: 'Audi', nationality: 'German', url: '' },
                ],
            },
        ],
        constructorStandings: [
            { constructorId: 'ferrari', constructorName: 'Ferrari', position: 1, points: 590, wins: 8 },
            { constructorId: 'red_bull', constructorName: 'Red Bull', position: 2, points: 540, wins: 7 },
        ],
        roundResults: {},
        roundQualifying: {},
    };

    return [bundle2019, bundle2026];
}

describe('commandSearch', () => {
    afterEach(() => {
        clearCommandSearchCache();
    });

    it('normalizes diacritics, casing, and punctuation', () => {
        expect(normalizeSearchText('Nico Hülkenberg')).toBe('nico hulkenberg');
        expect(normalizeSearchText('São Paulo — GP!')).toBe('sao paulo gp');
        expect(normalizeSearchText('Sergio Pérez #11')).toBe('sergio perez 11');
    });

    it('builds instant navigation items for 2018-2026 seasons and key pages', () => {
        const items = buildInstantCommandItems('2021');
        const seasons = items.filter(item => item.kind === 'seasons');
        const pages = items.filter(item => item.kind === 'pages');

        expect(seasons.map(item => item.entityId)).toEqual([...COMMAND_SEARCH_SEASONS]);
        expect(pages.length).toBeGreaterThanOrEqual(8);
        expect(pages.find(item => item.id === 'page:standings')?.to).toBe('/2021/standings');
        expect(pages.find(item => item.id === 'page:driver-vs')?.to).toBe('/2021/teammate-wars?mode=driver-vs');
        expect(pages.find(item => item.id === 'page:team-vs')?.to).toBe('/2021/teammate-wars?mode=teams');
    });

    it('deduplicates drivers and constructors across bundles and routes to preferred season', () => {
        const items = buildBundleCommandItems(createFixtureBundles(), '2026');
        const hamiltonMatches = items.filter(item => item.kind === 'drivers' && item.entityId === 'hamilton');
        const ferrariMatches = items.filter(item => item.kind === 'teams' && item.entityId === 'ferrari');

        expect(hamiltonMatches).toHaveLength(1);
        expect(hamiltonMatches[0].to).toBe('/2026/driver/hamilton');
        expect(hamiltonMatches[0].badge).toBe('HAM');
        expect(hamiltonMatches[0].seasons).toEqual(['2026', '2019']);
        expect(hamiltonMatches[0].subtitle).toContain('Ferrari');

        expect(ferrariMatches).toHaveLength(1);
        expect(ferrariMatches[0].to).toBe('/2026/teammate-wars?mode=teams&a=ferrari');
    });

    it('supports FIA codes, diacritics, completed/upcoming races, and year-aware route rewriting', () => {
        const bundles = createFixtureBundles();
        const allItems = [
            ...buildInstantCommandItems('2026'),
            ...buildBundleCommandItems(bundles, '2026'),
        ];

        // FIA code exact boost
        const verResults = searchCommandItems(allItems, 'VER', 'all', '2026');
        expect(verResults[0]?.entityId).toBe('max_verstappen');
        expect(verResults[0]?.to).toBe('/2026/driver/max_verstappen');

        // Diacritic-insensitive matching
        const hulkResults = searchCommandItems(allItems, 'hulkenberg', 'drivers', '2026');
        expect(hulkResults[0]?.entityId).toBe('hulkenberg');

        // Explicit year + driver rewrites destination URL to that year
        const ham2019 = searchCommandItems(allItems, '2019 hamilton', 'drivers', '2026');
        expect(ham2019).toHaveLength(1);
        expect(ham2019[0].to).toBe('/2019/driver/hamilton');
        expect(ham2019[0].subtitle).toContain('2019');

        // Year + circuit finds historical round link directly
        const monza2019 = searchCommandItems(allItems, '2019 monza', 'races', '2026');
        expect(monza2019).toHaveLength(1);
        expect(monza2019[0].to).toBe('/2019/race/14');

        // Non-year circuit search returns target season once without 2019 duplicate
        const monzaDefault = searchCommandItems(allItems, 'monza', 'races', '2026');
        expect(monzaDefault).toHaveLength(1);
        expect(monzaDefault[0].to).toBe('/2026/race/16');

        // Historical-only circuit still searchable without explicit year
        const hockenheim = searchCommandItems(allItems, 'hockenheim', 'races', '2026');
        expect(hockenheim).toHaveLength(1);
        expect(hockenheim[0].to).toBe('/2019/race/11');

        // Upcoming race routes to season page
        const qatar = searchCommandItems(allItems, 'lusail', 'races', '2026');
        expect(qatar).toHaveLength(1);
        expect(qatar[0].to).toBe('/2026');
        expect(qatar[0].subtitle).toContain('Upcoming');
    });

    it('surfaces the matching season entry first on bare year queries', () => {
        const allItems = [
            ...buildInstantCommandItems('2026'),
            ...buildBundleCommandItems(createFixtureBundles(), '2026'),
        ];

        const results = searchCommandItems(allItems, '2019', 'all', '2026');
        expect(results[0]?.id).toBe('season:2019');
        expect(results[0]?.to).toBe('/2019');
    });
});

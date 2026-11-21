// Official driver cutouts. Source URLs accompany the assets in public/images/drivers/<season>/SOURCES.json.
const SEASON_PORTRAITS: Record<string, Record<string, Record<string, string>>> = {
    '2024': {
        gasly: { alpine: '/images/drivers/2024/gasly.webp' },
        ocon: { alpine: '/images/drivers/2024/ocon.webp' },
        alonso: { aston_martin: '/images/drivers/2024/alonso.webp' },
        stroll: { aston_martin: '/images/drivers/2024/stroll.webp' },
        bearman: {
            ferrari: '/images/drivers/2024/bearman-ferrari.webp',
            haas: '/images/drivers/2024/bearman-haas.webp',
        },
        leclerc: { ferrari: '/images/drivers/2024/leclerc.webp' },
        sainz: { ferrari: '/images/drivers/2024/sainz.webp' },
        hulkenberg: { haas: '/images/drivers/2024/hulkenberg.webp' },
        kevin_magnussen: { haas: '/images/drivers/2024/kevin_magnussen.webp' },
        norris: { mclaren: '/images/drivers/2024/norris.webp' },
        piastri: { mclaren: '/images/drivers/2024/piastri.webp' },
        hamilton: { mercedes: '/images/drivers/2024/hamilton.webp' },
        russell: { mercedes: '/images/drivers/2024/russell.webp' },
        lawson: { rb: '/images/drivers/2024/lawson.webp' },
        ricciardo: { rb: '/images/drivers/2024/ricciardo.webp' },
        tsunoda: { rb: '/images/drivers/2024/tsunoda.webp' },
        max_verstappen: { red_bull: '/images/drivers/2024/max_verstappen.webp' },
        perez: { red_bull: '/images/drivers/2024/perez.webp' },
        bottas: { sauber: '/images/drivers/2024/bottas.webp' },
        zhou: { sauber: '/images/drivers/2024/zhou.webp' },
        albon: { williams: '/images/drivers/2024/albon.webp' },
        colapinto: { williams: '/images/drivers/2024/colapinto.webp' },
        sargeant: { williams: '/images/drivers/2024/sargeant.webp' },
    },
    '2025': {
        colapinto: { alpine: '/images/drivers/2025/colapinto.webp' },
        doohan: { alpine: '/images/drivers/2025/doohan.webp' },
        gasly: { alpine: '/images/drivers/2025/gasly.webp' },
        alonso: { aston_martin: '/images/drivers/2025/alonso.webp' },
        stroll: { aston_martin: '/images/drivers/2025/stroll.webp' },
        hamilton: { ferrari: '/images/drivers/2025/hamilton.webp' },
        leclerc: { ferrari: '/images/drivers/2025/leclerc.webp' },
        bearman: { haas: '/images/drivers/2025/bearman.webp' },
        ocon: { haas: '/images/drivers/2025/ocon.webp' },
        norris: { mclaren: '/images/drivers/2025/norris.webp' },
        piastri: { mclaren: '/images/drivers/2025/piastri.webp' },
        antonelli: { mercedes: '/images/drivers/2025/antonelli.webp' },
        russell: { mercedes: '/images/drivers/2025/russell.webp' },
        hadjar: { rb: '/images/drivers/2025/hadjar.webp' },
        lawson: {
            rb: '/images/drivers/2025/lawson-rb.webp',
            red_bull: '/images/drivers/2025/lawson-red_bull.webp',
        },
        tsunoda: {
            rb: '/images/drivers/2025/tsunoda-rb.webp',
            red_bull: '/images/drivers/2025/tsunoda-red_bull.webp',
        },
        max_verstappen: { red_bull: '/images/drivers/2025/max_verstappen.webp' },
        bortoleto: { sauber: '/images/drivers/2025/bortoleto.webp' },
        hulkenberg: { sauber: '/images/drivers/2025/hulkenberg.webp' },
        albon: { williams: '/images/drivers/2025/albon.webp' },
        sainz: { williams: '/images/drivers/2025/sainz.webp' },
    },
    '2026': {
        russell: { mercedes: '/images/drivers/2026/russell.webp' },
        antonelli: { mercedes: '/images/drivers/2026/antonelli.webp' },
        leclerc: { ferrari: '/images/drivers/2026/leclerc.webp' },
        hamilton: { ferrari: '/images/drivers/2026/hamilton.webp' },
        norris: { mclaren: '/images/drivers/2026/norris.webp' },
        piastri: { mclaren: '/images/drivers/2026/piastri.webp' },
        max_verstappen: { red_bull: '/images/drivers/2026/max_verstappen.webp' },
        hadjar: { red_bull: '/images/drivers/2026/hadjar.webp' },
        lawson: {
            rb: '/images/drivers/2026/lawson.webp',
            red_bull: '/images/drivers/team-variants/lawson-red-bull.webp',
        },
        tsunoda: {
            rb: '/images/drivers/team-variants/tsunoda-racing-bulls.webp',
            red_bull: '/images/drivers/team-variants/tsunoda-red-bull.webp',
        },
        arvid_lindblad: { rb: '/images/drivers/2026/arvid_lindblad.webp' },
        gasly: { alpine: '/images/drivers/2026/gasly.webp' },
        colapinto: { alpine: '/images/drivers/2026/colapinto.webp' },
        ocon: { haas: '/images/drivers/2026/ocon.webp' },
        bearman: { haas: '/images/drivers/2026/bearman.webp' },
        hulkenberg: { audi: '/images/drivers/2026/hulkenberg.webp' },
        bortoleto: { audi: '/images/drivers/2026/bortoleto.webp' },
        sainz: { williams: '/images/drivers/2026/sainz.webp' },
        albon: { williams: '/images/drivers/2026/albon.webp' },
        alonso: { aston_martin: '/images/drivers/2026/alonso.webp' },
        stroll: { aston_martin: '/images/drivers/2026/stroll.webp' },
        perez: { cadillac: '/images/drivers/2026/perez.webp' },
        bottas: { cadillac: '/images/drivers/2026/bottas.webp' },
    },
};

export interface DriverPortraitEntry {
    season: string;
    driverId: string;
    constructorId: string;
    path: string;
}

/** Returns all season/driver/team portrait mappings for validation and preloading. */
export function getConfiguredDriverPortraits(): DriverPortraitEntry[] {
    const entries: DriverPortraitEntry[] = [];
    for (const [season, drivers] of Object.entries(SEASON_PORTRAITS)) {
        for (const [driverId, constructors] of Object.entries(drivers)) {
            for (const [constructorId, path] of Object.entries(constructors)) {
                entries.push({ season, driverId, constructorId, path });
            }
        }
    }
    return entries;
}

/** Resolves the season- and constructor-specific driver cutout path, or null when unavailable. */
export function getDriverPortrait(season: string, driverId: string, constructorId: string): string | null {
    return SEASON_PORTRAITS[season]?.[driverId]?.[constructorId] ?? null;
}

// Official 2026 cutouts from formula1.com/en/drivers. Source URLs accompany the assets.
const PORTRAIT_TEAMS: Record<string, string> = {
    russell: 'mercedes',
    antonelli: 'mercedes',
    leclerc: 'ferrari',
    hamilton: 'ferrari',
    norris: 'mclaren',
    piastri: 'mclaren',
    max_verstappen: 'red_bull',
    hadjar: 'red_bull',
    lawson: 'rb',
    arvid_lindblad: 'rb',
    gasly: 'alpine',
    colapinto: 'alpine',
    ocon: 'haas',
    bearman: 'haas',
    hulkenberg: 'audi',
    bortoleto: 'audi',
    sainz: 'williams',
    albon: 'williams',
    alonso: 'aston_martin',
    stroll: 'aston_martin',
    perez: 'cadillac',
    bottas: 'cadillac',
};

export function getDriverPortrait(season: string, driverId: string, constructorId: string): string | null {
    // Keep historical battles from showing a driver in another season's race suit.
    if (season !== '2026' || PORTRAIT_TEAMS[driverId] !== constructorId) return null;
    return `/images/drivers/2026/${driverId}.webp`;
}

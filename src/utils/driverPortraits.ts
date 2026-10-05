// Official driver cutouts. Source URLs accompany the assets.
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

const TEAM_PORTRAIT_VARIANTS: Record<string, Record<string, string>> = {
    lawson: {
        red_bull: '/images/drivers/team-variants/lawson-red-bull.png',
    },
    tsunoda: {
        rb: '/images/drivers/team-variants/tsunoda-racing-bulls.webp',
        red_bull: '/images/drivers/team-variants/tsunoda-red-bull.webp',
    },
};

export function getDriverPortrait(season: string, driverId: string, constructorId: string): string | null {
    // Keep historical battles from showing a driver in another season's race suit.
    if (season !== '2026') return null;

    const teamPortrait = TEAM_PORTRAIT_VARIANTS[driverId]?.[constructorId];
    if (teamPortrait) return teamPortrait;

    if (PORTRAIT_TEAMS[driverId] !== constructorId) return null;
    return `/images/drivers/2026/${driverId}.webp`;
}

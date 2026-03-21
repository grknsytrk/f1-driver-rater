export interface RaceRouteSnapshot {
    season: string;
    round: string;
    raceName: string;
    date: string;
}

export interface RaceRouteLocationState {
    raceSnapshot?: RaceRouteSnapshot;
}

// F1 Types - Racing Data Structures

export interface Season {
    season: string;
    url: string;
}

export interface Race {
    season: string;
    round: string;
    raceName: string;
    Circuit: Circuit;
    date: string;
    time?: string;
    Results?: RaceResult[];
}

export interface Circuit {
    circuitId: string;
    circuitName: string;
    url: string;
    Location: {
        locality: string;
        country: string;
        lat?: string;
        long?: string;
    };
}

export interface Driver {
    driverId: string;
    permanentNumber?: string;
    code?: string;
    url: string;
    givenName: string;
    familyName: string;
    dateOfBirth?: string;
    nationality?: string;
}

export interface Constructor {
    constructorId: string;
    url: string;
    name: string;
    nationality?: string;
}

export interface RaceResult {
    number: string;
    position: string;
    positionText: string;
    points: string;
    Driver: Driver;
    Constructor: Constructor;
    grid: string;
    laps: string;
    status: string;
    Time?: {
        millis?: string;
        time?: string;
    };
    FastestLap?: {
        rank: string;
        lap: string;
        Time: {
            time: string;
        };
        AverageSpeed?: {
            units: string;
            speed: string;
        };
    };
}

// User Rating Types
export interface DriverRating {
    driverId: string;
    driverName: string;
    constructorId: string;
    constructorName: string;
    rating: number;
}

export interface RaceRatings {
    round: string;
    raceName: string;
    date: string;
    ratings: DriverRating[];
    completed: boolean;
}

export interface SeasonRatings {
    season: string;
    races: RaceRatings[];
}

export interface AverageRating {
    driverId: string;
    driverName: string;
    constructorId: string;
    constructorName: string;
    averageRating: number;
    totalRaces: number;
    ratings: number[];
}

// API Response Types
export interface ErgastResponse<T> {
    MRData: {
        xmlns: string;
        series: string;
        url: string;
        limit: string;
        offset: string;
        total: string;
        [key: string]: T | string;
    };
}

// Team Colors Map
export const TEAM_COLORS: Record<string, string> = {
    'red_bull': '#1e41ff',
    'ferrari': '#dc0000',
    'mercedes': '#00d2be',
    'mclaren': '#ff8700',
    'aston_martin': '#006f62',
    'alpine': '#0090ff',
    'williams': '#005aff',
    'rb': '#2b4562',
    'sauber': '#52e252',
    'haas': '#b6babd',
    // Legacy team names
    'alphatauri': '#2b4562',
    'alfa': '#900000',
    'racing_point': '#f596c8',
    'renault': '#fff500',
    'toro_rosso': '#469bff',
};

// Country Flags Map (using emoji flags)
export const COUNTRY_FLAGS: Record<string, string> = {
    'Bahrain': '🇧🇭',
    'Saudi Arabia': '🇸🇦',
    'Australia': '🇦🇺',
    'Japan': '🇯🇵',
    'China': '🇨🇳',
    'USA': '🇺🇸',
    'Italy': '🇮🇹',
    'Monaco': '🇲🇨',
    'Canada': '🇨🇦',
    'Spain': '🇪🇸',
    'Austria': '🇦🇹',
    'UK': '🇬🇧',
    'Hungary': '🇭🇺',
    'Belgium': '🇧🇪',
    'Netherlands': '🇳🇱',
    'Azerbaijan': '🇦🇿',
    'Singapore': '🇸🇬',
    'Mexico': '🇲🇽',
    'Brazil': '🇧🇷',
    'Qatar': '🇶🇦',
    'UAE': '🇦🇪',
    'Las Vegas': '🇺🇸',
    'Miami': '🇺🇸',
};

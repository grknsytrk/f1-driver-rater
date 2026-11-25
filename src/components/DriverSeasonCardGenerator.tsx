import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Download, Flag, ImageDown, Timer } from 'lucide-react';
import type {
    DriverSeasonStats,
    SeasonQualifyingResult,
    SeasonRaceResult,
    SeasonSprintResult,
} from '../api/f1Api';
import type { Race } from '../types';
import { TEAM_COLORS } from '../types';
import { CountryFlag } from '../utils/countryFlags';
import { COUNTRY_CODES } from '../utils/countryCodes';
import { getCountryCode } from '../utils/storage';

export type SeasonCardMode = 'race' | 'qualifying';

interface DriverSeasonCardGeneratorProps {
    season: string;
    driverId: string;
    driverName: string;
    fallbackConstructorId: string;
    fallbackConstructorName: string;
    stats: DriverSeasonStats | null;
    calendar: Race[];
    raceResults: SeasonRaceResult[];
    qualiResults?: SeasonQualifyingResult[];
    sprintResults: SeasonSprintResult[];
    portraitUrl: string | null;
}

interface CardRace {
    round: string;
    raceName: string;
    countryCode: string;
    position: number | null | undefined | '—';
    positionText?: string;
    status?: string;
    started?: boolean;
    sprintPosition: number | null | undefined;
    sprintPositionText?: string;
    sprintStatus?: string;
}

const ART_WIDTH = 1200;
const HEADER_HEIGHT = 220;
const ROW_HEIGHT = 106;
const BOTTOM_PADDING = 110;

const TEAM_LOGOS: Record<string, string> = {
    red_bull: '/images/teams/red-bull.webp',
    ferrari: '/images/teams/ferrari.webp',
    mercedes: '/images/teams/mercedes.webp',
    mclaren: '/images/teams/mclaren.webp',
    rb: '/images/teams/racing-bulls.webp',
    racing_bulls: '/images/teams/racing-bulls.webp',
    audi: '/images/teams/audi.webp',
    alpine: '/images/teams/alpine.webp',
    haas: '/images/teams/haas.webp',
    williams: '/images/teams/williams.webp',
    aston_martin: '/images/teams/aston-martin.webp',
    cadillac: '/images/teams/cadillac.webp',
};

const CARD_PORTRAIT_OVERRIDES: Record<string, string> = {
    leclerc: '/images/drivers/card-portraits/charles-leclerc-2026.webp',
    hamilton: '/images/drivers/card-portraits/lewis-hamilton-2026.webp',
    max_verstappen: '/images/drivers/card-portraits/max-verstappen-2026.webp',
    antonelli: '/images/drivers/card-portraits/kimi-antonelli-2026.webp',
    russell: '/images/drivers/card-portraits/george-russell-2026.webp',
    norris: '/images/drivers/card-portraits/lando-norris-2026.webp',
    piastri: '/images/drivers/card-portraits/oscar-piastri-2026.webp',
};

const TEAM_ACCENTS: Record<string, string> = {
    red_bull: '#1e41ff', ferrari: '#e10600', mercedes: '#00d2be', mclaren: '#ff8700',
    rb: '#5376a8', racing_bulls: '#5376a8', audi: '#bb0a30', alpine: '#0090ff',
    haas: '#d1001f', williams: '#00a0de', aston_martin: '#006f62', cadillac: '#c5a26a',
};

const WHITE_LOGOS = new Set(['aston_martin', 'cadillac']);

function normalizeRound(round: string): string {
    return String(Number.parseInt(round, 10));
}

function ordinal(position: number | null | undefined | '—'): string {
    if (position === undefined) return '-';
    if (position === '—') return '—';
    if (position === null) return 'DNF';
    if (position % 100 >= 10 && position % 100 <= 20) return `${position}th`;
    const suffix = ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[position % 10] ?? 'th';
    return `${position}${suffix}`;
}

function cardResultLabel(
    position: number | null | undefined | '—',
    status?: string,
    started?: boolean,
    positionText?: string,
): string {
    if (position === undefined) return '-';
    if (position === '—') return '—';

    const normalizedStatus = status?.trim().toLowerCase() ?? '';
    if (/\b(disqualified|dsq|dq)\b/.test(normalizedStatus)) return 'DSQ';
    if (/\b(excluded)\b/.test(normalizedStatus)) return 'EXC';
    if (/^(did not qualify|failed to qualify|not qualified|dnq|dnpq)\b/.test(normalizedStatus)) return 'DNQ';
    if (/^(withdrew|withdrawn|wdr|wd)\b/.test(normalizedStatus)) return 'WDR';
    if (/^(did not start|not started|dns)\b/.test(normalizedStatus) || started === false) return 'DNS';

    const classificationCode = positionText?.trim().toUpperCase();
    if (classificationCode === 'D') return 'DSQ';
    if (classificationCode === 'E') return 'EXC';
    if (classificationCode === 'W') return 'WDR';
    if (classificationCode === 'F') return 'DNQ';
    if (classificationCode === 'R' || classificationCode === 'N') return 'DNF';

    if (position === null) return 'DNF';
    if (normalizedStatus && !/^(finished|\+\s*\d+\s*lap(?:s)?)$/.test(normalizedStatus)) return 'DNF';
    return ordinal(position);
}

function cardResultColor(
    position: number | null | undefined | '—',
    status?: string,
    started?: boolean,
    positionText?: string,
): string {
    const label = cardResultLabel(position, status, started, positionText);
    if (['DNF', 'DNS', 'DSQ', 'EXC', 'DNQ', 'WDR'].includes(label)) return '#ff3545';
    return resultColor(position);
}

function resultColor(position: number | null | undefined | '—'): string {
    if (position === undefined) return '#a9b3c0';
    if (position === '—') return '#738092';
    if (position === null) return '#ff3545';
    return ({ 1: '#ffd451', 2: '#d9e1eb', 3: '#c88758' } as Record<number, string>)[position] || '#f2f3f4';
}

function fittedFontSize(
    text: string,
    fontFamily: string,
    fontWeight: number,
    baseSize: number,
    maxWidth: number,
    letterSpacingEm = 0,
): number {
    if (!text || typeof document === 'undefined') return baseSize;
    const context = document.createElement('canvas').getContext('2d');
    if (!context) return baseSize;

    context.font = `${fontWeight} ${baseSize}px "${fontFamily}"`;
    const measuredWidth = context.measureText(text).width
        + Math.max(0, text.length - 1) * letterSpacingEm * baseSize;
    if (!Number.isFinite(measuredWidth) || measuredWidth <= maxWidth) return baseSize;
    return Math.max(28, Math.floor(baseSize * maxWidth / measuredWidth));
}

function CardColon({ size = 5, gap = 5 }: { size?: number; gap?: number }) {
    return (
        <span aria-hidden="true" className="inline-flex shrink-0 flex-col items-center justify-center text-current" style={{ gap }}>
            <span className="rounded-full bg-current" style={{ width: size, height: size }} />
            <span className="rounded-full bg-current" style={{ width: size, height: size }} />
        </span>
    );
}

function useSeasonCardRaces(
    driverId: string,
    calendar: Race[],
    raceResults: SeasonRaceResult[],
    sprintResults: SeasonSprintResult[],
): CardRace[] {
    return useMemo(() => {
        const raceByRound = new Map<string, SeasonRaceResult>();
        const sprintByRound = new Map<string, SeasonSprintResult>();
        const roundsWithRaceResults = new Set<string>();

        for (const result of raceResults) {
            const round = normalizeRound(result.round);
            roundsWithRaceResults.add(round);
            if (result.driverId === driverId) raceByRound.set(round, result);
        }
        for (const result of sprintResults) {
            if (result.driverId === driverId) sprintByRound.set(normalizeRound(result.round), result);
        }

        return [...calendar]
            .sort((a, b) => Number.parseInt(a.round, 10) - Number.parseInt(b.round, 10))
            .map(race => {
                const round = normalizeRound(race.round);
                const result = raceByRound.get(round);
                const sprint = sprintByRound.get(round);
                const hasAnyResult = roundsWithRaceResults.has(round);
                const raceCountryCode = getCountryCode(race.raceName);
                return {
                    round,
                    raceName: race.raceName,
                    countryCode: raceCountryCode !== 'XX'
                        ? raceCountryCode
                        : COUNTRY_CODES[race.Circuit.Location.country] ?? 'XX',
                    // A missing row in an active calendar means the event has not run yet.
                    // In a completed season, an absent driver result is shown as an em dash.
                    position: result
                        ? result.position
                        : hasAnyResult ? '—' : undefined,
                    positionText: result?.positionText,
                    status: result?.status,
                    started: result?.started,
                    sprintPosition: sprint ? sprint.position : undefined,
                    sprintPositionText: sprint?.positionText,
                    sprintStatus: sprint?.status,
                };
            });
    }, [driverId, calendar, raceResults, sprintResults]);
}

function useSeasonCardQualifying(
    driverId: string,
    calendar: Race[],
    qualiResults: SeasonQualifyingResult[],
    raceResults: SeasonRaceResult[],
): CardRace[] {
    return useMemo(() => {
        const qualiByRound = new Map<string, SeasonQualifyingResult>();
        const raceByRound = new Map<string, SeasonRaceResult>();
        const roundsWithQualiResults = new Set<string>();
        const roundsWithRaceResults = new Set<string>();

        for (const result of qualiResults) {
            const round = normalizeRound(result.round);
            roundsWithQualiResults.add(round);
            if (result.driverId === driverId) qualiByRound.set(round, result);
        }
        for (const result of raceResults) {
            const round = normalizeRound(result.round);
            roundsWithRaceResults.add(round);
            if (result.driverId === driverId) raceByRound.set(round, result);
        }

        return [...calendar]
            .sort((a, b) => Number.parseInt(a.round, 10) - Number.parseInt(b.round, 10))
            .map(race => {
                const round = normalizeRound(race.round);
                const quali = qualiByRound.get(round);
                const raceRes = raceByRound.get(round);
                const hasQualiRound = roundsWithQualiResults.has(round);
                const hasRaceRound = roundsWithRaceResults.has(round);
                const raceCountryCode = getCountryCode(race.raceName);

                let position: number | null | undefined | '—';
                if (quali && quali.position > 0) {
                    position = quali.position;
                } else if (!hasQualiRound && raceRes?.gridPosition && raceRes.gridPosition > 0) {
                    position = raceRes.gridPosition;
                } else if (hasQualiRound || hasRaceRound) {
                    position = '—';
                } else {
                    position = undefined;
                }

                return {
                    round,
                    raceName: race.raceName,
                    countryCode: raceCountryCode !== 'XX'
                        ? raceCountryCode
                        : COUNTRY_CODES[race.Circuit.Location.country] ?? 'XX',
                    position,
                    sprintPosition: undefined,
                };
            });
    }, [driverId, calendar, qualiResults, raceResults]);
}

function getSeasonTeam(
    driverId: string,
    raceResults: SeasonRaceResult[],
    qualiResults: SeasonQualifyingResult[],
    fallbackId: string,
    fallbackName: string,
) {
    const counts = new Map<string, { id: string; name: string; count: number; latestRound: number }>();
    const sourceResults = raceResults.some(r => r.driverId === driverId) ? raceResults : qualiResults;
    for (const result of sourceResults) {
        if (result.driverId !== driverId) continue;
        const row = counts.get(result.constructorId) ?? {
            id: result.constructorId,
            name: result.constructorName,
            count: 0,
            latestRound: 0,
        };
        row.count += 1;
        row.latestRound = Math.max(row.latestRound, Number.parseInt(result.round, 10) || 0);
        counts.set(result.constructorId, row);
    }
    const selected = [...counts.values()].sort((a, b) => b.count - a.count || b.latestRound - a.latestRound)[0];
    return selected ?? { id: fallbackId, name: fallbackName, count: 0, latestRound: 0 };
}

function CardRaceRow({ race }: { race: CardRace }) {
    const position = cardResultLabel(race.position, race.status, race.started, race.positionText);
    const positionColor = cardResultColor(race.position, race.status, race.started, race.positionText);
    const sprintPosition = race.sprintPosition === undefined
        ? null
        : cardResultLabel(race.sprintPosition, race.sprintStatus, undefined, race.sprintPositionText);
    const sprintColor = race.sprintPosition === undefined
        ? undefined
        : cardResultColor(race.sprintPosition, race.sprintStatus, undefined, race.sprintPositionText);
    const country = race.countryCode === 'XX' ? 'US' : race.countryCode;

    return (
        <div className="relative flex h-[106px] items-center" aria-label={`${race.raceName}: ${position}`}>
            <CountryFlag country={country} size="lg" className="!h-[56px] !w-[84px] !rounded-md !border-white/35" />
            <div className="relative ml-5 flex h-[56px] min-w-0 items-center">
                {sprintPosition && (
                    <div className="season-card-bold absolute -top-[18px] left-0 flex items-center gap-[5px] whitespace-nowrap text-[19px] leading-none uppercase tracking-wide text-[#c4ccda]">
                        <span className="inline-flex items-center gap-[2px]">SPRINT<CardColon size={3} gap={2} /></span>
                        <span style={{ color: sprintColor }}>{sprintPosition}</span>
                    </div>
                )}
                <div
                    className={`season-card-bold text-[46px] leading-none ${sprintPosition ? 'translate-y-[3px]' : ''}`}
                    style={{ color: positionColor }}
                >
                    {position}
                </div>
            </div>
        </div>
    );
}

function SeasonCardArtwork({
    cardRef,
    mode,
    season,
    driverName,
    teamId,
    teamName,
    teamColor,
    stats,
    races,
    portraitUrl,
}: {
    cardRef: RefObject<HTMLDivElement | null>;
    mode: SeasonCardMode;
    season: string;
    driverName: string;
    teamId: string;
    teamName: string;
    teamColor: string;
    stats: DriverSeasonStats | null;
    races: CardRace[];
    portraitUrl: string | null;
}) {
    const parts = driverName.trim().split(/\s+/).filter(Boolean);
    const givenName = parts.length > 1 ? parts.slice(0, -1).join(' ') : (parts[0] || driverName);
    const familyName = parts.length > 1 ? parts[parts.length - 1] : '';
    const rowsPerColumn = Math.ceil(races.length / 2);
    const cardHeight = Math.max(1200, HEADER_HEIGHT + rowsPerColumn * ROW_HEIGHT + BOTTOM_PADDING);
    const logo = TEAM_LOGOS[teamId];
    const logoNeedsWhite = WHITE_LOGOS.has(teamId);
    const leftRaces = races.slice(0, rowsPerColumn);
    const rightRaces = races.slice(rowsPerColumn);
    const points = stats ? Number(stats.points).toLocaleString() : '—';
    const validQualiPositions = races
        .map(r => r.position)
        .filter((pos): pos is number => typeof pos === 'number' && Number.isFinite(pos) && pos > 0);
    const polesCount = validQualiPositions.length > 0
        ? validQualiPositions.filter(pos => pos === 1).length
        : (stats?.poles ?? 0);
    const avgQuali = validQualiPositions.length > 0
        ? (validQualiPositions.reduce((sum, pos) => sum + pos, 0) / validQualiPositions.length).toFixed(1)
        : '—';
    const accent = TEAM_ACCENTS[teamId] || TEAM_COLORS[teamId] || teamColor;
    const givenNameFontSize = fittedFontSize(givenName, 'Segoe Script', 400, 49, 300);
    const familyNameFontSize = fittedFontSize(familyName.toUpperCase(), 'Formula1-Black', 900, 46, 300, -0.025);

    return (
        <div
            ref={cardRef}
            className="season-share-card relative isolate overflow-hidden text-white"
            style={{
                width: `${ART_WIDTH}px`,
                height: `${cardHeight}px`,
                background: `radial-gradient(ellipse at 82% 22%, ${accent}55 0%, transparent 37%), linear-gradient(115deg, #070b10 0%, #10131d 57%, #101827 100%)`,
                fontFamily: 'Formula1, Arial, sans-serif',
            }}
        >
            {portraitUrl && (
                <img
                    src={portraitUrl}
                    alt=""
                    crossOrigin="anonymous"
                    className="absolute right-0 top-0 h-full w-[58%] object-cover object-top"
                    style={{
                        maskImage: 'linear-gradient(90deg, transparent 0%, #000 18%, #000 100%)',
                        WebkitMaskImage: 'linear-gradient(90deg, transparent 0%, #000 18%, #000 100%)',
                    }}
                />
            )}
            <div
                className="absolute inset-0"
                style={{ background: 'linear-gradient(90deg, #070b10 0%, rgba(7,11,16,.98) 30%, rgba(7,11,16,.90) 40%, rgba(7,11,16,.68) 52%, rgba(7,11,16,.36) 65%, rgba(7,11,16,.08) 86%, rgba(7,11,16,0) 100%)' }}
            />

            <div className="absolute left-[28px] top-[10px] z-10 w-[315px]">
                <div className="season-card-black text-[86px] leading-none tracking-tight">{season}</div>
                <div
                    className="mt-1 whitespace-nowrap font-['Segoe_Script',cursive] leading-[1.05]"
                    style={{ fontSize: `${givenNameFontSize}px` }}
                >
                    {givenName}
                </div>
                {familyName && (
                    <div
                        className="season-card-black whitespace-nowrap leading-none tracking-tight"
                        style={{ fontSize: `${familyNameFontSize}px` }}
                    >
                        {familyName.toUpperCase()}
                    </div>
                )}
            </div>

            <div className="absolute left-[350px] top-[18px] z-10 flex h-[165px] w-[250px] items-center justify-center">
                {logo ? (
                    <img
                        src={logo}
                        alt={`${teamName} logo`}
                        crossOrigin="anonymous"
                        className="max-h-full max-w-full object-contain"
                        style={logoNeedsWhite ? { filter: 'brightness(0) invert(1)' } : undefined}
                    />
                ) : (
                    <div className="season-card-bold max-w-full text-center text-[28px] uppercase leading-tight" style={{ color: accent }}>
                        {teamName}
                    </div>
                )}
            </div>

            <div className="absolute left-[24px] top-[220px] z-10 flex flex-col">
                {leftRaces.map(race => <CardRaceRow key={race.round} race={race} />)}
            </div>
            <div className="absolute left-[354px] top-[220px] z-10 flex flex-col">
                {rightRaces.map(race => <CardRaceRow key={race.round} race={race} />)}
            </div>

            <div
                className="absolute bottom-[38px] right-[34px] z-20 flex h-[150px] w-[420px] flex-col items-center justify-center gap-1 rounded-[34px] border-[3px] border-white bg-black/80 px-3 py-2 text-white"
                style={{ boxShadow: '0 12px 34px rgba(0,0,0,0.24)' }}
            >
                {mode === 'qualifying' ? (
                    <>
                        <div className="season-card-bold flex items-center justify-center gap-2 whitespace-nowrap text-[48px] leading-none">
                            <span className="inline-flex items-center gap-[3px]">Poles<CardColon /></span>
                            <span style={{ color: polesCount > 0 ? '#ffd451' : '#f2f3f4' }}>
                                {polesCount}
                            </span>
                        </div>
                        <div className="season-card-bold flex items-center justify-center gap-2 whitespace-nowrap text-[48px] leading-none">
                            <span className="inline-flex items-center gap-[3px]">Avg<CardColon /></span>
                            <span>{avgQuali}</span>
                        </div>
                    </>
                ) : (
                    <>
                        <div className="season-card-bold flex items-center justify-center gap-2 whitespace-nowrap text-[48px] leading-none">
                            <span className="inline-flex items-center gap-[3px]">WDC<CardColon /></span>
                            <span style={{ color: resultColor(Number(stats?.position) || undefined) }}>
                                {stats?.position ? ordinal(Number(stats.position)) : '—'}
                            </span>
                        </div>
                        <div className="season-card-bold flex items-center justify-center gap-2 whitespace-nowrap text-[48px] leading-none">
                            <span className="inline-flex items-center gap-[3px]">Pts<CardColon /></span>
                            <span>{points}</span>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

export function DriverSeasonCardGenerator(props: DriverSeasonCardGeneratorProps) {
    const cardRef = useRef<HTMLDivElement>(null);
    const [cardMode, setCardMode] = useState<SeasonCardMode>('race');
    const [generatingMode, setGeneratingMode] = useState<SeasonCardMode | null>(null);
    const [dotCount, setDotCount] = useState(1);
    const [cardImages, setCardImages] = useState<Partial<Record<SeasonCardMode, string>>>({});
    const cardImagesRef = useRef<Partial<Record<SeasonCardMode, string>>>({});
    const [error, setError] = useState<string | null>(null);
    const qualiResults = props.qualiResults ?? [];
    const raceEntries = useSeasonCardRaces(props.driverId, props.calendar, props.raceResults, props.sprintResults);
    const qualiEntries = useSeasonCardQualifying(props.driverId, props.calendar, qualiResults, props.raceResults);
    const activeEntries = cardMode === 'qualifying' ? qualiEntries : raceEntries;
    const activeCardImage = cardImages[cardMode] ?? null;
    const team = getSeasonTeam(props.driverId, props.raceResults, qualiResults, props.fallbackConstructorId, props.fallbackConstructorName);
    const cardPortraitUrl = CARD_PORTRAIT_OVERRIDES[props.driverId] ?? props.portraitUrl;
    const teamColor = TEAM_ACCENTS[team.id] || TEAM_COLORS[team.id] || '#e10600';
    const isGenerating = generatingMode !== null;

    cardImagesRef.current = cardImages;

    useEffect(() => {
        Object.values(cardImagesRef.current).forEach(url => {
            if (url) URL.revokeObjectURL(url);
        });
        setCardImages({});
        setError(null);
    }, [props.season, props.driverId]);

    useEffect(() => () => {
        Object.values(cardImagesRef.current).forEach(url => {
            if (url) URL.revokeObjectURL(url);
        });
    }, []);

    useEffect(() => {
        if (!isGenerating) {
            setDotCount(1);
            return;
        }
        const timer = window.setInterval(() => {
            setDotCount(prev => (prev % 3) + 1);
        }, 350);
        return () => window.clearInterval(timer);
    }, [isGenerating]);

    async function createCard(mode: SeasonCardMode) {
        const targetEntries = mode === 'qualifying' ? qualiEntries : raceEntries;
        if (targetEntries.length === 0) return;
        setCardMode(mode);
        setGeneratingMode(mode);
        setError(null);
        try {
            await new Promise<void>(resolve => {
                window.requestAnimationFrame(() => {
                    window.requestAnimationFrame(() => resolve());
                });
            });
            if (!cardRef.current) return;
            const targetHeight = Math.max(1200, HEADER_HEIGHT + Math.ceil(targetEntries.length / 2) * ROW_HEIGHT + BOTTOM_PADDING);
            await document.fonts?.ready;
            await Promise.all(Array.from(cardRef.current.querySelectorAll('img')).map(image => image.decode().catch(() => undefined)));
            const { toBlob } = await import('html-to-image');
            const blob = await toBlob(cardRef.current, {
                cacheBust: true,
                pixelRatio: 2,
                width: ART_WIDTH,
                height: targetHeight,
                backgroundColor: '#070b10',
            });
            if (!blob) throw new Error('Generated image blob was empty.');
            const objectUrl = URL.createObjectURL(blob);
            setCardImages(prev => {
                const previousUrl = prev[mode];
                if (previousUrl) URL.revokeObjectURL(previousUrl);
                return { ...prev, [mode]: objectUrl };
            });
        } catch (cause) {
            console.error('Failed to create driver season card:', cause);
            setError('The card could not be created. Please try again.');
        } finally {
            setGeneratingMode(null);
        }
    }

    function handleModeChange(nextMode: SeasonCardMode) {
        if (isGenerating || nextMode === cardMode) return;
        setCardMode(nextMode);
    }

    function downloadCard() {
        if (!activeCardImage) return;
        const link = document.createElement('a');
        const safeDriverName = props.driverName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        const suffix = cardMode === 'qualifying' ? 'quali-card' : 'season-card';
        link.download = `f1-${safeDriverName}-${props.season}-${suffix}.png`;
        link.href = activeCardImage;
        link.click();
    }

    return (
        <section id="season-share-card" className="space-y-4 border border-[var(--border-color)] bg-[var(--bg-panel)] p-4 md:p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                    <h3 className="font-display text-lg uppercase tracking-wide text-white">GENERATE SEASON CARD</h3>
                    <p className="mt-1 font-oxanium text-xs text-[var(--text-secondary)]">
                        Creates a card for {props.driverName} using the selected {props.season} season.
                    </p>
                </div>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 shrink-0">
                    <div
                        role="group"
                        aria-label="Season card type"
                        className="inline-grid grid-cols-2 gap-1 border border-[var(--border-color)] bg-[var(--bg-darker)] p-1 min-h-11"
                    >
                        <button
                            type="button"
                            aria-pressed={cardMode === 'race'}
                            disabled={isGenerating}
                            onClick={() => handleModeChange('race')}
                            className={`flex items-center justify-center gap-1.5 px-3.5 py-1.5 font-display text-xs uppercase tracking-wider transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                                cardMode === 'race'
                                    ? 'bg-[var(--accent-red)] text-white'
                                    : 'text-[var(--text-secondary)] hover:text-white'
                            }`}
                        >
                            <Flag size={13} />
                            <span>RACE</span>
                        </button>
                        <button
                            type="button"
                            aria-pressed={cardMode === 'qualifying'}
                            disabled={isGenerating}
                            onClick={() => handleModeChange('qualifying')}
                            className={`flex items-center justify-center gap-1.5 px-3.5 py-1.5 font-display text-xs uppercase tracking-wider transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                                cardMode === 'qualifying'
                                    ? 'bg-[var(--accent-red)] text-white'
                                    : 'text-[var(--text-secondary)] hover:text-white'
                            }`}
                        >
                            <Timer size={13} />
                            <span>QUALI</span>
                        </button>
                    </div>

                    <button
                        type="button"
                        onClick={() => void createCard(cardMode)}
                        disabled={isGenerating || activeEntries.length === 0}
                        className="relative inline-grid min-h-11 items-center justify-items-center whitespace-nowrap border border-[var(--accent-red)] bg-[var(--accent-red)] px-4 py-2 font-display text-xs font-bold uppercase tracking-wider text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        <span className={`col-start-1 row-start-1 inline-flex items-center gap-2 ${isGenerating ? 'invisible' : ''}`}>
                            <ImageDown size={17} />
                            <span>GENERATE CARD</span>
                        </span>
                        {isGenerating && (
                            <span className="col-start-1 row-start-1 inline-flex items-center">
                                <span className="relative">
                                    <span>GENERATING</span>
                                    <span className="absolute left-full top-0 text-left">{'.'.repeat(dotCount)}</span>
                                </span>
                            </span>
                        )}
                    </button>
                </div>
            </div>

            {error && <p role="alert" className="font-oxanium text-sm text-[var(--accent-red)]">{error}</p>}

            {activeCardImage && (
                <div className="space-y-3 border-t border-[var(--border-color)] pt-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="font-oxanium text-xs uppercase tracking-wide text-[var(--text-secondary)]">
                            {props.season} · {cardMode === 'qualifying' ? 'QUALIFYING' : 'RACE'} · {activeEntries.length} scheduled rounds · future results shown as "-"
                        </p>
                        <button
                            type="button"
                            onClick={downloadCard}
                            className="inline-flex items-center gap-2 border border-[var(--border-color)] bg-[var(--bg-darker)] px-3 py-2 font-display text-[11px] font-bold uppercase tracking-wider text-white hover:border-white/60"
                        >
                            <Download size={15} /> DOWNLOAD PNG
                        </button>
                    </div>
                    <img
                        src={activeCardImage}
                        alt={`${props.driverName} ${props.season} ${cardMode} results card`}
                        className="mx-auto block h-auto max-h-[85vh] w-full max-w-[760px] border border-[var(--border-color)] object-contain"
                    />
                </div>
            )}

            {isGenerating && (
                <div aria-hidden="true" className="pointer-events-none fixed left-[-15000px] top-0 z-[-1]">
                    <SeasonCardArtwork
                        cardRef={cardRef}
                        mode={cardMode}
                        season={props.season}
                        driverName={props.driverName}
                        teamId={team.id}
                        teamName={team.name}
                        teamColor={teamColor}
                        stats={props.stats}
                        races={activeEntries}
                        portraitUrl={cardPortraitUrl}
                    />
                </div>
            )}
        </section>
    );
}

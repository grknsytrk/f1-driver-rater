import { useMemo, useRef, useState, type RefObject } from 'react';
import { toPng } from 'html-to-image';
import { Download, ImageDown, Loader2 } from 'lucide-react';
import type { DriverSeasonStats, SeasonRaceResult, SeasonSprintResult } from '../api/f1Api';
import type { Race } from '../types';
import { TEAM_COLORS } from '../types';
import { CountryFlag } from '../utils/countryFlags';
import { COUNTRY_CODES } from '../utils/countryCodes';
import { getCountryCode } from '../utils/storage';

interface DriverSeasonCardGeneratorProps {
    season: string;
    driverId: string;
    driverName: string;
    fallbackConstructorId: string;
    fallbackConstructorName: string;
    stats: DriverSeasonStats | null;
    calendar: Race[];
    raceResults: SeasonRaceResult[];
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
    red_bull: '/images/teams/red-bull.png',
    ferrari: '/images/teams/ferrari.png',
    mercedes: '/images/teams/mercedes.png',
    mclaren: '/images/teams/mclaren.png',
    rb: '/images/teams/racing-bulls.png',
    racing_bulls: '/images/teams/racing-bulls.png',
    audi: '/images/teams/audi.png',
    alpine: '/images/teams/alpine.png',
    haas: '/images/teams/haas.png',
    williams: '/images/teams/williams.png',
    aston_martin: '/images/teams/aston-martin.png',
    cadillac: '/images/teams/cadillac.png',
};

const CARD_PORTRAIT_OVERRIDES: Record<string, string> = {
    '2026:leclerc': '/images/drivers/card-portraits/charles-leclerc-2026.webp',
    '2026:hamilton': '/images/drivers/card-portraits/lewis-hamilton-2026.webp',
    '2026:max_verstappen': '/images/drivers/card-portraits/max-verstappen-2026.webp',
    '2026:antonelli': '/images/drivers/card-portraits/kimi-antonelli-2026.webp',
    '2026:russell': '/images/drivers/card-portraits/george-russell-2026.webp',
    '2026:norris': '/images/drivers/card-portraits/lando-norris-2026.webp',
    '2026:piastri': '/images/drivers/card-portraits/oscar-piastri-2026.webp',
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

function getSeasonTeam(
    driverId: string,
    raceResults: SeasonRaceResult[],
    fallbackId: string,
    fallbackName: string,
) {
    const counts = new Map<string, { id: string; name: string; count: number; latestRound: number }>();
    for (const result of raceResults) {
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
            <div className="ml-5 flex h-[56px] min-w-0 flex-col justify-center">
                {sprintPosition ? (
                    <>
                        <div className="season-card-bold flex items-center gap-[5px] whitespace-nowrap text-[14px] leading-none uppercase tracking-wide text-[#c4ccda]">
                            <span className="inline-flex items-center gap-[2px]">SPRINT<CardColon size={2.5} gap={2} /></span>
                            <span style={{ color: sprintColor }}>{sprintPosition}</span>
                        </div>
                        <div
                            className="season-card-bold mt-1 text-[40px] leading-[0.88]"
                            style={{ color: positionColor }}
                        >
                            {position}
                        </div>
                    </>
                ) : (
                    <div
                        className="season-card-bold text-[46px] leading-none"
                        style={{ color: positionColor }}
                    >
                        {position}
                    </div>
                )}
            </div>
        </div>
    );
}

function SeasonCardArtwork({
    cardRef,
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
            </div>
        </div>
    );
}

export function DriverSeasonCardGenerator(props: DriverSeasonCardGeneratorProps) {
    const cardRef = useRef<HTMLDivElement>(null);
    const previewRef = useRef<HTMLDivElement>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [cardImage, setCardImage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const races = useSeasonCardRaces(props.driverId, props.calendar, props.raceResults, props.sprintResults);
    const team = getSeasonTeam(props.driverId, props.raceResults, props.fallbackConstructorId, props.fallbackConstructorName);
    const cardPortraitUrl = CARD_PORTRAIT_OVERRIDES[`${props.season}:${props.driverId}`] ?? props.portraitUrl;
    const teamColor = TEAM_ACCENTS[team.id] || TEAM_COLORS[team.id] || '#e10600';
    const cardHeight = Math.max(1200, HEADER_HEIGHT + Math.ceil(races.length / 2) * ROW_HEIGHT + BOTTOM_PADDING);

    async function createCard() {
        if (!cardRef.current || races.length === 0) return;
        setIsGenerating(true);
        setError(null);
        setCardImage(null);
        try {
            await document.fonts?.ready;
            await Promise.all(Array.from(cardRef.current.querySelectorAll('img')).map(image => image.decode().catch(() => undefined)));
            const dataUrl = await toPng(cardRef.current, {
                cacheBust: true,
                pixelRatio: 2,
                width: ART_WIDTH,
                height: cardHeight,
                backgroundColor: '#070b10',
            });
            setCardImage(dataUrl);
            window.setTimeout(() => previewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
        } catch (cause) {
            console.error('Failed to create driver season card:', cause);
            setError('The card could not be created. Please try again.');
        } finally {
            setIsGenerating(false);
        }
    }

    function downloadCard() {
        if (!cardImage) return;
        const link = document.createElement('a');
        const safeDriverName = props.driverName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        link.download = `f1-${safeDriverName}-${props.season}-season-card.png`;
        link.href = cardImage;
        link.click();
    }

    return (
            <section id="season-share-card" className="space-y-4 border border-[var(--border-color)] bg-[var(--bg-panel)] p-4 md:p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                        <h3 className="font-display text-lg uppercase tracking-wide text-white">GENERATE SEASON CARD</h3>
                    <p className="mt-1 font-oxanium text-xs text-[var(--text-secondary)]">
                        Creates a card for {props.driverName} using the selected {props.season} season.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => void createCard()}
                    disabled={isGenerating || races.length === 0}
                    className="inline-flex min-h-11 items-center justify-center gap-2 border border-[var(--accent-red)] bg-[var(--accent-red)] px-4 py-2 font-display text-xs font-bold uppercase tracking-wider text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                    {isGenerating ? <Loader2 size={17} className="animate-spin" /> : <ImageDown size={17} />}
                    {isGenerating ? 'GENERATING CARD…' : 'GENERATE CARD'}
                </button>
            </div>

            {error && <p role="alert" className="font-oxanium text-sm text-[var(--accent-red)]">{error}</p>}

            {cardImage && (
                <div ref={previewRef} className="space-y-3 border-t border-[var(--border-color)] pt-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="font-oxanium text-xs uppercase tracking-wide text-[var(--text-secondary)]">
                            {props.season} · {races.length} scheduled races · future results shown as "-"
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
                        src={cardImage}
                        alt={`${props.driverName} ${props.season} season results card`}
                        className="mx-auto block h-auto max-h-[85vh] w-full max-w-[760px] border border-[var(--border-color)] object-contain"
                    />
                </div>
            )}

            <div aria-hidden="true" className="pointer-events-none fixed left-[-15000px] top-0 z-[-1]">
                <SeasonCardArtwork
                    cardRef={cardRef}
                    season={props.season}
                    driverName={props.driverName}
                    teamId={team.id}
                    teamName={team.name}
                    teamColor={teamColor}
                    stats={props.stats}
                    races={races}
                    portraitUrl={cardPortraitUrl}
                />
            </div>
        </section>
    );
}

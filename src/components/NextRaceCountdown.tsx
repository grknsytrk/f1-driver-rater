import { Fragment, useEffect, useMemo, useState } from 'react';
import { Crown, Flag, History, MapPin, Trophy } from 'lucide-react';
import { loadStaticSeasonData, type CompactSeasonBundle } from '../api/staticSeasonData';
import { getTeamColor, type Race } from '../types';
import { CountryFlag } from '../utils/countryFlags';
import {
    buildCircuitHistory,
    buildWeekendSessions,
    CIRCUIT_HISTORY_START_YEAR,
    findNextUpcomingRace,
    formatLocalSessionTime,
    getLocalTimezoneLabel,
    isSprintWeekend,
    parseSessionTimestampMs,
    splitCountdown,
} from '../utils/nextRace';
import { DriverProfileLink } from './DriverProfileLink';
import { PodiumFlagBackdrop } from './PodiumFlagBackdrop';

const EMPTY_BUNDLES: CompactSeasonBundle[] = [];

export interface NextRaceCountdownProps {
    races: Race[];
    season: string;
    /** Optional preloaded bundles (used in tests or SSR) to skip async bundle loading. */
    historyBundles?: CompactSeasonBundle[];
}

function padTwo(value: number): string {
    return String(Math.max(0, value)).padStart(2, '0');
}

function formatPointsTotal(points: number): string {
    return Number.isInteger(points) ? String(points) : points.toFixed(1);
}

/**
 * Displays a live countdown to the next upcoming Grand Prix, full local-time weekend session
 * schedule, and historical circuit winners + top points scorers (2018–present) above RaceList.
 */
export function NextRaceCountdown({ races, season, historyBundles }: NextRaceCountdownProps) {
    const [nowMs, setNowMs] = useState(() => Date.now());
    const [loadedState, setLoadedState] = useState<{
        season: string;
        bundles: CompactSeasonBundle[];
        done: boolean;
    }>({ season: '', bundles: [], done: false });

    const nextRace = useMemo(() => findNextUpcomingRace(races, nowMs), [races, nowMs]);
    const hasNextRace = nextRace !== null;

    useEffect(() => {
        if (!hasNextRace) return;
        const timer = setInterval(() => {
            setNowMs(Date.now());
        }, 1000);
        return () => clearInterval(timer);
    }, [hasNextRace]);

    useEffect(() => {
        if (!hasNextRace || historyBundles) return;

        let cancelled = false;
        const seasonNum = Number.parseInt(season, 10);
        const endYear = Number.isFinite(seasonNum)
            ? Math.max(CIRCUIT_HISTORY_START_YEAR, seasonNum)
            : new Date().getUTCFullYear();

        const years: string[] = [];
        for (let yr = CIRCUIT_HISTORY_START_YEAR; yr <= endYear; yr += 1) {
            years.push(String(yr));
        }

        void Promise.all(years.map(yr => loadStaticSeasonData(yr).catch(() => null))).then((results) => {
            if (cancelled) return;
            const validBundles = results.filter((b): b is CompactSeasonBundle => b !== null);
            setLoadedState({
                season,
                bundles: validBundles,
                done: true,
            });
        });

        return () => {
            cancelled = true;
        };
    }, [hasNextRace, historyBundles, season]);

    const activeBundles = useMemo(
        () => historyBundles ?? (loadedState.season === season ? loadedState.bundles : EMPTY_BUNDLES),
        [historyBundles, loadedState.season, loadedState.bundles, season],
    );
    const historyReady = Boolean(historyBundles) || (loadedState.season === season && loadedState.done);

    const sessions = useMemo(
        () => (nextRace ? buildWeekendSessions(nextRace, nowMs) : []),
        [nextRace, nowMs],
    );

    const raceStartMs = useMemo(
        () => (nextRace ? parseSessionTimestampMs({ date: nextRace.date, time: nextRace.time }) : null),
        [nextRace],
    );

    const countdown = useMemo(
        () => (raceStartMs !== null ? splitCountdown(raceStartMs, nowMs) : null),
        [raceStartMs, nowMs],
    );

    const timezoneLabel = useMemo(() => getLocalTimezoneLabel(nowMs), [nowMs]);

    const circuitHistory = useMemo(
        () => (nextRace ? buildCircuitHistory(nextRace.Circuit.circuitId, activeBundles, 6, 5) : null),
        [nextRace, activeBundles],
    );

    const currentSeasonDrivers = useMemo(() => {
        const currentBundle = activeBundles.find(bundle => bundle.season === season);
        if (!currentBundle) return null;

        const ids = new Set<string>();
        for (const standing of currentBundle.driverStandings ?? []) {
            if (standing.Driver?.driverId) ids.add(standing.Driver.driverId);
        }
        for (const result of currentBundle.results ?? []) {
            if (result.driverId) ids.add(result.driverId);
        }
        for (const roundEntries of Object.values(currentBundle.roundResults ?? {})) {
            for (const entry of roundEntries) {
                if (entry.Driver?.driverId) ids.add(entry.Driver.driverId);
            }
        }
        return ids.size > 0 ? ids : null;
    }, [activeBundles, season]);

    if (!nextRace || !countdown) {
        return null;
    }

    const resolveDriverProfileSeason = (driverId: string, fallbackSeason: string): string => {
        if (!currentSeasonDrivers || currentSeasonDrivers.has(driverId)) {
            return season;
        }
        return fallbackSeason;
    };

    const sprintWeekend = isSprintWeekend(nextRace);
    const maxLeaderPoints = circuitHistory?.topScorers[0]?.totalPoints ?? 1;
    const historySpanLabel = circuitHistory?.fromYear && circuitHistory?.toYear
        ? circuitHistory.fromYear === circuitHistory.toYear
            ? `${circuitHistory.fromYear}`
            : `${circuitHistory.fromYear}–${circuitHistory.toYear}`
        : `${CIRCUIT_HISTORY_START_YEAR}–${season}`;

    return (
        <section
            aria-label="Next Grand Prix Countdown and Circuit History"
            data-testid="next-race-countdown"
            className="mb-6 border border-[var(--border-color)] bg-[var(--bg-panel)] overflow-hidden"
        >
            {/* Top Racing Accent Strip */}
            <div className="h-1 w-full bg-[var(--accent-red)]" />

            {/* Hero Countdown Row with Waving Host Country Flag */}
            <div className="relative isolate overflow-hidden p-5 md:p-7 bg-[var(--bg-panel)] border-b border-[var(--border-color)]">
                <PodiumFlagBackdrop
                    key={nextRace.Circuit.Location.country}
                    country={nextRace.Circuit.Location.country}
                />

                <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
                    {/* Left: Next GP Identity (site-native red left border telemetry style) */}
                    <div className="min-w-0 border-l-4 border-[var(--accent-red)] pl-4 md:pl-5">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-oxanium text-[10px] font-bold uppercase tracking-[0.2em]">
                            <span className="text-[var(--accent-red)]">
                                {countdown.isLive ? 'LIGHTS OUT • LIVE' : 'NEXT GRAND PRIX'}
                            </span>
                            <span className="text-[var(--text-muted)]">/</span>
                            <span className="text-[var(--text-secondary)]">
                                ROUND {nextRace.round.padStart(2, '0')}
                            </span>
                            {sprintWeekend && (
                                <>
                                    <span className="text-[var(--text-muted)]">/</span>
                                    <span className="text-[var(--accent-yellow)]">
                                        SPRINT WEEKEND
                                    </span>
                                </>
                            )}
                        </div>

                        <h2 className="mt-1.5 font-display text-3xl sm:text-4xl md:text-5xl text-white uppercase tracking-tight leading-none truncate">
                            {nextRace.raceName}
                        </h2>

                        <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 font-oxanium text-xs text-[var(--text-secondary)] uppercase tracking-wide">
                            <CountryFlag country={nextRace.Circuit.Location.country} size="sm" />
                            <span className="inline-flex items-center gap-1 text-white/90">
                                <MapPin size={12} className="text-[var(--accent-red)]" />
                                {nextRace.Circuit.circuitName}
                            </span>
                            <span className="text-[var(--text-muted)]">•</span>
                            <span className="text-[var(--text-muted)]">
                                {nextRace.Circuit.Location.locality}, {nextRace.Circuit.Location.country}
                            </span>
                        </div>
                    </div>

                    {/* Right: Borderless Timing-Tower Countdown Readout */}
                    <div className="flex flex-col items-start lg:items-end gap-2.5 shrink-0">
                        {countdown.isLive ? (
                            <div className="flex items-center gap-3 border-l-2 border-[var(--accent-red)] pl-3 py-1">
                                <Flag size={20} className="text-[var(--accent-red)] animate-pulse" />
                                <div>
                                    <div className="font-display text-2xl text-white uppercase leading-none">
                                        RACE IN PROGRESS
                                    </div>
                                    <div className="mt-1 font-oxanium text-[10px] uppercase tracking-widest text-[var(--text-secondary)]">
                                        Ratings unlock once classification finishes
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div
                                className="flex items-baseline gap-2.5 sm:gap-3.5"
                                data-testid="countdown-digits"
                            >
                                {[
                                    { label: 'DAYS', value: padTwo(countdown.days), isSec: false },
                                    { label: 'HRS', value: padTwo(countdown.hours), isSec: false },
                                    { label: 'MIN', value: padTwo(countdown.minutes), isSec: false },
                                    { label: 'SEC', value: padTwo(countdown.seconds), isSec: true },
                                ].map((unit, idx) => (
                                    <Fragment key={unit.label}>
                                        {idx > 0 && (
                                            <span
                                                aria-hidden="true"
                                                className="font-oxanium text-2xl sm:text-3xl font-light text-[var(--text-muted)]/50 leading-none self-start pt-0.5"
                                            >
                                                :
                                            </span>
                                        )}
                                        <div className="min-w-[44px] sm:min-w-[52px] text-center">
                                            <div className={`font-oxanium text-3xl sm:text-4xl md:text-5xl font-bold tabular-nums leading-none ${
                                                unit.isSec ? 'text-[var(--text-secondary)]' : 'text-white'
                                            }`}>
                                                {unit.value}
                                            </div>
                                            <div className="mt-1.5 font-oxanium text-[9px] uppercase tracking-[0.2em] text-[var(--text-muted)]">
                                                {unit.label}
                                            </div>
                                        </div>
                                    </Fragment>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Weekend Session Timetable (Local Time, borderless hairline strip) */}
            {sessions.length > 0 && (
                <div className="bg-[var(--bg-darker)] border-b border-[var(--border-color)]">
                    <div className="px-4 py-2 md:px-6 flex items-center justify-between gap-2 border-b border-[var(--border-color)]/60">
                        <span className="font-oxanium text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--text-muted)]">
                            WEEKEND SCHEDULE
                        </span>
                        <span className="font-oxanium text-[9px] uppercase tracking-wider text-[var(--text-muted)]">
                            {timezoneLabel}
                        </span>
                    </div>
                    <div
                        className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 divide-y sm:divide-y-0 lg:divide-x divide-[var(--border-color)]/60"
                        data-testid="weekend-sessions-grid"
                    >
                        {sessions.map((session) => {
                            const formatted = formatLocalSessionTime(session);
                            const isHighlighted = session.status === 'live' || session.status === 'next';
                            const isCompleted = session.status === 'completed';

                            return (
                                <div
                                    key={session.key}
                                    className={`relative px-4 py-3 md:px-5 transition-colors ${
                                        isCompleted ? 'opacity-50' : ''
                                    }`}
                                >
                                    {isHighlighted && (
                                        <div
                                            className={`absolute inset-x-0 top-0 h-0.5 ${
                                                session.status === 'live' ? 'bg-[var(--accent-red)]' : 'bg-[var(--accent-yellow)]'
                                            }`}
                                        />
                                    )}
                                    <div className="flex items-center justify-between gap-2">
                                        <span className={`font-display text-xs uppercase tracking-wider ${
                                            isHighlighted ? 'text-white' : 'text-[var(--text-secondary)]'
                                        }`}>
                                            {session.label}
                                        </span>
                                        {session.status === 'live' && (
                                            <span className="font-oxanium text-[9px] font-bold uppercase tracking-widest text-[var(--accent-red)]">
                                                LIVE
                                            </span>
                                        )}
                                        {session.status === 'next' && (
                                            <span className="font-oxanium text-[9px] font-bold uppercase tracking-widest text-[var(--accent-yellow)]">
                                                NEXT
                                            </span>
                                        )}
                                        {isCompleted && (
                                            <span className="font-oxanium text-[9px] uppercase tracking-widest text-[var(--text-muted)]">
                                                DONE
                                            </span>
                                        )}
                                    </div>
                                    <div className="mt-1.5 flex items-baseline justify-between gap-2 font-oxanium">
                                        <span className="text-[10px] uppercase text-[var(--text-muted)]">
                                            {formatted.dayLabel}
                                        </span>
                                        <span className={`text-sm font-bold tabular-nums ${
                                            session.status === 'live'
                                                ? 'text-[var(--accent-red)]'
                                                : session.status === 'next'
                                                    ? 'text-[var(--accent-yellow)]'
                                                    : 'text-white'
                                        }`}>
                                            {formatted.timeLabel}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Circuit History: Previous Winners + Top Points Scorers */}
            <div className="p-4 md:px-6 md:py-4 bg-[var(--bg-panel)]" data-testid="circuit-history-section">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                        <History size={14} className="text-[var(--accent-red)]" />
                        <h3 className="font-display text-sm md:text-base text-white uppercase tracking-wider">
                            CIRCUIT HISTORY • {historySpanLabel}
                        </h3>
                    </div>
                    {historyReady && circuitHistory && circuitHistory.totalRaces > 0 && (
                        <span className="font-oxanium text-[10px] uppercase tracking-widest text-[var(--text-muted)]">
                            {circuitHistory.totalRaces} GRANDS PRIX ANALYZED
                        </span>
                    )}
                </div>

                {!historyReady ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="h-24 border border-[var(--border-color)] bg-[var(--bg-darker)] animate-pulse" />
                        <div className="h-24 border border-[var(--border-color)] bg-[var(--bg-darker)] animate-pulse" />
                    </div>
                ) : !circuitHistory || circuitHistory.totalRaces === 0 ? (
                    <div className="border border-dashed border-[var(--border-color)] bg-[var(--bg-darker)] px-4 py-3 font-oxanium text-xs uppercase tracking-wider text-[var(--text-muted)]">
                        DEBUT CIRCUIT • NO {CIRCUIT_HISTORY_START_YEAR}–PRESENT RACE HISTORY YET
                    </div>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {/* Left Column: Previous Winners */}
                        <div className="border border-[var(--border-color)] bg-[var(--bg-darker)] p-3">
                            <div className="mb-2.5 flex items-center gap-2 border-b border-[var(--border-color)] pb-2">
                                <Crown size={13} className="text-[var(--accent-yellow)]" />
                                <span className="font-oxanium text-[10px] font-bold uppercase tracking-widest text-white">
                                    PREVIOUS WINNERS
                                </span>
                            </div>
                            <div className="divide-y divide-white/[0.05]">
                                {circuitHistory.winners.map((winner) => {
                                    const teamColor = getTeamColor(winner.constructorId);
                                    const targetSeason = resolveDriverProfileSeason(winner.driverId, winner.season);
                                    return (
                                        <div
                                            key={`${winner.season}-${winner.round}`}
                                            className="flex items-center justify-between gap-2 py-2 first:pt-0 last:pb-0"
                                        >
                                            <div className="flex items-center gap-2.5 min-w-0">
                                                <span className="w-10 shrink-0 font-oxanium text-xs font-bold tabular-nums text-[var(--accent-yellow)]">
                                                    {winner.season}
                                                </span>
                                                <span className="h-4 w-1 shrink-0" style={{ backgroundColor: teamColor }} />
                                                <div className="min-w-0">
                                                    <DriverProfileLink
                                                        season={targetSeason}
                                                        driverId={winner.driverId}
                                                        title={`View ${winner.driverName} (${targetSeason}) profile`}
                                                        className="block truncate font-display text-sm uppercase text-white hover:text-[var(--accent-yellow)] transition-colors leading-tight"
                                                    >
                                                        {winner.driverName}
                                                    </DriverProfileLink>
                                                    <span className="block truncate font-oxanium text-[9px] uppercase text-[var(--text-muted)]">
                                                        {winner.constructorName}
                                                    </span>
                                                </div>
                                            </div>
                                            {winner.gridPosition !== null && winner.gridPosition > 0 && (
                                                <span className="shrink-0 font-oxanium text-[9px] uppercase tracking-wider px-1.5 py-0.5 border border-[var(--border-color)] bg-[var(--bg-panel)] text-[var(--text-secondary)]">
                                                    FROM P{winner.gridPosition}
                                                </span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Right Column: Top Points Scorers at Circuit */}
                        <div className="border border-[var(--border-color)] bg-[var(--bg-darker)] p-3">
                            <div className="mb-2.5 flex items-center justify-between gap-2 border-b border-[var(--border-color)] pb-2">
                                <div className="flex items-center gap-2">
                                    <Trophy size={13} className="text-[var(--accent-red)]" />
                                    <span className="font-oxanium text-[10px] font-bold uppercase tracking-widest text-white">
                                        TOP POINTS AT CIRCUIT
                                    </span>
                                </div>
                                <span className="font-oxanium text-[9px] uppercase text-[var(--text-muted)]">
                                    GP + SPRINT
                                </span>
                            </div>
                            <div className="space-y-2.5">
                                {circuitHistory.topScorers.map((scorer, idx) => {
                                    const teamColor = getTeamColor(scorer.latestConstructorId);
                                    const pct = maxLeaderPoints > 0
                                        ? Math.max(8, Math.round((scorer.totalPoints / maxLeaderPoints) * 100))
                                        : 0;
                                    return (
                                        <div key={scorer.driverId} className="space-y-1">
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <span className="w-4 shrink-0 font-oxanium text-[10px] text-[var(--text-muted)]">
                                                        {idx + 1}.
                                                    </span>
                                                    <span className="h-3.5 w-1 shrink-0" style={{ backgroundColor: teamColor }} />
                                                    <DriverProfileLink
                                                        season={resolveDriverProfileSeason(scorer.driverId, scorer.latestSeason)}
                                                        driverId={scorer.driverId}
                                                        title={`View ${scorer.driverName} profile`}
                                                        className="truncate font-display text-sm uppercase text-white hover:text-[var(--accent-yellow)] transition-colors"
                                                    >
                                                        {scorer.driverName}
                                                    </DriverProfileLink>
                                                </div>
                                                <div className="flex items-baseline gap-2 shrink-0 font-oxanium">
                                                    <span className="hidden sm:inline text-[9px] uppercase text-[var(--text-muted)]">
                                                        {scorer.wins > 0 ? `${scorer.wins}W · ` : ''}{scorer.podiums} POD
                                                    </span>
                                                    <span className="text-xs font-bold tabular-nums text-[var(--accent-yellow)]">
                                                        {formatPointsTotal(scorer.totalPoints)} PTS
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="h-1 w-full bg-[var(--bg-panel)] overflow-hidden">
                                                <div
                                                    className="h-full transition-all duration-300"
                                                    style={{ width: `${pct}%`, backgroundColor: teamColor }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </section>
    );
}

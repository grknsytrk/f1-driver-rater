import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
    Activity,
    Award,
    Crown,
    Flame,
    Loader2,
    Radar,
    Rocket,
    TrendingDown,
    TrendingUp,
} from 'lucide-react';
import { TEAM_COLORS } from '../types';
import { getAllSeasonResults, type SeasonRaceResult } from '../api/f1Api';
import { useCommunityRatings } from '../hooks/useCommunityRatings';
import { buildCommunitySeasonAwards, type SeasonAward, type SeasonAwardId } from '../utils/seasonAwards';

interface SeasonAwardsPageProps {
    season: string;
}

interface AwardConfig {
    label: string;
    eyebrow: string;
    description: string;
    telemetryNote: string;
    accentColor: string;
    Icon: typeof Award;
}

const AWARD_CONFIG: Record<SeasonAwardId, AwardConfig> = {
    season_mvp: {
        label: 'Season MVP',
        eyebrow: 'Top overall average',
        description: 'Highest season average across drivers with at least three community-rated races.',
        telemetryNote: 'Built from race-by-race community averages across the season.',
        accentColor: '#F4C542',
        Icon: Crown,
    },
    consistency_king: {
        label: 'Consistency King',
        eyebrow: 'Lowest variance',
        description: 'Most stable race-by-race community average across at least four races.',
        telemetryNote: 'Rewards the smoothest community rating curve across the season.',
        accentColor: '#C6CCD5',
        Icon: Radar,
    },
    peak_performance: {
        label: 'Peak Performance',
        eyebrow: 'Best single race',
        description: 'Highest single-race community average of the season.',
        telemetryNote: 'Captures the strongest community-rated race of the season.',
        accentColor: '#FF7A00',
        Icon: Flame,
    },
    form_surge: {
        label: 'Form Surge',
        eyebrow: 'Strongest climb',
        description: 'Biggest rise from the first community-rated race to the latest.',
        telemetryNote: 'Compares each driver’s latest community average with their season start.',
        accentColor: '#00D084',
        Icon: TrendingUp,
    },
    toughest_slide: {
        label: 'Toughest Slide',
        eyebrow: 'Sharpest drop',
        description: 'Biggest drop from the first community-rated race to the latest.',
        telemetryNote: 'Tracks the steepest fall in community averages across the season.',
        accentColor: '#FF4D4F',
        Icon: TrendingDown,
    },
    hot_start: {
        label: 'Hot Start',
        eyebrow: 'Opening three',
        description: 'Best average across each driver’s first three community-rated races.',
        telemetryNote: 'Looks at each driver’s first three races with community ratings.',
        accentColor: '#FF6B35',
        Icon: Rocket,
    },
    strong_finish: {
        label: 'Strong Finish',
        eyebrow: 'Closing three',
        description: 'Best average across each driver’s latest three community-rated races.',
        telemetryNote: 'Looks at each driver’s latest three races with community ratings.',
        accentColor: '#38BDF8',
        Icon: Activity,
    },
    garage_boss: {
        label: 'Garage Boss',
        eyebrow: 'Teammate domination',
        description: 'Largest average gap over a teammate across at least three shared community-rated races.',
        telemetryNote: 'Built from direct same-team comparisons using community averages.',
        accentColor: '#A855F7',
        Icon: Award,
    },
    best_team_pairing: {
        label: 'Best Team Pairing',
        eyebrow: 'Strongest duo',
        description: 'Highest combined average for the two most community-rated drivers at a team.',
        telemetryNote: 'Team stints follow the constructor listed in each race result.',
        accentColor: '#00D084',
        Icon: Crown,
    },
    most_balanced_lineup: {
        label: 'Most Balanced Lineup',
        eyebrow: 'Closest duo',
        description: 'Smallest average gap between a team’s two most community-rated drivers.',
        telemetryNote: 'Rewards teams whose leading pair stayed close in community ratings.',
        accentColor: '#F97316',
        Icon: Radar,
    },
    late_season_charge: {
        label: 'Late Season Charge',
        eyebrow: 'Closing team run',
        description: 'Best team average across the latest three completed races.',
        telemetryNote: 'Measures team averages in the final three completed race rounds.',
        accentColor: '#22D3EE',
        Icon: TrendingUp,
    },
};

function splitDriverName(driverName: string) {
    const parts = driverName.trim().split(/\s+/);

    if (parts.length <= 1) {
        return { firstLine: driverName, secondLine: '' };
    }

    return {
        firstLine: parts[0],
        secondLine: parts.slice(1).join(' '),
    };
}

function getTeamColor(constructorId: string) {
    return TEAM_COLORS[constructorId] || '#888888';
}

function HeroStat({
    label,
    value,
    accentColor,
}: {
    label: string;
    value: string;
    accentColor: string;
}) {
    return (
        <div className="border border-[var(--border-color)] bg-[var(--bg-panel)] p-4 relative overflow-hidden">
            <div className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: accentColor }} />
            <div className="font-oxanium text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">
                {label}
            </div>
            <div className="mt-3 font-display text-3xl text-white uppercase leading-none md:text-5xl">
                {value}
            </div>
        </div>
    );
}

function AwardSection({ award, index }: { award: SeasonAward; index: number }) {
    const config = AWARD_CONFIG[award.id];
    const reverseLayout = index % 2 === 1;
    const winner = award.winner;
    const winnerName = winner ? splitDriverName(winner.subjectName) : null;

    return (
        <motion.section
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.25 }}
            transition={{ duration: 0.45, ease: 'easeOut', delay: index * 0.04 }}
            className="py-8 md:py-16"
        >
            <div className="grid gap-6 2xl:grid-cols-12 2xl:items-end 2xl:gap-10">
                <div className={`space-y-4 2xl:col-span-4 ${reverseLayout ? '2xl:order-2' : ''}`}>
                    <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center border border-[var(--border-color)] bg-[var(--bg-panel)]" style={{ color: config.accentColor }}>
                            <config.Icon size={18} />
                        </div>
                        <div>
                            <div className="font-oxanium text-[10px] uppercase tracking-[0.24em]" style={{ color: config.accentColor }}>
                                {config.eyebrow}
                            </div>
                            <div className="font-display text-2xl leading-[0.92] text-white uppercase tracking-tight md:text-4xl">
                                {config.label}
                            </div>
                        </div>
                    </div>

                    <p className="max-w-md font-ui text-sm leading-relaxed text-[var(--text-secondary)] md:text-base">
                        {config.description}
                    </p>

                    <div className="font-oxanium text-[10px] uppercase tracking-[0.22em] text-[var(--text-muted)]">
                        Award {String(index + 1).padStart(2, '0')}
                    </div>
                </div>

                <div className={`2xl:col-span-8 ${reverseLayout ? '2xl:order-1' : ''}`}>
                    <div className="relative overflow-hidden border border-[var(--border-color)] bg-[var(--bg-panel)]">
                        <div
                            className="absolute inset-0 opacity-[0.06] pointer-events-none"
                            style={{ backgroundImage: 'linear-gradient(var(--border-color) 1px, transparent 1px), linear-gradient(90deg, var(--border-color) 1px, transparent 1px)', backgroundSize: '24px 24px' }}
                        />
                        <div className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: config.accentColor }} />

                        {winner ? (
                            <div className="relative grid gap-6 p-6 md:p-8 2xl:grid-cols-[minmax(0,1.9fr)_minmax(200px,0.28fr)]">
                                <div className="min-w-0">
                                    <div className="relative min-w-0">
                                        <div className="min-w-0">
                                            <div className="font-oxanium text-[10px] uppercase tracking-[0.22em]" style={{ color: config.accentColor }}>
                                                Community Leader
                                            </div>
                                            <div className="mt-3 flex min-w-0 items-center gap-3">
                                                <div className="h-12 w-1.5 flex-shrink-0" style={{ backgroundColor: getTeamColor(winner.constructorId) }} />
                                                <div className="min-w-0">
                                                    <div className="font-display text-[1.8rem] leading-[0.86] text-white uppercase tracking-tight md:text-[2.6rem] xl:text-[3rem] 2xl:text-[3.35rem]">
                                                        <div>{winnerName?.firstLine}</div>
                                                        {winnerName?.secondLine && <div>{winnerName.secondLine}</div>}
                                                    </div>
                                                    <div className="mt-2 font-oxanium text-xs uppercase tracking-[0.2em] text-[var(--text-secondary)]">
                                                        {winner.secondaryLabel}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="mt-8 grid gap-3 sm:grid-cols-2">
                                        <div className="border border-[var(--border-color)] bg-[var(--bg-darker)] p-4">
                                            <div className="font-oxanium text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">
                                                Metric
                                            </div>
                                            <div className="mt-3 font-display text-xl leading-[0.92] text-white uppercase md:text-3xl">
                                                {winner.metricDisplay}
                                            </div>
                                        </div>
                                        <div className="border border-[var(--border-color)] bg-[var(--bg-darker)] p-4">
                                            <div className="font-oxanium text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">
                                                Context
                                            </div>
                                            <div className="mt-3 font-display text-lg leading-[0.92] text-white uppercase md:text-2xl">
                                                {winner.detail}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex flex-col justify-between gap-4 border border-[var(--border-color)] bg-[var(--bg-darker)] p-5 2xl:max-w-[220px] 2xl:justify-self-end">
                                    <div>
                                        <div className="font-oxanium text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">
                                            Telemetry Note
                                        </div>
                                        <div className="mt-3 font-display text-lg text-white uppercase leading-[1.02] md:text-2xl">
                                            {config.telemetryNote}
                                        </div>
                                    </div>

                                    <div className="font-oxanium text-[10px] uppercase tracking-[0.22em]" style={{ color: config.accentColor }}>
                                        Community season awards
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="relative p-6 md:p-8">
                                <div className="border border-dashed border-[var(--border-color)] bg-[var(--bg-darker)] p-6 md:p-8">
                                    <div className="font-oxanium text-[10px] uppercase tracking-[0.22em]" style={{ color: config.accentColor }}>
                                        Awaiting community data
                                    </div>
                                    <div className="mt-3 font-display text-2xl text-white uppercase leading-tight md:text-4xl">
                                        Not enough community race ratings yet for {config.label.toUpperCase()}.
                                    </div>
                                    <p className="mt-4 max-w-2xl font-ui text-sm leading-relaxed text-[var(--text-secondary)] md:text-base">
                                        This award appears when its community rating and race thresholds are met.
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </motion.section>
    );
}

function AwardsStatus({ title, description }: { title: string; description: string }) {
    return (
        <div className="flex min-h-[60vh] items-center justify-center px-4 py-10">
            <motion.div
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full max-w-3xl border border-[var(--border-color)] border-t-2 border-t-[var(--accent-red)] bg-[var(--bg-panel)] p-6 md:p-10"
                role="status"
            >
                <div className="font-oxanium text-xs uppercase tracking-[0.26em] text-[var(--accent-red)]">
                    Season Awards
                </div>
                <h1 className="mt-4 font-display text-4xl leading-none text-white uppercase tracking-tight md:text-6xl">
                    {title}
                </h1>
                <p className="mt-5 max-w-2xl font-ui text-sm leading-relaxed text-[var(--text-secondary)] md:text-lg">
                    {description}
                </p>
            </motion.div>
        </div>
    );
}

function AwardsLoading() {
    return (
        <div className="flex min-h-[60vh] items-center justify-center">
            <div className="flex flex-col items-center gap-4 border border-[var(--border-color)] bg-[var(--bg-panel)] px-8 py-10" role="status">
                <Loader2 size={28} className="animate-spin text-[var(--accent-red)]" />
                <div className="font-oxanium text-xs uppercase tracking-[0.25em] text-[var(--text-muted)]">
                    Loading community awards
                </div>
            </div>
        </div>
    );
}

export function SeasonAwardsPage({ season }: SeasonAwardsPageProps) {
    const community = useCommunityRatings('race', season);
    const [resultsState, setResultsState] = useState<{
        season: string;
        status: 'loading' | 'ready' | 'unavailable';
        results: SeasonRaceResult[];
    }>({ season: '', status: 'loading', results: [] });

    useEffect(() => {
        let active = true;
        void getAllSeasonResults(season, { throwOnError: true })
            .then(results => {
                if (active) setResultsState({ season, status: 'ready', results });
            })
            .catch(() => {
                if (active) setResultsState({ season, status: 'unavailable', results: [] });
            });
        return () => { active = false; };
    }, [season]);

    const raceResults = useMemo(
        () => resultsState.season === season ? resultsState.results : [],
        [resultsState, season]
    );
    const awardsSummary = useMemo(
        () => buildCommunitySeasonAwards(season, raceResults, community.ratings),
        [season, raceResults, community.ratings]
    );

    if (community.status === 'loading') return <AwardsLoading />;

    if (community.status === 'disabled') {
        return (
            <AwardsStatus
                title="Community ratings unavailable"
                description="Season Awards are calculated from community race ratings, which are not configured for this site right now. Personal ratings are not used as a substitute."
            />
        );
    }

    if (community.status === 'unavailable') {
        return (
            <AwardsStatus
                title="Community ratings could not load"
                description="The community rating service could not be reached. Season Awards will appear when race-by-race community ratings are available."
            />
        );
    }

    if (resultsState.season !== season || resultsState.status === 'loading') return <AwardsLoading />;

    if (resultsState.status === 'unavailable') {
        return (
            <AwardsStatus
                title="Race data unavailable"
                description="The season race results could not be loaded, so community ratings cannot be matched to their race and team context."
            />
        );
    }

    if (awardsSummary.ratedRaceCount === 0) {
        return (
            <AwardsStatus
                title="Waiting for community ratings"
                description={awardsSummary.completedRaceCount > 0
                    ? 'No community race ratings are available for completed ' + season + ' races yet. The awards board will appear when at least one race rating can be matched to its race result.'
                    : 'The ' + season + ' community awards will appear after a race is completed and race-by-race community ratings are available.'}
            />
        );
    }

    const readyAwardsCount = awardsSummary.awards.filter(award => award.status === 'ready').length;

    return (
        <div className="min-h-screen py-6 md:py-10">
            <div className="mx-auto max-w-6xl space-y-8 md:space-y-14">
                <motion.section
                    initial={{ opacity: 0, y: 24 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="relative overflow-hidden border border-[var(--border-color)] bg-[var(--bg-panel)] p-6 md:p-10"
                >
                    <div className="absolute inset-0 opacity-[0.05] pointer-events-none"
                        style={{ backgroundImage: 'linear-gradient(var(--border-color) 1px, transparent 1px), linear-gradient(90deg, var(--border-color) 1px, transparent 1px)', backgroundSize: '28px 28px' }}
                    />
                    <div className="relative">
                        <div className="inline-flex items-center gap-3 border-x border-[var(--accent-red)] px-4 py-1">
                            <span className="font-oxanium text-xs uppercase tracking-[0.28em] text-[var(--accent-red)]">
                                Season Awards
                            </span>
                        </div>

                        <div className="mt-6 max-w-4xl">
                            <h1 className="font-display text-5xl leading-none text-white uppercase tracking-tight md:text-8xl">
                                {season} Wrapped
                            </h1>
                            <p className="mt-4 max-w-2xl font-ui text-sm leading-relaxed text-[var(--text-secondary)] md:text-lg">
                                The community awards board is generated from race-by-race community averages. Every race with at least one valid community rating contributes equally to season averages.
                            </p>
                        </div>

                        <div className="mt-8 grid gap-4 md:grid-cols-3">
                            <HeroStat label="Community-rated races" value={awardsSummary.ratedRaceCount + '/' + awardsSummary.completedRaceCount} accentColor="#E10600" />
                            <HeroStat label="Drivers rated by community" value={String(awardsSummary.driverCount)} accentColor="#F4C542" />
                            <HeroStat label="Awards ready" value={String(readyAwardsCount)} accentColor="#38BDF8" />
                        </div>
                    </div>
                </motion.section>

                {awardsSummary.awards.map((award, index) => (
                    <AwardSection key={award.id} award={award} index={index} />
                ))}
            </div>
        </div>
    );
}

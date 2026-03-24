import { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
    Activity,
    Award,
    Crown,
    Flame,
    Loader2,
    Lock,
    Radar,
    Rocket,
    TrendingDown,
    TrendingUp,
} from 'lucide-react';
import { TEAM_COLORS } from '../types';
import { useSeasonProgress } from '../hooks/useSeasonProgress';
import { getSeasonAwards, type SeasonAward, type SeasonAwardId } from '../utils/storage';

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
        description: 'Highest season average across drivers with at least three rated races.',
        telemetryNote: 'Built from the strongest season-long average in your completed race log.',
        accentColor: '#F4C542',
        Icon: Crown,
    },
    consistency_king: {
        label: 'Consistency King',
        eyebrow: 'Lowest variance',
        description: 'Most stable race-by-race output across at least four rated races.',
        telemetryNote: 'Rewards the smoothest rating curve once enough races are on the board.',
        accentColor: '#C6CCD5',
        Icon: Radar,
    },
    peak_performance: {
        label: 'Peak Performance',
        eyebrow: 'Best single race',
        description: 'Highest one-race score you handed out all season.',
        telemetryNote: 'Captures the single most explosive rating spike in your season data.',
        accentColor: '#FF7A00',
        Icon: Flame,
    },
    form_surge: {
        label: 'Form Surge',
        eyebrow: 'Strongest climb',
        description: 'Biggest improvement from first rated race to latest rated race.',
        telemetryNote: 'Compares each driver’s latest form against where their season started.',
        accentColor: '#00D084',
        Icon: TrendingUp,
    },
    toughest_slide: {
        label: 'Toughest Slide',
        eyebrow: 'Sharpest drop',
        description: 'Biggest regression from first rated race to latest rated race.',
        telemetryNote: 'Tracks the steepest drop-off between the opening and latest rated runs.',
        accentColor: '#FF4D4F',
        Icon: TrendingDown,
    },
    hot_start: {
        label: 'Hot Start',
        eyebrow: 'Opening three',
        description: 'Best average across the first three races you rated for that driver.',
        telemetryNote: 'Looks only at the opening three rated appearances for each driver.',
        accentColor: '#FF6B35',
        Icon: Rocket,
    },
    strong_finish: {
        label: 'Strong Finish',
        eyebrow: 'Closing three',
        description: 'Best average across the latest three races you rated for that driver.',
        telemetryNote: 'Looks only at the latest three rated appearances for each driver.',
        accentColor: '#38BDF8',
        Icon: Activity,
    },
    garage_boss: {
        label: 'Garage Boss',
        eyebrow: 'Teammate domination',
        description: 'Largest sustained average gap over a teammate across shared rated races.',
        telemetryNote: 'Built from direct same-team duels in your own race log.',
        accentColor: '#A855F7',
        Icon: Award,
    },
    best_team_pairing: {
        label: 'Best Team Pairing',
        eyebrow: 'Strongest duo',
        description: 'Highest combined two-driver level for a team’s main pairing.',
        telemetryNote: 'Uses each team’s primary two-driver pairing from your rated season data.',
        accentColor: '#00D084',
        Icon: Crown,
    },
    most_balanced_lineup: {
        label: 'Most Balanced Lineup',
        eyebrow: 'Closest duo',
        description: 'Smallest gap between a team’s top two rated drivers.',
        telemetryNote: 'Rewards garages where both sides of the lineup stayed nearly level.',
        accentColor: '#F97316',
        Icon: Radar,
    },
    late_season_charge: {
        label: 'Late Season Charge',
        eyebrow: 'Closing team run',
        description: 'Best team average across the latest three completed races.',
        telemetryNote: 'Measures which garage peaked hardest in the closing stretch.',
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
                            <div className="relative grid gap-6 p-6 md:p-8 2xl:grid-cols-[minmax(0,1.65fr)_minmax(220px,0.35fr)]">
                                <div className="min-w-0">
                                    <div className="relative min-w-0 pr-16 md:pr-24">
                                        <div className="min-w-0">
                                            <div className="font-oxanium text-[10px] uppercase tracking-[0.22em]" style={{ color: config.accentColor }}>
                                                Winner Locked
                                            </div>
                                            <div className="mt-3 flex min-w-0 items-center gap-3">
                                                <div className="h-12 w-1.5 flex-shrink-0" style={{ backgroundColor: getTeamColor(winner.constructorId) }} />
                                                <div className="min-w-0">
                                                    <div className="font-display text-[1.95rem] leading-[0.86] text-white uppercase tracking-tight md:text-[3.1rem] 2xl:text-[3.8rem]">
                                                        <div>{winnerName?.firstLine}</div>
                                                        {winnerName?.secondLine && <div>{winnerName.secondLine}</div>}
                                                    </div>
                                                    <div className="mt-2 font-oxanium text-xs uppercase tracking-[0.2em] text-[var(--text-secondary)]">
                                                        {winner.secondaryLabel}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div
                                            className="pointer-events-none absolute right-0 top-0 hidden select-none font-display text-7xl leading-none md:block"
                                            style={{ color: config.accentColor, opacity: 0.15 }}
                                        >
                                            {String(index + 1).padStart(2, '0')}
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

                                <div className="flex flex-col justify-between gap-4 border border-[var(--border-color)] bg-[var(--bg-darker)] p-5 2xl:max-w-[260px] 2xl:justify-self-end">
                                    <div>
                                        <div className="font-oxanium text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">
                                            Telemetry Note
                                        </div>
                                        <div className="mt-3 font-display text-lg text-white uppercase leading-[1.02] md:text-2xl">
                                            {config.telemetryNote}
                                        </div>
                                    </div>

                                    <div className="font-oxanium text-[10px] uppercase tracking-[0.22em]" style={{ color: config.accentColor }}>
                                        Personal season awards
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="relative p-6 md:p-8">
                                <div className="border border-dashed border-[var(--border-color)] bg-[var(--bg-darker)] p-6 md:p-8">
                                    <div className="font-oxanium text-[10px] uppercase tracking-[0.22em]" style={{ color: config.accentColor }}>
                                        Awaiting more telemetry
                                    </div>
                                    <div className="mt-3 font-display text-2xl text-white uppercase leading-tight md:text-4xl">
                                        Not enough race-by-race data yet for {config.label.toUpperCase()}.
                                    </div>
                                    <p className="mt-4 max-w-2xl font-ui text-sm leading-relaxed text-[var(--text-secondary)] md:text-base">
                                        Keep rating completed races. This award unlocks automatically once enough races are in your personal data set.
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

export function SeasonAwardsPage({ season }: SeasonAwardsPageProps) {
    const { progress, loading } = useSeasonProgress(season);
    const awardsSummary = useMemo(() => getSeasonAwards(season), [season]);

    if (!progress || loading) {
        return (
            <div className="flex min-h-[60vh] items-center justify-center">
                <div className="flex flex-col items-center gap-4 border border-[var(--border-color)] bg-[var(--bg-panel)] px-8 py-10">
                    <Loader2 size={28} className="animate-spin text-[var(--accent-red)]" />
                    <div className="font-oxanium text-xs uppercase tracking-[0.25em] text-[var(--text-muted)]">
                        Loading season awards
                    </div>
                </div>
            </div>
        );
    }

    const readyAwardsCount = awardsSummary.awards.filter((award) => award.status === 'ready').length;

    if (!progress.unlocked) {
        return (
            <div className="min-h-[70vh] py-8 md:py-12">
                <motion.div
                    initial={{ opacity: 0, y: 24 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mx-auto max-w-5xl space-y-8"
                >
                    <div className="space-y-4 border-l-4 border-[var(--accent-red)] pl-4 md:pl-6">
                        <div className="font-oxanium text-xs uppercase tracking-[0.26em] text-[var(--accent-red)]">
                            Season Awards
                        </div>
                        <h2 className="font-display text-4xl leading-none text-white uppercase tracking-tight md:text-7xl">
                            {season} Wrapped
                        </h2>
                        <p className="max-w-2xl font-ui text-sm leading-relaxed text-[var(--text-secondary)] md:text-lg">
                            This page unlocks when every completed race in the {season} calendar has been rated by you.
                        </p>
                    </div>

                    <div className="overflow-hidden border border-[var(--border-color)] bg-[var(--bg-panel)]">
                        <div className="grid gap-0 lg:grid-cols-[1.1fr_0.9fr]">
                            <div className="border-b border-[var(--border-color)] p-6 md:p-8 lg:border-b-0 lg:border-r">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-12 w-12 items-center justify-center border border-[var(--border-color)] bg-[var(--bg-darker)] text-[var(--accent-yellow)]">
                                        <Lock size={20} />
                                    </div>
                                    <div>
                                        <div className="font-oxanium text-[10px] uppercase tracking-[0.22em] text-[var(--accent-yellow)]">
                                            Locked telemetry
                                        </div>
                                        <div className="font-display text-2xl text-white uppercase md:text-4xl">
                                            Finish the grid
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-8 space-y-4">
                                    <div className="flex items-end justify-between gap-4">
                                        <div>
                                            <div className="font-oxanium text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">
                                                Completed races rated
                                            </div>
                                            <div className="mt-2 font-display text-5xl text-white uppercase leading-none md:text-7xl">
                                                {progress.ratedCount}/{progress.completedCount}
                                            </div>
                                        </div>
                                        <div className="font-oxanium text-[10px] uppercase tracking-[0.2em] text-[var(--text-secondary)]">
                                            {progress.remainingCount} remaining
                                        </div>
                                    </div>

                                    <div className="h-2 w-full bg-[var(--bg-darker)]">
                                        <motion.div
                                            initial={{ width: 0 }}
                                            animate={{ width: `${progress.progressPercent}%` }}
                                            transition={{ duration: 0.6, ease: 'easeOut' }}
                                            className="h-full bg-[var(--accent-red)]"
                                        />
                                    </div>

                                    <p className="font-ui text-sm leading-relaxed text-[var(--text-secondary)] md:text-base">
                                        {progress.hasCompletedRaces
                                            ? `Rate the remaining completed races to unlock all seven personal season awards.`
                                            : `No races from the ${season} calendar have been completed yet, so awards telemetry is still waiting for the season to start.`}
                                    </p>
                                </div>
                            </div>

                            <div className="bg-[var(--bg-darker)] p-6 md:p-8">
                                <div className="font-oxanium text-[10px] uppercase tracking-[0.22em] text-[var(--text-muted)]">
                                    Preview
                                </div>
                                <div className="mt-4 space-y-3">
                                    {Object.values(AWARD_CONFIG).map((award, index) => (
                                        <div key={award.label} className="flex items-center justify-between border border-[var(--border-color)] bg-[var(--bg-panel)] px-4 py-3">
                                            <div className="flex items-center gap-3">
                                                <award.Icon size={16} style={{ color: award.accentColor }} />
                                                <span className="font-display text-lg text-white uppercase tracking-tight">
                                                    {award.label}
                                                </span>
                                            </div>
                                            <span className="font-oxanium text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">
                                                {String(index + 1).padStart(2, '0')}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </motion.div>
            </div>
        );
    }

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
                                Every completed race in the {season} calendar is logged. Here is the personal season awards board generated from your own race-by-race driver ratings.
                            </p>
                        </div>

                        <div className="mt-8 grid gap-4 md:grid-cols-3">
                            <HeroStat label="Completed race log" value={`${progress.ratedCount}/${progress.completedCount}`} accentColor="#E10600" />
                            <HeroStat label="Drivers tracked" value={String(awardsSummary.driverCount)} accentColor="#F4C542" />
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

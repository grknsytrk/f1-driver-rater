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
    TrendingUp,
} from 'lucide-react';
import { TEAM_COLORS } from '../types';
import {
    getAllSeasonQualifying,
    getAllSeasonResults,
    type SeasonQualifyingResult,
    type SeasonRaceResult,
} from '../api/f1Api';
import { useCommunityRatingDistributions, useCommunityRatings } from '../hooks/useCommunityRatings';
import {
    buildSeasonAwards,
    type SeasonAward,
    type SeasonAwardGroup,
    type SeasonAwardId,
} from '../utils/seasonAwards';

interface SeasonAwardsPageProps {
    season: string;
}

interface AwardConfig {
    label: string;
    eyebrow: string;
    description: string;
    source: string;
    metric: string;
    direction: string;
    accentColor: string;
    Icon: typeof Award;
}

type Availability = 'loading' | 'ready' | 'disabled' | 'unavailable';

const AWARD_CONFIG: Record<SeasonAwardId, AwardConfig> = {
    season_mvp: {
        label: 'Community MVP',
        eyebrow: 'Top season average',
        description: 'The strongest season-long community rating across at least three rated Grand Prix races.',
        source: 'Community race averages',
        metric: 'Average of each rated Grand Prix average; every race has equal weight.',
        direction: 'Higher wins; ties share the award.',
        accentColor: '#F4C542',
        Icon: Crown,
    },
    consistency_king: {
        label: 'Most Consistent',
        eyebrow: 'Smallest rating variation',
        description: 'The least variation in community ratings among drivers whose season average is at or above the driver median.',
        source: 'Community race averages',
        metric: 'Population standard deviation of race averages; at least three rated races.',
        direction: 'Lower wins; ties share the award.',
        accentColor: '#C6CCD5',
        Icon: Radar,
    },
    peak_performance: {
        label: 'Peak Performance',
        eyebrow: 'Best single race',
        description: 'The highest community average for one Grand Prix; tied ratings go to the driver with the largest average gap over other rated drivers in that race.',
        source: 'Community race averages',
        metric: 'Single Grand Prix average rating; tie-break: average rating gap over the other rated drivers in that race.',
        direction: 'Higher wins; if both metrics tie, one driver is selected by name order.',
        accentColor: '#FF7A00',
        Icon: Flame,
    },
    most_improved: {
        label: 'Most Improved',
        eyebrow: 'Strongest rating rise',
        description: 'Compares a driver’s first three rated races with their last three rated races.',
        source: 'Community race averages',
        metric: 'Final three rated-race average minus first three; at least six rated races.',
        direction: 'Largest positive change wins; ties share the award.',
        accentColor: '#00D084',
        Icon: TrendingUp,
    },
    most_polarizing: {
        label: 'Most Polarizing',
        eyebrow: 'Lowest community agreement',
        description: 'Shows where community ratings diverged most. Low agreement does not mean a low driver rating.',
        source: 'Community rating distributions',
        metric: 'Season agreement score, averaged equally across assessed Grand Prix races.',
        direction: 'Lower agreement wins; ties share the award.',
        accentColor: '#A855F7',
        Icon: Activity,
    },
    garage_boss: {
        label: 'Garage Boss',
        eyebrow: 'Teammate rating advantage',
        description: 'The driver with the largest positive average rating gap over their teammate in the same Grand Prix.',
        source: 'Community race averages + official team lineups',
        metric: 'Mean signed same-race rating difference; at least three shared rated races with each team stint.',
        direction: 'Higher positive gap wins; ties share the award.',
        accentColor: '#A855F7',
        Icon: Award,
    },
    most_balanced_lineup: {
        label: 'Most Balanced Lineup',
        eyebrow: 'Closest teammate ratings',
        description: 'The closest-rated real teammate pairing among pairs whose average community rating is at or above the pair median.',
        source: 'Community race averages + official team lineups',
        metric: 'Mean absolute same-race rating gap; at least three shared rated races.',
        direction: 'Lower gap wins; ties share the award.',
        accentColor: '#F97316',
        Icon: Radar,
    },
    best_team_pairing: {
        label: 'Best Team Pairing',
        eyebrow: 'Top-ten teammates, closest gaps',
        description: 'Both real teammates must qualify and finish in the top 10 at the same Grand Prix. The closest pair across qualifying and race times leads.',
        source: 'Official Grand Prix results + qualifying times',
        metric: 'Mean of the teammates’ race-time gap and qualifying best-lap gap across Grand Prix weekends where both finish and qualify in the top 10.',
        direction: 'Lower combined time gap wins; exact ties share the award.',
        accentColor: '#00D084',
        Icon: Crown,
    },
    longest_points_streak: {
        label: 'Longest Points Streak',
        eyebrow: 'Consecutive scoring races',
        description: 'The longest run of Grand Prix races in which the driver scored at least one point.',
        source: 'Official Grand Prix results',
        metric: 'Consecutive completed-round results with more than zero points; a zero or missing result resets the run.',
        direction: 'More consecutive races wins; ties share the award.',
        accentColor: '#38BDF8',
        Icon: Rocket,
    },
    race_comeback: {
        label: 'Race Comeback',
        eyebrow: 'Average places gained',
        description: 'Rewards drivers who make up the most positions between their official starting grid slot and classified finish.',
        source: 'Official Grand Prix results',
        metric: 'Average grid position minus finish position; at least half of completed Grand Prix races must have a valid grid slot and classified finish.',
        direction: 'Higher positive gain wins; ties share the award.',
        accentColor: '#00D084',
        Icon: Rocket,
    },
    late_season_team_form: {
        label: 'Late Season Team Form',
        eyebrow: 'Closing third of the season',
        description: 'The strongest constructor across the final third of completed Grand Prix races.',
        source: 'Official Grand Prix points',
        metric: 'Average team points per race; both drivers’ points are summed for each Grand Prix.',
        direction: 'Higher average wins; ties share the award.',
        accentColor: '#22D3EE',
        Icon: TrendingUp,
    },
};

const GROUP_CONFIG: Record<SeasonAwardGroup, { title: string; description: string }> = {
    community: {
        title: 'Community Opinion',
        description: 'Awards based on race-by-race community ratings and their distribution.',
    },
    track: {
        title: 'On-Track Performance',
        description: 'Awards based on official Grand Prix race results and qualifying times.',
    },
};

function splitDriverName(driverName: string) {
    const parts = driverName.trim().split(/\s+/);
    if (parts.length <= 1) return { firstLine: driverName, secondLine: '' };
    return { firstLine: parts[0], secondLine: parts.slice(1).join(' ') };
}

function getTeamColor(constructorId: string) {
    return TEAM_COLORS[constructorId] || '#888888';
}

function HeroStat({ label, value, accentColor }: { label: string; value: string; accentColor: string }) {
    return (
        <div className="relative overflow-hidden border border-[var(--border-color)] bg-[var(--bg-panel)] p-4">
            <div className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: accentColor }} />
            <div className="font-oxanium text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">{label}</div>
            <div className="mt-3 font-display text-3xl uppercase leading-none text-white md:text-5xl">{value}</div>
        </div>
    );
}

function AwardSection({
    award,
    index,
    availability,
}: {
    award: SeasonAward;
    index: number;
    availability: Availability;
}) {
    const config = AWARD_CONFIG[award.id];
    const emptyMessage = availability === 'loading'
        ? 'Loading this award’s data.'
        : availability === 'disabled'
            ? 'Community rating data is not configured for this site.'
            : availability === 'unavailable'
                ? 'The required data source could not be reached.'
                : award.status === 'no-positive-movement'
                    ? award.id === 'race_comeback'
                        ? 'No eligible driver averaged a positive gain from grid to finish this season.'
                        : 'There was no positive change between the first and final three rated races this season.'
                    : 'There is not enough eligible data for this award yet.';

    return (
        <motion.section
            initial={{ opacity: 0, y: 32 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.4, ease: 'easeOut', delay: Math.min(index, 5) * 0.035 }}
            className="grid gap-5 py-7 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-8"
        >
            <div className="space-y-3">
                <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center border border-[var(--border-color)] bg-[var(--bg-panel)]" style={{ color: config.accentColor }}>
                        <config.Icon size={18} />
                    </div>
                    <div>
                        <div className="font-oxanium text-[10px] uppercase tracking-[0.24em]" style={{ color: config.accentColor }}>
                            {config.eyebrow}
                        </div>
                        <h3 className="font-display text-2xl uppercase leading-[0.92] tracking-tight text-white md:text-4xl">
                            {config.label}
                        </h3>
                    </div>
                </div>
                <p className="max-w-xl font-ui text-sm leading-relaxed text-[var(--text-secondary)] md:text-base">
                    {config.description}
                </p>
                <div className="font-oxanium text-[10px] uppercase tracking-[0.22em] text-[var(--text-muted)]">
                    Award {String(index + 1).padStart(2, '0')}
                </div>
            </div>

            <div className="relative overflow-hidden border border-[var(--border-color)] bg-[var(--bg-panel)]">
                <div className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: config.accentColor }} />
                <div className="relative grid gap-5 p-5 md:p-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(220px,0.75fr)]">
                    <div className="min-w-0">
                        {award.winners.length ? (
                            <div className="space-y-4">
                                {award.winners.map((winner, winnerIndex) => {
                                    const name = splitDriverName(winner.subjectName);
                                    return (
                                        <div key={`${winner.constructorId}:${winner.driverId ?? winnerIndex}:${winnerIndex}`}
                                            className="border border-[var(--border-color)] bg-[var(--bg-darker)] p-4 md:p-5">
                                            <div className="flex items-start gap-3">
                                                <div className="mt-1 h-10 w-1.5 flex-shrink-0" style={{ backgroundColor: getTeamColor(winner.constructorId) }} />
                                                <div className="min-w-0">
                                                    <div className="font-oxanium text-[10px] uppercase tracking-[0.2em]" style={{ color: config.accentColor }}>
                                                        {winner.subjectType === 'team' ? 'Winning team' : 'Winning driver'}
                                                    </div>
                                                    <div className="mt-2 font-display text-3xl uppercase leading-[0.88] tracking-tight text-white md:text-4xl">
                                                        {winner.subjectType === 'driver' ? <><span className="block">{name.firstLine}</span>{name.secondLine && <span className="block">{name.secondLine}</span>}</> : winner.subjectName}
                                                    </div>
                                                    <div className="mt-2 font-oxanium text-xs uppercase tracking-[0.16em] text-[var(--text-secondary)]">
                                                        {winner.secondaryLabel}
                                                    </div>
                                                    <div className="mt-4 inline-flex border border-[var(--border-color)] px-3 py-2 font-display text-xl uppercase text-white md:text-2xl">
                                                        {winner.metricDisplay}
                                                    </div>
                                                    <p className="mt-3 font-ui text-xs leading-relaxed text-[var(--text-secondary)] md:text-sm">
                                                        {winner.detail}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="flex min-h-36 items-center border border-dashed border-[var(--border-color)] bg-[var(--bg-darker)] p-5 md:p-7">
                                <div>
                                    <div className="font-oxanium text-[10px] uppercase tracking-[0.22em]" style={{ color: config.accentColor }}>
                                        {availability === 'loading' ? 'Loading award data' : 'No award winner yet'}
                                    </div>
                                    <p className="mt-3 font-display text-xl uppercase leading-tight text-white md:text-2xl">
                                        {emptyMessage}
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="grid content-start gap-3 sm:grid-cols-3 xl:grid-cols-1">
                        <div className="border border-[var(--border-color)] bg-[var(--bg-darker)] p-4">
                            <div className="font-oxanium text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">Data source</div>
                            <div className="mt-2 font-ui text-sm leading-relaxed text-white">{config.source}</div>
                        </div>
                        <div className="border border-[var(--border-color)] bg-[var(--bg-darker)] p-4">
                            <div className="font-oxanium text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">Metric</div>
                            <div className="mt-2 font-ui text-sm leading-relaxed text-white">{config.metric}</div>
                        </div>
                        <div className="border border-[var(--border-color)] bg-[var(--bg-darker)] p-4">
                            <div className="font-oxanium text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">Winner rule</div>
                            <div className="mt-2 font-ui text-sm leading-relaxed text-white">{config.direction}</div>
                        </div>
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
                <div className="font-oxanium text-xs uppercase tracking-[0.26em] text-[var(--accent-red)]">Season Awards</div>
                <h1 className="mt-4 font-display text-4xl uppercase leading-none tracking-tight text-white md:text-6xl">{title}</h1>
                <p className="mt-5 max-w-2xl font-ui text-sm leading-relaxed text-[var(--text-secondary)] md:text-lg">{description}</p>
            </motion.div>
        </div>
    );
}

function AwardsLoading() {
    return (
        <div className="flex min-h-[60vh] items-center justify-center">
            <div className="flex flex-col items-center gap-4 border border-[var(--border-color)] bg-[var(--bg-panel)] px-8 py-10" role="status">
                <Loader2 size={28} className="animate-spin text-[var(--accent-red)]" />
                <div className="font-oxanium text-xs uppercase tracking-[0.25em] text-[var(--text-muted)]">Loading Grand Prix data</div>
            </div>
        </div>
    );
}

export function SeasonAwardsPage({ season }: SeasonAwardsPageProps) {
    const community = useCommunityRatings('race', season);
    const distributions = useCommunityRatingDistributions('race', season);
    const [raceState, setRaceState] = useState<{
        season: string;
        status: Availability;
        results: SeasonRaceResult[];
    }>({ season: '', status: 'loading', results: [] });
    const [qualifyingState, setQualifyingState] = useState<{
        season: string;
        status: Availability;
        results: SeasonQualifyingResult[];
    }>({ season: '', status: 'loading', results: [] });

    useEffect(() => {
        let active = true;
        void Promise.allSettled([
            getAllSeasonResults(season, { throwOnError: true }),
            getAllSeasonQualifying(season, { throwOnError: true }),
        ]).then(([raceResult, qualifyingResult]) => {
            if (!active) return;
            if (raceResult.status === 'fulfilled') {
                setRaceState({ season, status: 'ready', results: raceResult.value });
            } else {
                setRaceState({ season, status: 'unavailable', results: [] });
            }
            if (qualifyingResult.status === 'fulfilled') {
                setQualifyingState({ season, status: 'ready', results: qualifyingResult.value });
            } else {
                setQualifyingState({ season, status: 'unavailable', results: [] });
            }
        });
        return () => { active = false; };
    }, [season]);

    const raceResults = useMemo(
        () => raceState.season === season ? raceState.results : [],
        [raceState, season],
    );
    const qualifyingResults = useMemo(
        () => qualifyingState.season === season ? qualifyingState.results : [],
        [qualifyingState, season],
    );
    const awardsSummary = useMemo(
        () => buildSeasonAwards(season, raceResults, community.ratings, distributions.distributions, qualifyingResults),
        [season, raceResults, community.ratings, distributions.distributions, qualifyingResults],
    );

    if (raceState.season !== season || raceState.status === 'loading') return <AwardsLoading />;
    if (raceState.status === 'unavailable') {
        return (
            <AwardsStatus
                title="Race data unavailable"
                description="Official Grand Prix results could not be loaded, so season awards cannot be matched to drivers and team lineups."
            />
        );
    }

    const availabilityFor = (award: SeasonAward): Availability => {
        if (award.id === 'best_team_pairing') {
            return qualifyingState.season === season ? qualifyingState.status : 'loading';
        }
        if (award.group === 'track') return 'ready';
        if (award.id === 'most_polarizing') return distributions.status === 'idle' ? 'loading' : distributions.status;
        return community.status;
    };
    const readyAwardsCount = awardsSummary.awards.filter((award) =>
        award.status === 'ready' && availabilityFor(award) === 'ready').length;

    return (
        <div className="min-h-screen py-6 md:py-10">
            <div className="mx-auto max-w-6xl space-y-8 md:space-y-12">
                <motion.section
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="relative overflow-hidden border border-[var(--border-color)] bg-[var(--bg-panel)] p-6 md:p-10"
                >
                    <div className="pointer-events-none absolute inset-0 opacity-[0.05]"
                        style={{ backgroundImage: 'linear-gradient(var(--border-color) 1px, transparent 1px), linear-gradient(90deg, var(--border-color) 1px, transparent 1px)', backgroundSize: '28px 28px' }} />
                    <div className="relative">
                        <div className="inline-flex items-center gap-3 border-x border-[var(--accent-red)] px-4 py-1">
                            <span className="font-oxanium text-xs uppercase tracking-[0.28em] text-[var(--accent-red)]">Season Awards</span>
                        </div>
                        <div className="mt-6 max-w-4xl">
                            <h1 className="font-display text-5xl uppercase leading-none tracking-tight text-white md:text-8xl">{season} Wrapped</h1>
                            <p className="mt-4 max-w-2xl font-ui text-sm leading-relaxed text-[var(--text-secondary)] md:text-lg">
                                Community opinion and official Grand Prix performance are shown separately. Each award uses a clear metric, and exact ties can have multiple winners.
                            </p>
                        </div>
                        <div className="mt-8 grid gap-4 md:grid-cols-3">
                            <HeroStat label="Community-rated GPs" value={`${awardsSummary.ratedRaceCount}/${awardsSummary.completedRaceCount}`} accentColor="#E10600" />
                            <HeroStat label="Drivers rated" value={String(awardsSummary.driverCount)} accentColor="#F4C542" />
                            <HeroStat label="Awards ready" value={String(readyAwardsCount)} accentColor="#38BDF8" />
                        </div>
                    </div>
                </motion.section>

                {(['community', 'track'] as const).map(group => {
                    const groupAwards = awardsSummary.awards.filter(award => award.group === group);
                    return (
                        <section key={group} aria-labelledby={`awards-${group}`}>
                            <div className="mb-2 border-b border-[var(--border-color)] pb-4">
                                <h2 id={`awards-${group}`} className="font-display text-3xl uppercase leading-none tracking-tight text-white md:text-5xl">
                                    {GROUP_CONFIG[group].title}
                                </h2>
                                <p className="mt-2 font-ui text-sm text-[var(--text-secondary)]">{GROUP_CONFIG[group].description}</p>
                            </div>
                            {groupAwards.map((award, index) => (
                                <AwardSection
                                    key={award.id}
                                    award={award}
                                    index={index}
                                    availability={availabilityFor(award)}
                                />
                            ))}
                        </section>
                    );
                })}
            </div>
        </div>
    );
}

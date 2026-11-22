import { useState, useRef, useEffect, useMemo, startTransition } from 'react';
import { m, AnimatePresence } from 'framer-motion';
import { Trophy, BarChart3, RotateCcw, ImageDown, AlertTriangle, Upload, FileJson, ChevronsUp, Link2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LineChart, CartesianGrid, ReferenceLine } from 'recharts';
import { toast } from 'sonner';
import { Tooltip as ShadcnTooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { getTeamColor } from '../types';
import { calculateAverages, clearSeasonRatings, getDriverFormSeries, getRatedRacesCount, getRaceByRaceMatrix, getCountryCode, downloadRatingsAsJson, importRatings, type DriverRow, type RaceColumn } from '../utils/storage';
import { getRaces, getSeasonDrivers, getDriverStandings, getConstructorStandings, isRaceCompleted, type DriverStanding, type ConstructorStanding } from '../api/f1Api';
import { useCommunityRatings, useRatingStorage } from '../hooks/useCommunityRatings';
import { useSitePolicyConsent } from '../hooks/useSitePolicyConsent';
import { CommunityNotice } from './CommunityRating';
import { CommunityRatingRows } from './CommunityRatingRows';
import { compareCommunity } from '../utils/communityRatings';
import { buildFormChartData, reconcileFormDriverSelection, toggleFormDriverSelection, type FormChartPoint } from '../utils/formTracker';
import { getSeasonRatings, getQuickRatings } from '../utils/storage';
import { validRatings } from '../utils/ratingData';
import { buildDriverLineDashes } from '../utils/standings';
import { FormTrackerLines } from './FormTrackerLines';
import { FormLineSwatch } from './FormLineSwatch';
import {
    buildCommunityBreakdown,
    buildCommunityFormSeries,
    buildCommunitySeasonAverages,
    getDriverLabel,
    type BreakdownDriverIdentity,
    type BreakdownSource,
} from '../utils/raceBreakdown';
import { PodiumFlagBackdrop } from './PodiumFlagBackdrop';
import { DriverProfileLink } from './DriverProfileLink';
import { ResultsBreakdownTable } from './results/ResultsBreakdownTable';
import { ResultsShareCard } from './results/ResultsShareCard';
import { OverperformanceScatter } from './results/OverperformanceScatter';
import { createShareSnapshot } from '../utils/shareSnapshot';

interface ResultsDashboardProps {
    season: string;
    onReset: () => void;
    onSelectDriver?: (driverId: string) => void;
}

type DriverRatingsSortKey = 'myAverage' | 'communityAverage' | 'votes';
interface BreakdownCalendar {
    season: string;
    races: RaceColumn[];
}
interface SeasonDriverMetadata {
    season: string;
    drivers: Array<BreakdownDriverIdentity & { nationality?: string }>;
}
interface SeasonStandingsState {
    season: string;
    driverStandings: DriverStanding[];
    constructorStandings: ConstructorStanding[];
}

function formatRaceDisplayName(raceName: string | null): string {
    if (!raceName) return 'N/A';
    return raceName.replace(' Grand Prix', '').replace(' GP', '');
}

interface ShareLinkToolbarButtonProps {
    disabled: boolean;
    onCreateShareLink: () => Promise<void>;
}

/** Isolated Share Link toolbar button so loading state transitions never re-render dashboard charts. */
function ShareLinkToolbarButton({ disabled, onCreateShareLink }: ShareLinkToolbarButtonProps) {
    const [isLinking, setIsLinking] = useState(false);

    async function handleClick() {
        if (disabled || isLinking) return;
        setIsLinking(true);
        try {
            await onCreateShareLink();
        } finally {
            setIsLinking(false);
        }
    }

    return (
        <ShadcnTooltip>
            <TooltipTrigger asChild>
                <button
                    aria-label="Create a shareable interactive link for your season rankings"
                    onClick={() => void handleClick()}
                    disabled={disabled || isLinking}
                    className="group flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 px-2.5 py-1.5 bg-[var(--bg-panel)] border border-[var(--border-color)] hover:border-[#00FF88] transition-all hover:bg-[var(--bg-panel-hover)] disabled:opacity-50"
                >
                    <Link2 size={14} className="shrink-0 text-[var(--text-muted)] group-hover:text-[#00FF88]" />
                    <span className="font-ui font-bold text-[10px] xl:text-[11px] text-white uppercase tracking-wider hidden md:inline">
                        {isLinking ? 'LINKING...' : 'SHARE LINK'}
                    </span>
                </button>
            </TooltipTrigger>
            <TooltipContent
                side="bottom"
                sideOffset={8}
                className="bg-[var(--bg-darker)] text-white border border-[var(--border-color)]"
            >
                Copy an interactive read-only link with live social preview image
            </TooltipContent>
        </ShadcnTooltip>
    );
}

function rankBreakdownDrivers<T extends DriverRow>(drivers: T[], minimumRatedRaces: number): T[] {
    return [...drivers].sort((a, b) => {
        const aRatedRaces = Object.keys(a.raceRatings).length;
        const bRatedRaces = Object.keys(b.raceRatings).length;
        const aQualified = aRatedRaces >= minimumRatedRaces;
        const bQualified = bRatedRaces >= minimumRatedRaces;

        if (aQualified !== bQualified) return aQualified ? -1 : 1;
        if (b.totalAverage !== a.totalAverage) return b.totalAverage - a.totalAverage;
        return bRatedRaces - aRatedRaces;
    });
}

export function ResultsDashboard({ season, onReset, onSelectDriver }: ResultsDashboardProps) {
    const storageSnapshot = useRatingStorage();
    const policyConsent = useSitePolicyConsent();
    const {
        averages,
        personalRaces,
        source,
        hasLegacy,
        ratedCount,
        minimumRatedRaces,
        rankedAverages,
        raceMatrix,
        rankedRaceMatrixDrivers,
        rankedFormSeries,
    } = useMemo(() => {
        void storageSnapshot;
        const nextAverages = calculateAverages(season);
        const nextPersonalRaces = getSeasonRatings(season);
        const nextPersonalQuickRatings = getQuickRatings(season) ?? [];
        const hasPersonalRaceRatings = Boolean(
            nextPersonalRaces?.races.some(race => race.completed && validRatings(race.ratings).length),
        );
        const hasPersonalQuickRatings = nextPersonalQuickRatings.length > 0;
        const nextSource: 'race' | 'quick' = hasPersonalRaceRatings || !hasPersonalQuickRatings ? 'race' : 'quick';
        const nextHasLegacy = (nextSource === 'race'
            ? nextPersonalRaces?.races.flatMap(race => validRatings(race.ratings)) ?? []
            : nextPersonalQuickRatings).some(rating => !rating.communityEligible);

        const nextRatedCount = getRatedRacesCount(season);
        const nextMinimumRatedRaces = nextRatedCount > 0 ? Math.ceil(nextRatedCount * 0.5) : 0;
        const nextRankedAverages = [...nextAverages].sort((a, b) => {
            const aQualified = a.totalRaces >= nextMinimumRatedRaces;
            const bQualified = b.totalRaces >= nextMinimumRatedRaces;

            if (aQualified !== bQualified) {
                return aQualified ? -1 : 1;
            }

            return b.averageRating - a.averageRating;
        });
        const nextRaceMatrix = getRaceByRaceMatrix(season);
        const nextRankedRaceMatrixDrivers = rankBreakdownDrivers(nextRaceMatrix.drivers, nextMinimumRatedRaces);
        const formSeries = getDriverFormSeries(season);
        const nextRankedFormSeries = [...formSeries].sort((a, b) => {
            const aQualified = a.totalRatedRaces >= nextMinimumRatedRaces;
            const bQualified = b.totalRatedRaces >= nextMinimumRatedRaces;

            if (aQualified !== bQualified) {
                return aQualified ? -1 : 1;
            }

            if (b.seasonAverage !== a.seasonAverage) {
                return b.seasonAverage - a.seasonAverage;
            }

            return b.totalRatedRaces - a.totalRatedRaces;
        });

        return {
            averages: nextAverages,
            personalRaces: nextPersonalRaces,
            source: nextSource,
            hasLegacy: nextHasLegacy,
            ratedCount: nextRatedCount,
            minimumRatedRaces: nextMinimumRatedRaces,
            rankedAverages: nextRankedAverages,
            raceMatrix: nextRaceMatrix,
            rankedRaceMatrixDrivers: nextRankedRaceMatrixDrivers,
            rankedFormSeries: nextRankedFormSeries,
        };
    }, [season, storageSnapshot]);

    const community = useCommunityRatings(source, season);
    const communityVisible = community.status !== 'disabled' && community.status !== 'unavailable';
    const [showCardSection, setShowCardSection] = useState(false);
    const [showScrollTop, setShowScrollTop] = useState(false);
    const [cardImage, setCardImage] = useState<string | null>(null);
    const [generating, setGenerating] = useState(false);
    const [generatingTable, setGeneratingTable] = useState(false);
    const [shareLinkUrl, setShareLinkUrl] = useState<string | null>(null);
    const [userSelectedMode, setUserSelectedMode] = useState<BreakdownSource | null>(null);
    const [userSelectedBreakdownSource, setUserSelectedBreakdownSource] = useState<BreakdownSource | null>(null);
    const [breakdownCalendar, setBreakdownCalendar] = useState<BreakdownCalendar | null>(null);
    const [seasonDriverMetadata, setSeasonDriverMetadata] = useState<SeasonDriverMetadata | null>(null);
    const [standingsState, setStandingsState] = useState<SeasonStandingsState | null>(null);
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [selectedFormDriverIds, setSelectedFormDriverIds] = useState<string[]>(() =>
        rankedFormSeries[0] ? [rankedFormSeries[0].driverId] : [],
    );
    const [driverRatingsSort, setDriverRatingsSort] = useState<DriverRatingsSortKey | null>(null);
    const cardRef = useRef<HTMLDivElement>(null);
    const shareSectionRef = useRef<HTMLDivElement>(null);
    const tableRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const isScrollingToTop = useRef(false);
    const creatingShareLinkRef = useRef(false);

    const activeMode: BreakdownSource = userSelectedMode ?? (averages.length > 0 ? 'personal' : 'community');
    const breakdownSource: BreakdownSource = userSelectedBreakdownSource ?? activeMode;

    const completedCalendarRaces = useMemo(
        () => (breakdownCalendar?.season === season ? breakdownCalendar.races : []),
        [breakdownCalendar, season],
    );
    const seasonDriverIdentities = useMemo(
        () => (seasonDriverMetadata?.season === season ? seasonDriverMetadata.drivers : []),
        [seasonDriverMetadata, season],
    );
    const communityBreakdown = useMemo(
        () => buildCommunityBreakdown(
            raceMatrix.races,
            raceMatrix.drivers,
            community.ratings,
            completedCalendarRaces,
            seasonDriverIdentities,
        ),
        [raceMatrix.races, raceMatrix.drivers, community.ratings, completedCalendarRaces, seasonDriverIdentities],
    );
    const breakdownRaces = communityBreakdown.races;
    const votedCommunityRaces = useMemo(
        () => breakdownRaces.filter(race =>
            communityBreakdown.drivers.some(driver => driver.raceRatings[race.round] !== undefined)).length,
        [breakdownRaces, communityBreakdown.drivers],
    );
    const rankedCommunityBreakdownDrivers = useMemo(
        () => rankBreakdownDrivers(communityBreakdown.drivers, Math.ceil(votedCommunityRaces * 0.5)),
        [communityBreakdown.drivers, votedCommunityRaces],
    );
    const communityRankedAverages = useMemo(
        () => buildCommunitySeasonAverages(
            communityBreakdown.drivers,
            votedCommunityRaces,
            source === 'quick' ? community.ratings : [],
            seasonDriverIdentities,
        ),
        [communityBreakdown.drivers, votedCommunityRaces, source, community.ratings, seasonDriverIdentities],
    );
    const activeRankedAverages = activeMode === 'community' ? communityRankedAverages : rankedAverages;
    const communityFormSeries = useMemo(
        () => buildCommunityFormSeries(communityBreakdown.drivers, breakdownRaces),
        [communityBreakdown.drivers, breakdownRaces],
    );
    const activeRankedFormSeries = activeMode === 'community' ? communityFormSeries : rankedFormSeries;

    const breakdownDrivers: (DriverRow & { voteCounts?: Record<string, number> })[] = breakdownSource === 'community'
        ? rankedCommunityBreakdownDrivers : rankedRaceMatrixDrivers;
    const showCommunityBreakdownStatus = breakdownSource === 'community'
        && (community.status !== 'ready' || breakdownRaces.length === 0);
    const canDownloadBreakdown = breakdownSource === 'personal'
        || (community.status === 'ready' && breakdownRaces.length > 0);
    const formSeriesKey = useMemo(
        () => activeRankedFormSeries
            .map(series => `${series.driverId}:${series.latestConstructorId}:${series.totalRatedRaces}`)
            .join('|'),
        [activeRankedFormSeries],
    );
    const personalAverageByDriverId = useMemo(
        () => new Map(rankedAverages.map(driver => [driver.driverId, driver.averageRating])),
        [rankedAverages],
    );
    const baseDriversForTable = activeMode === 'community' ? communityRankedAverages : rankedAverages;
    const driverRatingRows = useMemo(
        () => baseDriversForTable.map(driver => ({
            driver,
            comparison: compareCommunity(
                { ...driver, averageRating: personalAverageByDriverId.get(driver.driverId) ?? 0 },
                personalRaces,
                community.ratings,
                source,
                'season',
            ),
        })),
        [baseDriversForTable, personalAverageByDriverId, personalRaces, community.ratings, source],
    );
    const activeMinimumRatedRaces = activeMode === 'community'
        ? (votedCommunityRaces > 0 ? Math.ceil(votedCommunityRaces * 0.5) : 0)
        : minimumRatedRaces;
    const sortedDriverRatingRows = useMemo(() => [...driverRatingRows].sort((a, b) => {
        if (!driverRatingsSort) return 0;

        if (driverRatingsSort === 'communityAverage' || driverRatingsSort === 'myAverage') {
            const aQualified = a.driver.totalRaces >= activeMinimumRatedRaces;
            const bQualified = b.driver.totalRaces >= activeMinimumRatedRaces;
            if (aQualified !== bQualified) {
                return aQualified ? -1 : 1;
            }
        }

        const getSortValue = (row: typeof driverRatingRows[number]) => {
            switch (driverRatingsSort) {
                case 'communityAverage':
                    return row.comparison.communityAverage ?? Number.NEGATIVE_INFINITY;
                case 'votes':
                    return row.comparison.voteCount;
                case 'myAverage':
                    return row.comparison.myAverage;
            }
        };

        const valueDifference = getSortValue(b) - getSortValue(a);
        if (valueDifference !== 0) return valueDifference;

        return b.comparison.myAverage - a.comparison.myAverage
            || a.driver.driverName.localeCompare(b.driver.driverName);
    }), [driverRatingRows, driverRatingsSort, activeMinimumRatedRaces]);

    function handleModeChange(nextMode: BreakdownSource) {
        setUserSelectedMode(nextMode);
        setUserSelectedBreakdownSource(nextMode);
        setCardImage(null);
        setShareLinkUrl(null);
    }

    useEffect(() => {
        if (source !== 'race') return;
        let active = true;
        getRaces(season).then(calendar => {
            if (!active) return;
            setBreakdownCalendar({
                season,
                races: calendar.filter(race => isRaceCompleted(race.date, race.time)).map(race => ({
                    round: race.round,
                    raceName: race.raceName,
                    countryCode: getCountryCode(race.raceName),
                    date: race.date,
                })),
            });
        }).catch(() => {
            if (active) setBreakdownCalendar({ season, races: [] });
        });
        return () => { active = false; };
    }, [season, source]);

    useEffect(() => {
        if (seasonDriverMetadata?.season === season) return;

        let active = true;
        getSeasonDrivers(season).then(drivers => {
            if (!active) return;
            setSeasonDriverMetadata({
                season,
                drivers: drivers.map(driver => ({
                    driverId: driver.driverId,
                    driverName: `${driver.givenName} ${driver.familyName}`,
                    nationality: driver.nationality,
                    constructorId: driver.constructorId,
                    constructorName: driver.constructorName,
                })),
            });
        }).catch(() => {
            if (active) setSeasonDriverMetadata({ season, drivers: [] });
        });
        return () => { active = false; };
    }, [seasonDriverMetadata?.season, season]);

    useEffect(() => {
        if (standingsState?.season === season) return;

        let active = true;
        void Promise.allSettled([
            getDriverStandings(season),
            getConstructorStandings(season),
        ]).then(([wdcRes, wccRes]) => {
            if (!active) return;
            setStandingsState({
                season,
                driverStandings: wdcRes.status === 'fulfilled' ? wdcRes.value : [],
                constructorStandings: wccRes.status === 'fulfilled' ? wccRes.value : [],
            });
        });

        return () => { active = false; };
    }, [standingsState?.season, season]);

    const seasonDriverStandings = useMemo(
        () => (standingsState?.season === season ? standingsState.driverStandings : []),
        [standingsState, season],
    );
    const seasonConstructorStandings = useMemo(
        () => (standingsState?.season === season ? standingsState.constructorStandings : []),
        [standingsState, season],
    );
    const standingsLoading = standingsState?.season !== season;

    // Track scroll position to show/hide "Top" button
    useEffect(() => {
        const handleScroll = () => {
            const scrolledDistance = window.scrollY;
            const threshold = 500;

            // If we are programmatically scrolling to top, don't show the button
            // untill we reach the top (reset logic handled below)
            if (isScrollingToTop.current) {
                if (scrolledDistance < 50) {
                    isScrollingToTop.current = false;
                }
                return;
            }

            // Show if scrolled down significantly
            setShowScrollTop(scrolledDistance > threshold);
        };

        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    useEffect(() => {
        setSelectedFormDriverIds(current => reconcileFormDriverSelection(
            current,
            activeRankedFormSeries.map(series => series.driverId),
        ));
    }, [season, activeMode, activeRankedFormSeries, formSeriesKey]);

    const visibleFormDrivers = useMemo(
        () => activeRankedFormSeries.filter(series => selectedFormDriverIds.includes(series.driverId)),
        [activeRankedFormSeries, selectedFormDriverIds],
    );

    async function handleGenerateCard() {
        if (!cardRef.current || activeRankedAverages.length === 0) return;

        setShowCardSection(true);
        setGenerating(true);
        setCardImage(null);

        // Small delay to let the section render, then scroll
        await new Promise(resolve => setTimeout(resolve, 100));

        // Smooth scroll to the share section
        shareSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

        // Additional delay for image generation
        await new Promise(resolve => setTimeout(resolve, 100));

        try {
            const { toPng } = await import('html-to-image');
            const dataUrl = await toPng(cardRef.current, {
                cacheBust: true,
                pixelRatio: 2,
                backgroundColor: '#0a0a0b',
            });
            setCardImage(dataUrl);
        } catch (error) {
            console.error('Error generating card:', error);
        } finally {
            setGenerating(false);
        }
    }

    function handleDownloadCard() {
        if (!cardImage) return;
        const link = document.createElement('a');
        link.download = activeMode === 'community'
            ? `f1-community-ratings-${season}.png`
            : `f1-ratings-${season}.png`;
        link.href = cardImage;
        link.click();
    }

    function handleReset() {
        setShowConfirmModal(true);
    }

    function confirmReset() {
        setShowConfirmModal(false);
        // Clear data and navigate away immediately
        clearSeasonRatings(season);
        toast.success('Data Cleared', {
            description: `All ${season} season ratings have been deleted`,
        });
        onReset();
    }

    async function handleDownloadTable() {
        if (!tableRef.current) return;

        setGeneratingTable(true);

        // Store original styles - need to capture full table without scroll
        const tableContainer = tableRef.current;
        const scrollContainer = tableContainer.querySelector('.overflow-x-auto') as HTMLElement;

        // Temporarily remove overflow to capture full table
        const originalOverflow = scrollContainer?.style.overflow;
        const originalMaxWidth = scrollContainer?.style.maxWidth;
        if (scrollContainer) {
            scrollContainer.style.overflow = 'visible';
            scrollContainer.style.maxWidth = 'none';
        }

        try {
            const { toPng } = await import('html-to-image');
            const dataUrl = await toPng(tableRef.current, {
                cacheBust: true,
                pixelRatio: 2,
                backgroundColor: '#0a0a0b',
                width: tableRef.current.scrollWidth,
                height: tableRef.current.scrollHeight,
            });

            const link = document.createElement('a');
            link.download = `f1-race-breakdown-${season}-${breakdownSource}.png`;
            link.href = dataUrl;
            link.click();
        } catch (error) {
            console.error('Error generating table image:', error);
        } finally {
            // Restore original styles
            if (scrollContainer) {
                scrollContainer.style.overflow = originalOverflow || '';
                scrollContainer.style.maxWidth = originalMaxWidth || '';
            }
            setGeneratingTable(false);
        }
    }

    function handleExportJson() {
        downloadRatingsAsJson(season);
        toast.success('Export Complete', {
            description: `${season} season data downloaded as JSON`,
        });
    }

    async function handleCreateShareLink() {
        if (activeRankedAverages.length === 0 || creatingShareLinkRef.current) return;
        creatingShareLinkRef.current = true;
        try {
            const result = await createShareSnapshot({
                season,
                mode: activeMode,
                source,
                ratedRaces: activeMode === 'community' ? votedCommunityRaces : ratedCount,
                drivers: activeRankedAverages.map((driver) => ({
                    driverId: driver.driverId,
                    driverName: driver.driverName,
                    constructorId: driver.constructorId,
                    constructorName: driver.constructorName,
                    averageRating: driver.averageRating,
                    totalRaces: driver.totalRaces,
                })),
            });
            startTransition(() => {
                setShareLinkUrl((prev) => (prev === result.url ? prev : result.url));
            });

            let copiedToClipboard = false;
            if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
                try {
                    await navigator.clipboard.writeText(result.url);
                    copiedToClipboard = true;
                } catch {
                    copiedToClipboard = false;
                }
            }

            if (copiedToClipboard) {
                toast.success('Share link copied to clipboard', {
                    description: `Anyone can view your ${season} ${activeMode} rankings at this link.`,
                });
            } else {
                toast.success('Share link ready', {
                    description: result.url,
                });
            }
        } catch {
            toast.error('Failed to create share link');
        } finally {
            creatingShareLinkRef.current = false;
        }
    }

    function handleImportClick() {
        fileInputRef.current?.click();
    }

    function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const content = event.target?.result as string;
            policyConsent.requestAcceptance(() => {
                const result = importRatings(content);

                if (result.success) {
                    toast.success('Import Successful', {
                        description: result.message,
                    });
                    // Reload page to reflect imported data
                    setTimeout(() => {
                        window.location.reload();
                    }, 1500);
                } else {
                    toast.error('Import Failed', {
                        description: result.message,
                    });
                }
            });
        };
        reader.readAsText(file);

        // Reset input so same file can be imported again
        e.target.value = '';
    }

    // Chart data
    const chartData = useMemo(() => activeRankedAverages.slice(0, 10).map(d => ({
        name: getDriverLabel(d.driverName),
        rating: d.averageRating,
        fullName: d.driverName.toUpperCase(),
        color: getTeamColor(d.constructorId),
        team: d.constructorName.toUpperCase(),
    })), [activeRankedAverages]);

    // Podium (top 3)
    const podium = useMemo(() => activeRankedAverages.slice(0, 3), [activeRankedAverages]);
    const winnerNationality = seasonDriverIdentities.find(driver => driver.driverId === podium[0]?.driverId)?.nationality;
    const podiumOrder = [1, 0, 2]; // Silver, Gold, Bronze positions
    const formChartData = useMemo(() => buildFormChartData(activeRankedFormSeries), [activeRankedFormSeries]);
    const formLineDashes = useMemo(() => buildDriverLineDashes(activeRankedFormSeries.map(driver => ({
        driverId: driver.driverId,
        constructorId: driver.latestConstructorId,
    }))), [activeRankedFormSeries]);
    const showBreakdownSection = raceMatrix.races.length > 0
        || (activeMode === 'community' && breakdownRaces.length > 0);

    return (
        <div className="min-h-screen py-4 md:py-8 px-3 md:px-6">
            <div className="max-w-6xl mx-auto space-y-8 md:space-y-20">

                {/* 1. SECTION: HEADER */}
                <m.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-4 md:space-y-6"
                >
                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                        <div className="flex flex-col items-start border-l-4 border-[var(--accent-red)] pl-4 md:pl-6">
                            <h2 className="font-display text-3xl md:text-7xl text-white uppercase tracking-tight leading-none">
                                {season} <span className="text-[var(--accent-red)]">SEASON</span>
                            </h2>
                            <div className="h-px w-16 md:w-32 bg-[var(--accent-red)] mt-2" />
                        </div>

                        <div
                            role="group"
                            aria-label="Results dashboard rating source"
                            className="inline-flex self-start md:self-auto border border-[var(--border-color)] bg-[var(--bg-darker)] p-1"
                        >
                            <button
                                type="button"
                                aria-pressed={activeMode === 'personal'}
                                onClick={() => handleModeChange('personal')}
                                className={`px-3 md:px-4 py-2 font-ui text-[10px] md:text-xs font-bold uppercase tracking-wider transition-colors ${activeMode === 'personal'
                                    ? 'bg-[var(--accent-red)] text-white'
                                    : 'text-[var(--text-secondary)] hover:text-white'}`}
                            >
                                MY RATINGS
                            </button>
                            <button
                                type="button"
                                aria-pressed={activeMode === 'community'}
                                onClick={() => handleModeChange('community')}
                                className={`px-3 md:px-4 py-2 font-ui text-[10px] md:text-xs font-bold uppercase tracking-wider transition-colors ${activeMode === 'community'
                                    ? 'bg-[var(--accent-yellow)] text-black'
                                    : 'text-[var(--text-secondary)] hover:text-white'}`}
                            >
                                COMMUNITY
                            </button>
                        </div>
                    </div>

                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-[var(--border-color)] pb-4">
                        <p className="font-oxanium text-[var(--accent-red)] tracking-widest text-xs md:text-sm uppercase shrink-0 whitespace-nowrap">
                            {activeMode === 'community' ? (
                                <>
                                    SEASON {season} • COMMUNITY RACES:{' '}
                                    <span className="text-white">{votedCommunityRaces}</span>
                                </>
                            ) : (
                                <>
                                    SEASON {season} • RACES RATED:{' '}
                                    <span className="text-white">{ratedCount}</span>
                                </>
                            )}
                        </p>

                        <div className="grid grid-cols-2 sm:grid-cols-3 md:flex md:items-center gap-1.5 w-full lg:w-auto">
                            <ShadcnTooltip>
                                <TooltipTrigger asChild>
                                    <button
                                        aria-label="Export your season ratings as a JSON backup file"
                                        onClick={handleExportJson}
                                        className="group flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 px-2.5 py-1.5 bg-[var(--bg-panel)] border border-[var(--border-color)] hover:border-[#00FF88] transition-all hover:bg-[var(--bg-panel-hover)]"
                                    >
                                        <FileJson size={14} className="shrink-0 text-[var(--text-muted)] group-hover:text-[#00FF88]" />
                                        <span className="font-ui font-bold text-[10px] xl:text-[11px] text-white uppercase tracking-wider hidden md:inline">EXPORT JSON</span>
                                    </button>
                                </TooltipTrigger>
                                <TooltipContent
                                    side="bottom"
                                    sideOffset={8}
                                    className="bg-[var(--bg-darker)] text-white border border-[var(--border-color)]"
                                >
                                    Download a JSON backup of all your ratings for this season
                                </TooltipContent>
                            </ShadcnTooltip>

                            <ShadcnTooltip>
                                <TooltipTrigger asChild>
                                    <button
                                        aria-label="Import a JSON backup to restore your season ratings"
                                        onClick={handleImportClick}
                                        className="group flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 px-2.5 py-1.5 bg-[var(--bg-panel)] border border-[var(--border-color)] hover:border-[var(--accent-yellow)] transition-all hover:bg-[var(--bg-panel-hover)]"
                                    >
                                        <Upload size={14} className="shrink-0 text-[var(--text-muted)] group-hover:text-[var(--accent-yellow)]" />
                                        <span className="font-ui font-bold text-[10px] xl:text-[11px] text-white uppercase tracking-wider hidden md:inline">IMPORT JSON</span>
                                    </button>
                                </TooltipTrigger>
                                <TooltipContent
                                    side="bottom"
                                    sideOffset={8}
                                    className="bg-[var(--bg-darker)] text-white border border-[var(--border-color)]"
                                >
                                    Import a previously exported JSON file to restore your ratings
                                </TooltipContent>
                            </ShadcnTooltip>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".json"
                                onChange={handleFileChange}
                                className="hidden"
                            />

                            <ShareLinkToolbarButton
                                disabled={activeRankedAverages.length === 0}
                                onCreateShareLink={handleCreateShareLink}
                            />

                            <ShadcnTooltip>
                                <TooltipTrigger asChild>
                                    <button
                                        aria-label="Generate a shareable PNG card from your season ratings"
                                        onClick={handleGenerateCard}
                                        disabled={activeRankedAverages.length === 0}
                                        className="group flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 px-2.5 py-1.5 bg-[var(--bg-panel)] border border-[var(--border-color)] hover:border-white transition-all hover:bg-[var(--bg-panel-hover)] disabled:opacity-50"
                                    >
                                        <ImageDown size={14} className="shrink-0 text-[var(--text-muted)] group-hover:text-white" />
                                        <span className="font-ui font-bold text-[10px] xl:text-[11px] text-white uppercase tracking-wider hidden md:inline">GENERATE CARD</span>
                                    </button>
                                </TooltipTrigger>
                                <TooltipContent
                                    side="bottom"
                                    sideOffset={8}
                                    className="bg-[var(--bg-darker)] text-white border border-[var(--border-color)]"
                                >
                                    Create a shareable PNG card from the active ratings view (opens the Share section)
                                </TooltipContent>
                            </ShadcnTooltip>

                            <ShadcnTooltip>
                                <TooltipTrigger asChild>
                                    <button
                                        aria-label="Clear all season ratings"
                                        onClick={handleReset}
                                        className="group flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 px-2.5 py-1.5 bg-[var(--bg-panel)] border border-[var(--border-color)] hover:border-[var(--accent-red)] transition-all hover:bg-[var(--bg-panel-hover)]"
                                    >
                                        <RotateCcw size={14} className="shrink-0 text-[var(--text-muted)] group-hover:text-[var(--accent-red)]" />
                                        <span className="font-ui font-bold text-[10px] xl:text-[11px] text-white uppercase tracking-wider hidden md:inline">CLEAR ALL</span>
                                    </button>
                                </TooltipTrigger>
                                <TooltipContent
                                    side="bottom"
                                    sideOffset={8}
                                    className="bg-[var(--bg-darker)] text-white border border-[var(--border-color)]"
                                >
                                    Clear all season data
                                </TooltipContent>
                            </ShadcnTooltip>
                        </div>
                    </div>

                </m.div>

                {activeRankedAverages.length === 0 ? (
                    <m.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex flex-col items-center justify-center p-8 md:p-20 border border-[var(--border-color)] bg-[var(--bg-panel)] min-h-[300px] md:min-h-[400px]"
                    >
                        <div className="w-16 h-16 border border-[var(--text-muted)] flex items-center justify-center mb-6 opacity-50">
                            <Trophy size={24} className="text-[var(--text-muted)]" />
                        </div>
                        {activeMode === 'community' ? (
                            <>
                                <h3 className="font-display text-2xl md:text-4xl mb-2 text-white uppercase tracking-wide text-center">
                                    {community.status === 'loading'
                                        ? 'LOADING COMMUNITY RESULTS'
                                        : community.status === 'ready'
                                            ? 'NO COMMUNITY RATINGS YET'
                                            : 'COMMUNITY RATINGS UNAVAILABLE'}
                                </h3>
                                <p className="font-oxanium text-[var(--text-secondary)] uppercase tracking-wider text-xs md:text-sm text-center">
                                    {community.status === 'loading'
                                        ? `Fetching global community ratings for the ${season} season...`
                                        : community.status === 'ready'
                                            ? `No community votes have been recorded for the ${season} season yet`
                                            : 'Community data could not be loaded right now'}
                                </p>
                            </>
                        ) : (
                            <>
                                <h3 className="font-display text-2xl md:text-4xl mb-2 text-white uppercase tracking-wide text-center">NO RATINGS YET</h3>
                                <p className="font-oxanium text-[var(--text-secondary)] uppercase tracking-wider text-xs md:text-sm text-center">
                                    Rate some races to see your results — or switch to Community mode above
                                </p>
                            </>
                        )}
                    </m.div>
                ) : (
                    <>
                        {/* 2. SECTION: PODIUM (TECHNICAL BLOCKS) */}
                        <div className="podium-stage relative isolate pt-4 md:pt-8 pb-8 md:pb-16 overflow-hidden">
                            {winnerNationality && <PodiumFlagBackdrop key={winnerNationality} nationality={winnerNationality} />}
                            <div className="relative z-10 flex items-end justify-center gap-1 md:gap-8">
                                {podiumOrder.map((pos, visualIndex) => {
                                    if (!podium[pos]) return null;
                                    const driver = podium[pos];
                                    const isWinner = pos === 0;
                                    // Explicit heights - smaller on mobile
                                    const blockHeight = isWinner ? 'h-20 md:h-56' : pos === 1 ? 'h-16 md:h-40' : 'h-12 md:h-32';
                                    const positionColor = isWinner ? 'var(--accent-yellow)' : pos === 1 ? '#C0C0C0' : '#CD7F32';
                                    const rank = isWinner ? 1 : pos === 1 ? 2 : 3;

                                    return (
                                        <m.div
                                            key={driver.driverId}
                                            initial={{ opacity: 0, y: 50 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: 0.1 * visualIndex, ease: "circOut" }}
                                            className={`flex flex-col w-[30%] max-w-[100px] md:max-w-none md:w-56 ${isWinner ? 'z-10' : 'z-0'}`}
                                        >
                                            {/* DRIVER INFO */}
                                            {onSelectDriver ? (
                                                <DriverProfileLink
                                                    season={season}
                                                    driverId={driver.driverId}
                                                    onNavigate={() => onSelectDriver(driver.driverId)}
                                                    title={`View ${driver.driverName} profile`}
                                                    className="block group/pod mb-1 md:mb-2 bg-[var(--bg-panel)] border border-[var(--border-color)] border-l-2 p-1.5 md:p-3 overflow-hidden cursor-pointer hover:border-[var(--accent-yellow)] transition-colors"
                                                    style={{ borderLeftColor: getTeamColor(driver.constructorId) }}
                                                >
                                                    <div className="flex justify-between items-start mb-0.5 md:mb-1">
                                                        <span className="font-oxanium text-[7px] md:text-xs text-[var(--text-secondary)]">P{rank}</span>
                                                        <div className="w-1 h-1 md:w-2 md:h-2 rounded-full flex-shrink-0" style={{ backgroundColor: getTeamColor(driver.constructorId) }} />
                                                    </div>
                                                    <div className="font-display-condensed text-[10px] md:text-2xl leading-none text-white group-hover/pod:text-[var(--accent-yellow)] transition-colors uppercase tracking-tight truncate">
                                                        {driver.driverName.split(' ')[1] || driver.driverName}
                                                    </div>
                                                    <div className="font-ui text-[6px] md:text-[10px] text-[var(--text-muted)] uppercase tracking-wider mt-0.5 md:mt-1 truncate">
                                                        {driver.constructorName}
                                                    </div>
                                                </DriverProfileLink>
                                            ) : (
                                                <div
                                                    className="group/pod mb-1 md:mb-2 bg-[var(--bg-panel)] border border-[var(--border-color)] border-l-2 p-1.5 md:p-3 overflow-hidden"
                                                    style={{ borderLeftColor: getTeamColor(driver.constructorId) }}
                                                >
                                                    <div className="flex justify-between items-start mb-0.5 md:mb-1">
                                                        <span className="font-oxanium text-[7px] md:text-xs text-[var(--text-secondary)]">P{rank}</span>
                                                        <div className="w-1 h-1 md:w-2 md:h-2 rounded-full flex-shrink-0" style={{ backgroundColor: getTeamColor(driver.constructorId) }} />
                                                    </div>
                                                    <div className="font-display-condensed text-[10px] md:text-2xl leading-none text-white uppercase tracking-tight truncate">
                                                        {driver.driverName.split(' ')[1] || driver.driverName}
                                                    </div>
                                                    <div className="font-ui text-[6px] md:text-[10px] text-[var(--text-muted)] uppercase tracking-wider mt-0.5 md:mt-1 truncate">
                                                        {driver.constructorName}
                                                    </div>
                                                </div>
                                            )}

                                            {/* RATING DISPLAY */}
                                            <div className="bg-[var(--bg-darker)] border-x border-[var(--border-color)] px-1.5 md:px-4 py-0.5 md:py-2 flex justify-between items-center">
                                                <span className="font-ui text-[6px] md:text-[10px] text-[var(--text-secondary)] uppercase">AVG</span>
                                                <span className="font-oxanium text-xs md:text-xl font-bold" style={{ color: positionColor }}>
                                                    {driver.averageRating.toFixed(2)}
                                                </span>
                                            </div>

                                            {/* BAR BLOCK */}
                                            <div
                                                className={`w-full ${blockHeight} relative bg-[var(--bg-panel)] border border-[var(--border-color)] border-t-0 p-1 md:p-2 overflow-hidden`}
                                            >
                                                <div className="absolute inset-0 opacity-10"
                                                    style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, #fff 2px, #fff 3px)' }} />

                                                <div className="absolute bottom-0 left-0 w-full h-1" style={{ backgroundColor: positionColor }} />

                                                <span
                                                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 font-oxanium text-4xl md:text-8xl font-bold leading-none select-none z-10"
                                                    style={{ color: positionColor, opacity: 0.4 }}
                                                >
                                                    {rank}
                                                </span>
                                            </div>
                                        </m.div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* 3. SECTION: STATS GRID */}
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-12">

                            {/* CHART (Span 6) - Hidden on mobile */}
                            <div className="hidden md:flex md:flex-col lg:col-span-6">
                                <div className="mb-4 flex items-center justify-between border-b border-[var(--border-color)] pb-2">
                                    <h3 className="font-display text-xl md:text-2xl text-white uppercase tracking-wider">PERFORMANCE ANALYSIS</h3>
                                    <BarChart3 className="text-[var(--accent-red)] opacity-50" size={16} />
                                </div>

                                <div className="bg-[var(--bg-panel)] border border-[var(--border-color)] p-4 md:p-6 flex-1 min-h-[400px] md:min-h-[600px] relative scanline">
                                    {/* Grid Lines Overlay */}
                                    <div className="absolute inset-0 pointer-events-none opacity-5"
                                        style={{ backgroundImage: 'linear-gradient(var(--border-color) 1px, transparent 1px), linear-gradient(90deg, var(--border-color) 1px, transparent 1px)', backgroundSize: '20px 20px' }} />

                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={chartData} layout="vertical" margin={{ left: 0, right: 30, top: 10, bottom: 10 }}>
                                            <XAxis type="number" domain={[0, 10]} hide />
                                            <YAxis
                                                type="category"
                                                dataKey="name"
                                                tick={{ fill: '#8E9196', fontSize: 12, fontFamily: 'Formula1', fontWeight: 400 }}
                                                width={100}
                                                axisLine={false}
                                                tickLine={false}
                                            />
                                            <Tooltip
                                                cursor={{ fill: 'rgba(255,255,255,0.02)' }}
                                                content={({ active, payload }) => {
                                                    if (active && payload && payload.length) {
                                                        const d = payload[0].payload;
                                                        return (
                                                            <div className="bg-[#050608] border border-[var(--border-color)] p-4 shadow-2xl">
                                                                <div className="flex items-center gap-2 mb-2">
                                                                    <div className="w-1 h-3" style={{ backgroundColor: d.color }} />
                                                                    <div className="font-display text-xl text-white uppercase leading-none">{d.fullName}</div>
                                                                </div>
                                                                <div className="flex justify-between gap-4 font-oxanium text-sm">
                                                                    <span className="text-[var(--text-muted)]">RATING</span>
                                                                    <span className="text-[var(--accent-yellow)]">{d.rating.toFixed(3)}</span>
                                                                </div>
                                                            </div>
                                                        );
                                                    }
                                                    return null;
                                                }}
                                            />
                                            <Bar dataKey="rating" radius={[0, 1, 1, 0]} barSize={16}>
                                                {chartData.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            {/* Personal or Community season order is the default; the three metric columns can be sorted independently. */}
                            <div className="min-w-0 lg:col-span-6">
                                <div className="mb-3 border-b border-[var(--border-color)] pb-2">
                                    <h3 className="font-display text-lg text-white uppercase tracking-wider md:text-2xl">DRIVER RATINGS</h3>
                                    <p className="mt-1 font-oxanium text-[9px] tracking-wide text-[var(--text-muted)]">
                                        {activeMode === 'community'
                                            ? (source === 'race' ? 'RACE RATINGS · COMMUNITY SEASON ORDER' : 'QUICK RATE · COMMUNITY SEASON ORDER')
                                            : (source === 'race' ? 'RACE RATINGS · PERSONAL SEASON ORDER' : 'QUICK RATE · SEASON RATINGS')}
                                    </p>
                                </div>
                                <CommunityNotice status={community.status} legacy={hasLegacy} />
                                <div className="bg-[var(--bg-panel)] border-t border-[var(--border-color)]">
                                    <div className={`grid items-center gap-2 border-b border-[var(--border-color)] px-2 py-2 font-oxanium text-[8px] text-[var(--text-muted)] md:px-3 md:text-[9px] ${communityVisible ? 'grid-cols-[minmax(0,1fr)_60px_104px] md:grid-cols-[minmax(0,1fr)_72px_112px_40px]' : 'grid-cols-[minmax(0,1fr)_60px] md:grid-cols-[minmax(0,1fr)_72px]'}`}>
                                        <span>DRIVER</span>
                                        <button
                                            type="button"
                                            aria-label="Sort by my average, highest first"
                                            aria-pressed={driverRatingsSort === 'myAverage'}
                                            onClick={() => setDriverRatingsSort('myAverage')}
                                            className={`w-full cursor-pointer select-none whitespace-nowrap text-left transition-colors hover:text-white ${driverRatingsSort === 'myAverage' ? 'text-white' : ''}`}
                                        >
                                            MY AVG
                                        </button>
                                        {communityVisible && <>
                                            <button
                                                type="button"
                                                aria-label="Sort by community average, highest first"
                                                aria-pressed={driverRatingsSort === 'communityAverage'}
                                                onClick={() => setDriverRatingsSort('communityAverage')}
                                                className={`w-full cursor-pointer select-none whitespace-nowrap text-center transition-colors hover:text-white ${driverRatingsSort === 'communityAverage' ? 'text-white' : ''}`}
                                            >
                                                COMMUNITY AVG
                                            </button>
                                            <button
                                                type="button"
                                                aria-label="Sort by votes, highest first"
                                                aria-pressed={driverRatingsSort === 'votes'}
                                                onClick={() => setDriverRatingsSort('votes')}
                                                className={`hidden w-full cursor-pointer select-none items-center justify-center whitespace-nowrap text-center transition-colors hover:text-white md:flex ${driverRatingsSort === 'votes' ? 'text-white' : ''}`}
                                            >
                                                VOTES
                                            </button>
                                        </>}
                                    </div>
                                    <CommunityRatingRows
                                        rows={sortedDriverRatingRows}
                                        season={season}
                                        source={source}
                                        communityStatus={community.status}
                                        communityVisible={communityVisible}
                                        onSelectDriver={onSelectDriver}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* 4. SECTION: FORM TRACKER */}
                        <m.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.25 }}
                        >
                            <div className="mb-4 flex items-center justify-between border-b border-[var(--border-color)] pb-2">
                                <div className="flex items-center gap-3">
                                    <BarChart3 size={16} className="text-[var(--accent-red)]" />
                                    <h3 className="font-display text-2xl text-white uppercase tracking-wider">FORM TRACKER</h3>
                                </div>
                                <span className="font-oxanium text-[10px] text-[var(--text-muted)] uppercase tracking-widest">
                                    {activeMode === 'community' ? 'COMMUNITY RACE AVERAGES' : 'RAW RACE RATINGS'}
                                </span>
                            </div>

                            {activeRankedFormSeries.length === 0 ? (
                                <div className="bg-[var(--bg-panel)] border border-[var(--border-color)] p-6 md:p-8 relative overflow-hidden">
                                    <div
                                        className="absolute inset-0 pointer-events-none opacity-5"
                                        style={{ backgroundImage: 'linear-gradient(var(--border-color) 1px, transparent 1px), linear-gradient(90deg, var(--border-color) 1px, transparent 1px)', backgroundSize: '20px 20px' }}
                                    />
                                    <div className="relative z-10 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                        <div>
                                            <div className="font-display text-2xl text-white uppercase tracking-wider">FORM TRACKER UNAVAILABLE</div>
                                            <p className="font-oxanium text-sm text-[var(--text-secondary)] max-w-2xl">
                                                Form graph requires race-by-race ratings. Quick Rate data only provides a season snapshot.
                                            </p>
                                        </div>
                                        <div className="font-oxanium text-[10px] text-[var(--text-muted)] uppercase tracking-widest">
                                            NO TIMELINE DATA
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="bg-[var(--bg-panel)] border border-[var(--border-color)] p-4 md:p-6 relative scanline overflow-hidden">
                                    <div
                                        className="absolute inset-0 pointer-events-none opacity-5"
                                        style={{ backgroundImage: 'linear-gradient(var(--border-color) 1px, transparent 1px), linear-gradient(90deg, var(--border-color) 1px, transparent 1px)', backgroundSize: '20px 20px' }}
                                    />

                                    <div className="relative z-10 space-y-6">
                                        <div className="space-y-3">
                                            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                                                <p className="font-ui text-sm text-[var(--text-secondary)]">
                                                    Select one or more drivers to compare their race-by-race ratings.
                                                </p>
                                                <span className="font-oxanium text-[10px] uppercase tracking-widest text-[var(--text-muted)]">
                                                    {visibleFormDrivers.length} SELECTED
                                                </span>
                                            </div>
                                            {visibleFormDrivers.length > 0 && <div aria-label="Selected drivers" className="flex gap-3 overflow-x-auto pb-2">
                                                {visibleFormDrivers.map(driver => {
                                                    const color = getTeamColor(driver.latestConstructorId);
                                                    return (
                                                        <div key={driver.driverId} className="w-[260px] shrink-0 border border-[var(--border-color)] bg-[var(--bg-darker)] p-3">
                                                            <div className="flex items-start justify-between gap-3">
                                                                <div className="flex min-w-0 items-center gap-2">
                                                                    <FormLineSwatch color={color} dash={formLineDashes.get(driver.driverId)} height={40} />
                                                                    <div className="min-w-0">
                                                                        <div className="truncate font-display text-sm uppercase leading-tight text-white">{driver.driverName}</div>
                                                                        <div className="truncate font-oxanium text-[9px] uppercase tracking-wider text-[var(--text-muted)]">
                                                                            {driver.latestConstructorName}{driver.changedTeams ? ' · TEAM CHANGE' : ''}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                <div className="shrink-0 text-right">
                                                                    <div className="font-oxanium text-[9px] uppercase tracking-wider text-[var(--text-muted)]">AVG</div>
                                                                    <div className="font-display text-lg leading-none text-white">{driver.seasonAverage.toFixed(2)}</div>
                                                                </div>
                                                            </div>
                                                            <div className="mt-3 grid grid-cols-3 gap-2 border-t border-[var(--border-color)] pt-2">
                                                                <div>
                                                                    <div className="font-oxanium text-[8px] uppercase tracking-wider text-[var(--text-muted)]">RACES</div>
                                                                    <div className="font-oxanium text-xs text-white">{driver.totalRatedRaces}</div>
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <div className="font-oxanium text-[8px] uppercase tracking-wider text-[var(--text-muted)]">BEST</div>
                                                                    <div className="font-oxanium text-xs text-white">{driver.bestRating?.toFixed(1) ?? 'N/A'}</div>
                                                                    <div className="truncate font-ui text-[8px] uppercase text-[var(--text-muted)]">{formatRaceDisplayName(driver.bestRaceName)}</div>
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <div className="font-oxanium text-[8px] uppercase tracking-wider text-[var(--text-muted)]">WORST</div>
                                                                    <div className="font-oxanium text-xs text-white">{driver.worstRating?.toFixed(1) ?? 'N/A'}</div>
                                                                    <div className="truncate font-ui text-[8px] uppercase text-[var(--text-muted)]">{formatRaceDisplayName(driver.worstRaceName)}</div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>}
                                        </div>

                                        <div>
                                            <div className="mb-2 flex items-center justify-between gap-3">
                                                <span className="font-oxanium text-[10px] uppercase tracking-widest text-[var(--text-muted)]">SELECT DRIVERS</span>
                                                <span className="font-oxanium text-[9px] uppercase tracking-wider text-[var(--text-muted)]">Click again to remove</span>
                                            </div>
                                            <div role="group" aria-label="Select drivers to compare in Form Tracker" className="overflow-x-auto pb-2">
                                                <div className="flex min-w-max gap-2">
                                                    {activeRankedFormSeries.map(driver => {
                                                        const isSelected = selectedFormDriverIds.includes(driver.driverId);
                                                        const color = getTeamColor(driver.latestConstructorId);

                                                        return (
                                                            <button
                                                                key={driver.driverId}
                                                                type="button"
                                                                aria-label={`${isSelected ? 'Remove' : 'Add'} ${driver.driverName} ${isSelected ? 'from' : 'to'} the Form Tracker chart`}
                                                                aria-pressed={isSelected}
                                                                onClick={() => setSelectedFormDriverIds(current => toggleFormDriverSelection(current, driver.driverId))}
                                                                className={`group min-w-[130px] border px-3 py-2 text-left transition-colors ${isSelected
                                                                    ? 'bg-[var(--bg-darker)]'
                                                                    : 'border-[var(--border-color)] bg-[var(--bg-panel-hover)] hover:border-white/40'
                                                                    }`}
                                                                style={isSelected ? { borderColor: color } : undefined}
                                                            >
                                                                <div className="flex items-center gap-2">
                                                                    <FormLineSwatch color={color} dash={formLineDashes.get(driver.driverId)} height={32} />
                                                                    <div className="min-w-0">
                                                                        <div className="truncate font-display text-sm uppercase leading-none text-white">
                                                                            {getDriverLabel(driver.driverName)}
                                                                        </div>
                                                                        <div className="mt-1 truncate font-oxanium text-[9px] uppercase tracking-wider text-[var(--text-muted)]">
                                                                            {driver.seasonAverage.toFixed(2)} AVG
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </div>

                                        {visibleFormDrivers.length === 0 ? (
                                            <div className="h-[320px] md:h-[420px] flex flex-col items-center justify-center gap-3 text-center" role="status">
                                                <BarChart3 size={32} className="text-[var(--text-muted)]" />
                                                <p className="font-display text-lg uppercase text-white">SELECT DRIVERS TO COMPARE</p>
                                                <p className="font-ui text-sm text-[var(--text-secondary)]">Choose one or more drivers above to see their race-by-race ratings.</p>
                                            </div>
                                        ) : (
                                            <div className="h-[320px] md:h-[420px]">
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <LineChart data={formChartData} margin={{ left: 0, right: 16, top: 20, bottom: 10 }}>
                                                        <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
                                                        <XAxis
                                                            dataKey="roundLabel"
                                                            axisLine={false}
                                                            tickLine={false}
                                                            tick={{ fill: '#8E9196', fontSize: 11, fontFamily: 'Oxanium, sans-serif' }}
                                                        />
                                                        <YAxis
                                                            type="number"
                                                            domain={[0, 10]}
                                                            ticks={[0, 2, 4, 6, 8, 10]}
                                                            axisLine={false}
                                                            tickLine={false}
                                                            tick={{ fill: '#8E9196', fontSize: 11, fontFamily: 'Oxanium, sans-serif' }}
                                                        />
                                                        <Tooltip
                                                            cursor={{ stroke: 'rgba(255,255,255,0.08)', strokeWidth: 1 }}
                                                            content={({ active, payload }) => {
                                                                if (!active || !payload || payload.length === 0) return null;

                                                                const point = payload[0]?.payload as FormChartPoint | undefined;
                                                                if (!point) return null;

                                                                const ratings = payload.flatMap(entry => {
                                                                    const driverId = typeof entry.dataKey === 'string' ? entry.dataKey : '';
                                                                    const driver = visibleFormDrivers.find(series => series.driverId === driverId);
                                                                    const rating = Number(entry.value);
                                                                    if (!driver || entry.value === null || entry.value === undefined || !Number.isFinite(rating)) return [];

                                                                    const racePoint = driver.points.find(candidate => candidate.round === point.round);
                                                                    return [{ driver, racePoint, rating, color: getTeamColor(driver.latestConstructorId) }];
                                                                });
                                                                if (ratings.length === 0) return null;

                                                                return (
                                                                    <div className="max-w-[280px] border border-[var(--border-color)] bg-[#050608] p-4 shadow-2xl">
                                                                        <div className="font-display text-sm uppercase leading-tight text-white">
                                                                            {formatRaceDisplayName(point.raceName)}
                                                                        </div>
                                                                        <div className="mt-1 font-oxanium text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                                                                            ROUND {point.roundNumber}{point.date ? ` · ${new Date(point.date).toLocaleDateString('en-GB')}` : ''}
                                                                        </div>
                                                                        <div className="mt-3 space-y-2">
                                                                            {ratings.map(({ driver, racePoint, rating, color }) => (
                                                                                <div key={driver.driverId} className="flex items-center justify-between gap-4 border-t border-white/10 pt-2">
                                                                                    <div className="flex min-w-0 items-center gap-2">
                                                                                        <FormLineSwatch color={color} dash={formLineDashes.get(driver.driverId)} height={20} />
                                                                                        <span className="min-w-0">
                                                                                            <span className="block truncate font-display-condensed text-xs uppercase text-white">{driver.driverName}</span>
                                                                                            <span className="block truncate font-oxanium text-[9px] uppercase text-[var(--text-muted)]">
                                                                                                {racePoint?.constructorName ?? driver.latestConstructorName}
                                                                                            </span>
                                                                                        </span>
                                                                                    </div>
                                                                                    <span className="font-oxanium text-sm tabular-nums text-[var(--accent-yellow)]">
                                                                                        {activeMode === 'community' ? rating.toFixed(2) : rating.toFixed(1)}
                                                                                    </span>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                );
                                                            }}
                                                        />
                                                        {visibleFormDrivers.map((driver, index) => {
                                                            const color = getTeamColor(driver.latestConstructorId);
                                                            const dash = index % 2 === 0 ? '6 4' : '2 4';
                                                            return (
                                                                <ReferenceLine
                                                                    key={`average-${driver.driverId}`}
                                                                    y={driver.seasonAverage}
                                                                    stroke={color}
                                                                    strokeDasharray={dash}
                                                                    strokeOpacity={0.45}
                                                                />
                                                            );
                                                        })}
                                                        <FormTrackerLines
                                                            drivers={activeRankedFormSeries}
                                                            selectedDriverIds={visibleFormDrivers.map(driver => driver.driverId)}
                                                            getColor={getTeamColor}
                                                        />
                                                    </LineChart>
                                                </ResponsiveContainer>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </m.div>

                        {/* 4B. SECTION: OVERPERFORMANCE SCATTER PLOT */}
                        <OverperformanceScatter
                            season={season}
                            averages={activeRankedAverages}
                            driverStandings={seasonDriverStandings}
                            constructorStandings={seasonConstructorStandings}
                            activeMode={activeMode}
                            minimumRatedRaces={activeMinimumRatedRaces}
                            standingsLoading={standingsLoading}
                            onSelectDriver={onSelectDriver}
                        />
                    </>
                )}

                {/* 5. SECTION: RACE-BY-RACE TABLE */}
                {showBreakdownSection && (
                    <ResultsBreakdownTable
                        season={season}
                        tableRef={tableRef}
                        breakdownRaces={breakdownRaces}
                        breakdownDrivers={breakdownDrivers}
                        breakdownSource={breakdownSource}
                        onChangeBreakdownSource={setUserSelectedBreakdownSource}
                        generatingTable={generatingTable}
                        canDownloadBreakdown={canDownloadBreakdown}
                        onDownloadTable={handleDownloadTable}
                        showCommunityBreakdownStatus={showCommunityBreakdownStatus}
                        communityStatus={community.status}
                        onSelectDriver={onSelectDriver}
                    />
                )}
            </div>

            {/* 6. SECTION: SHARE YOUR CARD + Hidden Card for Image Generation */}
            <ResultsShareCard
                season={season}
                activeMode={activeMode}
                votedCommunityRaces={votedCommunityRaces}
                ratedCount={ratedCount}
                activeRankedAverages={activeRankedAverages}
                cardRef={cardRef}
                shareSectionRef={shareSectionRef}
                showCardSection={showCardSection}
                onHide={() => setShowCardSection(false)}
                generating={generating}
                cardImage={cardImage}
                onDownloadCard={handleDownloadCard}
                onGenerateCard={handleGenerateCard}
                shareLinkUrl={shareLinkUrl}
                onCreateShareLink={() => void handleCreateShareLink()}
            />

            {/* F1 Style Scroll to Top Button */}
            <AnimatePresence>
                {showScrollTop && (
                    <m.button
                        initial={{ opacity: 0, y: 50, x: 20 }}
                        animate={{ opacity: 1, y: 0, x: 0 }}
                        exit={{ opacity: 0, y: 50, x: 20 }}
                        whileHover={{ scale: 1.1, x: -5 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={() => {
                            isScrollingToTop.current = true; // Prevent button from reappearing while scrolling up
                            setShowScrollTop(false);
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                        className="fixed bottom-8 right-8 z-50 group flex items-center justify-center w-12 h-12 bg-[var(--accent-red)] border border-white/20 shadow-[0_4px_20px_rgba(225,6,0,0.4)] backdrop-blur-sm -skew-x-12 hover:bg-[#ff0000] transition-colors"
                    >
                        <div className="skew-x-12">
                            <ChevronsUp size={28} className="text-white animate-bounce-custom" />
                        </div>

                        {/* Decorative corner accent */}
                        <div className="absolute -top-1 -right-1 w-2 h-2 bg-white skew-x-12 opacity-50" />
                        <div className="absolute -bottom-1 -left-1 w-2 h-2 bg-[var(--bg-darker)] skew-x-12 opacity-50" />
                    </m.button>
                )}
            </AnimatePresence>

            {/* Confirmation Modal (shadcn AlertDialog) */}
            <AlertDialog open={showConfirmModal} onOpenChange={setShowConfirmModal}>
                <AlertDialogContent className="bg-[var(--bg-panel)] border border-[var(--border-color)] p-8 max-w-md w-full rounded-none">
                    {/* Warning Icon */}
                    <div className="flex justify-center mb-6">
                        <div className="w-16 h-16 flex items-center justify-center border-2 border-[var(--accent-red)] bg-[var(--accent-red)]/10">
                            <AlertTriangle size={32} className="text-[var(--accent-red)]" />
                        </div>
                    </div>

                    <AlertDialogTitle className="font-display text-3xl text-white uppercase tracking-wider text-center mb-2">
                        CLEAR ALL DATA
                    </AlertDialogTitle>

                    <AlertDialogDescription className="font-oxanium text-sm text-[var(--text-secondary)] text-center mb-8">
                        Are you sure you want to reset all <span className="text-white font-bold">{season}</span> ratings? This action cannot be undone.
                    </AlertDialogDescription>

                    <div className="flex gap-4">
                        <AlertDialogCancel className="flex-1 py-3 bg-[var(--bg-darker)] border border-[var(--border-color)] hover:border-white text-white font-display text-lg uppercase tracking-widest transition-colors rounded-none">
                            CANCEL
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={confirmReset}
                            className="flex-1 py-3 bg-[var(--accent-red)] hover:bg-[#ff0000] text-white font-display text-lg uppercase tracking-widest transition-colors rounded-none border-0"
                        >
                            CLEAR ALL
                        </AlertDialogAction>
                    </div>
                </AlertDialogContent>
            </AlertDialog>
            {policyConsent.overlays}
        </div>
    );
}

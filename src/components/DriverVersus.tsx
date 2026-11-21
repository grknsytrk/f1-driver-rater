import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { m } from 'framer-motion';
import {
    ArrowLeftRight,
    ChevronDown,
    Download,
    History,
    ImageDown,
    Loader2,
    Repeat,
    Share2,
    Swords,
} from 'lucide-react';
import { getAllSeasonQualifying, getAllSeasonResults, getDriverStandings, RateLimitError } from '../api/f1Api';
import { loadStaticSeasonData } from '../api/staticSeasonData';
import { useCommunityRatingDistribution, useCommunityRatings, useRatingStorage } from '../hooks/useCommunityRatings';
import { useExportImage } from '../hooks/useExportImage';
import { getTeamColor } from '../types';
import { getDriverPortrait } from '../utils/driverPortraits';
import {
    buildDriverComparisonRows,
    buildDriverOptions,
    buildDriverSeasonStats,
    calculateDirectDriverH2H,
    countCategoryWins,
    getAvailableVersusSeasons,
    resolveDistinctBarColors,
    resolveDriverVersusSelection,
    type DataStatus,
    type DriverSeasonDataset,
    type DriverVersusOption,
} from '../utils/driverVersus';
import { validRatings } from '../utils/ratingData';
import { calculateAverages, getQuickRatings, getSeasonRatings } from '../utils/storage';
import { CommunityRatingDistribution } from './CommunityRatingDistribution';
import { DriverBattlePortrait } from './DriverBattlePortrait';
import { DriverProfileLink } from './DriverProfileLink';
import { DriverVersusShareCard } from './teammate-wars/DriverVersusShareCard';
import { VersusRowView } from './VersusRowView';

interface DriverVersusProps {
    defaultSeason: string;
    toggle: ReactNode;
    onSelectDriver?: (driverId: string, targetSeason?: string) => void;
}

function getDriverFamilyName(driverName: string): string {
    const parts = driverName.trim().split(/\s+/);
    return parts[parts.length - 1]?.toUpperCase() || driverName.toUpperCase();
}

function getDriverGivenName(driverName: string): string {
    const parts = driverName.trim().split(/\s+/);
    return parts.slice(0, -1).join(' ').toUpperCase();
}

function resolveCommunitySource(season: string): 'race' | 'quick' {
    const personalRaces = getSeasonRatings(season);
    const hasPersonalRaceRatings = Boolean(
        personalRaces?.races.some(race => race.completed && validRatings(race.ratings).length > 0),
    );
    const hasPersonalQuickRatings = !hasPersonalRaceRatings && (getQuickRatings(season)?.length ?? 0) > 0;
    return hasPersonalQuickRatings ? 'quick' : 'race';
}

function unavailableMessage(label: string, status: DataStatus): string | null {
    if (status === 'rate_limited') return `${label} data unavailable (API limit 429)`;
    if (status === 'error') return `${label} data unavailable`;
    return null;
}

function datasetHasDriver(dataset: DriverSeasonDataset, driverId: string): boolean {
    return dataset.driverStandings.some(d => d.Driver.driverId === driverId)
        || dataset.raceResults.some(r => r.driverId === driverId)
        || dataset.qualiResults.some(q => q.driverId === driverId);
}

interface DriverSlotSelectProps {
    label: string;
    seasonValue: string;
    driverValue: string;
    color: string;
    availableSeasons: string[];
    driverOptions: DriverVersusOption[];
    loadingSeason: boolean;
    onSeasonChange: (season: string) => void;
    onDriverChange: (driverId: string) => void;
}

function DriverSlotSelect({
    label,
    seasonValue,
    driverValue,
    color,
    availableSeasons,
    driverOptions,
    loadingSeason,
    onSeasonChange,
    onDriverChange,
}: DriverSlotSelectProps) {
    return (
        <div className="relative bg-[var(--bg-panel)] border border-[var(--border-color)] hover:border-white transition-colors">
            <span className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: color }} />
            <div className="flex items-center justify-between pl-4 pr-3 pt-2">
                <span className="font-oxanium text-[9px] text-[var(--text-muted)] uppercase tracking-widest">
                    {label}
                </span>
                {loadingSeason && (
                    <span className="inline-flex items-center gap-1 font-oxanium text-[9px] text-[var(--accent-yellow)] uppercase">
                        <Loader2 size={10} className="animate-spin" />
                        {seasonValue}
                    </span>
                )}
            </div>
            <div className="grid grid-cols-[92px_1fr] items-center gap-2 pl-4 pr-2 pb-2 pt-1">
                <label className="relative block border-r border-[var(--border-color)] pr-2">
                    <select
                        value={seasonValue}
                        onChange={event => onSeasonChange(event.target.value)}
                        aria-label={`Season ${label}`}
                        className="w-full appearance-none bg-transparent pr-5 font-oxanium text-xs md:text-sm font-bold text-[var(--accent-yellow)] uppercase outline-none cursor-pointer"
                        style={{ colorScheme: 'dark' }}
                    >
                        {availableSeasons.map(yr => (
                            <option key={yr} value={yr} className="bg-[var(--bg-panel)] text-white">
                                {yr}
                            </option>
                        ))}
                    </select>
                    <ChevronDown size={13} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                </label>

                <label className="relative block min-w-0">
                    <select
                        value={driverValue}
                        onChange={event => onDriverChange(event.target.value)}
                        aria-label={`Driver ${label}`}
                        disabled={driverOptions.length === 0}
                        className="w-full appearance-none bg-transparent pr-6 font-display text-sm md:text-base text-white uppercase tracking-wider outline-none cursor-pointer truncate disabled:opacity-50"
                        style={{ colorScheme: 'dark' }}
                    >
                        {driverOptions.map(option => (
                            <option key={option.driverId} value={option.driverId} className="bg-[var(--bg-panel)] text-white">
                                {option.driverName}{option.constructorName ? ` (${option.constructorName})` : ''}
                            </option>
                        ))}
                    </select>
                    <ChevronDown size={15} className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                </label>
            </div>
        </div>
    );
}

/**
 * Cross-season and same-driver head-to-head comparison dashboard.
 * Allows comparing any two drivers from any teams/seasons (2018–current), or the same driver across eras.
 */
export function DriverVersus({ defaultSeason, toggle, onSelectDriver }: DriverVersusProps) {
    const ratingSnapshot = useRatingStorage();
    const [searchParams, setSearchParams] = useSearchParams();
    const availableSeasons = useMemo(() => getAvailableVersusSeasons(), []);

    const resolveValidSeason = useCallback(
        (candidate: string | null) =>
            candidate && availableSeasons.includes(candidate) ? candidate : defaultSeason,
        [availableSeasons, defaultSeason],
    );

    const rawSa = searchParams.get('sa');
    const rawDa = searchParams.get('da');
    const rawSb = searchParams.get('sb');
    const rawDb = searchParams.get('db');
    const seasonA = resolveValidSeason(rawSa);
    const seasonB = resolveValidSeason(rawSb);

    const [seasonDatasets, setSeasonDatasets] = useState<Record<string, DriverSeasonDataset>>({});
    const [loadingSeasons, setLoadingSeasons] = useState<Record<string, boolean>>({});
    const inFlightPromisesRef = useRef<Map<string, Promise<DriverSeasonDataset>>>(new Map());

    const [driverSeasonsCache, setDriverSeasonsCache] = useState<Record<string, string[]>>({});
    const seasonDatasetsRef = useRef<Record<string, DriverSeasonDataset>>({});
    useEffect(() => {
        seasonDatasetsRef.current = seasonDatasets;
    }, [seasonDatasets]);

    const { exportAsImage, isExporting } = useExportImage();
    const [exportContainerRef, setExportContainerRef] = useState<HTMLDivElement | null>(null);
    const cardRef = useRef<HTMLDivElement>(null);
    const shareSectionRef = useRef<HTMLDivElement>(null);
    const [showCardSection, setShowCardSection] = useState(false);
    const [cardImage, setCardImage] = useState<string | null>(null);
    const [generatingCard, setGeneratingCard] = useState(false);

    // Fetch missing season datasets cleanly (deduplicated across Side A/B and StrictMode remounts).
    useEffect(() => {
        let active = true;
        const targets = [...new Set([seasonA, seasonB])];

        async function loadSeason(targetSeason: string) {
            if (seasonDatasetsRef.current[targetSeason]) {
                setLoadingSeasons(prev => (prev[targetSeason] === false ? prev : { ...prev, [targetSeason]: false }));
                return;
            }

            setLoadingSeasons(prev => (prev[targetSeason] ? prev : { ...prev, [targetSeason]: true }));

            let promise = inFlightPromisesRef.current.get(targetSeason);
            if (!promise) {
                promise = Promise.allSettled([
                    getAllSeasonResults(targetSeason),
                    getAllSeasonQualifying(targetSeason),
                    getDriverStandings(targetSeason),
                ]).then(([raceRes, qualiRes, wdcRes]): DriverSeasonDataset => ({
                    raceResults: raceRes.status === 'fulfilled' ? raceRes.value : [],
                    qualiResults: qualiRes.status === 'fulfilled' ? qualiRes.value : [],
                    driverStandings: wdcRes.status === 'fulfilled' ? wdcRes.value : [],
                    raceStatus: raceRes.status === 'fulfilled'
                        ? 'ok'
                        : raceRes.reason instanceof RateLimitError ? 'rate_limited' : 'error',
                    qualiStatus: qualiRes.status === 'fulfilled'
                        ? 'ok'
                        : qualiRes.reason instanceof RateLimitError ? 'rate_limited' : 'error',
                })).finally(() => {
                    inFlightPromisesRef.current.delete(targetSeason);
                });
                inFlightPromisesRef.current.set(targetSeason, promise);
            }

            try {
                const dataset = await promise;
                if (!active) return;
                setSeasonDatasets(prev => (prev[targetSeason] ? prev : { ...prev, [targetSeason]: dataset }));
            } finally {
                if (active) {
                    setLoadingSeasons(prev => (prev[targetSeason] === false ? prev : { ...prev, [targetSeason]: false }));
                }
            }
        }

        targets.forEach(yr => { void loadSeason(yr); });
        return () => {
            active = false;
        };
    }, [seasonA, seasonB]);

    const datasetA = seasonDatasets[seasonA];
    const datasetB = seasonDatasets[seasonB];

    const averagesA = useMemo(() => {
        void ratingSnapshot;
        return calculateAverages(seasonA);
    }, [ratingSnapshot, seasonA]);

    const averagesB = useMemo(() => {
        void ratingSnapshot;
        return calculateAverages(seasonB);
    }, [ratingSnapshot, seasonB]);

    const optionsA = useMemo(
        () => (datasetA ? buildDriverOptions(datasetA, averagesA) : []),
        [datasetA, averagesA],
    );
    const optionsB = useMemo(
        () => (datasetB ? buildDriverOptions(datasetB, averagesB) : []),
        [datasetB, averagesB],
    );

    const selection = useMemo(
        () =>
            resolveDriverVersusSelection(
                { sa: seasonA, da: rawDa, sb: seasonB, db: rawDb },
                defaultSeason,
                availableSeasons,
                optionsA,
                optionsB,
            ),
        [availableSeasons, defaultSeason, optionsA, optionsB, rawDa, rawDb, seasonA, seasonB],
    );

    const sourceA = resolveCommunitySource(seasonA);
    const sourceB = resolveCommunitySource(seasonB);
    const communityA = useCommunityRatings(sourceA, seasonA);
    const communityB = useCommunityRatings(sourceB, seasonB);
    const distA = useCommunityRatingDistribution(sourceA, seasonA, selection?.driverA ?? null);
    const distB = useCommunityRatingDistribution(sourceB, seasonB, selection?.driverB ?? null);

    // Discover which seasons a driver raced in (for "VS SELF" cycling & era chips).
    const discoverDriverSeasons = useCallback(async (driverId: string): Promise<string[]> => {
        const found: string[] = [];
        const loaded = seasonDatasetsRef.current;

        const probes = await Promise.all(
            availableSeasons.map(async (yr) => {
                if (loaded[yr]) {
                    return datasetHasDriver(loaded[yr], driverId) ? yr : null;
                }
                try {
                    const bundle = await loadStaticSeasonData(yr);
                    if (!bundle) return null;
                    const inBundle = bundle.driverStandings.some(d => d.Driver.driverId === driverId)
                        || bundle.results.some(r => r.driverId === driverId);
                    return inBundle ? yr : null;
                } catch {
                    return null;
                }
            }),
        );

        probes.forEach(yr => {
            if (yr) found.push(yr);
        });

        if (found.length > 0) {
            setDriverSeasonsCache(prev => ({ ...prev, [driverId]: found }));
        }
        return found;
    }, [availableSeasons]);

    const activeDriverA = selection?.driverA;
    useEffect(() => {
        if (!activeDriverA || driverSeasonsCache[activeDriverA]) return;
        let cancelled = false;
        void discoverDriverSeasons(activeDriverA).then((list) => {
            if (cancelled || list.length === 0) return;
            setDriverSeasonsCache(prev => (prev[activeDriverA] ? prev : { ...prev, [activeDriverA]: list }));
        });
        return () => {
            cancelled = true;
        };
    }, [activeDriverA, discoverDriverSeasons, driverSeasonsCache]);

    const versus = useMemo(() => {
        if (!selection || !datasetA || !datasetB) return null;

        const statsA = buildDriverSeasonStats(
            selection.seasonA,
            selection.driverA,
            datasetA,
            averagesA,
            communityA.ratings,
            sourceA,
        );
        const statsB = buildDriverSeasonStats(
            selection.seasonB,
            selection.driverB,
            datasetB,
            averagesB,
            communityB.ratings,
            sourceB,
        );

        const isSameSeason = selection.seasonA === selection.seasonB;
        const isSameDriverEraBattle = selection.driverA === selection.driverB && !isSameSeason;
        const directH2H = isSameSeason
            ? calculateDirectDriverH2H(selection.driverA, selection.driverB, datasetA.raceResults, datasetA.qualiResults)
            : null;

        const rows = buildDriverComparisonRows(statsA, statsB, {
            directH2H,
            raceAvailable: isSameSeason && datasetA.raceStatus === 'ok',
            qualiAvailable: isSameSeason && datasetA.qualiStatus === 'ok',
            communityStatusA: communityA.status,
            communityStatusB: communityB.status,
        });

        return {
            statsA,
            statsB,
            rows,
            score: countCategoryWins(rows),
            isSameSeason,
            isSameDriverEraBattle,
        };
    }, [
        averagesA,
        averagesB,
        communityA.ratings,
        communityA.status,
        communityB.ratings,
        communityB.status,
        datasetA,
        datasetB,
        selection,
        sourceA,
        sourceB,
    ]);

    const updateSelection = useCallback((sa: string, da: string, sb: string, db: string) => {
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            next.set('mode', 'driver-vs');
            next.set('sa', sa);
            next.set('da', da);
            next.set('sb', sb);
            next.set('db', db);
            return next;
        }, { replace: true });
        setCardImage(null);
    }, [setSearchParams]);

    const handleSeasonChange = (side: 'a' | 'b', nextSeason: string) => {
        const curA = selection?.driverA ?? rawDa ?? '';
        const curB = selection?.driverB ?? rawDb ?? '';
        if (side === 'a') {
            updateSelection(nextSeason, curA, seasonB, curB);
        } else {
            updateSelection(seasonA, curA, nextSeason, curB);
        }
    };

    const handleDriverChange = (side: 'a' | 'b', nextDriverId: string) => {
        if (!selection) return;
        if (selection.seasonA === selection.seasonB) {
            if (side === 'a' && nextDriverId === selection.driverB) {
                updateSelection(selection.seasonA, nextDriverId, selection.seasonB, selection.driverA);
                return;
            }
            if (side === 'b' && nextDriverId === selection.driverA) {
                updateSelection(selection.seasonA, selection.driverB, selection.seasonB, nextDriverId);
                return;
            }
        }

        if (side === 'a') {
            updateSelection(selection.seasonA, nextDriverId, selection.seasonB, selection.driverB);
        } else {
            updateSelection(selection.seasonA, selection.driverA, selection.seasonB, nextDriverId);
        }
    };

    const handleSwap = () => {
        if (!selection) return;
        updateSelection(selection.seasonB, selection.driverB, selection.seasonA, selection.driverA);
    };

    const handleCompareSameDriver = async () => {
        if (!selection) return;
        const driverId = selection.driverA;
        const known = driverSeasonsCache[driverId] ?? await discoverDriverSeasons(driverId);
        const candidates = known.filter(yr => yr !== selection.seasonA);
        const fallbackPool = candidates.length > 0
            ? candidates
            : availableSeasons.filter(yr => yr !== selection.seasonA);

        if (fallbackPool.length === 0) return;

        let targetSeasonB = fallbackPool[0];
        if (selection.driverB === driverId && selection.seasonB !== selection.seasonA) {
            const currentIdx = fallbackPool.indexOf(selection.seasonB);
            if (currentIdx !== -1) {
                targetSeasonB = fallbackPool[(currentIdx + 1) % fallbackPool.length];
            }
        }

        updateSelection(selection.seasonA, driverId, targetSeasonB, driverId);
    };

    const handleShare = async () => {
        if (!versus) return;
        const shareData = {
            title: `F1 Driver VS: ${versus.statsA.driverName} (${versus.statsA.season}) vs ${versus.statsB.driverName} (${versus.statsB.season})`,
            text: `${versus.statsA.driverName} (${versus.statsA.season}) vs ${versus.statsB.driverName} (${versus.statsB.season}) on F1 Driver Rater!`,
            url: window.location.href,
        };

        if (navigator.share) {
            try {
                await navigator.share(shareData);
            } catch (err) {
                console.log('Error sharing:', err);
            }
        } else {
            await navigator.clipboard?.writeText(window.location.href);
        }
    };

    const handleGenerateCard = async () => {
        if (!cardRef.current || !versus) return;

        setShowCardSection(true);
        setGeneratingCard(true);
        setCardImage(null);

        await new Promise(resolve => setTimeout(resolve, 100));
        shareSectionRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
        await new Promise(resolve => setTimeout(resolve, 100));

        try {
            const { toPng } = await import('html-to-image');
            const dataUrl = await toPng(cardRef.current, {
                cacheBust: true,
                pixelRatio: 2,
                backgroundColor: '#0a0a0b',
                width: cardRef.current.scrollWidth,
                height: cardRef.current.scrollHeight,
            });
            setCardImage(dataUrl);
        } catch (error) {
            console.error('Error generating Driver VS card:', error);
        } finally {
            setGeneratingCard(false);
        }
    };

    const handleDownloadCard = () => {
        if (!cardImage || !versus) return;
        const link = document.createElement('a');
        link.download = `f1-driver-vs-${versus.statsA.season}-${versus.statsA.driverId}-vs-${versus.statsB.season}-${versus.statsB.driverId}.png`;
        link.href = cardImage;
        link.click();
    };

    const isLoadingAny = Boolean(loadingSeasons[seasonA] || loadingSeasons[seasonB]) || !datasetA || !datasetB;

    const header = (
        <div className="mb-8 text-center">
            <m.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="inline-flex items-center justify-center gap-3 mb-4"
            >
                <Swords size={32} className="text-[var(--accent-red)]" />
                <h2 className="font-display text-4xl md:text-6xl text-white uppercase tracking-tight">
                    DRIVER <span className="text-[var(--accent-red)]">VS</span>
                </h2>
                <Swords size={32} className="text-[var(--accent-red)] scale-x-[-1]" />
            </m.div>
            <div className="h-1 w-24 bg-[var(--accent-red)] mx-auto" />
            {toggle}
            {isLoadingAny && (
                <div className="mt-4 flex items-center justify-center gap-2 text-[var(--text-muted)]">
                    <Loader2 size={14} className="animate-spin" />
                    <span className="font-oxanium text-xs uppercase">Loading driver data...</span>
                </div>
            )}
            {!isLoadingAny && versus && (
                <m.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="mt-6 flex flex-wrap gap-2 justify-center hide-on-export"
                >
                    <button
                        type="button"
                        onClick={handleGenerateCard}
                        disabled={generatingCard}
                        className="inline-flex items-center justify-center gap-2 px-6 py-2 bg-[var(--bg-panel)] hover:bg-[var(--bg-panel-hover)] border border-[var(--border-color)] hover:border-white text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {generatingCard ? <Loader2 size={16} className="animate-spin" /> : <ImageDown size={16} />}
                        <span className="font-display text-sm uppercase tracking-wider">
                            {generatingCard ? 'GENERATING...' : 'GENERATE CARD'}
                        </span>
                    </button>
                    <button
                        type="button"
                        onClick={handleShare}
                        className="inline-flex items-center justify-center gap-2 px-6 py-2 bg-zinc-800 hover:bg-zinc-700 border border-[var(--border-color)] text-white transition-colors"
                    >
                        <Share2 size={16} />
                        <span className="font-display text-sm uppercase tracking-wider">SHARE</span>
                    </button>
                    <button
                        type="button"
                        onClick={() =>
                            exportAsImage(exportContainerRef, {
                                fileName: `f1-${versus.statsA.season}-${versus.statsA.driverId}-vs-${versus.statsB.season}-${versus.statsB.driverId}.png`,
                            })
                        }
                        disabled={isExporting}
                        className="inline-flex items-center justify-center gap-2 px-6 py-2 bg-[var(--accent-red)] hover:bg-red-700 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isExporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                        <span className="font-display text-sm uppercase tracking-wider">
                            {isExporting ? 'EXPORTING...' : 'SAVE IMAGE'}
                        </span>
                    </button>
                </m.div>
            )}
        </div>
    );

    const selectors = (
        <div className="mb-6 grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] items-center gap-3 hide-on-export">
            <DriverSlotSelect
                label="DRIVER A"
                seasonValue={seasonA}
                driverValue={selection?.driverA ?? rawDa ?? ''}
                color={versus ? getTeamColor(versus.statsA.constructorId, '#666') : '#e10600'}
                availableSeasons={availableSeasons}
                driverOptions={optionsA}
                loadingSeason={Boolean(loadingSeasons[seasonA])}
                onSeasonChange={yr => handleSeasonChange('a', yr)}
                onDriverChange={id => handleDriverChange('a', id)}
            />

            <div className="flex md:flex-col items-center justify-center gap-2">
                <button
                    type="button"
                    onClick={handleSwap}
                    disabled={!selection}
                    title="Swap drivers"
                    aria-label="Swap drivers"
                    className="p-2 rounded-full bg-[var(--bg-darker)] border border-[var(--border-color)] hover:border-[var(--accent-yellow)] hover:bg-[var(--accent-yellow)]/10 text-[var(--text-muted)] hover:text-[var(--accent-yellow)] transition-colors disabled:opacity-40"
                >
                    <ArrowLeftRight size={16} className="rotate-90 md:rotate-0" />
                </button>
                <button
                    type="button"
                    onClick={() => void handleCompareSameDriver()}
                    disabled={!selection}
                    title="Compare Driver A against another season"
                    aria-label="Compare same driver across seasons"
                    className={`inline-flex items-center gap-1 px-2.5 py-1 border font-oxanium text-[9px] uppercase tracking-wider transition-colors disabled:opacity-40 ${
                        versus?.isSameDriverEraBattle
                            ? 'border-[var(--accent-yellow)] bg-[var(--accent-yellow)]/10 text-[var(--accent-yellow)]'
                            : 'border-[var(--border-color)] bg-[var(--bg-darker)] text-[var(--text-muted)] hover:border-white hover:text-white'
                    }`}
                >
                    <Repeat size={10} />
                    VS SELF
                </button>
            </div>

            <DriverSlotSelect
                label="DRIVER B"
                seasonValue={seasonB}
                driverValue={selection?.driverB ?? rawDb ?? ''}
                color={versus ? getTeamColor(versus.statsB.constructorId, '#666') : '#facc15'}
                availableSeasons={availableSeasons}
                driverOptions={optionsB}
                loadingSeason={Boolean(loadingSeasons[seasonB])}
                onSeasonChange={yr => handleSeasonChange('b', yr)}
                onDriverChange={id => handleDriverChange('b', id)}
            />
        </div>
    );

    if (!versus || !selection) {
        return (
            <div className="max-w-5xl mx-auto px-4 py-8">
                {header}
                {selectors}
                <div className="flex flex-col items-center justify-center min-h-[30vh] text-center p-8 border border-[var(--border-color)] bg-[var(--bg-panel)]">
                    {isLoadingAny ? (
                        <Loader2 size={44} className="text-[var(--accent-red)] mb-4 animate-spin" />
                    ) : (
                        <Swords size={44} className="text-[var(--text-muted)] mb-4 opacity-50" />
                    )}
                    <h3 className="font-display text-2xl text-white uppercase mb-2">
                        {isLoadingAny ? 'LOADING COMPARISON' : 'NO DRIVERS AVAILABLE'}
                    </h3>
                    <p className="font-oxanium text-sm text-[var(--text-secondary)]">
                        {isLoadingAny ? 'Fetching season data...' : 'Select two valid drivers or seasons to compare.'}
                    </p>
                </div>
            </div>
        );
    }

    const { statsA, statsB, rows, score, isSameSeason, isSameDriverEraBattle } = versus;
    const rawColorA = getTeamColor(statsA.constructorId, '#666');
    const rawColorB = getTeamColor(statsB.constructorId, '#666');
    const [colorA, colorB] = resolveDistinctBarColors(rawColorA, rawColorB);
    const [scoreA, scoreB] = score;
    const portraitA = getDriverPortrait(statsA.season, statsA.driverId, statsA.constructorId);
    const portraitB = getDriverPortrait(statsB.season, statsB.driverId, statsB.constructorId);
    const driverAvailableSeasons = driverSeasonsCache[statsA.driverId] ?? [];

    const notices = isSameSeason
        ? [unavailableMessage('Race', datasetA.raceStatus), unavailableMessage('Qualifying', datasetA.qualiStatus)].filter(Boolean)
        : [];

    const heroBadge = isSameDriverEraBattle
        ? 'ERA BATTLE • SAME DRIVER'
        : !isSameSeason
            ? 'CROSS-SEASON BATTLE'
            : `SEASON ${statsA.season}`;

    return (
        <div className="max-w-5xl mx-auto px-4 py-8" ref={setExportContainerRef}>
            {header}
            {selectors}

            {/* Era quick-pick season chips when comparing the same driver across seasons */}
            {isSameDriverEraBattle && driverAvailableSeasons.length > 1 && (
                <div className="mb-6 flex flex-wrap items-center justify-between gap-2 border border-[var(--border-color)] bg-[var(--bg-darker)] px-3 py-2 hide-on-export">
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-oxanium text-[9px] uppercase tracking-wider text-[var(--text-muted)] mr-1">
                            ERA A:
                        </span>
                        {driverAvailableSeasons.map(yr => (
                            <button
                                key={`a-${yr}`}
                                type="button"
                                disabled={yr === statsB.season}
                                onClick={() => updateSelection(yr, statsA.driverId, statsB.season, statsB.driverId)}
                                className={`px-2 py-0.5 font-oxanium text-[10px] border transition-colors disabled:opacity-35 ${
                                    yr === statsA.season
                                        ? 'border-[var(--accent-red)] bg-[var(--accent-red)]/15 text-white font-bold'
                                        : 'border-[var(--border-color)] text-[var(--text-secondary)] hover:border-white hover:text-white'
                                }`}
                            >
                                {yr}
                            </button>
                        ))}
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-oxanium text-[9px] uppercase tracking-wider text-[var(--text-muted)] mr-1">
                            ERA B:
                        </span>
                        {driverAvailableSeasons.map(yr => (
                            <button
                                key={`b-${yr}`}
                                type="button"
                                disabled={yr === statsA.season}
                                onClick={() => updateSelection(statsA.season, statsA.driverId, yr, statsB.driverId)}
                                className={`px-2 py-0.5 font-oxanium text-[10px] border transition-colors disabled:opacity-35 ${
                                    yr === statsB.season
                                        ? 'border-[var(--accent-yellow)] bg-[var(--accent-yellow)]/15 text-[var(--accent-yellow)] font-bold'
                                        : 'border-[var(--border-color)] text-[var(--text-secondary)] hover:border-white hover:text-white'
                                }`}
                            >
                                {yr}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Main VS Card */}
            <m.div
                key={`${statsA.season}-${statsA.driverId}-${statsB.season}-${statsB.driverId}`}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="bg-[var(--bg-panel)] border border-[var(--border-color)] relative overflow-hidden"
            >
                <div className="flex h-1 w-full">
                    <div className="flex-1" style={{ backgroundColor: colorA }} />
                    <div className="flex-1" style={{ backgroundColor: colorB }} />
                </div>

                <div
                    className="h2h-battle relative px-4 md:px-8 py-6 md:py-8"
                    data-portraits={Boolean(portraitA || portraitB)}
                    style={{ '--battle-color': colorA } as CSSProperties}
                >
                    {portraitA && <DriverBattlePortrait src={portraitA} side="left" />}
                    {portraitB && <DriverBattlePortrait src={portraitB} side="right" />}

                    <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 select-none font-display text-[96px] text-white/[0.02] md:text-[160px]">
                        VS
                    </div>

                    <div className="relative z-10 mb-4 flex justify-center">
                        <span className={`inline-flex items-center gap-1.5 border px-2.5 py-0.5 font-oxanium text-[9px] md:text-[10px] uppercase tracking-widest ${
                            isSameDriverEraBattle
                                ? 'border-[var(--accent-yellow)]/50 bg-[var(--accent-yellow)]/10 text-[var(--accent-yellow)]'
                                : !isSameSeason
                                    ? 'border-[var(--accent-red)]/50 bg-[var(--accent-red)]/10 text-white'
                                    : 'border-[var(--border-color)] bg-[var(--bg-darker)] text-[var(--text-muted)]'
                        }`}>
                            {(!isSameSeason || isSameDriverEraBattle) && <History size={11} />}
                            {heroBadge}
                        </span>
                    </div>

                    <div className="relative z-10 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                        {/* Side A Identity */}
                        <div className="min-w-0 text-right">
                            <span
                                className="inline-block px-2 py-0.5 font-oxanium text-[10px] font-bold uppercase tracking-wider border mb-1"
                                style={{ borderColor: colorA, color: colorA }}
                            >
                                {statsA.season}
                            </span>
                            {onSelectDriver ? (
                                <DriverProfileLink
                                    season={statsA.season}
                                    driverId={statsA.driverId}
                                    onNavigate={() => onSelectDriver(statsA.driverId, statsA.season)}
                                    title={`View ${statsA.driverName} (${statsA.season}) profile`}
                                    className="block w-full text-right cursor-pointer group/drv"
                                >
                                    {getDriverGivenName(statsA.driverName) && (
                                        <span className="block font-oxanium text-[10px] md:text-xs text-[var(--text-secondary)] uppercase tracking-wider">
                                            {getDriverGivenName(statsA.driverName)}
                                        </span>
                                    )}
                                    <span className="block font-display text-xl md:text-4xl text-white group-hover/drv:text-[var(--accent-yellow)] transition-colors uppercase leading-[0.95] break-words">
                                        {getDriverFamilyName(statsA.driverName)}
                                    </span>
                                </DriverProfileLink>
                            ) : (
                                <>
                                    {getDriverGivenName(statsA.driverName) && (
                                        <span className="block font-oxanium text-[10px] md:text-xs text-[var(--text-secondary)] uppercase tracking-wider">
                                            {getDriverGivenName(statsA.driverName)}
                                        </span>
                                    )}
                                    <span className="block font-display text-xl md:text-4xl text-white uppercase leading-[0.95] break-words">
                                        {getDriverFamilyName(statsA.driverName)}
                                    </span>
                                </>
                            )}
                            {statsA.constructorName && (
                                <p className="mt-1 font-oxanium text-[9px] md:text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                                    {statsA.constructorName}
                                </p>
                            )}
                        </div>

                        {/* Center Category Tally */}
                        <div className="flex flex-col items-center px-2">
                            <span className="font-oxanium text-[10px] text-[var(--text-muted)] uppercase tracking-widest">VS</span>
                            <div className="mt-1 flex items-baseline gap-2 font-oxanium font-bold text-2xl md:text-4xl">
                                <span className={scoreA > scoreB ? 'text-[var(--accent-yellow)]' : 'text-white'}>{scoreA}</span>
                                <span className="text-[var(--text-muted)] text-lg">-</span>
                                <span className={scoreB > scoreA ? 'text-[var(--accent-yellow)]' : 'text-white'}>{scoreB}</span>
                            </div>
                            <span className="font-oxanium text-[9px] text-[var(--text-muted)] uppercase tracking-widest">categories</span>
                        </div>

                        {/* Side B Identity */}
                        <div className="min-w-0 text-left">
                            <span
                                className="inline-block px-2 py-0.5 font-oxanium text-[10px] font-bold uppercase tracking-wider border mb-1"
                                style={{ borderColor: colorB, color: colorB }}
                            >
                                {statsB.season}
                            </span>
                            {onSelectDriver ? (
                                <DriverProfileLink
                                    season={statsB.season}
                                    driverId={statsB.driverId}
                                    onNavigate={() => onSelectDriver(statsB.driverId, statsB.season)}
                                    title={`View ${statsB.driverName} (${statsB.season}) profile`}
                                    className="block w-full text-left cursor-pointer group/drv"
                                >
                                    {getDriverGivenName(statsB.driverName) && (
                                        <span className="block font-oxanium text-[10px] md:text-xs text-[var(--text-secondary)] uppercase tracking-wider">
                                            {getDriverGivenName(statsB.driverName)}
                                        </span>
                                    )}
                                    <span className="block font-display text-xl md:text-4xl text-white group-hover/drv:text-[var(--accent-yellow)] transition-colors uppercase leading-[0.95] break-words">
                                        {getDriverFamilyName(statsB.driverName)}
                                    </span>
                                </DriverProfileLink>
                            ) : (
                                <>
                                    {getDriverGivenName(statsB.driverName) && (
                                        <span className="block font-oxanium text-[10px] md:text-xs text-[var(--text-secondary)] uppercase tracking-wider">
                                            {getDriverGivenName(statsB.driverName)}
                                        </span>
                                    )}
                                    <span className="block font-display text-xl md:text-4xl text-white uppercase leading-[0.95] break-words">
                                        {getDriverFamilyName(statsB.driverName)}
                                    </span>
                                </>
                            )}
                            {statsB.constructorName && (
                                <p className="mt-1 font-oxanium text-[9px] md:text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                                    {statsB.constructorName}
                                </p>
                            )}
                        </div>
                    </div>
                </div>

                {rows.map(row => (
                    <VersusRowView key={row.key} row={row} colorA={colorA} colorB={colorB} />
                ))}
            </m.div>

            {notices.length > 0 && (
                <p className="mt-3 text-center font-oxanium text-[10px] text-[var(--text-muted)] uppercase tracking-wider">
                    {notices.join(' • ')}
                </p>
            )}

            {/* Side-by-side Community Vote Distributions */}
            <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-[var(--bg-panel)] border border-[var(--border-color)] p-4 md:p-5">
                    <div className="mb-3 flex items-center justify-between gap-2 border-b border-[var(--border-color)] pb-2">
                        <span className="font-display text-base md:text-lg text-white uppercase tracking-wider truncate">
                            {statsA.driverName}
                        </span>
                        <span
                            className="font-oxanium text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 border shrink-0"
                            style={{ borderColor: colorA, color: colorA }}
                        >
                            {statsA.season} COMMUNITY DIST
                        </span>
                    </div>
                    <CommunityRatingDistribution
                        driverName={statsA.driverName}
                        communityStatus={communityA.status}
                        distributionStatus={distA.status}
                        distribution={distA.distribution}
                        voteCount={statsA.communityVotes}
                    />
                </div>

                <div className="bg-[var(--bg-panel)] border border-[var(--border-color)] p-4 md:p-5">
                    <div className="mb-3 flex items-center justify-between gap-2 border-b border-[var(--border-color)] pb-2">
                        <span className="font-display text-base md:text-lg text-white uppercase tracking-wider truncate">
                            {statsB.driverName}
                        </span>
                        <span
                            className="font-oxanium text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 border shrink-0"
                            style={{ borderColor: colorB, color: colorB }}
                        >
                            {statsB.season} COMMUNITY DIST
                        </span>
                    </div>
                    <CommunityRatingDistribution
                        driverName={statsB.driverName}
                        communityStatus={communityB.status}
                        distributionStatus={distB.status}
                        distribution={distB.distribution}
                        voteCount={statsB.communityVotes}
                    />
                </div>
            </div>

            <DriverVersusShareCard
                statsA={statsA}
                statsB={statsB}
                colorA={colorA}
                colorB={colorB}
                scoreA={scoreA}
                scoreB={scoreB}
                rows={rows}
                isSameDriverEraBattle={isSameDriverEraBattle}
                isCrossSeason={!isSameSeason}
                cardRef={cardRef}
                shareSectionRef={shareSectionRef}
                showCardSection={showCardSection}
                onHide={() => setShowCardSection(false)}
                generatingCard={generatingCard}
                cardImage={cardImage}
                onDownloadCard={handleDownloadCard}
                onGenerateCard={handleGenerateCard}
            />
        </div>
    );
}

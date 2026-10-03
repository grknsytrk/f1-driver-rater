import { useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toPng } from 'html-to-image';
import { ArrowLeftRight, ChevronDown, Download, ImageDown, Loader2, Share2, Swords } from 'lucide-react';
import { useExportImage } from '../hooks/useExportImage';
import type { ConstructorStanding, SeasonQualifyingResult, SeasonRaceResult } from '../api/f1Api';
import { TEAM_COLORS } from '../types';
import type { AverageRating } from '../types';
import {
    buildComparisonRows,
    buildTeamOptions,
    buildTeamStats,
    calculateTeamH2H,
    countCategoryWins,
    getTeamDrivers,
    resolveTeamSelection,
} from '../utils/teamVersus';
import type { DataStatus, RowWinner, VersusRow } from '../utils/teamVersus';

interface TeamVersusProps {
    season: string;
    raceResults: SeasonRaceResult[];
    qualiResults: SeasonQualifyingResult[];
    constructorStandings: ConstructorStanding[];
    averages: AverageRating[];
    loading: boolean;
    raceStatus: DataStatus;
    qualiStatus: DataStatus;
    /** Mode toggle rendered under the title so both modes share the same switch. */
    toggle: ReactNode;
}

function getDriverFamilyName(driverName: string): string {
    const parts = driverName.trim().split(/\s+/);
    return parts[parts.length - 1]?.toUpperCase() || driverName.toUpperCase();
}

function valueColor(winner: RowWinner, side: 'a' | 'b'): string {
    if (winner === 'none') return 'text-[var(--text-muted)]';
    if (winner === 'tie') return 'text-white';
    return winner === side ? 'text-[var(--accent-yellow)]' : 'text-[var(--text-muted)]';
}

function unavailableMessage(label: string, status: DataStatus): string | null {
    if (status === 'rate_limited') return `${label} data unavailable (API limit 429)`;
    if (status === 'error') return `${label} data unavailable`;
    return null;
}

interface TeamSelectProps {
    label: string;
    value: string;
    color: string;
    options: Array<{ teamId: string; teamName: string }>;
    onChange: (teamId: string) => void;
}

function TeamSelect({ label, value, color, options, onChange }: TeamSelectProps) {
    return (
        <label className="relative block bg-[var(--bg-panel)] border border-[var(--border-color)] hover:border-white transition-colors">
            <span className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: color }} />
            <span className="block pl-4 pr-10 pt-2 font-oxanium text-[9px] text-[var(--text-muted)] uppercase tracking-widest">
                {label}
            </span>
            <select
                value={value}
                onChange={event => onChange(event.target.value)}
                aria-label={`Team ${label}`}
                className="w-full appearance-none bg-transparent pl-4 pr-10 pb-2 font-display text-sm md:text-base text-white uppercase tracking-wider outline-none cursor-pointer"
                style={{ colorScheme: 'dark' }}
            >
                {options.map(option => (
                    <option key={option.teamId} value={option.teamId} className="bg-[var(--bg-panel)] text-white">
                        {option.teamName}
                    </option>
                ))}
            </select>
            <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
        </label>
    );
}

interface VersusRowViewProps {
    row: VersusRow;
    colorA: string;
    colorB: string;
}

function VersusRowView({ row, colorA, colorB }: VersusRowViewProps) {
    return (
        <div className="px-4 md:px-8 py-3 border-t border-[var(--border-color)]">
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                <span className={`font-oxanium text-2xl md:text-4xl font-bold text-right ${valueColor(row.winner, 'a')}`}>
                    {row.displayA}
                </span>
                <div className="flex flex-col items-center min-w-[88px] md:min-w-[130px] text-center">
                    <span className="font-oxanium text-[10px] md:text-xs text-[var(--text-secondary)] uppercase tracking-widest">
                        {row.label}
                    </span>
                    {row.note && (
                        <span className="font-oxanium text-[9px] text-[var(--text-muted)] mt-0.5">{row.note}</span>
                    )}
                </div>
                <span className={`font-oxanium text-2xl md:text-4xl font-bold text-left ${valueColor(row.winner, 'b')}`}>
                    {row.displayB}
                </span>
            </div>
            <div className="mt-2 flex h-1 w-full gap-[2px] bg-[var(--border-color)]">
                {row.shareA === null ? null : (
                    <>
                        <motion.div
                            className="h-full"
                            style={{ backgroundColor: colorA }}
                            initial={{ width: '50%' }}
                            animate={{ width: `${row.shareA * 100}%` }}
                            transition={{ duration: 0.4 }}
                        />
                        <motion.div
                            className="h-full flex-1"
                            style={{ backgroundColor: colorB }}
                        />
                    </>
                )}
            </div>
        </div>
    );
}

export function TeamVersus({
    season,
    raceResults,
    qualiResults,
    constructorStandings,
    averages,
    loading,
    raceStatus,
    qualiStatus,
    toggle,
}: TeamVersusProps) {
    const [searchParams, setSearchParams] = useSearchParams();
    const { exportAsImage, isExporting } = useExportImage();
    const [exportContainerRef, setExportContainerRef] = useState<HTMLDivElement | null>(null);
    const cardRef = useRef<HTMLDivElement>(null);
    const shareSectionRef = useRef<HTMLDivElement>(null);
    const [showCardSection, setShowCardSection] = useState(false);
    const [cardImage, setCardImage] = useState<string | null>(null);
    const [generatingCard, setGeneratingCard] = useState(false);

    const teamOptions = useMemo(
        () => buildTeamOptions(raceResults, qualiResults, averages, constructorStandings),
        [raceResults, qualiResults, averages, constructorStandings],
    );

    const selection = useMemo(
        () => resolveTeamSelection(searchParams.get('a'), searchParams.get('b'), teamOptions.map(option => option.teamId)),
        [searchParams, teamOptions],
    );

    const versus = useMemo(() => {
        if (!selection) return null;
        const [idA, idB] = selection;
        const nameOf = (id: string) => teamOptions.find(option => option.teamId === id)?.teamName ?? id;

        const statsA = buildTeamStats(idA, nameOf(idA), raceResults, averages, constructorStandings);
        const statsB = buildTeamStats(idB, nameOf(idB), raceResults, averages, constructorStandings);
        const h2h = calculateTeamH2H(idA, idB, raceResults, qualiResults);
        const rows = buildComparisonRows(statsA, statsB, h2h, {
            raceAvailable: raceStatus === 'ok',
            qualiAvailable: qualiStatus === 'ok',
        });

        return {
            statsA,
            statsB,
            rows,
            score: countCategoryWins(rows),
            driversA: getTeamDrivers(idA, raceResults, averages),
            driversB: getTeamDrivers(idB, raceResults, averages),
        };
    }, [selection, teamOptions, raceResults, qualiResults, averages, constructorStandings, raceStatus, qualiStatus]);

    const updateSelection = (nextA: string, nextB: string) => {
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            next.set('mode', 'teams');
            next.set('a', nextA);
            next.set('b', nextB);
            return next;
        }, { replace: true });
        setCardImage(null);
    };

    const handleTeamChange = (side: 'a' | 'b', teamId: string) => {
        if (!selection) return;
        const [currentA, currentB] = selection;
        if (side === 'a') {
            updateSelection(teamId, teamId === currentB ? currentA : currentB);
        } else {
            updateSelection(teamId === currentA ? currentB : currentA, teamId);
        }
    };

    const handleSwap = () => {
        if (!selection) return;
        updateSelection(selection[1], selection[0]);
    };

    const handleShare = async () => {
        const shareData = {
            title: `F1 ${season} Team VS`,
            text: `${versus?.statsA.teamName ?? 'Team'} vs ${versus?.statsB.teamName ?? 'Team'} - F1 ${season} team head-to-head on the F1 Driver Rater!`,
            url: window.location.href,
        };

        if (navigator.share) {
            try {
                await navigator.share(shareData);
            } catch (err) {
                console.log('Error sharing:', err);
            }
        } else {
            navigator.clipboard.writeText(window.location.href);
            alert('Link copied to clipboard! Share it with your friends.');
        }
    };

    const handleGenerateCard = async () => {
        if (!cardRef.current || !versus) return;

        setShowCardSection(true);
        setGeneratingCard(true);
        setCardImage(null);

        await new Promise(resolve => setTimeout(resolve, 100));
        shareSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        await new Promise(resolve => setTimeout(resolve, 100));

        try {
            const dataUrl = await toPng(cardRef.current, {
                cacheBust: true,
                pixelRatio: 2,
                backgroundColor: '#0a0a0b',
                width: cardRef.current.scrollWidth,
                height: cardRef.current.scrollHeight,
            });
            setCardImage(dataUrl);
        } catch (error) {
            console.error('Error generating team VS card:', error);
        } finally {
            setGeneratingCard(false);
        }
    };

    const handleDownloadCard = () => {
        if (!cardImage || !versus) return;

        const link = document.createElement('a');
        link.download = `f1-${season}-team-vs-${versus.statsA.teamId}-${versus.statsB.teamId}.png`;
        link.href = cardImage;
        link.click();
    };

    const header = (
        <div className="mb-8 text-center">
            <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="inline-flex items-center justify-center gap-3 mb-4"
            >
                <Swords size={32} className="text-[var(--accent-red)]" />
                <h2 className="font-display text-4xl md:text-6xl text-white uppercase tracking-tight">
                    TEAM <span className="text-[var(--accent-red)]">VS</span>
                </h2>
                <Swords size={32} className="text-[var(--accent-red)] scale-x-[-1]" />
            </motion.div>
            <div className="h-1 w-24 bg-[var(--accent-red)] mx-auto" />
            {toggle}
            {loading && (
                <div className="mt-4 flex items-center justify-center gap-2 text-[var(--text-muted)]">
                    <Loader2 size={14} className="animate-spin" />
                    <span className="font-oxanium text-xs uppercase">Loading team data...</span>
                </div>
            )}
            {!loading && versus && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="mt-6 flex gap-2 justify-center hide-on-export"
                >
                    <button
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
                        onClick={handleShare}
                        className="inline-flex items-center justify-center gap-2 px-6 py-2 bg-zinc-800 hover:bg-zinc-700 border border-[var(--border-color)] text-white transition-colors"
                    >
                        <Share2 size={16} />
                        <span className="font-display text-sm uppercase tracking-wider">SHARE</span>
                    </button>
                    <button
                        onClick={() => exportAsImage(exportContainerRef, { fileName: `f1-${season}-team-vs.png` })}
                        disabled={isExporting}
                        className="inline-flex items-center justify-center gap-2 px-6 py-2 bg-[var(--accent-red)] hover:bg-red-700 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isExporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                        <span className="font-display text-sm uppercase tracking-wider">
                            {isExporting ? 'EXPORTING...' : 'SAVE IMAGE'}
                        </span>
                    </button>
                </motion.div>
            )}
        </div>
    );

    if (!versus || !selection) {
        return (
            <div className="max-w-7xl mx-auto px-4 py-8">
                {header}
                <div className="flex flex-col items-center justify-center min-h-[30vh] text-center p-8">
                    {loading ? (
                        <Loader2 size={48} className="text-[var(--accent-red)] mb-4 animate-spin" />
                    ) : (
                        <Swords size={48} className="text-[var(--text-muted)] mb-4 opacity-50" />
                    )}
                    <h3 className="font-display text-2xl text-white uppercase mb-2">
                        {loading ? 'LOADING BATTLES' : 'NO TEAM BATTLES YET'}
                    </h3>
                    <p className="font-oxanium text-[var(--text-secondary)]">
                        {loading ? 'Fetching season data...' : 'At least two teams are needed for a comparison.'}
                    </p>
                </div>
            </div>
        );
    }

    const { statsA, statsB, rows, score, driversA, driversB } = versus;
    const colorA = TEAM_COLORS[statsA.teamId] || '#666';
    const colorB = TEAM_COLORS[statsB.teamId] || '#666';
    const [scoreA, scoreB] = score;
    const notices = [unavailableMessage('Race', raceStatus), unavailableMessage('Qualifying', qualiStatus)].filter(Boolean);

    const renderDrivers = (drivers: typeof driversA, align: 'left' | 'right') => (
        <div className={`flex flex-col gap-1 ${align === 'right' ? 'items-end text-right' : 'items-start text-left'}`}>
            {drivers.map(driver => (
                <div key={driver.driverId} className="flex items-baseline gap-2 min-w-0">
                    <span className="font-display text-xs md:text-sm text-white uppercase truncate">
                        {getDriverFamilyName(driver.driverName)}
                    </span>
                    <span className="font-oxanium text-[10px] md:text-xs text-[var(--text-muted)]">
                        {driver.averageRating !== null ? driver.averageRating.toFixed(2) : '—'}
                    </span>
                </div>
            ))}
        </div>
    );

    return (
        <div className="max-w-5xl mx-auto px-4 py-8" ref={setExportContainerRef}>
            {header}

            {/* Team selectors */}
            <div className="mb-6 grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] items-center gap-3 hide-on-export">
                <TeamSelect
                    label="TEAM A"
                    value={statsA.teamId}
                    color={colorA}
                    options={teamOptions}
                    onChange={teamId => handleTeamChange('a', teamId)}
                />
                <button
                    type="button"
                    onClick={handleSwap}
                    title="Swap teams"
                    aria-label="Swap teams"
                    className="mx-auto p-2 rounded-full bg-[var(--bg-darker)] border border-[var(--border-color)] hover:border-[var(--accent-yellow)] hover:bg-[var(--accent-yellow)]/10 text-[var(--text-muted)] hover:text-[var(--accent-yellow)] transition-colors"
                >
                    <ArrowLeftRight size={16} className="rotate-90 md:rotate-0" />
                </button>
                <TeamSelect
                    label="TEAM B"
                    value={statsB.teamId}
                    color={colorB}
                    options={teamOptions}
                    onChange={teamId => handleTeamChange('b', teamId)}
                />
            </div>

            {/* VS panel */}
            <motion.div
                key={`${statsA.teamId}-${statsB.teamId}`}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="bg-[var(--bg-panel)] border border-[var(--border-color)] relative overflow-hidden"
            >
                <div className="flex h-1 w-full">
                    <div className="flex-1" style={{ backgroundColor: colorA }} />
                    <div className="flex-1" style={{ backgroundColor: colorB }} />
                </div>

                <div className="relative px-4 md:px-8 py-6 md:py-8">
                    <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 select-none font-display text-[96px] text-white/[0.02] md:text-[160px]">
                        VS
                    </div>

                    <div className="relative grid grid-cols-[1fr_auto_1fr] items-start gap-3">
                        <div className="min-w-0 text-right">
                            <div className="font-display text-xl md:text-4xl uppercase tracking-tight leading-[0.95] break-words" style={{ color: colorA }}>
                                {statsA.teamName}
                            </div>
                        </div>
                        <div className="flex flex-col items-center">
                            <span className="font-oxanium text-[10px] text-[var(--text-muted)] uppercase tracking-widest">VS</span>
                            <div className="mt-1 flex items-baseline gap-2 font-oxanium font-bold text-2xl md:text-4xl">
                                <span className={scoreA > scoreB ? 'text-[var(--accent-yellow)]' : 'text-white'}>{scoreA}</span>
                                <span className="text-[var(--text-muted)] text-lg">-</span>
                                <span className={scoreB > scoreA ? 'text-[var(--accent-yellow)]' : 'text-white'}>{scoreB}</span>
                            </div>
                            <span className="font-oxanium text-[9px] text-[var(--text-muted)] uppercase tracking-widest">categories</span>
                        </div>
                        <div className="min-w-0 text-left">
                            <div className="font-display text-xl md:text-4xl uppercase tracking-tight leading-[0.95] break-words" style={{ color: colorB }}>
                                {statsB.teamName}
                            </div>
                        </div>
                    </div>

                    <div className="relative mt-4 grid grid-cols-2 gap-6">
                        {renderDrivers(driversA, 'right')}
                        {renderDrivers(driversB, 'left')}
                    </div>
                </div>

                {rows.map(row => (
                    <VersusRowView key={row.key} row={row} colorA={colorA} colorB={colorB} />
                ))}
            </motion.div>

            {notices.length > 0 && (
                <p className="mt-3 text-center font-oxanium text-[10px] text-[var(--text-muted)] uppercase tracking-wider">
                    {notices.join(' • ')}
                </p>
            )}

            {/* Hidden card used for the shareable PNG */}
            <div className="fixed -left-[9999px] top-0 hide-on-export">
                <div
                    ref={cardRef}
                    className="w-[600px] p-8"
                    style={{
                        background: 'linear-gradient(135deg, #0a0a0b 0%, #1a1a1c 50%, #0a0a0b 100%)',
                        fontFamily: 'Formula1, sans-serif',
                    }}
                >
                    <div className="border-l-4 border-[#e10600] pl-4 mb-6">
                        <div className="text-[10px] text-[#e10600] tracking-[0.3em] mb-1">TEAM VS</div>
                        <div className="text-5xl font-black text-white tracking-tight">{season} H2H</div>
                        <div className="text-xs text-gray-500 mt-1 uppercase">
                            {statsA.teamName} vs {statsB.teamName}
                        </div>
                    </div>

                    <div className="flex items-center gap-3 mb-4">
                        <div className="flex-1 min-w-0 px-3 py-3" style={{ background: 'rgba(255,255,255,0.03)', borderLeft: `3px solid ${colorA}` }}>
                            <div className="text-white font-bold text-lg uppercase tracking-wide truncate">{statsA.teamName}</div>
                            <div className="text-gray-500 text-[10px] mt-1 uppercase truncate">
                                {driversA.map(driver => getDriverFamilyName(driver.driverName)).join(' • ') || '—'}
                            </div>
                        </div>
                        <div className="text-center">
                            <div className="text-gray-600 text-[10px] font-bold">VS</div>
                            <div className="text-white font-bold text-2xl">{scoreA} - {scoreB}</div>
                        </div>
                        <div className="flex-1 min-w-0 px-3 py-3 text-right" style={{ background: 'rgba(255,255,255,0.03)', borderRight: `3px solid ${colorB}` }}>
                            <div className="text-white font-bold text-lg uppercase tracking-wide truncate">{statsB.teamName}</div>
                            <div className="text-gray-500 text-[10px] mt-1 uppercase truncate">
                                {driversB.map(driver => getDriverFamilyName(driver.driverName)).join(' • ') || '—'}
                            </div>
                        </div>
                    </div>

                    <div className="space-y-1">
                        {rows.map(row => (
                            <div
                                key={row.key}
                                className="px-3 py-2 flex items-center"
                                style={{ background: 'rgba(255,255,255,0.03)' }}
                            >
                                <div className="flex-1 text-right text-lg font-bold" style={{ color: row.winner === 'a' ? '#f2d13d' : row.winner === 'none' ? '#55575e' : row.winner === 'tie' ? '#ffffff' : '#8e9196' }}>
                                    {row.displayA}
                                </div>
                                <div className="w-[170px] text-center text-[10px] text-gray-500 uppercase tracking-[0.2em]">
                                    {row.label}
                                    {row.note && <div className="text-[9px] text-gray-600 normal-case tracking-normal">{row.note}</div>}
                                </div>
                                <div className="flex-1 text-left text-lg font-bold" style={{ color: row.winner === 'b' ? '#f2d13d' : row.winner === 'none' ? '#55575e' : row.winner === 'tie' ? '#ffffff' : '#8e9196' }}>
                                    {row.displayB}
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="mt-6 pt-4 border-t border-gray-800 flex justify-between items-center">
                        <div className="text-[10px] text-gray-600 uppercase tracking-widest">F1 DRIVER RATING</div>
                        <div className="text-[10px] text-gray-600">{new Date().toLocaleDateString()}</div>
                    </div>
                </div>
            </div>

            {/* Shareable card section */}
            {showCardSection && (
                <motion.div
                    ref={shareSectionRef}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-20 pt-12 border-t border-[var(--border-color)] hide-on-export"
                >
                    <div className="mb-6 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <Share2 size={20} className="text-[var(--accent-red)]" />
                            <h3 className="font-display text-3xl text-white uppercase tracking-wider">SHARE TEAM CARD</h3>
                        </div>
                        <button
                            onClick={() => setShowCardSection(false)}
                            className="font-oxanium text-xs text-[var(--text-muted)] hover:text-white uppercase tracking-wider transition-colors"
                        >
                            HIDE
                        </button>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
                        <div className="bg-[var(--bg-panel)] border border-[var(--border-color)] p-6">
                            <div className="mb-4">
                                <span className="font-oxanium text-[10px] text-[var(--text-muted)] uppercase tracking-widest">PREVIEW</span>
                            </div>
                            <div className="border border-[var(--border-color)] overflow-hidden">
                                {generatingCard ? (
                                    <div className="flex flex-col items-center justify-center h-80 bg-[var(--bg-darker)] gap-4">
                                        <div className="animate-spin w-10 h-10 border-2 border-[var(--accent-red)] border-t-transparent rounded-full" />
                                        <span className="font-oxanium text-xs text-[var(--text-muted)] uppercase tracking-widest animate-pulse">Generating...</span>
                                    </div>
                                ) : cardImage ? (
                                    <img src={cardImage} alt="Generated team versus card" className="w-full" />
                                ) : (
                                    <div className="flex items-center justify-center h-80 bg-[var(--bg-darker)] text-[var(--text-muted)]">
                                        Error generating card
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="space-y-6">
                            <div className="bg-[var(--bg-panel)] border border-[var(--border-color)] p-6">
                                <h4 className="font-display text-xl text-white uppercase tracking-wider mb-4">DOWNLOAD</h4>
                                <p className="font-oxanium text-sm text-[var(--text-secondary)] mb-6">
                                    Save this team head-to-head as a high-quality PNG image.
                                </p>
                                <button
                                    onClick={handleDownloadCard}
                                    disabled={!cardImage || generatingCard}
                                    className="w-full flex items-center justify-center gap-3 py-4 bg-[var(--accent-red)] hover:bg-[#ff0000] text-white font-display text-xl uppercase tracking-widest transition-colors disabled:opacity-50"
                                >
                                    <Download size={22} />
                                    DOWNLOAD PNG
                                </button>
                            </div>

                            <div className="bg-[var(--bg-panel)] border border-[var(--border-color)] p-6">
                                <h4 className="font-display text-xl text-white uppercase tracking-wider mb-4">REGENERATE</h4>
                                <p className="font-oxanium text-sm text-[var(--text-secondary)] mb-6">
                                    Update the card with the currently selected teams.
                                </p>
                                <button
                                    onClick={handleGenerateCard}
                                    disabled={generatingCard}
                                    className="w-full flex items-center justify-center gap-3 py-4 bg-[var(--bg-darker)] border border-[var(--border-color)] hover:border-white text-white font-display text-xl uppercase tracking-widest transition-colors disabled:opacity-50"
                                >
                                    <ImageDown size={22} />
                                    REGENERATE CARD
                                </button>
                            </div>
                        </div>
                    </div>
                </motion.div>
            )}
        </div>
    );
}

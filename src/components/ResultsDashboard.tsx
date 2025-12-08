import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, BarChart3, RotateCcw, ImageDown, Download, Share2, AlertTriangle, Table, Upload, FileJson, CheckCircle, XCircle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { toPng } from 'html-to-image';
import { TEAM_COLORS } from '../types';
import { calculateAverages, clearSeasonRatings, getRatedRacesCount, getRaceByRaceMatrix, downloadRatingsAsJson, importRatings } from '../utils/storage';
import { CountryFlag } from '../utils/countryFlags';

interface ResultsDashboardProps {
    season: string;
    onReset: () => void;
}

export function ResultsDashboard({ season, onReset }: ResultsDashboardProps) {
    const averages = calculateAverages(season);
    const ratedCount = getRatedRacesCount(season);
    const raceMatrix = getRaceByRaceMatrix(season);
    const [showCardSection, setShowCardSection] = useState(false);
    const [cardImage, setCardImage] = useState<string | null>(null);
    const [generating, setGenerating] = useState(false);
    const [generatingTable, setGeneratingTable] = useState(false);
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [importMessage, setImportMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const cardRef = useRef<HTMLDivElement>(null);
    const shareSectionRef = useRef<HTMLDivElement>(null);
    const tableRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    if (averages.length === 0) {
        return (
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center p-20 border border-[var(--border-color)] bg-[var(--bg-panel)] min-h-[400px]"
            >
                <div className="w-16 h-16 border border-[var(--text-muted)] flex items-center justify-center mb-6 opacity-50">
                    <Trophy size={24} className="text-[var(--text-muted)]" />
                </div>
                <h3 className="font-display text-4xl mb-2 text-white uppercase tracking-wide">NO RATINGS YET</h3>
                <p className="font-oxanium text-[var(--text-secondary)] uppercase tracking-wider text-sm">
                    Rate some races to see your results
                </p>
            </motion.div>
        );
    }

    function getTeamColor(constructorId: string): string {
        return TEAM_COLORS[constructorId] || '#888888';
    }

    async function handleGenerateCard() {
        if (!cardRef.current) return;

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
        link.download = `f1-ratings-${season}.png`;
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
            const dataUrl = await toPng(tableRef.current, {
                cacheBust: true,
                pixelRatio: 2,
                backgroundColor: '#0a0a0b',
                width: tableRef.current.scrollWidth,
                height: tableRef.current.scrollHeight,
            });

            const link = document.createElement('a');
            link.download = `f1-race-breakdown-${season}.png`;
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
            const result = importRatings(content);

            if (result.success) {
                setImportMessage({ type: 'success', text: result.message });
                // Reload page to reflect imported data
                setTimeout(() => {
                    window.location.reload();
                }, 1500);
            } else {
                setImportMessage({ type: 'error', text: result.message });
                setTimeout(() => setImportMessage(null), 3000);
            }
        };
        reader.readAsText(file);

        // Reset input so same file can be imported again
        e.target.value = '';
    }

    // Chart data
    const chartData = averages.slice(0, 10).map(d => ({
        name: d.driverName.split(' ').pop()?.toUpperCase(),
        rating: d.averageRating,
        fullName: d.driverName.toUpperCase(),
        color: getTeamColor(d.constructorId),
        team: d.constructorName.toUpperCase()
    }));

    // Podium (top 3)
    const podium = averages.slice(0, 3);
    const podiumOrder = [1, 0, 2]; // Silver, Gold, Bronze positions

    return (
        <div className="min-h-screen py-8">
            <div className="max-w-6xl mx-auto space-y-20">

                {/* 1. SECTION: HEADER */}
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-6"
                >
                    <div className="flex flex-col items-start border-l-4 border-[var(--accent-red)] pl-6">
                        <h2 className="font-display text-7xl text-white uppercase tracking-tight leading-none">
                            {season} <span className="text-[var(--accent-red)]">SEASON</span>
                        </h2>
                        <div className="h-px w-32 bg-[var(--accent-red)] mt-2" />
                    </div>

                    <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-4">
                        <p className="font-oxanium text-[var(--accent-red)] tracking-widest text-sm uppercase">
                            SEASON {season} • RACES RATED: <span className="text-white">{ratedCount}</span>
                        </p>

                        <div className="flex gap-2 flex-wrap">
                            {/* Export JSON */}
                            <button
                                onClick={handleExportJson}
                                className="group flex items-center gap-2 px-4 py-2 bg-[var(--bg-panel)] border border-[var(--border-color)] hover:border-[#00FF88] transition-all hover:bg-[var(--bg-panel-hover)]"
                            >
                                <FileJson size={14} className="text-[var(--text-muted)] group-hover:text-[#00FF88]" />
                                <span className="font-ui font-bold text-xs text-white uppercase tracking-wider">EXPORT JSON</span>
                            </button>

                            {/* Import JSON */}
                            <button
                                onClick={handleImportClick}
                                className="group flex items-center gap-2 px-4 py-2 bg-[var(--bg-panel)] border border-[var(--border-color)] hover:border-[var(--accent-yellow)] transition-all hover:bg-[var(--bg-panel-hover)]"
                            >
                                <Upload size={14} className="text-[var(--text-muted)] group-hover:text-[var(--accent-yellow)]" />
                                <span className="font-ui font-bold text-xs text-white uppercase tracking-wider">IMPORT JSON</span>
                            </button>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".json"
                                onChange={handleFileChange}
                                className="hidden"
                            />

                            {/* Generate Card */}
                            <button
                                onClick={handleGenerateCard}
                                className="group flex items-center gap-2 px-4 py-2 bg-[var(--bg-panel)] border border-[var(--border-color)] hover:border-white transition-all hover:bg-[var(--bg-panel-hover)]"
                            >
                                <ImageDown size={14} className="text-[var(--text-muted)] group-hover:text-white" />
                                <span className="font-ui font-bold text-xs text-white uppercase tracking-wider">GENERATE CARD</span>
                            </button>

                            {/* Clear All */}
                            <button
                                onClick={handleReset}
                                className="group flex items-center gap-2 px-4 py-2 bg-[var(--bg-panel)] border border-[var(--border-color)] hover:border-[var(--accent-red)] transition-all hover:bg-[var(--bg-panel-hover)]"
                            >
                                <RotateCcw size={14} className="text-[var(--text-muted)] group-hover:text-[var(--accent-red)]" />
                                <span className="font-ui font-bold text-xs text-white uppercase tracking-wider">CLEAR ALL</span>
                            </button>
                        </div>
                    </div>

                    {/* Import Notification */}
                    <AnimatePresence>
                        {importMessage && (
                            <motion.div
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                className={`mt-4 p-4 border flex items-center gap-3 ${importMessage.type === 'success'
                                    ? 'bg-[#00FF88]/10 border-[#00FF88]'
                                    : 'bg-[var(--accent-red)]/10 border-[var(--accent-red)]'
                                    }`}
                            >
                                {importMessage.type === 'success' ? (
                                    <CheckCircle size={20} className="text-[#00FF88]" />
                                ) : (
                                    <XCircle size={20} className="text-[var(--accent-red)]" />
                                )}
                                <span className="font-oxanium text-sm text-white">{importMessage.text}</span>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </motion.div>

                {/* 2. SECTION: PODIUM (TECHNICAL BLOCKS) */}
                <div className="pt-8 pb-16">
                    <div className="flex items-end justify-center gap-2 md:gap-8">
                        {podiumOrder.map((pos, visualIndex) => {
                            if (!podium[pos]) return null;
                            const driver = podium[pos];
                            const isWinner = pos === 0;
                            // Explicit heights
                            const blockHeight = isWinner ? 'h-56' : pos === 1 ? 'h-40' : 'h-32';
                            const positionColor = isWinner ? 'var(--accent-yellow)' : pos === 1 ? '#C0C0C0' : '#CD7F32';
                            const rank = isWinner ? 1 : pos === 1 ? 2 : 3;

                            return (
                                <motion.div
                                    key={driver.driverId}
                                    initial={{ opacity: 0, y: 50 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.1 * visualIndex, ease: "circOut" }}
                                    className={`flex flex-col w-40 md:w-56 ${isWinner ? 'z-10' : 'z-0'}`}
                                >
                                    {/* DRIVER INFO */}
                                    <div className="mb-2 bg-[var(--bg-panel)] border border-[var(--border-color)] border-l-2 p-3"
                                        style={{ borderLeftColor: getTeamColor(driver.constructorId) }}
                                    >
                                        <div className="flex justify-between items-start mb-1">
                                            <span className="font-oxanium text-xs text-[var(--text-secondary)]">P{rank}</span>
                                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: getTeamColor(driver.constructorId) }} />
                                        </div>
                                        <div className="font-display-condensed text-2xl leading-none text-white uppercase tracking-tight">
                                            {driver.driverName.split(' ')[1]}
                                        </div>
                                        <div className="font-ui text-[10px] text-[var(--text-muted)] uppercase tracking-wider mt-1">
                                            {driver.constructorName}
                                        </div>
                                    </div>

                                    {/* RATING DISPLAY */}
                                    <div className="bg-[var(--bg-darker)] border-x border-[var(--border-color)] px-4 py-2 flex justify-between items-center">
                                        <span className="font-ui text-[10px] text-[var(--text-secondary)] uppercase">AVG RATING</span>
                                        <span className="font-oxanium text-xl font-bold" style={{ color: positionColor }}>
                                            {driver.averageRating.toFixed(2)}
                                        </span>
                                    </div>

                                    {/* BAR BLOCK */}
                                    <div
                                        className={`w-full ${blockHeight} relative bg-[var(--bg-panel)] border border-[var(--border-color)] border-t-0 p-2 overflow-hidden`}
                                    >
                                        <div className="absolute inset-0 opacity-10"
                                            style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, #fff 2px, #fff 3px)' }} />

                                        <div className="absolute bottom-0 left-0 w-full h-1" style={{ backgroundColor: positionColor }} />

                                        <span className="absolute bottom-2 right-4 font-oxanium text-6xl opacity-10 font-bold leading-none">
                                            {rank}
                                        </span>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>
                </div>

                {/* 3. SECTION: STATS GRID */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">

                    {/* CHART (Span 6) */}
                    <div className="lg:col-span-6">
                        <div className="mb-4 flex items-center justify-between border-b border-[var(--border-color)] pb-2">
                            <h3 className="font-display text-2xl text-white uppercase tracking-wider">PERFORMANCE ANALYSIS</h3>
                            <BarChart3 className="text-[var(--accent-red)] opacity-50" size={16} />
                        </div>

                        <div className="bg-[var(--bg-panel)] border border-[var(--border-color)] p-6 h-[600px] relative scanline">
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

                    {/* STANDINGS TABLE (Span 6) */}
                    <div className="lg:col-span-6">
                        <div className="mb-4 flex items-center justify-between border-b border-[var(--border-color)] pb-2">
                            <h3 className="font-display text-2xl text-white uppercase tracking-wider">DRIVER STANDINGS</h3>
                            <div className="flex gap-2 text-[10px] font-oxanium text-[var(--text-muted)]">
                                <span>POS</span>
                                <span>//</span>
                                <span>DRIVER</span>
                                <span>//</span>
                                <span>RATING</span>
                            </div>
                        </div>

                        <div className="bg-[var(--bg-panel)] border-t border-[var(--border-color)]">
                            <div className="max-h-[600px] overflow-y-auto pr-1">
                                {averages.map((driver, index) => (
                                    <motion.div
                                        key={driver.driverId}
                                        className="telemetry-row p-3 animate-enter"
                                        style={{ animationDelay: `${index * 50}ms`, gridTemplateColumns: '40px 40px 1fr auto' }}
                                    >
                                        {/* POS */}
                                        <div className="font-oxanium text-lg text-[var(--text-secondary)] font-bold text-center">
                                            {index + 1}
                                        </div>

                                        {/* TEAM STRIPE */}
                                        <div className="h-4 w-1 bg-white/20 mx-auto" style={{ backgroundColor: getTeamColor(driver.constructorId) }} />

                                        {/* DRIVER */}
                                        <div className="flex flex-col justify-center min-w-0">
                                            <div className="font-display-condensed text-xl text-white leading-none uppercase tracking-tight">
                                                {driver.driverName}
                                            </div>
                                            <div className="font-ui text-[10px] text-[var(--text-muted)] uppercase tracking-wider">
                                                {driver.constructorName}
                                            </div>
                                        </div>

                                        {/* RATING */}
                                        <div className="font-oxanium text-xl font-bold tracking-widest text-right pr-2"
                                            style={{ color: index < 3 ? 'var(--accent-yellow)' : 'white' }}>
                                            {driver.averageRating.toFixed(2)}
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        </div>
                    </div>

                </div>

                {/* 4. SECTION: RACE-BY-RACE TABLE */}
                {raceMatrix.races.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                        className="mt-12"
                    >
                        <div className="mb-4 flex items-center justify-between border-b border-[var(--border-color)] pb-2">
                            <div className="flex items-center gap-3">
                                <Table size={16} className="text-[var(--accent-red)]" />
                                <h3 className="font-display text-2xl text-white uppercase tracking-wider">RACE-BY-RACE BREAKDOWN</h3>
                            </div>
                            <div className="flex items-center gap-4">
                                <span className="font-oxanium text-[10px] text-[var(--text-muted)] uppercase tracking-widest">
                                    {raceMatrix.races.length} RACES • {raceMatrix.drivers.length} DRIVERS
                                </span>
                                <button
                                    onClick={handleDownloadTable}
                                    disabled={generatingTable}
                                    className="group flex items-center gap-2 px-4 py-1.5 bg-[var(--bg-panel)] border border-[var(--border-color)] hover:border-white transition-all hover:bg-[var(--bg-panel-hover)] disabled:opacity-50"
                                >
                                    {generatingTable ? (
                                        <div className="w-3 h-3 border-2 border-[var(--accent-red)] border-t-transparent rounded-full animate-spin" />
                                    ) : (
                                        <Download size={12} className="text-[var(--text-muted)] group-hover:text-white" />
                                    )}
                                    <span className="font-ui font-bold text-[10px] text-white uppercase tracking-wider">
                                        {generatingTable ? 'GENERATING...' : 'DOWNLOAD PNG'}
                                    </span>
                                </button>
                            </div>
                        </div>

                        <div ref={tableRef} className="bg-[var(--bg-panel)] border border-[var(--border-color)] overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-max">
                                    {/* Header */}
                                    <thead>
                                        <tr className="border-b border-[var(--border-color)]">
                                            <th className="sticky left-0 z-10 bg-[var(--bg-darker)] px-3 py-2 text-left w-12">
                                                <span className="font-oxanium text-[10px] text-[var(--text-muted)] uppercase">#</span>
                                            </th>
                                            <th className="sticky left-12 z-10 bg-[var(--bg-darker)] px-3 py-2 text-left min-w-[140px]">
                                                <span className="font-oxanium text-[10px] text-[var(--text-muted)] uppercase">DRIVER</span>
                                            </th>
                                            <th className="bg-[var(--bg-darker)] px-3 py-2 text-center w-16">
                                                <span className="font-oxanium text-[10px] text-[var(--accent-yellow)] uppercase">AVG</span>
                                            </th>
                                            {raceMatrix.races.map(race => (
                                                <th key={race.round} className="bg-[var(--bg-darker)] px-2 py-2 text-center min-w-[48px]" title={race.raceName}>
                                                    <div className="flex flex-col items-center gap-1">
                                                        <CountryFlag country={race.countryCode} size="sm" />
                                                    </div>
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>

                                    {/* Body */}
                                    <tbody>
                                        {raceMatrix.drivers.map((driver, index) => (
                                            <tr
                                                key={driver.driverId}
                                                className="border-b border-[var(--border-color)] hover:bg-[var(--bg-panel-hover)] transition-colors"
                                            >
                                                {/* Position */}
                                                <td className="sticky left-0 z-10 bg-[var(--bg-panel)] px-3 py-2 text-center">
                                                    <span className="font-oxanium text-sm text-[var(--text-muted)]">{index + 1}</span>
                                                </td>

                                                {/* Driver Name */}
                                                <td className="sticky left-12 z-10 bg-[var(--bg-panel)] px-3 py-2">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-1 h-6" style={{ backgroundColor: getTeamColor(driver.constructorId) }} />
                                                        <div>
                                                            <div className="font-display text-sm text-white uppercase leading-none">
                                                                {driver.driverName.split(' ')[1]}
                                                            </div>
                                                            <div className="font-oxanium text-[8px] text-[var(--text-muted)] uppercase">
                                                                {driver.constructorName}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>

                                                {/* Average */}
                                                <td className="px-3 py-2 text-center bg-[var(--bg-darker)]/50">
                                                    <span className="font-oxanium text-sm font-bold text-[var(--accent-yellow)]">
                                                        {driver.totalAverage.toFixed(1)}
                                                    </span>
                                                </td>

                                                {/* Race Ratings */}
                                                {raceMatrix.races.map(race => {
                                                    const rating = driver.raceRatings[race.round];
                                                    const hasRating = rating !== undefined && rating > 0;

                                                    // Gradient color based on rating
                                                    let ratingColor = 'var(--text-muted)';
                                                    if (hasRating) {
                                                        const t = (rating - 0.5) / 9.5;
                                                        if (t < 0.4) {
                                                            const localT = t / 0.4;
                                                            ratingColor = `rgb(225, ${Math.round(6 + localT * 101)}, 0)`;
                                                        } else if (t < 0.7) {
                                                            const localT = (t - 0.4) / 0.3;
                                                            ratingColor = `rgb(${Math.round(225 + localT * 17)}, ${Math.round(107 + localT * 102)}, ${Math.round(localT * 61)})`;
                                                        } else {
                                                            const localT = (t - 0.7) / 0.3;
                                                            ratingColor = `rgb(${Math.round(242 - localT * 242)}, ${Math.round(209 + localT * 46)}, ${Math.round(61 + localT * 75)})`;
                                                        }
                                                    }

                                                    return (
                                                        <td key={race.round} className="px-2 py-2 text-center">
                                                            <span
                                                                className="font-oxanium text-sm font-medium"
                                                                style={{ color: ratingColor }}
                                                            >
                                                                {hasRating ? (rating % 1 === 0 ? rating : rating.toFixed(1)) : '-'}
                                                            </span>
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </motion.div>
                )}
            </div>

            {/* Hidden Card for Image Generation */}
            <div className="fixed -left-[9999px] top-0">
                <div
                    ref={cardRef}
                    className="w-[600px] p-8"
                    style={{
                        background: 'linear-gradient(135deg, #0a0a0b 0%, #1a1a1c 50%, #0a0a0b 100%)',
                        fontFamily: 'system-ui, sans-serif'
                    }}
                >
                    {/* Card Header */}
                    <div className="border-l-4 border-[#e10600] pl-4 mb-6">
                        <div className="text-[10px] text-[#e10600] tracking-[0.3em] mb-1">MY DRIVER RATINGS</div>
                        <div className="text-5xl font-black text-white tracking-tight">{season} SEASON</div>
                        <div className="text-xs text-gray-500 mt-1">{ratedCount} RACES RATED</div>
                    </div>

                    {/* Top 10 Drivers */}
                    <div className="space-y-1">
                        {averages.slice(0, 10).map((driver, index) => {
                            const isTop3 = index < 3;
                            const positionColor = index === 0 ? '#FFD700' : index === 1 ? '#C0C0C0' : index === 2 ? '#CD7F32' : '#888';

                            return (
                                <div
                                    key={driver.driverId}
                                    className="flex items-center gap-3 py-2 px-3"
                                    style={{
                                        background: isTop3 ? 'rgba(255,255,255,0.03)' : 'transparent',
                                        borderLeft: `3px solid ${getTeamColor(driver.constructorId)}`
                                    }}
                                >
                                    {/* Position */}
                                    <div
                                        className="w-8 text-2xl font-black text-center"
                                        style={{ color: positionColor }}
                                    >
                                        {index + 1}
                                    </div>

                                    {/* Driver Info */}
                                    <div className="flex-1">
                                        <div className="text-white font-bold text-lg uppercase tracking-wide">
                                            {driver.driverName}
                                        </div>
                                        <div className="text-gray-500 text-[10px] uppercase tracking-wider">
                                            {driver.constructorName}
                                        </div>
                                    </div>

                                    {/* Rating */}
                                    <div
                                        className="text-2xl font-black"
                                        style={{ color: isTop3 ? '#FFD700' : '#fff' }}
                                    >
                                        {driver.averageRating.toFixed(2)}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Footer */}
                    <div className="mt-6 pt-4 border-t border-gray-800 flex justify-between items-center">
                        <div className="text-[10px] text-gray-600 uppercase tracking-widest">F1 DRIVER RATING</div>
                        <div className="text-[10px] text-gray-600">{new Date().toLocaleDateString()}</div>
                    </div>
                </div>
            </div>

            {/* 4. SECTION: SHARE YOUR CARD - Shows after clicking Generate Card */}
            {showCardSection && (
                <motion.div
                    ref={shareSectionRef}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-20 pt-12 border-t border-[var(--border-color)]"
                >
                    <div className="mb-6 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <Share2 size={20} className="text-[var(--accent-red)]" />
                            <h3 className="font-display text-3xl text-white uppercase tracking-wider">SHARE YOUR CARD</h3>
                        </div>
                        <button
                            onClick={() => setShowCardSection(false)}
                            className="font-oxanium text-xs text-[var(--text-muted)] hover:text-white uppercase tracking-wider transition-colors"
                        >
                            HIDE
                        </button>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
                        {/* Card Preview */}
                        <div className="bg-[var(--bg-panel)] border border-[var(--border-color)] p-6">
                            <div className="mb-4">
                                <span className="font-oxanium text-[10px] text-[var(--text-muted)] uppercase tracking-widest">PREVIEW</span>
                            </div>
                            <div className="border border-[var(--border-color)] overflow-hidden">
                                {generating ? (
                                    <div className="flex flex-col items-center justify-center h-80 bg-[var(--bg-darker)] gap-4">
                                        <div className="animate-spin w-10 h-10 border-2 border-[var(--accent-red)] border-t-transparent rounded-full" />
                                        <span className="font-oxanium text-xs text-[var(--text-muted)] uppercase tracking-widest animate-pulse">Generating...</span>
                                    </div>
                                ) : cardImage ? (
                                    <img src={cardImage} alt="Generated Card" className="w-full" />
                                ) : (
                                    <div className="flex items-center justify-center h-80 bg-[var(--bg-darker)] text-[var(--text-muted)]">
                                        Error generating card
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Actions Panel */}
                        <div className="space-y-6">
                            <div className="bg-[var(--bg-panel)] border border-[var(--border-color)] p-6">
                                <h4 className="font-display text-xl text-white uppercase tracking-wider mb-4">DOWNLOAD</h4>
                                <p className="font-oxanium text-sm text-[var(--text-secondary)] mb-6">
                                    Save your personalized F1 driver ratings card as a high-quality PNG image.
                                </p>
                                <button
                                    onClick={handleDownloadCard}
                                    disabled={!cardImage || generating}
                                    className="w-full flex items-center justify-center gap-3 py-4 bg-[var(--accent-red)] hover:bg-[#ff0000] text-white font-display text-xl uppercase tracking-widest transition-colors disabled:opacity-50"
                                >
                                    <Download size={22} />
                                    DOWNLOAD PNG
                                </button>
                            </div>

                            <div className="bg-[var(--bg-panel)] border border-[var(--border-color)] p-6">
                                <h4 className="font-display text-xl text-white uppercase tracking-wider mb-4">REGENERATE</h4>
                                <p className="font-oxanium text-sm text-[var(--text-secondary)] mb-6">
                                    Update the card with your latest ratings.
                                </p>
                                <button
                                    onClick={handleGenerateCard}
                                    disabled={generating}
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

            {/* Confirmation Modal */}
            <AnimatePresence>
                {showConfirmModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center p-4"
                        onClick={() => setShowConfirmModal(false)}
                    >
                        <div className="absolute inset-0 bg-black/90 backdrop-blur-md" />

                        <motion.div
                            initial={{ opacity: 0, scale: 0.9, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 20 }}
                            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                            onClick={e => e.stopPropagation()}
                            className="relative bg-[var(--bg-panel)] border border-[var(--border-color)] p-8 max-w-md w-full"
                        >
                            {/* Warning Icon */}
                            <div className="flex justify-center mb-6">
                                <div className="w-16 h-16 flex items-center justify-center border-2 border-[var(--accent-red)] bg-[var(--accent-red)]/10">
                                    <AlertTriangle size={32} className="text-[var(--accent-red)]" />
                                </div>
                            </div>

                            {/* Title */}
                            <h3 className="font-display text-3xl text-white uppercase tracking-wider text-center mb-2">
                                CLEAR ALL DATA
                            </h3>

                            {/* Message */}
                            <p className="font-oxanium text-sm text-[var(--text-secondary)] text-center mb-8">
                                Are you sure you want to reset all <span className="text-white font-bold">{season}</span> ratings? This action cannot be undone.
                            </p>

                            {/* Actions */}
                            <div className="flex gap-4">
                                <button
                                    onClick={() => setShowConfirmModal(false)}
                                    className="flex-1 py-3 bg-[var(--bg-darker)] border border-[var(--border-color)] hover:border-white text-white font-display text-lg uppercase tracking-widest transition-colors"
                                >
                                    CANCEL
                                </button>
                                <button
                                    onClick={confirmReset}
                                    className="flex-1 py-3 bg-[var(--accent-red)] hover:bg-[#ff0000] text-white font-display text-lg uppercase tracking-widest transition-colors"
                                >
                                    CLEAR ALL
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

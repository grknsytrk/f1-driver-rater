import type { RefObject } from 'react';
import { m } from 'framer-motion';
import { Download, ImageDown, Share2 } from 'lucide-react';
import type { DriverSeasonStats, VersusRow } from '../../utils/driverVersus';

export interface DriverVersusShareCardProps {
    statsA: DriverSeasonStats;
    statsB: DriverSeasonStats;
    colorA: string;
    colorB: string;
    scoreA: number;
    scoreB: number;
    rows: VersusRow[];
    isSameDriverEraBattle: boolean;
    isCrossSeason: boolean;
    cardRef: RefObject<HTMLDivElement | null>;
    shareSectionRef: RefObject<HTMLDivElement | null>;
    showCardSection: boolean;
    onHide: () => void;
    generatingCard: boolean;
    cardImage: string | null;
    onDownloadCard: () => void;
    onGenerateCard: () => void;
}

function getDriverFamilyName(driverName: string): string {
    const parts = driverName.trim().split(/\s+/);
    return parts[parts.length - 1] || driverName;
}

/** Off-screen shareable Driver VS card and interactive PNG preview/download section. */
export function DriverVersusShareCard({
    statsA,
    statsB,
    colorA,
    colorB,
    scoreA,
    scoreB,
    rows,
    isSameDriverEraBattle,
    isCrossSeason,
    cardRef,
    shareSectionRef,
    showCardSection,
    onHide,
    generatingCard,
    cardImage,
    onDownloadCard,
    onGenerateCard,
}: DriverVersusShareCardProps) {
    const eyebrow = isSameDriverEraBattle
        ? `ERA BATTLE • ${statsA.season} VS ${statsB.season}`
        : isCrossSeason
            ? `CROSS-SEASON • ${statsA.season} VS ${statsB.season}`
            : `DRIVER HEAD-TO-HEAD • ${statsA.season}`;

    return (
        <>
            {/* Off-screen 600px card for PNG export */}
            <div className="fixed -left-[9999px] top-0 hide-on-export">
                <div
                    ref={cardRef}
                    className="w-[600px] p-8"
                    style={{
                        background: 'linear-gradient(135deg, #0a0a0b 0%, #1a1a1c 50%, #0a0a0b 100%)',
                        fontFamily: 'Formula1, sans-serif',
                    }}
                >
                    <div className="flex h-1 w-full mb-5">
                        <div className="flex-1" style={{ backgroundColor: colorA }} />
                        <div className="flex-1" style={{ backgroundColor: colorB }} />
                    </div>

                    <div className="text-[10px] text-[#e10600] tracking-[0.25em] uppercase mb-3">
                        {eyebrow}
                    </div>

                    <div className="flex items-start justify-between gap-4 mb-6">
                        <div className="min-w-0 flex-1">
                            <div className="text-white text-2xl font-black uppercase leading-tight truncate">
                                {getDriverFamilyName(statsA.driverName)}
                            </div>
                            <div className="text-gray-400 text-[10px] uppercase tracking-wider mt-1">
                                {statsA.season}{statsA.constructorName ? ` • ${statsA.constructorName}` : ''}
                            </div>
                        </div>

                        <div className="text-center shrink-0 px-3">
                            <div className="text-3xl font-black text-white tabular-nums">
                                <span style={{ color: scoreA > scoreB ? '#FACC15' : '#FFFFFF' }}>{scoreA}</span>
                                <span className="text-gray-500 mx-1.5">-</span>
                                <span style={{ color: scoreB > scoreA ? '#FACC15' : '#FFFFFF' }}>{scoreB}</span>
                            </div>
                            <div className="text-[9px] text-gray-500 uppercase tracking-widest mt-0.5">
                                categories
                            </div>
                        </div>

                        <div className="min-w-0 flex-1 text-right">
                            <div className="text-white text-2xl font-black uppercase leading-tight truncate">
                                {getDriverFamilyName(statsB.driverName)}
                            </div>
                            <div className="text-gray-400 text-[10px] uppercase tracking-wider mt-1">
                                {statsB.season}{statsB.constructorName ? ` • ${statsB.constructorName}` : ''}
                            </div>
                        </div>
                    </div>

                    <div className="border-t border-gray-800 divide-y divide-gray-800/80">
                        {rows.map((row) => (
                            <div key={row.key} className="grid grid-cols-[1fr_auto_1fr] items-center py-2 text-sm">
                                <span
                                    className="font-bold tabular-nums"
                                    style={{ color: row.winner === 'a' ? '#FACC15' : row.winner === 'tie' ? '#FFFFFF' : '#888888' }}
                                >
                                    {row.displayA}
                                </span>
                                <span className="text-[10px] text-gray-400 uppercase tracking-widest px-4">
                                    {row.label}
                                </span>
                                <span
                                    className="text-right font-bold tabular-nums"
                                    style={{ color: row.winner === 'b' ? '#FACC15' : row.winner === 'tie' ? '#FFFFFF' : '#888888' }}
                                >
                                    {row.displayB}
                                </span>
                            </div>
                        ))}
                    </div>

                    <div className="mt-6 pt-4 border-t border-gray-800 flex justify-between items-center">
                        <div className="text-[10px] text-gray-600 uppercase tracking-widest">F1 DRIVER RATING</div>
                        <div className="text-[10px] text-gray-600">{new Date().toLocaleDateString()}</div>
                    </div>
                </div>
            </div>

            {showCardSection && (
                <m.div
                    ref={shareSectionRef}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-16 pt-12 border-t border-[var(--border-color)] hide-on-export"
                >
                    <div className="mb-6 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <Share2 size={20} className="text-[var(--accent-red)]" />
                            <h3 className="font-display text-3xl text-white uppercase tracking-wider">SHARE DRIVER VS CARD</h3>
                        </div>
                        <button
                            type="button"
                            onClick={onHide}
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
                                    <img src={cardImage} alt="Generated Driver VS card" className="w-full" />
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
                                    Save this driver comparison card as a high-quality PNG image.
                                </p>
                                <button
                                    type="button"
                                    onClick={onDownloadCard}
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
                                    Update the card with the current drivers and seasons.
                                </p>
                                <button
                                    type="button"
                                    onClick={onGenerateCard}
                                    disabled={generatingCard}
                                    className="w-full flex items-center justify-center gap-3 py-4 bg-[var(--bg-darker)] border border-[var(--border-color)] hover:border-white text-white font-display text-xl uppercase tracking-widest transition-colors disabled:opacity-50"
                                >
                                    <ImageDown size={22} />
                                    REGENERATE CARD
                                </button>
                            </div>
                        </div>
                    </div>
                </m.div>
            )}
        </>
    );
}

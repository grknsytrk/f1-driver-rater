import type { RefObject } from 'react';
import { m } from 'framer-motion';
import { Share2, Download, ImageDown, Link2, ExternalLink } from 'lucide-react';
import { getTeamColor } from '../../types';
import type { BreakdownSource } from '../../utils/raceBreakdown';

export interface ShareCardDriver {
    driverId: string;
    driverName: string;
    constructorId: string;
    constructorName: string;
    averageRating: number;
}

export interface ResultsShareCardProps {
    season: string;
    activeMode: BreakdownSource;
    votedCommunityRaces: number;
    ratedCount: number;
    activeRankedAverages: ShareCardDriver[];
    cardRef: RefObject<HTMLDivElement | null>;
    shareSectionRef: RefObject<HTMLDivElement | null>;
    showCardSection: boolean;
    onHide: () => void;
    generating: boolean;
    cardImage: string | null;
    onDownloadCard: () => void;
    onGenerateCard: () => void;
    shareLinkUrl?: string | null;
    creatingShareLink?: boolean;
    onCreateShareLink?: () => void;
}

/** Off-screen shareable Top-10 ratings card and interactive preview/download panel. */
export function ResultsShareCard({
    season,
    activeMode,
    votedCommunityRaces,
    ratedCount,
    activeRankedAverages,
    cardRef,
    shareSectionRef,
    showCardSection,
    onHide,
    generating,
    cardImage,
    onDownloadCard,
    onGenerateCard,
    shareLinkUrl,
    creatingShareLink = false,
    onCreateShareLink,
}: ResultsShareCardProps) {
    return (
        <>
            {/* Hidden Card for Image Generation */}
            <div className="fixed -left-[9999px] top-0">
                <div
                    ref={cardRef}
                    className="w-[600px] p-8"
                    style={{
                        background: 'linear-gradient(135deg, #0a0a0b 0%, #1a1a1c 50%, #0a0a0b 100%)',
                        fontFamily: 'Formula1, sans-serif'
                    }}
                >
                    {/* Card Header */}
                    <div className="border-l-4 border-[#e10600] pl-4 mb-6">
                        <div className="text-[10px] text-[#e10600] tracking-[0.3em] mb-1">
                            {activeMode === 'community' ? 'COMMUNITY DRIVER RATINGS' : 'MY DRIVER RATINGS'}
                        </div>
                        <div className="text-5xl font-black text-white tracking-tight">{season} SEASON</div>
                        <div className="text-xs text-gray-500 mt-1">
                            {activeMode === 'community' ? `${votedCommunityRaces} COMMUNITY RACES` : `${ratedCount} RACES RATED`}
                        </div>
                    </div>

                    {/* Top 10 Drivers */}
                    <div className="space-y-1">
                        {activeRankedAverages.slice(0, 10).map((driver, index) => {
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

            {/* 6. SECTION: SHARE YOUR CARD - Shows after clicking Generate Card */}
            {showCardSection && (
                <m.div
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
                            onClick={onHide}
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
                                    onClick={onDownloadCard}
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
                                    onClick={onGenerateCard}
                                    disabled={generating}
                                    className="w-full flex items-center justify-center gap-3 py-4 bg-[var(--bg-darker)] border border-[var(--border-color)] hover:border-white text-white font-display text-xl uppercase tracking-widest transition-colors disabled:opacity-50"
                                >
                                    <ImageDown size={22} />
                                    REGENERATE CARD
                                </button>
                            </div>

                            {onCreateShareLink && (
                                <div className="bg-[var(--bg-panel)] border border-[var(--border-color)] p-6">
                                    <h4 className="font-display text-xl text-white uppercase tracking-wider mb-4">INTERACTIVE SHARE LINK</h4>
                                    <p className="font-oxanium text-sm text-[var(--text-secondary)] mb-4">
                                        Copy a read-only link with live social preview image for Twitter/WhatsApp.
                                    </p>
                                    {shareLinkUrl && (
                                        <div className="mb-4 flex items-center justify-between gap-2 border border-[var(--border-color)] bg-[var(--bg-darker)] px-3 py-2">
                                            <span className="truncate font-oxanium text-xs text-[var(--text-secondary)]">
                                                {shareLinkUrl}
                                            </span>
                                            <a
                                                href={shareLinkUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex shrink-0 items-center gap-1 font-oxanium text-[10px] font-bold tracking-wider text-[var(--accent-yellow)] uppercase hover:text-white"
                                            >
                                                OPEN
                                                <ExternalLink size={12} aria-hidden="true" />
                                            </a>
                                        </div>
                                    )}
                                    <button
                                        type="button"
                                        onClick={onCreateShareLink}
                                        disabled={creatingShareLink}
                                        className="w-full flex items-center justify-center gap-3 py-3.5 bg-[var(--bg-darker)] border border-[var(--border-color)] hover:border-[#00FF88] text-white font-display text-lg uppercase tracking-widest transition-colors disabled:opacity-50"
                                    >
                                        <Link2 size={18} className="text-[#00FF88]" />
                                        {creatingShareLink ? 'CREATING LINK...' : shareLinkUrl ? 'COPY SHARE LINK' : 'CREATE SHARE LINK'}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </m.div>
            )}
        </>
    );
}

import type { RefObject } from 'react';
import { m } from 'framer-motion';
import { Share2, Download, ImageDown } from 'lucide-react';
import type { DataStatus, TeammateRatingH2H } from '../../utils/teamVersus';

export interface H2HStats {
    raceWinsA: number;
    raceWinsB: number;
    qualiWinsA: number;
    qualiWinsB: number;
    totalRaces: number;
    totalQualis: number;
}

export interface TeamDriver {
    driverId: string;
    driverName: string;
    constructorId: string;
    constructorName: string;
    averageRating: number | null;
    totalRaces: number;
}

export interface H2HCardMatchup {
    teamId: string;
    teamName: string;
    teamColor: string;
    driverA: TeamDriver;
    driverB: TeamDriver;
    h2h: H2HStats | null;
    ratingH2H: TeammateRatingH2H;
}

export type TeammateRatingSource = 'personal' | 'community';

export interface TeammateShareCardProps {
    season: string;
    ratingSource: TeammateRatingSource;
    raceStatus: DataStatus;
    qualiStatus: DataStatus;
    cardMatchups: H2HCardMatchup[];
    cardRef: RefObject<HTMLDivElement | null>;
    shareSectionRef: RefObject<HTMLDivElement | null>;
    showCardSection: boolean;
    onHide: () => void;
    generatingCard: boolean;
    cardImage: string | null;
    onDownloadCard: () => void;
    onGenerateCard: () => void;
}

/** Off-screen shareable Teammate Wars H2H card and interactive preview/download panel. */
export function TeammateShareCard({
    season,
    ratingSource,
    raceStatus,
    qualiStatus,
    cardMatchups,
    cardRef,
    shareSectionRef,
    showCardSection,
    onHide,
    generatingCard,
    cardImage,
    onDownloadCard,
    onGenerateCard,
}: TeammateShareCardProps) {
    return (
        <>
            {/* Hidden H2H card used for the shareable PNG */}
            <div className="fixed -left-[9999px] top-0 hide-on-export">
                <div
                    ref={cardRef}
                    className="w-[600px] p-8"
                    style={{
                        background: 'linear-gradient(135deg, #0a0a0b 0%, #1a1a1c 50%, #0a0a0b 100%)',
                        fontFamily: 'Formula1, sans-serif',
                    }}
                >
                    {/* Card Header */}
                    <div className="border-l-4 border-[#e10600] pl-4 mb-6">
                        <div className="text-[10px] text-[#e10600] tracking-[0.3em] mb-1">TEAMMATE WARS</div>
                        <div className="text-5xl font-black text-white tracking-tight">{season} H2H</div>
                        <div className="text-xs text-gray-500 mt-1">
                            {cardMatchups.length} TEAMMATE BATTLES • {ratingSource === 'community' ? 'COMMUNITY AVG' : 'MY RATINGS'}
                        </div>
                    </div>

                    {/* H2H Matchups */}
                    <div className="space-y-2">
                        {cardMatchups.map((matchup, index) => {
                            const hasRaceH2H = raceStatus === 'ok' && (matchup.h2h?.totalRaces ?? 0) > 0;
                            const hasQualiH2H = qualiStatus === 'ok' && (matchup.h2h?.totalQualis ?? 0) > 0;
                            const hasRatingH2H = matchup.ratingH2H.totalSharedRaces > 0;
                            const raceH2H = hasRaceH2H
                                ? `${matchup.h2h!.raceWinsA} - ${matchup.h2h!.raceWinsB}`
                                : '—';
                            const qualiH2H = hasQualiH2H
                                ? `${matchup.h2h!.qualiWinsA} - ${matchup.h2h!.qualiWinsB}`
                                : '—';
                            const ratingH2HDisplay = hasRatingH2H
                                ? `${matchup.ratingH2H.winsA} - ${matchup.ratingH2H.winsB}`
                                : '—';

                            return (
                                <div
                                    key={matchup.teamId}
                                    className="px-3 py-3"
                                    style={{
                                        background: 'rgba(255,255,255,0.03)',
                                        borderLeft: `3px solid ${matchup.teamColor}`,
                                    }}
                                >
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="text-[10px] text-gray-500 uppercase tracking-[0.2em]">
                                            BATTLE {index + 1} • {matchup.teamName}
                                        </div>
                                        <div className="text-[10px] text-gray-600 uppercase tracking-wider">H2H</div>
                                    </div>

                                    <div className="flex items-center gap-3">
                                        <div className="flex-1 min-w-0">
                                            <div className="text-white font-bold text-base uppercase tracking-wide truncate">
                                                {matchup.driverA.driverName}
                                            </div>
                                            <div className="text-gray-400 text-xs mt-1">
                                                {matchup.driverA.averageRating !== null ? matchup.driverA.averageRating.toFixed(2) : '—'} AVG
                                            </div>
                                        </div>
                                        <div className="text-gray-600 text-xs font-bold">VS</div>
                                        <div className="flex-1 min-w-0 text-right">
                                            <div className="text-white font-bold text-base uppercase tracking-wide truncate">
                                                {matchup.driverB.driverName}
                                            </div>
                                            <div className="text-gray-400 text-xs mt-1">
                                                {matchup.driverB.averageRating !== null ? matchup.driverB.averageRating.toFixed(2) : '—'} AVG
                                            </div>
                                        </div>
                                    </div>

                                    <div className="mt-3 pt-2 border-t border-gray-800 flex justify-between text-xs uppercase tracking-wider">
                                        <div>
                                            <span className="text-gray-600">RACE </span>
                                            <span className="text-white">{raceH2H}</span>
                                        </div>
                                        <div>
                                            <span className="text-gray-600">QUALI </span>
                                            <span className="text-white">{qualiH2H}</span>
                                        </div>
                                        <div>
                                            <span className="text-gray-600">RATING </span>
                                            <span className="text-white">{ratingH2HDisplay}</span>
                                        </div>
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

            {/* Shareable H2H card section */}
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
                            <h3 className="font-display text-3xl text-white uppercase tracking-wider">SHARE H2H CARD</h3>
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
                                {generatingCard ? (
                                    <div className="flex flex-col items-center justify-center h-80 bg-[var(--bg-darker)] gap-4">
                                        <div className="animate-spin w-10 h-10 border-2 border-[var(--accent-red)] border-t-transparent rounded-full" />
                                        <span className="font-oxanium text-xs text-[var(--text-muted)] uppercase tracking-widest animate-pulse">Generating...</span>
                                    </div>
                                ) : cardImage ? (
                                    <img src={cardImage} alt="Generated teammate H2H card" className="w-full" />
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
                                    Save the season&apos;s teammate head-to-head battles as a high-quality PNG image.
                                </p>
                                <button
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
                                    Update the card with the current teammate selections and H2H results.
                                </p>
                                <button
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

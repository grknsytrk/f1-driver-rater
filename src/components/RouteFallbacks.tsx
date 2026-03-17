import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Loader2, Timer, Zap, type LucideIcon } from 'lucide-react';
import { PageLoadingSkeleton, QuickRateDriverSkeleton, RatingDriverSkeleton } from './Skeleton';

interface FullPageRouteFallbackProps {
    title: string;
    eyebrow: string;
}

interface ModalRouteFrameProps {
    title: string;
    eyebrow: string;
    Icon: LucideIcon;
    children: ReactNode;
}

export function FullPageRouteFallback({ title, eyebrow }: FullPageRouteFallbackProps) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="min-h-screen py-4 md:py-8 px-3 md:px-6"
        >
            <div className="max-w-6xl mx-auto space-y-6 md:space-y-8">
                <div className="flex flex-col items-start border-l-4 border-[var(--accent-red)] pl-4 md:pl-6">
                    <span className="font-oxanium text-xs text-[var(--accent-red)] uppercase tracking-[0.2em]">
                        {eyebrow}
                    </span>
                    <h2 className="font-display text-3xl md:text-6xl text-white uppercase tracking-tight leading-none mt-2">
                        {title}
                    </h2>
                </div>

                <div className="border border-[var(--border-color)] bg-[var(--bg-panel)] min-h-[420px] md:min-h-[520px] p-6 md:p-10">
                    <div className="flex items-center gap-3 mb-6">
                        <Loader2 size={18} className="text-[var(--accent-red)] animate-spin" />
                        <span className="font-oxanium text-xs text-[var(--text-muted)] uppercase tracking-[0.2em]">
                            Loading route chunk
                        </span>
                    </div>
                    <PageLoadingSkeleton />
                </div>
            </div>
        </motion.div>
    );
}

function ModalRouteFrame({ title, eyebrow, Icon, children }: ModalRouteFrameProps) {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-0 md:p-4"
        >
            <div className="absolute inset-0 bg-[#000]/95" />

            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="relative w-full max-w-5xl h-[100dvh] md:h-auto md:max-h-[90vh] bg-[var(--bg-main)] border-0 md:border border-[var(--border-color)] rounded-none overflow-hidden flex flex-col shadow-2xl"
                style={{ boxShadow: '0 0 100px rgba(0,0,0,0.8)' }}
            >
                <div className="relative p-4 md:p-6 border-b border-[var(--border-color)] bg-[var(--bg-panel)]">
                    <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                        <div className="w-32 h-32 border-2 border-white rounded-full flex items-center justify-center">
                            <div className="w-24 h-24 border border-white" />
                        </div>
                    </div>

                    <div className="relative flex items-center justify-between z-10">
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <Icon size={14} className="text-[var(--accent-red)]" />
                                <span className="text-[var(--text-muted)] text-[10px] font-oxanium uppercase tracking-[0.2em]">
                                    {eyebrow}
                                </span>
                            </div>
                            <h2 className="font-display-condensed font-bold text-2xl md:text-5xl text-white uppercase tracking-tight leading-tight mb-1">
                                {title}
                            </h2>
                        </div>

                        <div className="w-12 h-12 border border-[var(--border-color)] bg-[var(--bg-darker)]" />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 md:p-6 custom-scrollbar">
                    {children}
                </div>
            </motion.div>
        </motion.div>
    );
}

export function RatingModalRouteFallback() {
    return (
        <ModalRouteFrame
            title="Loading Race Rating"
            eyebrow="Race telemetry"
            Icon={Timer}
        >
            <RatingDriverSkeleton count={20} />
        </ModalRouteFrame>
    );
}

export function QuickRateModalRouteFallback() {
    return (
        <ModalRouteFrame
            title="Loading Quick Rate"
            eyebrow="Season input"
            Icon={Zap}
        >
            <QuickRateDriverSkeleton count={10} />
        </ModalRouteFrame>
    );
}

export function ResultsRouteFallback() {
    return (
        <FullPageRouteFallback
            title="Loading Results"
            eyebrow="Season analysis"
        />
    );
}

export function StandingsRouteFallback() {
    return (
        <FullPageRouteFallback
            title="Loading Standings"
            eyebrow="Championship data"
        />
    );
}

export function TeammateWarsRouteFallback() {
    return (
        <FullPageRouteFallback
            title="Loading Teammate Wars"
            eyebrow="Head to head"
        />
    );
}

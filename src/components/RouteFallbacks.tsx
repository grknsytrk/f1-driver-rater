import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { PageLoadingSkeleton, QuickRateDriverSkeleton, RatingDriverSkeleton } from './Skeleton';

interface FullPageRouteFallbackProps {
    title: string;
    eyebrow: string;
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

export function RatingModalContentFallback() {
    return (
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 md:p-6 custom-scrollbar">
            <RatingDriverSkeleton count={20} />
        </div>
    );
}

export function QuickRateModalContentFallback() {
    return (
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 md:p-6 custom-scrollbar">
            <QuickRateDriverSkeleton count={10} />
        </div>
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

export function AwardsRouteFallback() {
    return (
        <FullPageRouteFallback
            title="Loading Awards"
            eyebrow="Season wrapped"
        />
    );
}

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, Copy, Link2, Trophy } from 'lucide-react';
import { toast } from 'sonner';
import { getTeamColor } from '../types';
import {
    buildShareUrl,
    decodeShareToken,
    isStatelessShareToken,
    loadShareSnapshot,
    type ShareSnapshot,
} from '../utils/shareSnapshot';
import { DriverProfileLink } from './DriverProfileLink';
import { SEOHead, SITE_URL } from './SEOHead';

export interface ShareSnapshotPageProps {
    shareId: string;
}

const PODIUM_COLORS = ['#FFD700', '#C6CCD5', '#CD7F32'] as const;

export function ShareSnapshotPage({ shareId }: ShareSnapshotPageProps) {
    const trimmedId = shareId.trim();
    const isStateless = isStatelessShareToken(trimmedId);
    const statelessSnapshot = useMemo(
        () => (isStateless ? decodeShareToken(trimmedId) : null),
        [isStateless, trimmedId],
    );

    const [remoteState, setRemoteState] = useState<{
        id: string;
        snapshot: ShareSnapshot | null;
    } | null>(null);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (!trimmedId || isStateless) return;

        let active = true;
        void loadShareSnapshot(trimmedId).then((resolved) => {
            if (!active) return;
            setRemoteState({ id: trimmedId, snapshot: resolved });
        });

        return () => {
            active = false;
        };
    }, [isStateless, trimmedId]);

    const loading = Boolean(trimmedId && !isStateless && remoteState?.id !== trimmedId);
    const snapshot = isStateless
        ? statelessSnapshot
        : (remoteState?.id === trimmedId ? remoteState.snapshot : null);

    const shareUrl = useMemo(() => buildShareUrl(trimmedId), [trimmedId]);
    const ogImageUrl = `${SITE_URL}/api/og?id=${encodeURIComponent(trimmedId)}`;

    async function handleCopyLink() {
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(shareUrl);
            }
            setCopied(true);
            toast.success('Share link copied');
            globalThis.setTimeout(() => setCopied(false), 2000);
        } catch {
            toast.error('Could not copy link automatically');
        }
    }

    if (loading) {
        return (
            <div className="space-y-6 py-4">
                <div className="h-28 animate-pulse border border-[var(--border-color)] bg-[var(--bg-panel)]" />
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <div className="h-32 animate-pulse border border-[var(--border-color)] bg-[var(--bg-panel)]" />
                    <div className="h-32 animate-pulse border border-[var(--border-color)] bg-[var(--bg-panel)]" />
                    <div className="h-32 animate-pulse border border-[var(--border-color)] bg-[var(--bg-panel)]" />
                </div>
                <div className="h-64 animate-pulse border border-[var(--border-color)] bg-[var(--bg-panel)]" />
            </div>
        );
    }

    if (!snapshot) {
        return (
            <div className="mx-auto max-w-2xl py-12">
                <SEOHead
                    title="Shared Link Not Found"
                    description="This F1 Driver Rating share link is invalid or expired."
                    path={`/share/${encodeURIComponent(trimmedId)}`}
                    noindex
                />
                <div className="border border-[var(--border-color)] border-l-4 border-l-[var(--accent-red)] bg-[var(--bg-panel)] p-6 md:p-8">
                    <div className="font-oxanium text-[10px] tracking-[0.2em] text-[var(--accent-red)] uppercase">
                        404 · TELEMETRY LINK ERROR
                    </div>
                    <h1 className="mt-2 font-display text-3xl text-white uppercase tracking-tight">
                        SHARED LINK NOT FOUND
                    </h1>
                    <p className="mt-2 font-ui text-sm text-[var(--text-secondary)]">
                        The shared rankings snapshot may be corrupted or no longer available.
                    </p>
                    <Link
                        to="/"
                        className="mt-6 inline-flex items-center gap-2 border border-[var(--border-color)] bg-[var(--bg-darker)] px-5 py-2.5 font-oxanium text-xs font-bold tracking-widest text-white uppercase transition-colors hover:border-[var(--accent-red)]"
                    >
                        BROWSE SEASONS
                        <ArrowRight size={14} aria-hidden="true" />
                    </Link>
                </div>
            </div>
        );
    }

    const modeLabel = snapshot.mode === 'community' ? 'COMMUNITY RANKINGS' : 'PERSONAL RANKINGS';
    const scopeLabel = snapshot.source === 'quick'
        ? 'QUICK RATE SNAPSHOT'
        : `${snapshot.ratedRaces} RACES RATED`;
    const podium = snapshot.drivers.slice(0, 3);
    const maxScore = 10;

    return (
        <div className="space-y-8 py-2">
            <SEOHead
                title={`${snapshot.season} ${snapshot.mode === 'community' ? 'Community' : 'Personal'} Rankings`}
                description={snapshot.drivers.slice(0, 3).map((d, idx) => `${idx + 1}. ${d.driverName} (${d.averageRating.toFixed(2)})`).join(' · ')}
                path={`/share/${encodeURIComponent(trimmedId)}`}
                ogImage={ogImageUrl}
                ogImageAlt={`${snapshot.season} F1 Driver Rating Rankings`}
                noindex
            />

            {/* Header Hero */}
            <section className="border border-[var(--border-color)] bg-[var(--bg-panel)] overflow-hidden">
                <div className="h-1 w-full bg-[var(--accent-red)]" />
                <div className="p-5 md:p-7 flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                    <div className="border-l-4 border-[var(--accent-red)] pl-4 md:pl-5">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-oxanium text-[10px] font-bold uppercase tracking-[0.2em]">
                            <span className="text-[var(--accent-red)]">SHARED SNAPSHOT</span>
                            <span className="text-[var(--text-muted)]">/</span>
                            <span className="text-[var(--text-secondary)]">{modeLabel}</span>
                            <span className="text-[var(--text-muted)]">/</span>
                            <span className="text-[var(--accent-yellow)]">{scopeLabel}</span>
                        </div>
                        <h1 className="mt-1.5 font-display text-3xl md:text-5xl text-white uppercase tracking-tight leading-none">
                            {snapshot.season} SEASON RANKINGS
                        </h1>
                        <p className="mt-2 font-oxanium text-xs text-[var(--text-muted)] uppercase tracking-wider">
                            READ-ONLY GRID SNAPSHOT · {snapshot.drivers.length} DRIVERS RANKED
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 shrink-0">
                        <button
                            type="button"
                            onClick={() => void handleCopyLink()}
                            className="inline-flex items-center gap-2 border border-[var(--border-color)] bg-[var(--bg-darker)] px-4 py-2.5 font-oxanium text-xs font-bold tracking-widest text-white uppercase transition-colors hover:border-white"
                        >
                            {copied ? <Check size={14} className="text-[#00FF88]" /> : <Copy size={14} />}
                            {copied ? 'COPIED' : 'COPY LINK'}
                        </button>
                        <Link
                            to={`/${snapshot.season}`}
                            className="inline-flex items-center gap-2 bg-[var(--accent-red)] px-5 py-2.5 font-oxanium text-xs font-bold tracking-widest text-white uppercase transition-colors hover:bg-[#ff1e17]"
                        >
                            RATE {snapshot.season} SEASON
                            <ArrowRight size={14} aria-hidden="true" />
                        </Link>
                    </div>
                </div>
            </section>

            {/* Top 3 Podium */}
            {podium.length > 0 && (
                <section aria-label="Shared podium" className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    {podium.map((driver, index) => {
                        const teamColor = getTeamColor(driver.constructorId);
                        const accentColor = PODIUM_COLORS[index] ?? '#FFFFFF';
                        return (
                            <div
                                key={driver.driverId}
                                className="relative border border-[var(--border-color)] bg-[var(--bg-panel)] p-5"
                                style={{ borderTop: `3px solid ${accentColor}` }}
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <span
                                        className="font-display text-3xl leading-none"
                                        style={{ color: accentColor }}
                                    >
                                        P{index + 1}
                                    </span>
                                    <span className="font-oxanium text-2xl font-bold tabular-nums text-[var(--accent-yellow)]">
                                        {driver.averageRating.toFixed(2)}
                                    </span>
                                </div>
                                <div className="mt-4 flex items-center gap-2.5">
                                    <span className="h-5 w-1 shrink-0" style={{ backgroundColor: teamColor }} />
                                    <div className="min-w-0">
                                        <DriverProfileLink
                                            season={snapshot.season}
                                            driverId={driver.driverId}
                                            className="block truncate font-display text-xl text-white uppercase hover:text-[var(--accent-yellow)] transition-colors"
                                        >
                                            {driver.driverName}
                                        </DriverProfileLink>
                                        <div className="truncate font-oxanium text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                                            {driver.constructorName}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </section>
            )}

            {/* Full Rankings Breakdown */}
            <section className="border border-[var(--border-color)] bg-[var(--bg-panel)]">
                <div className="flex items-center justify-between gap-2 border-b border-[var(--border-color)] px-4 py-3 md:px-6">
                    <div className="flex items-center gap-2.5">
                        <Trophy size={16} className="text-[var(--accent-yellow)]" aria-hidden="true" />
                        <h2 className="font-display text-xl text-white uppercase tracking-wider">
                            FULL RANKING ORDER
                        </h2>
                    </div>
                    <span className="inline-flex items-center gap-1.5 font-oxanium text-[10px] tracking-widest text-[var(--text-muted)] uppercase">
                        <Link2 size={12} aria-hidden="true" />
                        INTERACTIVE VIEW
                    </span>
                </div>

                <div className="divide-y divide-white/[0.05]">
                    {snapshot.drivers.map((driver, index) => {
                        const teamColor = getTeamColor(driver.constructorId);
                        const barWidthPct = Math.max(4, Math.min(100, (driver.averageRating / maxScore) * 100));
                        const isTop3 = index < 3;

                        return (
                            <div
                                key={driver.driverId}
                                className="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-white/[0.02] md:px-6"
                            >
                                <div className="flex min-w-0 flex-1 items-center gap-3 md:gap-4">
                                    <span
                                        className={`w-7 shrink-0 font-oxanium text-sm font-bold tabular-nums ${
                                            isTop3 ? 'text-[var(--accent-yellow)]' : 'text-[var(--text-muted)]'
                                        }`}
                                    >
                                        {String(index + 1).padStart(2, '0')}
                                    </span>
                                    <span className="h-5 w-1 shrink-0" style={{ backgroundColor: teamColor }} />
                                    <div className="min-w-0 flex-1">
                                        <DriverProfileLink
                                            season={snapshot.season}
                                            driverId={driver.driverId}
                                            className="block truncate font-display text-base text-white uppercase hover:text-[var(--accent-yellow)] transition-colors md:text-lg"
                                        >
                                            {driver.driverName}
                                        </DriverProfileLink>
                                        <div className="truncate font-oxanium text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                                            {driver.constructorName}
                                            {driver.totalRaces > 0 ? ` · ${driver.totalRaces} RACES` : ''}
                                        </div>
                                    </div>
                                </div>

                                <div className="flex shrink-0 items-center gap-4">
                                    <div className="hidden h-1.5 w-28 bg-[var(--bg-darker)] sm:block md:w-40">
                                        <div
                                            className="h-full"
                                            style={{ width: `${barWidthPct}%`, backgroundColor: teamColor }}
                                        />
                                    </div>
                                    <span
                                        className={`w-12 text-right font-oxanium text-base font-bold tabular-nums md:text-lg ${
                                            isTop3 ? 'text-[var(--accent-yellow)]' : 'text-white'
                                        }`}
                                    >
                                        {driver.averageRating.toFixed(2)}
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </section>
        </div>
    );
}

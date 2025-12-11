// Reusable Skeleton Components with shimmer/pulse effects
// Inspired by MUI & PrimeReact Skeleton components

import React from 'react';

// ═══════════════════════════════════════════════════════════════════════════
// SKELETON BASE COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

type SkeletonVariant = 'text' | 'circular' | 'rectangular' | 'rounded';
type SkeletonAnimation = 'pulse' | 'wave' | 'shimmer' | false;

interface SkeletonProps {
    /** Shape variant */
    variant?: SkeletonVariant;
    /** Animation type */
    animation?: SkeletonAnimation;
    /** Width - can be number (px) or string (e.g., '100%', '10rem') */
    width?: number | string;
    /** Height - can be number (px) or string */
    height?: number | string;
    /** Border radius for custom shapes */
    borderRadius?: number | string;
    /** Additional CSS classes */
    className?: string;
    /** Inline styles */
    style?: React.CSSProperties;
    /** For accessibility */
    'aria-label'?: string;
}

export function Skeleton({
    variant = 'text',
    animation = 'shimmer',
    width,
    height,
    borderRadius,
    className = '',
    style,
    'aria-label': ariaLabel,
}: SkeletonProps) {
    // Determine border radius based on variant
    const getRadius = () => {
        if (borderRadius !== undefined) return borderRadius;
        switch (variant) {
            case 'circular':
                return '50%';
            case 'rounded':
                return '8px';
            case 'text':
                return '4px';
            case 'rectangular':
            default:
                return '2px';
        }
    };

    // Determine animation class
    const getAnimationClass = () => {
        switch (animation) {
            case 'pulse':
                return 'animate-pulse';
            case 'wave':
                return 'skeleton-wave';
            case 'shimmer':
                return 'skeleton-shimmer';
            default:
                return '';
        }
    };

    // Default dimensions based on variant
    const getDefaultHeight = () => {
        if (height !== undefined) return height;
        if (variant === 'text') return '1em';
        if (variant === 'circular') return width || 40;
        return 'auto';
    };

    const getDefaultWidth = () => {
        if (width !== undefined) return width;
        if (variant === 'circular') return height || 40;
        if (variant === 'text') return '100%';
        return '100%';
    };

    const computedWidth = typeof getDefaultWidth() === 'number' ? `${getDefaultWidth()}px` : getDefaultWidth();
    const computedHeight = typeof getDefaultHeight() === 'number' ? `${getDefaultHeight()}px` : getDefaultHeight();
    const computedRadius = typeof getRadius() === 'number' ? `${getRadius()}px` : getRadius();

    return (
        <div
            className={`
                skeleton-base bg-[var(--bg-darker)]
                ${getAnimationClass()}
                ${className}
            `}
            style={{
                width: computedWidth,
                height: computedHeight,
                borderRadius: computedRadius,
                ...style,
            }}
            aria-hidden="true"
            aria-label={ariaLabel}
        />
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// SKELETON CONTAINER - Wrapper with shimmer overlay
// ═══════════════════════════════════════════════════════════════════════════

interface SkeletonContainerProps {
    children: React.ReactNode;
    className?: string;
    animation?: SkeletonAnimation;
}

export function SkeletonContainer({
    children,
    className = '',
    animation = 'shimmer'
}: SkeletonContainerProps) {
    return (
        <div
            className={`relative overflow-hidden ${className}`}
            aria-busy="true"
        >
            {children}
            {animation === 'shimmer' && (
                <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/5 to-transparent pointer-events-none" />
            )}
            {animation === 'wave' && (
                <div className="absolute inset-0 skeleton-wave-overlay pointer-events-none" />
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// SPECIALIZED SKELETON COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

// Race List Skeleton - matching RaceCard structure
export function RaceListSkeleton({
    count = 10,
    animation = 'shimmer' as SkeletonAnimation
}: {
    count?: number;
    animation?: SkeletonAnimation;
}) {
    return (
        <div className="border border-[var(--border-color)] bg-[var(--bg-main)]">
            {/* Header Skeleton */}
            <div className="p-3 bg-[var(--bg-panel)] border-b border-[var(--border-color)] flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Skeleton variant="rectangular" width={16} height={16} animation={animation} />
                    <Skeleton variant="text" width={96} height={16} animation={animation} />
                </div>
                <div className="hidden sm:flex items-center gap-4">
                    <Skeleton variant="text" width={80} height={12} animation={animation} />
                    <Skeleton variant="rectangular" width={128} height={4} animation={animation} />
                </div>
            </div>

            {/* Race Cards Skeleton */}
            <div className="divide-y divide-[var(--border-color)]">
                {[...Array(count)].map((_, i) => (
                    <SkeletonContainer
                        key={i}
                        className="p-3 md:p-4 bg-[var(--bg-panel)]"
                        animation={animation}
                    >
                        {/* Mobile Layout */}
                        <div className="flex md:hidden items-center gap-2">
                            <Skeleton variant="rectangular" width={36} height={24} animation={animation} />
                            <Skeleton variant="rounded" width={40} height={28} animation={animation} />
                            <div className="flex-1 space-y-1.5">
                                <Skeleton variant="text" width="75%" height={16} animation={animation} />
                                <Skeleton variant="text" width="50%" height={10} animation={animation} />
                                <div className="flex items-center gap-2">
                                    <Skeleton variant="text" width={48} height={10} animation={animation} />
                                    <Skeleton variant="rounded" width={56} height={16} animation={animation} />
                                </div>
                            </div>
                            <Skeleton variant="rectangular" width={16} height={16} animation={animation} />
                        </div>

                        {/* Desktop Layout */}
                        <div
                            className="hidden md:grid gap-4"
                            style={{
                                gridTemplateColumns: '60px 1fr 90px 100px 160px 24px',
                                alignItems: 'center',
                            }}
                        >
                            {/* Round */}
                            <div className="flex flex-col items-center gap-1 border-r border-[var(--border-color)] pr-4">
                                <Skeleton variant="text" width={32} height={10} animation={animation} />
                                <Skeleton variant="text" width={40} height={32} animation={animation} />
                            </div>

                            {/* Race Name & Circuit */}
                            <div className="flex items-center gap-4">
                                <Skeleton variant="rounded" width={40} height={28} animation={animation} />
                                <div className="flex-1 space-y-1.5">
                                    <Skeleton variant="text" width={200} height={24} animation={animation} />
                                    <Skeleton variant="text" width={128} height={12} animation={animation} />
                                </div>
                            </div>

                            {/* Date */}
                            <div className="space-y-1">
                                <Skeleton variant="text" width={32} height={10} animation={animation} />
                                <Skeleton variant="text" width={64} height={16} animation={animation} />
                            </div>

                            {/* Time */}
                            <div className="space-y-1">
                                <Skeleton variant="text" width={32} height={10} animation={animation} />
                                <Skeleton variant="text" width={80} height={16} animation={animation} />
                            </div>

                            {/* Status */}
                            <Skeleton variant="rounded" width="100%" height={28} animation={animation} />

                            {/* Chevron */}
                            <Skeleton variant="rectangular" width={20} height={20} animation={animation} />
                        </div>
                    </SkeletonContainer>
                ))}
            </div>
        </div>
    );
}

// Quick Rate Driver Skeleton - matching driver card structure
export function QuickRateDriverSkeleton({
    count = 10,
    animation = 'shimmer' as SkeletonAnimation
}: {
    count?: number;
    animation?: SkeletonAnimation;
}) {
    return (
        <div className="grid grid-cols-1 gap-px bg-[var(--border-color)] border border-[var(--border-color)]">
            {[...Array(count)].map((_, i) => (
                <SkeletonContainer
                    key={i}
                    className="bg-[var(--bg-panel)] p-2 md:p-3 flex flex-col gap-2 md:gap-3"
                    animation={animation}
                >
                    {/* Driver Info Row */}
                    <div className="flex items-center gap-0">
                        {/* Position Box */}
                        <Skeleton
                            variant="rectangular"
                            width={56}
                            height={48}
                            className="!w-10 md:!w-14 !h-10 md:!h-12 border border-[var(--border-color)]"
                            animation={animation}
                        />

                        {/* Team Color + Name */}
                        <div className="flex items-center h-10 md:h-12 min-w-0 flex-1">
                            <div className="w-1 h-full bg-[var(--border-color)]" />
                            <div className="min-w-0 pl-2 md:pl-3 flex-1 space-y-1.5">
                                <Skeleton variant="text" width={160} height={20} className="!w-32 md:!w-40 !h-4 md:!h-5" animation={animation} />
                                <Skeleton variant="text" width={96} height={12} className="!w-20 md:!w-24 !h-2.5 md:!h-3" animation={animation} />
                            </div>
                        </div>

                        {/* Stats */}
                        <div className="flex items-center gap-2 md:gap-4 ml-auto pr-2">
                            {[...Array(4)].map((_, j) => (
                                <div key={j} className="flex flex-col items-center gap-1">
                                    <Skeleton variant="text" width={24} height={8} animation={animation} />
                                    <Skeleton variant="text" width={32} height={20} className="!h-4 md:!h-5" animation={animation} />
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Rating Bar */}
                    <div className="flex items-center gap-1 md:gap-2 w-full">
                        <Skeleton variant="rounded" width={56} height={32} className="!w-8 md:!w-14 !h-6 md:!h-8" animation={animation} />
                        <div className="flex-1 flex gap-[2px]">
                            {[...Array(20)].map((_, k) => (
                                <Skeleton
                                    key={k}
                                    variant="rounded"
                                    width={20}
                                    height={28}
                                    className="!w-4 md:!w-5 !h-5 md:!h-7 flex-shrink-0"
                                    style={{ opacity: 0.3 + (k * 0.035) }}
                                    animation={animation}
                                />
                            ))}
                        </div>
                    </div>
                </SkeletonContainer>
            ))}
        </div>
    );
}

// Rating Driver Skeleton - For RatingModal driver list
export function RatingDriverSkeleton({
    count = 20,
    animation = 'shimmer' as SkeletonAnimation
}: {
    count?: number;
    animation?: SkeletonAnimation;
}) {
    return (
        <div className="grid grid-cols-1 gap-px bg-[var(--border-color)] border border-[var(--border-color)]">
            {[...Array(count)].map((_, i) => (
                <SkeletonContainer
                    key={i}
                    className="bg-[var(--bg-panel)] p-2 md:p-3 flex flex-col gap-2 md:gap-3"
                    animation={animation}
                >
                    {/* Driver Info Row */}
                    <div className="flex items-center gap-0">
                        {/* Position Box */}
                        <Skeleton
                            variant="rectangular"
                            width={40}
                            height={40}
                            className="!w-10 md:!w-14 !h-10 md:!h-12 border border-[var(--border-color)]"
                            animation={animation}
                        />

                        {/* Grid Position - desktop only */}
                        <div className="hidden md:block">
                            <Skeleton
                                variant="rectangular"
                                width={40}
                                height={48}
                                className="border-y border-r border-[var(--border-color)]"
                                animation={animation}
                            />
                        </div>

                        {/* Team Color + Name */}
                        <div className="flex items-center h-10 md:h-12 min-w-0 flex-1">
                            <div className="w-1 h-full bg-[var(--border-color)]" />
                            <div className="min-w-0 pl-2 md:pl-3 flex-1 space-y-1.5">
                                <Skeleton variant="text" width={140} height={18} className="!w-28 md:!w-36 !h-4 md:!h-5" animation={animation} />
                                <Skeleton variant="text" width={80} height={10} className="!w-16 md:!w-20 !h-2 md:!h-2.5" animation={animation} />
                            </div>
                        </div>

                        {/* Gap / Time - desktop only */}
                        <div className="hidden md:flex flex-col items-end pr-4 min-w-[100px]">
                            <Skeleton variant="text" width={32} height={8} className="mb-1" animation={animation} />
                            <Skeleton variant="text" width={64} height={14} animation={animation} />
                        </div>
                    </div>

                    {/* Rating Bar */}
                    <div className="flex items-center gap-1 md:gap-2 w-full">
                        <Skeleton variant="rectangular" width={32} height={24} className="!w-8 md:!w-14 !h-6 md:!h-8" animation={animation} />
                        <div className="flex-1 flex gap-[2px]">
                            {[...Array(20)].map((_, k) => (
                                <Skeleton
                                    key={k}
                                    variant="rounded"
                                    width={16}
                                    height={28}
                                    className="!w-4 md:!w-5 !h-7 md:!h-10 flex-shrink-0"
                                    style={{ opacity: 0.3 + (k * 0.035) }}
                                    animation={animation}
                                />
                            ))}
                        </div>
                    </div>
                </SkeletonContainer>
            ))}
        </div>
    );
}

// Full Page Loading Skeleton
export function PageLoadingSkeleton({ animation = 'shimmer' as SkeletonAnimation }) {
    return (
        <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
            {/* Animated F1 style loader */}
            <div className="relative w-16 h-16">
                <div className="absolute inset-0 border-2 border-[var(--border-color)] rounded-full" />
                <div className="absolute inset-0 border-2 border-[var(--accent-red)] border-t-transparent rounded-full animate-spin" />
                <div className="absolute inset-2 border border-[var(--accent-red)]/30 rounded-full" />
            </div>
            <div className="flex flex-col items-center gap-2">
                <Skeleton variant="text" width={160} height={16} animation={animation} />
                <Skeleton variant="text" width={100} height={12} animation={animation} />
            </div>
        </div>
    );
}

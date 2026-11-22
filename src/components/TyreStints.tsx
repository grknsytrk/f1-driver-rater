import { memo } from 'react';
import type { TyreCompound, TyreStint } from '../api/openf1';

interface CompoundVisual {
    letter: string;
    label: string;
    color: string;
}

const COMPOUND_VISUALS: Record<TyreCompound, CompoundVisual> = {
    SOFT: { letter: 'S', label: 'Soft', color: '#E10600' },
    MEDIUM: { letter: 'M', label: 'Medium', color: '#FFD700' },
    HARD: { letter: 'H', label: 'Hard', color: '#F3F4F6' },
    INTERMEDIATE: { letter: 'I', label: 'Intermediate', color: '#39B54A' },
    WET: { letter: 'W', label: 'Wet', color: '#0072CE' },
    UNKNOWN: { letter: '?', label: 'Unknown', color: '#6B7280' },
};

function formatStintTooltip(stint: TyreStint): string {
    const visual = COMPOUND_VISUALS[stint.compound];
    const lapRange = stint.lapStart !== null && stint.lapEnd !== null
        ? ` · L${stint.lapStart}–${stint.lapEnd}${stint.lapCount !== null ? ` (${stint.lapCount}L)` : ''}`
        : '';
    return `Stint ${stint.stintNumber}: ${visual.label}${lapRange}`;
}

function TyreIcon({ compound, title }: { compound: TyreCompound; title: string }) {
    const visual = COMPOUND_VISUALS[compound];
    return (
        <span title={title} className="inline-flex shrink-0 items-center justify-center">
            <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                aria-hidden="true"
                className="block"
            >
                <circle cx="12" cy="12" r="11" fill="#0D0E11" stroke="#22242A" strokeWidth="1.2" />
                <path
                    d="M 15.42 4.33 A 8.4 8.4 0 0 1 15.42 19.67"
                    fill="none"
                    stroke={visual.color}
                    strokeWidth="2.7"
                    strokeLinecap="butt"
                />
                <path
                    d="M 8.58 19.67 A 8.4 8.4 0 0 1 8.58 4.33"
                    fill="none"
                    stroke={visual.color}
                    strokeWidth="2.7"
                    strokeLinecap="butt"
                />
                <text
                    x="12"
                    y="15.4"
                    textAnchor="middle"
                    fill="#FFFFFF"
                    fontSize="10"
                    fontWeight="800"
                    fontFamily="Oxanium, sans-serif"
                >
                    {visual.letter}
                </text>
            </svg>
        </span>
    );
}

export interface TyreStintsProps {
    stints?: TyreStint[];
}

/**
 * Renders official Pirelli F1 compound badges (`S`, `M`, `H`, `I`, `W`) for a driver's race stints.
 */
export const TyreStints = memo(function TyreStints({ stints }: TyreStintsProps) {
    if (!stints || stints.length === 0) return null;

    const strategySummary = stints
        .map(stint => COMPOUND_VISUALS[stint.compound].label)
        .join(', ');

    return (
        <div
            aria-label={`Tyre strategy: ${strategySummary}`}
            className="flex shrink-0 items-center gap-1"
        >
            {stints.map((stint) => (
                <TyreIcon
                    key={stint.stintNumber}
                    compound={stint.compound}
                    title={formatStintTooltip(stint)}
                />
            ))}
        </div>
    );
});

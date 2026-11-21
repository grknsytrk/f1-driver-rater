import { memo } from 'react';

const SEGMENT_INDICES = Array.from({ length: 20 }, (_, index) => index);

const RATING_SEGMENT_COLORS: readonly string[] = SEGMENT_INDICES.map((index) => {
    const t = index / 19;
    if (t < 0.4) {
        const localT = t / 0.4;
        return `rgb(225, ${Math.round(6 + localT * 101)}, 0)`;
    }
    if (t < 0.7) {
        const localT = (t - 0.4) / 0.3;
        const r = Math.round(225 + localT * 17);
        const g = Math.round(107 + localT * 102);
        const b = Math.round(localT * 61);
        return `rgb(${r}, ${g}, ${b})`;
    }
    const localT = (t - 0.7) / 0.3;
    const r = Math.round(242 - localT * 242);
    const g = Math.round(209 + localT * 46);
    const b = Math.round(61 + localT * 75);
    return `rgb(${r}, ${g}, ${b})`;
});

interface RatingSegmentsProps {
    driverName: string;
    currentRating: number;
    displayRating: number;
    onHoverChange: (val: number | null) => void;
    onSelect: (val: number) => void;
}

export const RatingSegments = memo(function RatingSegments({
    driverName,
    currentRating,
    displayRating,
    onHoverChange,
    onSelect,
}: RatingSegmentsProps) {
    return (
        <div className="min-w-0 flex-1 overflow-x-auto scrollbar-hide md:overflow-visible">
            <div className="flex w-max gap-[2px] py-1" onMouseLeave={() => onHoverChange(null)}>
                {SEGMENT_INDICES.map((index) => {
                    const val = (index + 1) * 0.5;
                    const isFilled = val <= displayRating;
                    const segmentColor = isFilled ? RATING_SEGMENT_COLORS[index] : 'rgba(255,255,255,0.08)';

                    return (
                        <button
                            key={index}
                            aria-label={`${driverName}: ${val.toFixed(1)} out of 10`}
                            aria-pressed={currentRating === val}
                            onFocus={() => onHoverChange(val)}
                            onBlur={() => onHoverChange(null)}
                            onMouseEnter={() => onHoverChange(val)}
                            onClick={() => onSelect(val)}
                            className="relative h-7 w-4 flex-shrink-0 cursor-pointer touch-manipulation focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2 md:h-10 md:w-5"
                        >
                            <div
                                className="h-full w-full rounded-sm"
                                style={{
                                    backgroundColor: segmentColor,
                                    transform: isFilled ? 'scaleY(1)' : 'scaleY(0.65)',
                                    opacity: isFilled ? 1 : 0.4,
                                }}
                            />
                        </button>
                    );
                })}
            </div>
        </div>
    );
});

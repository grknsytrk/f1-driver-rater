import { memo, useRef, useState, type PointerEvent } from 'react';
import { ratingFromClientX } from '../utils/ratingInput';

const SEGMENT_INDICES = Array.from({ length: 20 }, (_, index) => index);
const SCRUB_DRAG_THRESHOLD_PX = 6;
const SCRUB_CLICK_SUPPRESS_WINDOW_MS = 80;

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
    onSelect: (val: number, options?: { fromScrub?: boolean }) => void;
}

interface ScrubSession {
    pointerId: number;
    startX: number;
    isScrubbing: boolean;
    lastVal: number | null;
}

export const RatingSegments = memo(function RatingSegments({
    driverName,
    currentRating,
    displayRating,
    onHoverChange,
    onSelect,
}: RatingSegmentsProps) {
    const trackRef = useRef<HTMLDivElement>(null);
    const scrubRef = useRef<ScrubSession | null>(null);
    const suppressClickUntilRef = useRef(0);
    const [isScrubbing, setIsScrubbing] = useState(false);

    function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        suppressClickUntilRef.current = 0;

        const rect = trackRef.current?.getBoundingClientRect();
        if (!rect || rect.width <= 0) return;

        const val = ratingFromClientX(event.clientX, rect);
        scrubRef.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            isScrubbing: false,
            lastVal: val,
        };

        if (event.pointerType === 'touch') {
            onHoverChange(val);
        }
    }

    function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
        const session = scrubRef.current;
        const track = trackRef.current;
        if (!session || session.pointerId !== event.pointerId || !track) return;

        if (!session.isScrubbing && Math.abs(event.clientX - session.startX) >= SCRUB_DRAG_THRESHOLD_PX) {
            session.isScrubbing = true;
            setIsScrubbing(true);
            event.currentTarget.setPointerCapture?.(event.pointerId);
        }

        if (session.isScrubbing) {
            const val = ratingFromClientX(event.clientX, track.getBoundingClientRect());
            if (val !== session.lastVal) {
                session.lastVal = val;
                onHoverChange(val);
            }
        }
    }

    function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
        const session = scrubRef.current;
        if (!session || session.pointerId !== event.pointerId) return;

        if (session.isScrubbing) {
            event.currentTarget.releasePointerCapture?.(event.pointerId);
            const rect = trackRef.current?.getBoundingClientRect();
            const finalVal = session.lastVal ?? (rect ? ratingFromClientX(event.clientX, rect) : 0.5);
            scrubRef.current = null;
            suppressClickUntilRef.current = performance.now() + SCRUB_CLICK_SUPPRESS_WINDOW_MS;
            setIsScrubbing(false);
            onHoverChange(null);
            onSelect(finalVal, { fromScrub: true });
            return;
        }

        scrubRef.current = null;
        if (event.pointerType === 'touch') {
            onHoverChange(null);
        }
    }

    function handlePointerCancel(event: PointerEvent<HTMLDivElement>) {
        const session = scrubRef.current;
        if (!session || session.pointerId !== event.pointerId) return;

        if (session.isScrubbing) {
            event.currentTarget.releasePointerCapture?.(event.pointerId);
        }
        scrubRef.current = null;
        suppressClickUntilRef.current = 0;
        setIsScrubbing(false);
        onHoverChange(null);
    }

    function handleSegmentClick(val: number) {
        if (suppressClickUntilRef.current > 0) {
            const shouldSuppress = performance.now() < suppressClickUntilRef.current;
            suppressClickUntilRef.current = 0;
            if (shouldSuppress) return;
        }
        onSelect(val);
    }

    return (
        <div className="min-w-0 flex-1 overflow-x-auto scrollbar-hide md:overflow-visible">
            <div
                ref={trackRef}
                data-scrubbing={isScrubbing ? 'true' : undefined}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerCancel}
                onMouseLeave={() => {
                    if (!scrubRef.current?.isScrubbing) {
                        onHoverChange(null);
                    }
                }}
                className={`flex w-max gap-[2px] py-1 touch-pan-y select-none ${isScrubbing ? 'rounded-sm ring-1 ring-white/40' : ''}`}
            >
                {SEGMENT_INDICES.map((index) => {
                    const val = (index + 1) * 0.5;
                    const isFilled = val <= displayRating;
                    const isScrubHead = isScrubbing && displayRating === val;
                    const segmentColor = isFilled ? RATING_SEGMENT_COLORS[index] : 'rgba(255,255,255,0.08)';

                    return (
                        <button
                            key={index}
                            type="button"
                            aria-label={`${driverName}: ${val.toFixed(1)} out of 10`}
                            aria-pressed={currentRating === val}
                            onFocus={() => onHoverChange(val)}
                            onBlur={() => onHoverChange(null)}
                            onMouseEnter={() => onHoverChange(val)}
                            onClick={() => handleSegmentClick(val)}
                            className="relative h-7 w-4 flex-shrink-0 cursor-pointer touch-manipulation focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2 md:h-10 md:w-5"
                        >
                            <div
                                className="h-full w-full rounded-sm transition-transform duration-75"
                                style={{
                                    backgroundColor: segmentColor,
                                    transform: isScrubHead ? 'scaleY(1.12)' : isFilled ? 'scaleY(1)' : 'scaleY(0.65)',
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

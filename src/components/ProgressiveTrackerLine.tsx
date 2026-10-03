import type { ComponentProps } from 'react';
import { Curve } from 'recharts';
import { revealPointsLine, type TrackerCoordinate } from '../utils/pointsTracker';

interface ProgressiveTrackerCurveProps extends ComponentProps<typeof Curve> {
    progress: number;
    dash?: string;
}

/** Draw a tracker line by distance while keeping Recharts' full geometry available for scale transitions. */
export function ProgressiveTrackerCurve({ progress, dash, ...props }: ProgressiveTrackerCurveProps) {
    const { visiblePoints } = revealPointsLine(props.points ?? [], progress);
    return <>
        <Curve {...props} className="points-tracker-geometry" strokeDasharray={dash} visibility="hidden" pointerEvents="none" aria-hidden />
        <Curve {...props} pathRef={undefined} points={visiblePoints} strokeDasharray={dash} />
    </>;
}

interface ProgressiveTrackerDotProps {
    progress: number;
    color: string;
    active?: boolean;
    name?: string;
    cx?: number;
    cy?: number;
    index?: number;
    points?: readonly TrackerCoordinate[];
}

/** Reveal solid, full-size markers only when the animated line reaches their vertices. */
export function ProgressiveTrackerDot({
    progress, color, active = false, name, cx, cy, index, points = [],
}: ProgressiveTrackerDotProps) {
    const { visibleIndexes, dotScale } = revealPointsLine(points, progress);
    if (index === undefined || !visibleIndexes.has(index) || cx === undefined || cy === undefined) return null;
    return <circle
        className={`recharts-dot recharts-line-dot${active ? ' points-tracker-active-dot' : ''}`}
        name={name}
        data-point-index={index}
        cx={cx}
        cy={cy}
        r={(active ? 6 : 4) * dotScale}
        fill={color}
        stroke={active ? '#fff' : '#0a0a0b'}
        strokeWidth={2 * dotScale}
        strokeDasharray="none"
    />;
}

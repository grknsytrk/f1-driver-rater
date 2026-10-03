import { useReducedMotion } from 'framer-motion';
import { Line, useActiveTooltipDataPoints } from 'recharts';
import { POINTS_RESCALE_MS, usePointsTrackerSeries } from '../hooks/usePointsTrackerSeries';
import { buildDriverLineDashes } from '../utils/standings';
import type { DriverFormSeries } from '../utils/storage';
import type { FormChartPoint } from '../utils/formTracker';
import { ProgressiveTrackerCurve, ProgressiveTrackerDot } from './ProgressiveTrackerLine';
import type { TrackerCoordinate } from '../utils/pointsTracker';

interface FormTrackerLinesProps {
    drivers: DriverFormSeries[];
    selectedDriverIds: string[];
    getColor: (constructorId: string) => string;
}

interface FormTrackerDotProps {
    progress: number;
    color: string;
    name?: string;
    cx?: number;
    cy?: number;
    index?: number;
    points?: readonly TrackerCoordinate[];
    payload?: FormChartPoint;
}

function FormTrackerDot({ progress, color, name, cx, cy, index, points = [], payload }: FormTrackerDotProps) {
    const activePoints = useActiveTooltipDataPoints<FormChartPoint>();
    const active = activePoints?.some(point => point.round === payload?.round) ?? false;
    return <ProgressiveTrackerDot progress={progress} color={color} active={active} name={name} cx={cx} cy={cy} index={index} points={points} />;
}

export function FormTrackerLines({ drivers, selectedDriverIds, getColor }: FormTrackerLinesProps) {
    const reducedMotion = useReducedMotion();
    const selectedDrivers = drivers.filter(driver => selectedDriverIds.includes(driver.driverId));
    const series = usePointsTrackerSeries(selectedDrivers.map(driver => driver.driverId), !!reducedMotion);
    const dashPatterns = buildDriverLineDashes(drivers.map(driver => ({
        driverId: driver.driverId,
        constructorId: driver.latestConstructorId,
    })));

    return <>
        {series.flatMap(animation => {
            const driver = drivers.find(candidate => candidate.driverId === animation.id);
            if (!driver) return [];
            const color = getColor(driver.latestConstructorId);
            const dash = dashPatterns.get(driver.driverId);
            return [
                <Line
                    key={driver.driverId}
                    type="linear"
                    name={driver.driverId}
                    dataKey={driver.driverId}
                    connectNulls={false}
                    stroke={color}
                    strokeDasharray={dash}
                    strokeWidth={3}
                    shape={<ProgressiveTrackerCurve progress={animation.progress} dash={dash} />}
                    dot={<FormTrackerDot progress={animation.progress} color={color} />}
                    activeDot={false}
                    isAnimationActive={!reducedMotion}
                    animationDuration={POINTS_RESCALE_MS}
                    animationEasing="ease"
                />,
            ];
        })}
    </>;
}

import { useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { Line, useActiveTooltipDataPoints } from 'recharts';
import { POINTS_RESCALE_MS, usePointsTrackerSeries } from '../hooks/usePointsTrackerSeries';
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
    const selectionKey = JSON.stringify(selectedDrivers.map(driver => driver.driverId));
    const [dashState, setDashState] = useState(() => ({
        selectionKey,
        patterns: new Map(selectedDrivers.map((driver, index) => [
            driver.driverId,
            index === 0 ? undefined : index % 2 === 1 ? '7 4' : '2 3',
        ])),
    }));
    let renderedDashPatterns = dashState.patterns;
    if (dashState.selectionKey !== selectionKey) {
        renderedDashPatterns = new Map(dashState.patterns);
        selectedDrivers.forEach((driver, index) => {
            if (!renderedDashPatterns.has(driver.driverId)) {
                renderedDashPatterns.set(driver.driverId, index === 0 ? undefined : index % 2 === 1 ? '7 4' : '2 3');
            }
        });
        setDashState({ selectionKey, patterns: renderedDashPatterns });
    }

    return <>
        {series.flatMap(animation => {
            const driver = drivers.find(candidate => candidate.driverId === animation.id);
            if (!driver) return [];
            const color = getColor(driver.latestConstructorId);
            const dash = renderedDashPatterns.get(driver.driverId);
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

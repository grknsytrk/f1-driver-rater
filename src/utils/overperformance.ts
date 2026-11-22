import type { ConstructorStanding, DriverStanding } from '../api/f1Api';
import { getTeamColor, type AverageRating } from '../types';

export type PerformanceAxisMode = 'car' | 'driver';
export type PerformanceScaleMode = 'spread' | 'linear';
export type PerformanceGridFilter = 'all' | 'midfield' | 'leaders';
export type LabelPlacement = 'top' | 'bottom' | 'left' | 'right';

export interface OverperformancePoint {
    driverId: string;
    driverName: string;
    shortCode: string;
    constructorId: string;
    constructorName: string;
    color: string;
    carPoints: number;
    driverPoints: number;
    xValue: number;
    xPlot: number;
    rating: number;
    expectedRating: number;
    delta: number;
    ratedRaces: number;
    qualified: boolean;
    wccPosition: number | null;
    wdcPosition: number | null;
    labelPlacement: LabelPlacement;
}

export interface RegressionTrend {
    slope: number;
    intercept: number;
    meanX: number;
    meanY: number;
    segment: [{ x: number; y: number }, { x: number; y: number }];
}

export interface OverperformanceDataset {
    points: OverperformancePoint[];
    trend: RegressionTrend | null;
    topOverperformers: OverperformancePoint[];
    topUnderperformers: OverperformancePoint[];
    xDomain: [number, number];
    yDomain: [number, number];
    xTicks?: number[];
    totalDriverCount: number;
    unqualifiedCount: number;
}

export interface BuildOverperformanceParams {
    averages: AverageRating[];
    driverStandings: DriverStanding[];
    constructorStandings: ConstructorStanding[];
    axisMode: PerformanceAxisMode;
    scaleMode?: PerformanceScaleMode;
    gridFilter?: PerformanceGridFilter;
    includeUnqualified?: boolean;
    minimumRatedRaces?: number;
}

function toPlotX(value: number, scaleMode: PerformanceScaleMode): number {
    const safeValue = Math.max(0, value);
    return scaleMode === 'spread' ? Math.sqrt(safeValue) : safeValue;
}

function deriveShortCode(driverName: string, standingCode?: string): string {
    const trimmed = standingCode?.trim();
    if (trimmed) return trimmed.toUpperCase();
    const parts = driverName.trim().split(/\s+/);
    const family = parts[parts.length - 1] ?? driverName;
    return family.replace(/[^a-zA-Z0-9]/g, '').slice(0, 3).toUpperCase() || 'DRV';
}

function computeNiceMaxX(maxValue: number): number {
    if (!Number.isFinite(maxValue) || maxValue <= 0) return 10;
    const padded = maxValue * 1.08;
    const step = padded >= 400 ? 100 : padded >= 150 ? 50 : padded >= 60 ? 25 : 10;
    return Math.max(10, Math.ceil(padded / step) * step);
}

function computeLinearBounds(
    minValue: number,
    maxValue: number,
    anchorZero: boolean,
): { domain: [number, number]; ticks?: number[] } {
    if (anchorZero || minValue <= 20) {
        return { domain: [0, computeNiceMaxX(maxValue)] };
    }
    const span = Math.max(10, maxValue - minValue);
    const step = span >= 300 ? 100 : span >= 120 ? 50 : 25;
    const xMin = Math.max(0, Math.floor((minValue - span * 0.12) / step) * step);
    const xMax = Math.ceil((maxValue + span * 0.12) / step) * step;
    const ticks: number[] = [];
    for (let v = xMin; v <= xMax; v += step) {
        ticks.push(v);
    }
    return { domain: [xMin, Math.max(xMin + step, xMax)], ticks };
}

function computeSpreadBounds(
    minPlot: number,
    maxPlot: number,
    anchorZero: boolean,
): { domain: [number, number]; ticks: number[] } {
    const safeMax = Number.isFinite(maxPlot) && maxPlot > 0 ? maxPlot : 5;
    const startPlot = anchorZero ? 0 : Math.max(0, minPlot);
    const roughSpan = Math.max(2, safeMax - startPlot);
    const step = roughSpan <= 7 ? 1 : roughSpan <= 16 ? 3 : 5;

    const xMin = anchorZero
        ? 0
        : Math.max(0, Math.floor((startPlot - step * 0.4) / step) * step);
    const xMax = Math.max(xMin + step, Math.ceil((safeMax * 1.04) / step) * step);

    const ticks: number[] = [];
    for (let v = xMin; v <= xMax + 1e-6; v += step) {
        ticks.push(v);
    }

    return { domain: [xMin, xMax], ticks };
}

function computeYDomain(ratings: number[]): [number, number] {
    if (ratings.length === 0) return [0, 10];
    let minRating = Infinity;
    let maxRating = -Infinity;
    for (const r of ratings) {
        if (r < minRating) minRating = r;
        if (r > maxRating) maxRating = r;
    }

    let yMin = Math.max(0, Math.floor((minRating - 0.6) * 2) / 2);
    let yMax = Math.min(10, Math.ceil((maxRating + 0.6) * 2) / 2);

    if (yMax - yMin < 1.5) {
        const mid = (yMin + yMax) / 2;
        yMin = Math.max(0, Math.floor((mid - 1) * 2) / 2);
        yMax = Math.min(10, Math.ceil((mid + 1) * 2) / 2);
    }

    return [yMin, yMax];
}

function clipRegressionSegment(
    slope: number,
    intercept: number,
    xMin: number,
    xMax: number,
    yMin: number,
    yMax: number,
): [{ x: number; y: number }, { x: number; y: number }] {
    const eps = 1e-6;
    const candidates: Array<{ x: number; y: number }> = [];

    const addIfInside = (x: number, y: number) => {
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        if (x < xMin - eps || x > xMax + eps || y < yMin - eps || y > yMax + eps) return;
        const clampedX = Math.max(xMin, Math.min(xMax, x));
        const clampedY = Math.max(yMin, Math.min(yMax, y));
        const duplicate = candidates.some(
            pt => Math.abs(pt.x - clampedX) < 1e-3 && Math.abs(pt.y - clampedY) < 1e-3,
        );
        if (!duplicate) {
            candidates.push({ x: clampedX, y: clampedY });
        }
    };

    addIfInside(xMin, slope * xMin + intercept);
    addIfInside(xMax, slope * xMax + intercept);

    if (Math.abs(slope) > eps) {
        addIfInside((yMin - intercept) / slope, yMin);
        addIfInside((yMax - intercept) / slope, yMax);
    }

    candidates.sort((a, b) => a.x - b.x);
    if (candidates.length >= 2) {
        return [candidates[0], candidates[candidates.length - 1]];
    }

    return [
        { x: xMin, y: Math.max(yMin, Math.min(yMax, slope * xMin + intercept)) },
        { x: xMax, y: Math.max(yMin, Math.min(yMax, slope * xMax + intercept)) },
    ];
}

function assignLabelPlacements(
    points: OverperformancePoint[],
    xDomain: [number, number],
    yDomain: [number, number],
): OverperformancePoint[] {
    const xMin = xDomain[0];
    const spanX = Math.max(1, xDomain[1] - xMin);
    const yMin = yDomain[0];
    const spanY = Math.max(0.5, yDomain[1] - yMin);

    const offsets: Record<LabelPlacement, { dx: number; dy: number }> = {
        top: { dx: 0, dy: 0.06 },
        bottom: { dx: 0, dy: -0.06 },
        right: { dx: 0.065, dy: 0 },
        left: { dx: -0.065, dy: 0 },
    };
    const candidates: LabelPlacement[] = ['top', 'right', 'bottom', 'left'];

    const ordered = [...points].sort((a, b) => b.xPlot - a.xPlot || b.rating - a.rating);
    const placedLabels: Array<{ lx: number; ly: number }> = [];
    const placementByDriver = new Map<string, LabelPlacement>();

    for (const point of ordered) {
        const nx = (point.xPlot - xMin) / spanX;
        const ny = (point.rating - yMin) / spanY;

        let bestPlacement: LabelPlacement = 'top';
        let bestScore = -Infinity;

        for (const placement of candidates) {
            const offset = offsets[placement];
            const lx = nx + offset.dx;
            const ly = ny + offset.dy;

            let edgePenalty = 0;
            if (lx < 0.02 || lx > 0.96 || ly < 0.03 || ly > 0.96) {
                edgePenalty = 2;
            }

            let minDist = Infinity;
            for (const other of placedLabels) {
                const dist = Math.hypot(lx - other.lx, ly - other.ly);
                if (dist < minDist) minDist = dist;
            }

            const clearance = minDist === Infinity ? 1 : minDist;
            const score = clearance - edgePenalty;
            if (score > bestScore) {
                bestScore = score;
                bestPlacement = placement;
            }
        }

        const chosenOffset = offsets[bestPlacement];
        placedLabels.push({ lx: nx + chosenOffset.dx, ly: ny + chosenOffset.dy });
        placementByDriver.set(point.driverId, bestPlacement);
    }

    return points.map(point => ({
        ...point,
        labelPlacement: placementByDriver.get(point.driverId) ?? 'top',
    }));
}

function isLeaderPoint(
    point: OverperformancePoint,
    axisMode: PerformanceAxisMode,
    maxX: number,
): boolean {
    if (axisMode === 'car') {
        if (point.wccPosition !== null) return point.wccPosition <= 4;
    } else if (point.wdcPosition !== null) {
        return point.wdcPosition <= 8;
    }
    return maxX > 0 && point.xValue >= maxX * 0.4;
}

/**
 * Computes scatter plot points, OLS baseline trendline, axis bounds/ticks, and standout deltas
 * comparing driver ratings against constructor (car) or WDC points.
 */
export function buildOverperformanceDataset({
    averages,
    driverStandings,
    constructorStandings,
    axisMode,
    scaleMode = 'spread',
    gridFilter = 'all',
    includeUnqualified = true,
    minimumRatedRaces = 0,
}: BuildOverperformanceParams): OverperformanceDataset {
    if (averages.length === 0) {
        return {
            points: [],
            trend: null,
            topOverperformers: [],
            topUnderperformers: [],
            xDomain: [0, 10],
            yDomain: [0, 10],
            totalDriverCount: 0,
            unqualifiedCount: 0,
        };
    }

    const constructorById = new Map<string, ConstructorStanding>();
    for (const ctor of constructorStandings) {
        constructorById.set(ctor.constructorId, ctor);
    }

    const driverStandingById = new Map<string, DriverStanding>();
    for (const standing of driverStandings) {
        if (standing.Driver?.driverId) {
            driverStandingById.set(standing.Driver.driverId, standing);
        }
    }

    const allPoints: OverperformancePoint[] = averages.map((avg) => {
        const driverStanding = driverStandingById.get(avg.driverId);
        const latestCtor = driverStanding?.Constructors?.[driverStanding.Constructors.length - 1];
        const constructorId = latestCtor?.constructorId || avg.constructorId;
        const ctorStanding = constructorById.get(constructorId);
        const constructorName = ctorStanding?.constructorName || latestCtor?.name || avg.constructorName;

        const carPoints = ctorStanding?.points ?? 0;
        const parsedDriverPts = driverStanding ? Number.parseFloat(driverStanding.points) : 0;
        const driverPoints = Number.isFinite(parsedDriverPts) ? parsedDriverPts : 0;
        const parsedWdcPos = driverStanding ? Number.parseInt(driverStanding.position, 10) : Number.NaN;

        const xValue = axisMode === 'car' ? carPoints : driverPoints;
        const qualified = minimumRatedRaces <= 0 || avg.totalRaces >= minimumRatedRaces;

        return {
            driverId: avg.driverId,
            driverName: avg.driverName,
            shortCode: deriveShortCode(avg.driverName, driverStanding?.Driver?.code),
            constructorId,
            constructorName,
            color: getTeamColor(constructorId),
            carPoints,
            driverPoints,
            xValue,
            xPlot: toPlotX(xValue, scaleMode),
            rating: avg.averageRating,
            expectedRating: avg.averageRating,
            delta: 0,
            ratedRaces: avg.totalRaces,
            qualified,
            wccPosition: ctorStanding?.position ?? null,
            wdcPosition: Number.isFinite(parsedWdcPos) ? parsedWdcPos : null,
            labelPlacement: 'top',
        };
    });

    const qualifiedPoints = allPoints.filter(pt => pt.qualified);
    const unqualifiedCount = allPoints.length - qualifiedPoints.length;
    const regressionSample = qualifiedPoints.length >= 3 ? qualifiedPoints : allPoints;

    let slope = 0;
    let intercept = 0;
    let meanX = 0;
    let meanY = 0;
    let hasTrend = false;

    if (regressionSample.length >= 3) {
        const n = regressionSample.length;
        meanX = regressionSample.reduce((sum, pt) => sum + pt.xPlot, 0) / n;
        meanY = regressionSample.reduce((sum, pt) => sum + pt.rating, 0) / n;

        let covXY = 0;
        let varX = 0;
        for (const pt of regressionSample) {
            const dx = pt.xPlot - meanX;
            const dy = pt.rating - meanY;
            covXY += dx * dy;
            varX += dx * dx;
        }

        slope = varX > 1e-6 ? covXY / varX : 0;
        intercept = meanY - slope * meanX;
        hasTrend = true;

        for (const pt of allPoints) {
            pt.expectedRating = slope * pt.xPlot + intercept;
            pt.delta = pt.rating - pt.expectedRating;
        }
    }

    const basePool = !includeUnqualified && qualifiedPoints.length >= 3
        ? qualifiedPoints
        : allPoints;

    const maxAllX = allPoints.reduce((acc, pt) => Math.max(acc, pt.xValue), 0);
    const visiblePointsRaw = gridFilter === 'all'
        ? basePool
        : basePool.filter((pt) => {
            const leader = isLeaderPoint(pt, axisMode, maxAllX);
            return gridFilter === 'leaders' ? leader : !leader;
        });

    const activePool = visiblePointsRaw.length > 0 ? visiblePointsRaw : basePool;
    const minVisiblePlot = activePool.reduce((acc, pt) => Math.min(acc, pt.xPlot), Infinity);
    const maxVisiblePlot = activePool.reduce((acc, pt) => Math.max(acc, pt.xPlot), 0);

    const anchorZero = gridFilter !== 'leaders';
    const xBounds = scaleMode === 'spread'
        ? computeSpreadBounds(minVisiblePlot, maxVisiblePlot, anchorZero)
        : computeLinearBounds(
            anchorZero ? 0 : activePool.reduce((acc, pt) => Math.min(acc, pt.xValue), Infinity),
            activePool.reduce((acc, pt) => Math.max(acc, pt.xValue), 0),
            anchorZero,
        );

    const yDomain = computeYDomain(activePool.map(pt => pt.rating));

    const trend: RegressionTrend | null = hasTrend
        ? {
            slope,
            intercept,
            meanX,
            meanY,
            segment: clipRegressionSegment(
                slope,
                intercept,
                xBounds.domain[0],
                xBounds.domain[1],
                yDomain[0],
                yDomain[1],
            ),
        }
        : null;

    const labeledPoints = assignLabelPlacements(visiblePointsRaw, xBounds.domain, yDomain);

    const standoutSource = qualifiedPoints.length >= 3 ? qualifiedPoints : allPoints;
    const filteredStandout = gridFilter === 'all'
        ? standoutSource
        : standoutSource.filter((pt) => {
            const leader = isLeaderPoint(pt, axisMode, maxAllX);
            return gridFilter === 'leaders' ? leader : !leader;
        });
    const standoutPool = filteredStandout.length > 0 ? filteredStandout : standoutSource;

    const topOverperformers = standoutPool
        .filter(pt => pt.delta > 0.05)
        .sort((a, b) => b.delta - a.delta || b.rating - a.rating)
        .slice(0, 3);

    const topUnderperformers = standoutPool
        .filter(pt => pt.delta < -0.05)
        .sort((a, b) => a.delta - b.delta || a.rating - b.rating)
        .slice(0, 3);

    return {
        points: labeledPoints,
        trend,
        topOverperformers,
        topUnderperformers,
        xDomain: xBounds.domain,
        yDomain,
        xTicks: xBounds.ticks,
        totalDriverCount: allPoints.length,
        unqualifiedCount,
    };
}

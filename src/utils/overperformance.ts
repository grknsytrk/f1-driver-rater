import type { ConstructorStanding, DriverStanding } from '../api/f1Api';
import { getTeamColor, type AverageRating } from '../types';

export type PerformanceAxisMode = 'car' | 'driver';
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
}

export interface BuildOverperformanceParams {
    averages: AverageRating[];
    driverStandings: DriverStanding[];
    constructorStandings: ConstructorStanding[];
    axisMode: PerformanceAxisMode;
    minimumRatedRaces?: number;
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
    xMax: number,
    yMin: number,
    yMax: number,
): [{ x: number; y: number }, { x: number; y: number }] {
    const eps = 1e-6;
    const candidates: Array<{ x: number; y: number }> = [];

    const addIfInside = (x: number, y: number) => {
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        if (x < -eps || x > xMax + eps || y < yMin - eps || y > yMax + eps) return;
        const clampedX = Math.max(0, Math.min(xMax, x));
        const clampedY = Math.max(yMin, Math.min(yMax, y));
        const duplicate = candidates.some(
            pt => Math.abs(pt.x - clampedX) < 1e-3 && Math.abs(pt.y - clampedY) < 1e-3,
        );
        if (!duplicate) {
            candidates.push({ x: clampedX, y: clampedY });
        }
    };

    addIfInside(0, intercept);
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
        { x: 0, y: Math.max(yMin, Math.min(yMax, intercept)) },
        { x: xMax, y: Math.max(yMin, Math.min(yMax, slope * xMax + intercept)) },
    ];
}

function assignLabelPlacements(
    points: OverperformancePoint[],
    xMax: number,
    yDomain: [number, number],
): OverperformancePoint[] {
    const spanX = Math.max(1, xMax);
    const spanY = Math.max(0.5, yDomain[1] - yDomain[0]);
    const yMin = yDomain[0];

    const offsets: Record<LabelPlacement, { dx: number; dy: number }> = {
        top: { dx: 0, dy: 0.06 },
        bottom: { dx: 0, dy: -0.06 },
        right: { dx: 0.065, dy: 0 },
        left: { dx: -0.065, dy: 0 },
    };
    const candidates: LabelPlacement[] = ['top', 'right', 'bottom', 'left'];

    const ordered = [...points].sort((a, b) => b.xValue - a.xValue || b.rating - a.rating);
    const placedLabels: Array<{ lx: number; ly: number }> = [];
    const placementByDriver = new Map<string, LabelPlacement>();

    for (const point of ordered) {
        const nx = point.xValue / spanX;
        const ny = (point.rating - yMin) / spanY;

        let bestPlacement: LabelPlacement = 'top';
        let bestScore = -Infinity;

        for (const placement of candidates) {
            const offset = offsets[placement];
            const lx = nx + offset.dx;
            const ly = ny + offset.dy;

            // Keep labels inside chart edges
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

/**
 * Computes scatter plot points, OLS linear trendline, and over/underperforming standouts
 * comparing driver ratings against championship or constructor (car) performance.
 */
export function buildOverperformanceDataset({
    averages,
    driverStandings,
    constructorStandings,
    axisMode,
    minimumRatedRaces = 0,
}: BuildOverperformanceParams): OverperformanceDataset {
    if (averages.length === 0) {
        return {
            points: [],
            trend: null,
            topOverperformers: [],
            topUnderperformers: [],
            xDomain: [0, 100],
            yDomain: [0, 10],
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

    const rawPoints: OverperformancePoint[] = averages.map((avg) => {
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

    const maxX = rawPoints.reduce((acc, pt) => Math.max(acc, pt.xValue), 0);
    const xDomain: [number, number] = [0, computeNiceMaxX(maxX)];
    const yDomain = computeYDomain(rawPoints.map(pt => pt.rating));

    const qualifiedPoints = rawPoints.filter(pt => pt.qualified);
    const regressionSample = qualifiedPoints.length >= 3 ? qualifiedPoints : rawPoints;

    let trend: RegressionTrend | null = null;
    if (regressionSample.length >= 3) {
        const n = regressionSample.length;
        const meanX = regressionSample.reduce((sum, pt) => sum + pt.xValue, 0) / n;
        const meanY = regressionSample.reduce((sum, pt) => sum + pt.rating, 0) / n;

        let covXY = 0;
        let varX = 0;
        for (const pt of regressionSample) {
            const dx = pt.xValue - meanX;
            const dy = pt.rating - meanY;
            covXY += dx * dy;
            varX += dx * dx;
        }

        const slope = varX > 1e-6 ? covXY / varX : 0;
        const intercept = meanY - slope * meanX;
        const segment = clipRegressionSegment(slope, intercept, xDomain[1], yDomain[0], yDomain[1]);

        trend = { slope, intercept, meanX, meanY, segment };

        for (const pt of rawPoints) {
            pt.expectedRating = slope * pt.xValue + intercept;
            pt.delta = pt.rating - pt.expectedRating;
        }
    }

    const labeledPoints = assignLabelPlacements(rawPoints, xDomain[1], yDomain);
    const standoutPool = qualifiedPoints.length >= 3
        ? labeledPoints.filter(pt => pt.qualified)
        : labeledPoints;

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
        xDomain,
        yDomain,
    };
}

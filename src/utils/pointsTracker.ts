export interface TrackerCoordinate {
    x: number | null;
    y: number | null;
}

/** Reveal a linear SVG path by distance, keeping gaps and full circular markers intact. */
export function revealPointsLine(points: readonly TrackerCoordinate[], progress: number) {
    const distances: (number | null)[] = [];
    let length = 0;
    let previous: { x: number; y: number } | null = null;
    for (const point of points) {
        if (point.x === null || point.y === null || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
            distances.push(null);
            previous = null;
            continue;
        }
        if (previous) length += Math.hypot(point.x - previous.x, point.y - previous.y);
        distances.push(length);
        previous = { x: point.x, y: point.y };
    }
    const fraction = Math.max(0, Math.min(1, progress));
    const limit = length * fraction;
    const visiblePoints: TrackerCoordinate[] = [];
    const visibleIndexes = new Set<number>();
    if (fraction > 0) {
        let previousVisible: { x: number; y: number; distance: number } | null = null;
        for (let index = 0; index < points.length; index++) {
            const point = points[index];
            const distance = distances[index];
            if (distance === null) {
                if (visiblePoints.length > 0 && visiblePoints.at(-1)?.x !== null) visiblePoints.push({ x: null, y: null });
                previousVisible = null;
                continue;
            }
            if (distance <= limit) {
                visiblePoints.push({ x: point.x, y: point.y });
                visibleIndexes.add(index);
                previousVisible = { x: point.x!, y: point.y!, distance };
            } else {
                if (!previousVisible) break;
                const segmentProgress = (limit - previousVisible.distance) / (distance - previousVisible.distance);
                visiblePoints.push({
                    x: previousVisible.x + (point.x! - previousVisible.x) * segmentProgress,
                    y: previousVisible.y + (point.y! - previousVisible.y) * segmentProgress,
                });
                break;
            }
        }
        if (visiblePoints.at(-1)?.x === null) visiblePoints.pop();
    }
    return { visiblePoints, visibleIndexes, dotScale: length === 0 ? fraction : 1 };
}

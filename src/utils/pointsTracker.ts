export interface TrackerCoordinate {
    x: number | null;
    y: number | null;
}

/** Reveal a linear SVG path by distance, keeping its original dash origin and full circular markers. */
export function revealPointsLine(points: readonly TrackerCoordinate[], progress: number) {
    const vertices = points.flatMap((point, index) =>
        point.x !== null && point.y !== null && Number.isFinite(point.x) && Number.isFinite(point.y)
            ? [{ x: point.x, y: point.y, index }]
            : []);
    const distances = [0];
    for (let index = 1; index < vertices.length; index++) {
        const previous = vertices[index - 1];
        const point = vertices[index];
        distances.push(distances[index - 1] + Math.hypot(point.x - previous.x, point.y - previous.y));
    }
    const fraction = Math.max(0, Math.min(1, progress));
    const length = distances.at(-1) ?? 0;
    const limit = length * fraction;
    const visiblePoints: { x: number; y: number }[] = [];
    const visibleIndexes = new Set<number>();
    if (fraction > 0) {
        for (let index = 0; index < vertices.length; index++) {
            const point = vertices[index];
            if (distances[index] <= limit) {
                visiblePoints.push({ x: point.x, y: point.y });
                visibleIndexes.add(point.index);
            } else {
                const previous = vertices[index - 1];
                const segmentProgress = (limit - distances[index - 1]) / (distances[index] - distances[index - 1]);
                visiblePoints.push({
                    x: previous.x + (point.x - previous.x) * segmentProgress,
                    y: previous.y + (point.y - previous.y) * segmentProgress,
                });
                break;
            }
        }
    }
    return { visiblePoints, visibleIndexes, dotScale: length === 0 ? fraction : 1 };
}

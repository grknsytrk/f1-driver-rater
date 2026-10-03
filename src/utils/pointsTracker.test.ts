import { describe, expect, it } from 'vitest';
import { revealPointsLine } from './pointsTracker';

describe('revealPointsLine', () => {
    const points = [{ x: 0, y: 0 }, { x: 3, y: 4 }, { x: 15, y: 4 }];
    it('uses segment distance rather than the point count to place the moving endpoint', () => {
        const reveal = revealPointsLine(points, 0.5);
        expect(reveal.visiblePoints).toEqual([{ x: 0, y: 0 }, { x: 3, y: 4 }, { x: 6.5, y: 4 }]);
        expect([...reveal.visibleIndexes]).toEqual([0, 1]);
        expect(reveal.dotScale).toBe(1);
    });
    it('shows a whole marker exactly when the drawing reaches its vertex', () => {
        expect([...revealPointsLine(points, 5 / 17).visibleIndexes]).toEqual([0, 1]);
        expect([...revealPointsLine(points, 4.99 / 17).visibleIndexes]).toEqual([0]);
        expect(revealPointsLine(points, 0).visiblePoints).toEqual([]);
        expect(revealPointsLine(points, 1).visiblePoints).toEqual(points);
    });
    it('keeps gaps disconnected while revealing each contiguous segment in sequence', () => {
        const sparse = [
            { x: 0, y: 0 }, { x: 10, y: 0 }, { x: null, y: null },
            { x: 20, y: 10 }, { x: 30, y: 10 },
        ];
        const reveal = revealPointsLine(sparse, 0.75);
        expect(reveal.visiblePoints).toEqual([
            { x: 0, y: 0 }, { x: 10, y: 0 }, { x: null, y: null },
            { x: 20, y: 10 }, { x: 25, y: 10 },
        ]);
        expect([...reveal.visibleIndexes]).toEqual([0, 1, 3]);
    });
    it('scales single and coincident points without dividing by zero', () => {
        expect(revealPointsLine(points.slice(0, 1), 0.4).dotScale).toBe(0.4);
        expect(revealPointsLine([points[0], points[0]], 0.4).dotScale).toBe(0.4);
        expect(revealPointsLine([], 0.4).visiblePoints).toEqual([]);
    });
});

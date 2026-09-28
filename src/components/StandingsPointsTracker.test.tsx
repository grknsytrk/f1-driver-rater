import { act, cloneElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChampionshipProgressPoint, PointsTrackerEntry } from '../utils/standings';
import { StandingsPointsTracker } from './StandingsPointsTracker';

// Fix dimensions only; all axes, curves, dots, tooltips and geometry animations remain real Recharts.
vi.mock('recharts', async importOriginal => ({
    ...await importOriginal<typeof import('recharts')>(),
    ResponsiveContainer: ({ children }: { children: ReactElement<{ width: number; height: number }> }) =>
        cloneElement(children, { width: 800, height: 420 }),
}));
const preferences = vi.hoisted(() => ({ reducedMotion: false }));
vi.mock('framer-motion', () => ({ useReducedMotion: () => preferences.reducedMotion }));

const entries: PointsTrackerEntry[] = [
    { id: 'leader', name: 'Leader', label: 'Leader', description: 'Leader', points: 100, color: '#00d2be' },
    { id: 'teammate', name: 'Teammate', label: 'Teammate', description: 'Teammate', points: 60, color: '#00d2be', dash: '8 5' },
    { id: 'other', name: 'Other', label: 'Other', description: 'Other', points: 40, color: '#ff0000' },
];
const points: ChampionshipProgressPoint[] = [1, 2, 3].map((round, index) => ({
    round: String(round), raceName: `Race ${round}`, sprintOnly: false,
    scores: Object.fromEntries(entries.map(entry => [entry.id, {
        totalPoints: entry.points * (index + 1) / 3, weekendPoints: entry.points / 3,
    }])),
}));

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.useFakeTimers();
    preferences.reducedMotion = false;
    // happy-dom lacks SVG length measurement used internally by Recharts' geometry animation.
    Object.defineProperty(SVGElement.prototype, 'getTotalLength', { configurable: true, value: () => 800 });
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
});
afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    Reflect.deleteProperty(SVGElement.prototype, 'getTotalLength');
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

async function render(selectedIds: string[], isExporting = false, data = points, mode: 'drivers' | 'constructors' = 'drivers', trackerEntries = entries) {
    await act(async () => root.render(<StandingsPointsTracker season="2026" mode={mode} entries={trackerEntries}
        points={data} selectedIds={selectedIds} onSelectionChange={() => {}} isExporting={isExporting}
        error={null} onRetry={() => {}} />));
}
async function advance(ms: number) {
    await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}
function curve(name: string) {
    return container.querySelector<SVGPathElement>(`.recharts-line-curve[name="${name}"]`);
}
function dots(name: string) {
    return [...container.querySelectorAll<SVGCircleElement>(`.recharts-line-dot[name="${name}"]`)];
}
function lastX(name: string) {
    const coordinates = curve(name)?.getAttribute('d')?.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
    return coordinates.at(-2) ?? 0;
}
function assertAlignedDots(name: string) {
    const vertices = (curve(name)?.getAttribute('d') ?? '').match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
    dots(name).forEach(dot => {
        const index = Number(dot.dataset.pointIndex);
        expect(dot.getAttribute('stroke-dasharray')).toBe('none');
        expect(Number(dot.getAttribute('cx'))).toBeCloseTo(vertices[index * 2], 2);
        expect(Number(dot.getAttribute('cy'))).toBeCloseTo(vertices[index * 2 + 1], 2);
    });
}
async function hoverRound(index: number) {
    const application = container.querySelector<SVGSVGElement>('[role="application"]')!;
    await act(async () => {
        application.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    });
    for (let step = 0; step < index; step++) {
        await act(async () => {
            application.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        });
    }
}

describe('points tracker SVG', () => {
    it('shows three-letter driver codes in the round tooltip while keeping full names available', async () => {
        const codedEntries = entries.map((entry, index) => ({
            ...entry,
            name: ['Lewis Hamilton', 'Charles Leclerc', 'Andrea Kimi Antonelli'][index],
            label: ['Hamilton', 'Leclerc', 'Antonelli'][index],
            code: ['HAM', 'LEC', 'ANT'][index],
        }));
        const selected = entries.map(entry => entry.id);
        await render(selected, true, points, 'drivers', codedEntries);
        await render(selected, false, points, 'drivers', codedEntries);
        await hoverRound(0);

        const tooltip = container.querySelector('.recharts-tooltip-wrapper');
        expect(tooltip?.textContent).toContain('HAM');
        expect(tooltip?.textContent).toContain('LEC');
        expect(tooltip?.textContent).toContain('ANT');
        expect(tooltip?.textContent).not.toContain('Hamilton');
        expect([...tooltip!.querySelectorAll('span[title]')].map(span => span.getAttribute('title')))
            .toEqual(['Lewis Hamilton', 'Charles Leclerc', 'Andrea Kimi Antonelli']);
    });

    it('draws markers only when the line reaches them, preserving solid circles and settled sibling lines', async () => {
        await render(['leader']);
        await advance(1600);
        const settledPath = curve('Leader')?.getAttribute('d');
        await render(['leader', 'teammate']);
        expect(dots('Teammate')).toHaveLength(0);
        await advance(300);
        expect(dots('Teammate')).toHaveLength(1);
        const firstEnd = lastX('Teammate');
        await advance(600);
        expect(dots('Teammate')).toHaveLength(2);
        expect(lastX('Teammate')).toBeGreaterThan(firstEnd);
        expect(curve('Leader')?.getAttribute('d')).toBe(settledPath);
        expect(curve('Teammate')?.getAttribute('stroke-dasharray')).toBe('8 5');
        assertAlignedDots('Teammate');
        await advance(700);
        expect(dots('Teammate')).toHaveLength(3);
        assertAlignedDots('Teammate');
    });

    it('erases from the last point backwards at full opacity and rescales only after completion', async () => {
        await render(['leader', 'teammate']);
        await advance(1600);
        const previousPath = curve('Teammate')?.getAttribute('d');
        const fullEnd = lastX('Leader');
        await render(['teammate']);
        await advance(200);
        const partialEnd = lastX('Leader');
        expect(partialEnd).toBeLessThan(fullEnd);
        expect(dots('Leader')).toHaveLength(2);
        expect(curve('Leader')?.style.opacity).toBe('');
        expect(container.querySelector('[aria-label="Selected driver lines"]')?.textContent).toContain('Leader');
        expect(curve('Teammate')?.getAttribute('d')).toBe(previousPath);
        await advance(200);
        expect(lastX('Leader')).toBeLessThan(partialEnd);
        expect(dots('Leader')).toHaveLength(1);
        await advance(240);
        expect(curve('Leader')).toBeNull();
        assertAlignedDots('Teammate');
        await advance(350);
        expect(curve('Teammate')?.getAttribute('d')).not.toBe(previousPath);
        expect(dots('Teammate')).toHaveLength(3);
        assertAlignedDots('Teammate');
    });

    it('reverses a partial entry and exit without jumping or allowing stale completion to remove a new selection', async () => {
        await render(['leader', 'teammate']);
        await advance(750);
        const entryEnd = lastX('Teammate');
        await render(['leader']);
        expect(lastX('Teammate')).toBe(entryEnd);
        await advance(100);
        const exitEnd = lastX('Teammate');
        expect(exitEnd).toBeLessThan(entryEnd);
        await render(['leader', 'teammate']);
        expect(lastX('Teammate')).toBe(exitEnd);
        await advance(350); // Pass the old exit's completion time.
        expect(lastX('Teammate')).toBeGreaterThan(exitEnd);
        await advance(1500);
        expect(dots('Teammate')).toHaveLength(3);
        await render([]);
        await advance(400);
        expect(container.textContent).not.toContain('SELECT DRIVERS TO COMPARE');
        await advance(250);
        expect(container.textContent).toContain('SELECT DRIVERS TO COMPARE');
    });

    it('uses the same visibility boundary for active dots during entry and erasure', async () => {
        await render(['leader']);
        await advance(250);
        await hoverRound(2);
        expect(container.querySelectorAll('.points-tracker-active-dot')).toHaveLength(0);
        await advance(1400);
        const active = container.querySelector<SVGCircleElement>('.points-tracker-active-dot');
        expect(active?.dataset.pointIndex).toBe('2');
        expect(active?.getAttribute('stroke-dasharray')).toBe('none');
        expect(active?.getAttribute('r')).toBe('6');
        await render([]);
        await advance(100);
        expect(container.querySelectorAll('.points-tracker-active-dot')).toHaveLength(0);
    });

    it('grows and shrinks the marker for a single-race timeline', async () => {
        const single = points.slice(0, 1);
        await render(['leader'], false, single);
        await advance(300);
        const smallRadius = Number(dots('Leader')[0]?.getAttribute('r'));
        expect(smallRadius).toBeGreaterThan(0);
        expect(smallRadius).toBeLessThan(4);
        await advance(1300);
        expect(dots('Leader')[0]?.getAttribute('r')).toBe('4');
        await render([], false, single);
        await advance(300);
        expect(Number(dots('Leader')[0]?.getAttribute('r'))).toBeLessThan(4);
        await advance(350);
        expect(dots('Leader')).toHaveLength(0);
    });

    it('exports fully drawn current selections and does not replay them after export', async () => {
        await render(['leader']);
        await advance(1600);
        await render(['leader', 'teammate']);
        await advance(100);
        await render(['teammate']);
        await render(['teammate'], true);
        await advance(50);
        expect(curve('Leader')).toBeNull();
        expect(curve('Teammate')?.getAttribute('stroke-dasharray')).toBe('8 5');
        expect(dots('Teammate')).toHaveLength(3);
        const completedPath = curve('Teammate')?.getAttribute('d');
        assertAlignedDots('Teammate');
        await render(['teammate']);
        await advance(650);
        expect(curve('Teammate')?.getAttribute('d')).toBe(completedPath);
        expect(dots('Teammate')).toHaveLength(3);
    });

    it('snaps entry and exit to completion when reduced motion becomes active', async () => {
        await render(['leader', 'teammate']);
        await advance(300);
        await render(['teammate']);
        preferences.reducedMotion = true;
        await render(['teammate']);
        await advance(50);
        expect(curve('Leader')).toBeNull();
        expect(dots('Teammate')).toHaveLength(3);
        await render([]);
        expect(container.textContent).toContain('SELECT DRIVERS TO COMPARE');
    });

    it.each(['drivers', 'constructors'] as const)('shows the hovered-round selected leader gap in %s tooltips', async mode => {
        const data: ChampionshipProgressPoint[] = [
            { round: '1', raceName: 'Japanese Grand Prix', sprintOnly: false, scores: {
                leader: { totalPoints: 72, weekendPoints: 25 }, teammate: { totalPoints: 63, weekendPoints: 12 }, other: { totalPoints: 49, weekendPoints: 15 },
            } },
            { round: '2', raceName: 'Chinese Grand Prix', sprintOnly: true, scores: {
                leader: { totalPoints: 72.5, weekendPoints: 0.5 }, teammate: { totalPoints: 73, weekendPoints: 10 }, other: { totalPoints: 72.5, weekendPoints: 23.5 },
            } },
        ];
        await render(['leader', 'teammate', 'other'], true, data, mode);
        await render(['leader', 'teammate', 'other'], false, data, mode);
        await hoverRound(0);
        const tooltip = () => container.querySelector('.recharts-tooltip-wrapper')?.textContent;
        expect(tooltip()).toContain('GAP');
        expect(tooltip()).not.toContain('WEEKEND');
        expect(tooltip()).toContain('Leader72LEADER');
        expect(tooltip()).toContain('Teammate63−9');
        expect(tooltip()).toContain('Other49−23');
        await render(['teammate', 'other'], false, data, mode);
        expect(tooltip()).toContain('Teammate63LEADER');
        expect(tooltip()).toContain('Other49−14');
        await render(['leader', 'teammate', 'other'], false, data, mode);
        await act(async () => { container.querySelector('[role="application"]')!
            .dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); });
        expect(tooltip()).toContain('SPRINT ONLY');
        expect(tooltip()).toContain('Teammate73LEADER');
        expect(tooltip()).toContain('Leader72.5−0.5');
        await render(['leader', 'other'], false, data, mode);
        expect(tooltip()?.match(/LEADER/g)).toHaveLength(2);
        await render(['other'], false, data, mode);
        expect(tooltip()).toContain('Other72.5LEADER');
    });
});

import { useEffect, useRef, useState } from 'react';

export const POINTS_ENTRY_MS = 1500;
export const POINTS_EXIT_MS = 600;
export const POINTS_RESCALE_MS = 300;

export interface PointsTrackerSeries {
    id: string;
    phase: 'entering' | 'visible' | 'exiting';
    progress: number;
}

interface SeriesAnimation {
    phase: PointsTrackerSeries['phase'];
    frame: number;
}

/** Keep each reveal independent of Recharts' geometry animations and reversible from its current position. */
export function usePointsTrackerSeries(selectedIds: string[], instant: boolean) {
    const selectionKey = JSON.stringify(selectedIds);
    const [state, setState] = useState(() => ({
        selectionKey,
        instant,
        series: selectedIds.map<PointsTrackerSeries>(id => ({ id, phase: instant ? 'visible' : 'entering', progress: instant ? 1 : 0 })),
    }));
    const animations = useRef(new Map<string, SeriesAnimation>());

    // Synchronize before painting so exports and reduced-motion renders never include retiring lines.
    if (state.selectionKey !== selectionKey || state.instant !== instant) {
        const selected = new Set(selectedIds);
        const previous = new Map(state.series.map(series => [series.id, series]));
        const series = selectedIds.map<PointsTrackerSeries>(id => {
            const progress = instant ? 1 : previous.get(id)?.progress ?? 0;
            return { id, progress, phase: progress === 1 ? 'visible' : 'entering' };
        });
        if (!instant) {
            state.series.forEach(item => {
                if (!selected.has(item.id)) series.push({ ...item, phase: 'exiting' });
            });
        }
        setState({ selectionKey, instant, series });
    }

    useEffect(() => {
        const pending = animations.current;
        const phases = new Map(state.series.map(series => [series.id, series.phase]));
        pending.forEach((entry, id) => {
            if (phases.get(id) !== entry.phase) {
                cancelAnimationFrame(entry.frame);
                pending.delete(id);
            }
        });
        state.series.forEach(({ id, phase, progress }) => {
            if (phase === 'visible' || pending.has(id)) return;
            const target = phase === 'exiting' ? 0 : 1;
            const duration = (target === 1 ? POINTS_ENTRY_MS : POINTS_EXIT_MS) * Math.abs(target - progress);
            const startedAt = performance.now();
            const entry: SeriesAnimation = { phase, frame: 0 };
            const tick = (now: number) => {
                if (pending.get(id) !== entry) return;
                const elapsed = duration === 0 ? 1 : Math.min(1, (now - startedAt) / duration);
                const eased = elapsed * elapsed * (3 - 2 * elapsed);
                const nextProgress = progress + (target - progress) * eased;
                setState(current => ({
                    ...current,
                    series: current.series.flatMap(series => {
                        if (series.id !== id || series.phase !== phase) return [series];
                        if (elapsed < 1) return [{ ...series, progress: nextProgress }];
                        return target === 0 ? [] : [{ id, phase: 'visible', progress: 1 }];
                    }),
                }));
                if (elapsed < 1) entry.frame = requestAnimationFrame(tick);
                else pending.delete(id);
            };
            pending.set(id, entry);
            entry.frame = requestAnimationFrame(tick);
        });
    }, [state.series]);

    useEffect(() => {
        const pending = animations.current;
        return () => {
            pending.forEach(entry => cancelAnimationFrame(entry.frame));
            pending.clear();
        };
    }, []);

    return state.series;
}

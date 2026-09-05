export function getRatingColor(value: number): string {
    if (value <= 0) return 'var(--text-muted)';
    const t = Math.max(0, Math.min(1, (value - 0.5) / 9.5));
    if (t < 0.4) {
        const localT = t / 0.4;
        return `rgb(225, ${Math.round(6 + localT * 101)}, 0)`;
    }
    if (t < 0.7) {
        const localT = (t - 0.4) / 0.3;
        return `rgb(${Math.round(225 + localT * 17)}, ${Math.round(107 + localT * 102)}, ${Math.round(localT * 61)})`;
    }
    const localT = (t - 0.7) / 0.3;
    return `rgb(${Math.round(242 - localT * 242)}, ${Math.round(209 + localT * 46)}, ${Math.round(61 + localT * 75)})`;
}

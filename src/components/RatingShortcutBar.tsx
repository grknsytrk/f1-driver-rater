/**
 * Compact responsive hint bar displaying mobile scrub and desktop keyboard shortcuts
 * inside rating modals.
 */
export function RatingShortcutBar() {
    return (
        <div
            data-testid="rating-shortcut-bar"
            className="mb-2 flex items-center justify-between gap-2 border border-[var(--border-color)] bg-[var(--bg-darker)] px-2.5 py-1.5 font-oxanium text-[9px] uppercase tracking-wider text-[var(--text-muted)] md:mb-3 md:text-[10px]"
        >
            <span className="md:hidden">
                Slide across bars to rate · Tap segment to toggle
            </span>
            <div className="hidden flex-wrap items-center gap-x-3 gap-y-1 md:flex">
                <span>
                    <kbd className="mr-1 rounded-xs border border-white/15 bg-black/40 px-1 py-0.5 text-[9px] text-white/85">↑↓</kbd>
                    Navigate
                </span>
                <span>
                    <kbd className="mr-1 rounded-xs border border-white/15 bg-black/40 px-1 py-0.5 text-[9px] text-white/85">1–9, 0</kbd>
                    Rate (+Shift = .5)
                </span>
                <span>
                    <kbd className="mr-1 rounded-xs border border-white/15 bg-black/40 px-1 py-0.5 text-[9px] text-white/85">←→</kbd>
                    ±0.5
                </span>
                <span>
                    <kbd className="mr-1 rounded-xs border border-white/15 bg-black/40 px-1 py-0.5 text-[9px] text-white/85">Del</kbd>
                    Clear
                </span>
                <span>
                    <kbd className="mr-1 rounded-xs border border-white/15 bg-black/40 px-1 py-0.5 text-[9px] text-white/85">Ctrl+Z</kbd>
                    Undo
                </span>
            </div>
        </div>
    );
}

import { m } from 'framer-motion';
import type { RowWinner, VersusRow } from '../utils/teamVersus';

function getVersusValueColor(winner: RowWinner, side: 'a' | 'b'): string {
    if (winner === 'none') return 'text-[var(--text-muted)]';
    if (winner === 'tie') return 'text-white';
    return winner === side ? 'text-[var(--accent-yellow)]' : 'text-[var(--text-muted)]';
}

interface VersusRowViewProps {
    row: VersusRow;
    colorA: string;
    colorB: string;
}

/** Shared horizontal split-bar metric comparison row used by Team VS and Driver VS. */
export function VersusRowView({ row, colorA, colorB }: VersusRowViewProps) {
    return (
        <div className="px-4 md:px-8 py-3 border-t border-[var(--border-color)]">
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                <span className={`font-oxanium text-2xl md:text-4xl font-bold text-right ${getVersusValueColor(row.winner, 'a')}`}>
                    {row.displayA}
                </span>
                <div className="flex flex-col items-center min-w-[88px] md:min-w-[130px] text-center">
                    <span className="font-oxanium text-[10px] md:text-xs text-[var(--text-secondary)] uppercase tracking-widest">
                        {row.label}
                    </span>
                    {row.note && (
                        <span className="font-oxanium text-[9px] text-[var(--text-muted)] mt-0.5">{row.note}</span>
                    )}
                </div>
                <span className={`font-oxanium text-2xl md:text-4xl font-bold text-left ${getVersusValueColor(row.winner, 'b')}`}>
                    {row.displayB}
                </span>
            </div>
            <div className="mt-2 flex h-1 w-full gap-[2px] bg-[var(--border-color)]">
                {row.shareA === null ? null : (
                    <>
                        <m.div
                            className="h-full"
                            style={{ backgroundColor: colorA }}
                            initial={{ width: '50%' }}
                            animate={{ width: `${row.shareA * 100}%` }}
                            transition={{ duration: 0.4 }}
                        />
                        <m.div
                            className="h-full flex-1"
                            style={{ backgroundColor: colorB }}
                        />
                    </>
                )}
            </div>
        </div>
    );
}

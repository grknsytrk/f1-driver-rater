import { ArrowLeftRight, Swords, Users } from 'lucide-react';

export type VersusMode = 'drivers' | 'driver-vs' | 'teams';

interface VersusModeToggleProps {
    mode: VersusMode;
    onChange: (mode: VersusMode) => void;
}

const OPTIONS: Array<{ mode: VersusMode; label: string; Icon: typeof Users }> = [
    { mode: 'drivers', label: 'TEAMMATES', Icon: Swords },
    { mode: 'driver-vs', label: 'DRIVER VS', Icon: ArrowLeftRight },
    { mode: 'teams', label: 'TEAMS', Icon: Users },
];

export function VersusModeToggle({ mode, onChange }: VersusModeToggleProps) {
    return (
        <div className="mt-6 grid grid-cols-3 gap-2 w-full max-w-lg mx-auto hide-on-export" role="tablist" aria-label="Versus mode">
            {OPTIONS.map(({ mode: optionMode, label, Icon }) => (
                <button
                    key={optionMode}
                    type="button"
                    role="tab"
                    aria-selected={mode === optionMode}
                    onClick={() => onChange(optionMode)}
                    className={`w-full flex items-center justify-center gap-2 whitespace-nowrap px-3 md:px-4 py-2 border transition-all ${
                        mode === optionMode
                            ? 'bg-[var(--accent-yellow)]/10 border-[var(--accent-yellow)] text-[var(--accent-yellow)]'
                            : 'bg-[var(--bg-panel)] border-[var(--border-color)] text-[var(--text-muted)] hover:border-white hover:text-white'
                    }`}
                >
                    <Icon size={16} className="hidden md:inline-block shrink-0" />
                    <span className="font-display text-xs md:text-sm uppercase tracking-wider whitespace-nowrap">{label}</span>
                </button>
            ))}
        </div>
    );
}

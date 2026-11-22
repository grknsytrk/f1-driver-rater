import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type KeyboardEvent as ReactKeyboardEvent,
    type MouseEvent as ReactMouseEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
    Calendar,
    CornerDownLeft,
    Flag,
    Layers,
    Search,
    Shield,
    User,
    X,
} from 'lucide-react';
import {
    buildBundleCommandItems,
    buildInstantCommandItems,
    loadAllStaticSearchBundles,
    searchCommandItems,
    type CommandCategory,
    type CommandItemKind,
    type CommandSearchItem,
} from '../utils/commandSearch';

export interface CommandPaletteProps {
    isOpen: boolean;
    onClose: () => void;
    currentSeason: string | null;
}

const CATEGORY_TABS: ReadonlyArray<{ id: CommandCategory; label: string }> = [
    { id: 'all', label: 'ALL' },
    { id: 'drivers', label: 'DRIVERS' },
    { id: 'teams', label: 'TEAMS' },
    { id: 'races', label: 'RACES' },
    { id: 'pages', label: 'PAGES' },
    { id: 'seasons', label: 'SEASONS' },
];

const KIND_LABELS: Record<CommandItemKind, string> = {
    drivers: 'DRIVER',
    teams: 'TEAM',
    races: 'GRAND PRIX',
    pages: 'VIEW',
    seasons: 'SEASON',
};

function renderKindIcon(kind: CommandItemKind) {
    const className = 'shrink-0 text-[var(--text-muted)] group-hover:text-white transition-colors';
    if (kind === 'drivers') return <User size={14} className={className} aria-hidden="true" />;
    if (kind === 'teams') return <Shield size={14} className={className} aria-hidden="true" />;
    if (kind === 'races') return <Flag size={14} className={className} aria-hidden="true" />;
    if (kind === 'seasons') return <Calendar size={14} className={className} aria-hidden="true" />;
    return <Layers size={14} className={className} aria-hidden="true" />;
}

function CommandPaletteDialog({ onClose, currentSeason }: Omit<CommandPaletteProps, 'isOpen'>) {
    const navigate = useNavigate();
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const previousFocusRef = useRef<HTMLElement | null>(null);

    const [query, setQuery] = useState('');
    const [category, setCategory] = useState<CommandCategory>('all');
    const [activeIndex, setActiveIndex] = useState(0);
    const [bundleItems, setBundleItems] = useState<CommandSearchItem[] | null>(null);
    const isIndexing = bundleItems === null;

    // Lock body scroll and focus input while the palette is mounted
    useEffect(() => {
        previousFocusRef.current = document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;

        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        inputRef.current?.focus();

        return () => {
            document.body.style.overflow = prevOverflow;
            previousFocusRef.current?.focus();
            previousFocusRef.current = null;
        };
    }, []);

    // Lazily load and index static 2018-2026 season bundles on mount
    useEffect(() => {
        let cancelled = false;

        void loadAllStaticSearchBundles().then((bundles) => {
            if (cancelled) return;
            setBundleItems(buildBundleCommandItems(bundles, currentSeason));
        });

        return () => {
            cancelled = true;
        };
    }, [currentSeason]);

    // Capture-phase Escape handler so dismissing the palette never leaks to modals underneath
    useEffect(() => {
        function handleCaptureEscape(event: KeyboardEvent) {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            event.stopPropagation();
            onClose();
        }

        window.addEventListener('keydown', handleCaptureEscape, true);
        return () => window.removeEventListener('keydown', handleCaptureEscape, true);
    }, [onClose]);

    const instantItems = useMemo(
        () => buildInstantCommandItems(currentSeason),
        [currentSeason],
    );

    const allItems = useMemo(
        () => (bundleItems ? [...instantItems, ...bundleItems] : instantItems),
        [instantItems, bundleItems],
    );

    const results = useMemo(
        () => searchCommandItems(allItems, query, category, currentSeason, 24),
        [allItems, query, category, currentSeason],
    );

    const clampedActiveIndex = results.length === 0
        ? 0
        : Math.min(activeIndex, results.length - 1);

    const activeItem = results[clampedActiveIndex] ?? null;

    useEffect(() => {
        if (results.length === 0) return;
        const container = listRef.current;
        if (!container) return;
        const activeOption = container.querySelector<HTMLElement>(
            `[data-command-index="${clampedActiveIndex}"]`,
        );
        activeOption?.scrollIntoView?.({ block: 'nearest' });
    }, [clampedActiveIndex, results.length]);

    const handleSelectItem = useCallback((item: CommandSearchItem) => {
        onClose();
        navigate(item.to);
    }, [navigate, onClose]);

    const handleLinkClick = useCallback(
        (event: ReactMouseEvent<HTMLAnchorElement>, item: CommandSearchItem) => {
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
                onClose();
                return;
            }
            event.preventDefault();
            handleSelectItem(item);
        },
        [handleSelectItem, onClose],
    );

    const handleKeyDown = useCallback(
        (event: ReactKeyboardEvent<HTMLDivElement>) => {
            if (event.key === 'ArrowDown') {
                if (results.length === 0) return;
                event.preventDefault();
                setActiveIndex(prev => (prev + 1) % results.length);
                return;
            }
            if (event.key === 'ArrowUp') {
                if (results.length === 0) return;
                event.preventDefault();
                setActiveIndex(prev => (prev - 1 + results.length) % results.length);
                return;
            }
            if (event.key === 'Enter' && activeItem) {
                event.preventDefault();
                handleSelectItem(activeItem);
            }
        },
        [activeItem, handleSelectItem, results.length],
    );

    return createPortal(
        <div
            role="presentation"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) {
                    onClose();
                }
            }}
            className="fixed inset-0 z-50 flex items-start justify-center bg-black/80 px-3 pt-[7vh] backdrop-blur-sm sm:px-4 sm:pt-[11vh]"
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-label="Global F1 quick search"
                onKeyDown={handleKeyDown}
                className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden border border-[var(--border-color)] bg-[var(--bg-darker)] shadow-[0_24px_80px_rgba(0,0,0,0.85)]"
            >
                <div className="h-0.5 w-full bg-[var(--accent-red)]" />

                {/* Search Input Row */}
                <div className="flex items-center gap-3 px-4 py-3.5">
                    <Search size={16} className="shrink-0 text-[var(--accent-red)]" aria-hidden="true" />
                    <input
                        ref={inputRef}
                        type="text"
                        value={query}
                        onChange={(event) => {
                            setQuery(event.target.value);
                            setActiveIndex(0);
                        }}
                        placeholder="Search drivers, VER, teams, circuits, or 2019 hamilton..."
                        aria-label="Quick search input"
                        aria-controls="command-palette-results"
                        aria-activedescendant={activeItem ? `cmd-option-${clampedActiveIndex}` : undefined}
                        autoComplete="off"
                        spellCheck={false}
                        className="w-full min-w-0 bg-transparent font-ui text-sm text-white placeholder:text-[var(--text-muted)] focus:outline-none sm:text-base"
                    />
                    {query.length > 0 && (
                        <button
                            type="button"
                            onClick={() => {
                                setQuery('');
                                setActiveIndex(0);
                                inputRef.current?.focus();
                            }}
                            aria-label="Clear search"
                            className="flex h-6 w-6 shrink-0 items-center justify-center text-[var(--text-muted)] transition-colors hover:text-white"
                        >
                            <X size={14} />
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close search"
                        className="shrink-0 border border-[var(--border-color)] px-2 py-0.5 font-oxanium text-[10px] tracking-widest text-[var(--text-muted)] uppercase transition-colors hover:border-[var(--accent-red)] hover:text-white"
                    >
                        ESC
                    </button>
                </div>

                {/* Hairline Category Tabs */}
                <div
                    role="tablist"
                    aria-label="Filter search results"
                    className="flex items-center gap-1 overflow-x-auto border-y border-[var(--border-color)] bg-[var(--bg-panel)]/45 px-3"
                >
                    {CATEGORY_TABS.map((tab) => {
                        const isSelected = category === tab.id;
                        return (
                            <button
                                key={tab.id}
                                type="button"
                                role="tab"
                                aria-selected={isSelected}
                                onClick={() => {
                                    setCategory(tab.id);
                                    setActiveIndex(0);
                                    inputRef.current?.focus();
                                }}
                                className={`shrink-0 border-b-2 px-2.5 py-2 font-oxanium text-[10px] tracking-[0.16em] uppercase transition-colors ${
                                    isSelected
                                        ? 'border-[var(--accent-red)] text-white'
                                        : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                                }`}
                            >
                                {tab.label}
                            </button>
                        );
                    })}
                </div>

                {/* Search Results List */}
                <div
                    ref={listRef}
                    id="command-palette-results"
                    role="listbox"
                    aria-label="Search results"
                    className="min-h-0 flex-1 overflow-y-auto divide-y divide-white/[0.04]"
                >
                    {results.length === 0 ? (
                        <div className="px-5 py-10 text-center">
                            <p className="font-oxanium text-xs tracking-[0.16em] text-white uppercase">
                                {query.trim()
                                    ? `NO TELEMETRY MATCHES FOR "${query.trim().toUpperCase()}"`
                                    : 'NO ENTRIES IN THIS FILTER'}
                            </p>
                            <p className="mt-2 font-ui text-xs text-[var(--text-muted)]">
                                Try a driver name, FIA code like VER, track like Monza, or year + query like 2019 hamilton.
                            </p>
                        </div>
                    ) : (
                        results.map((item, index) => {
                            const isActive = index === clampedActiveIndex;
                            return (
                                <a
                                    key={item.id}
                                    id={`cmd-option-${index}`}
                                    data-command-index={index}
                                    role="option"
                                    aria-selected={isActive}
                                    href={item.to}
                                    onMouseEnter={() => setActiveIndex(index)}
                                    onClick={(event) => handleLinkClick(event, item)}
                                    className={`group relative flex items-center justify-between gap-3 px-4 py-2.5 transition-colors ${
                                        isActive
                                            ? 'bg-white/[0.07]'
                                            : 'hover:bg-white/[0.04]'
                                    }`}
                                >
                                    {/* Left 2px vertical telemetry accent */}
                                    <span
                                        aria-hidden="true"
                                        className="absolute inset-y-1.5 left-0 w-0.5 transition-opacity"
                                        style={{
                                            backgroundColor: item.accentColor || 'var(--accent-red)',
                                            opacity: isActive ? 1 : 0.35,
                                        }}
                                    />

                                    <div className="flex min-w-0 items-center gap-3 pl-1">
                                        {renderKindIcon(item.kind)}

                                        {item.badge && (
                                            <span
                                                className="w-11 shrink-0 border border-white/10 bg-black/30 py-0.5 text-center font-oxanium text-[10px] font-bold tracking-wider uppercase"
                                                style={{
                                                    color: item.accentColor || 'var(--text-secondary)',
                                                }}
                                            >
                                                {item.badge}
                                            </span>
                                        )}

                                        <div className="min-w-0">
                                            <div className="truncate font-display text-sm tracking-wide text-white uppercase sm:text-[15px]">
                                                {item.title}
                                            </div>
                                            <div className="truncate font-oxanium text-[10px] tracking-wider text-[var(--text-muted)] uppercase">
                                                {item.subtitle}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex shrink-0 items-center gap-2">
                                        <span className="hidden font-oxanium text-[9px] tracking-[0.18em] text-[var(--text-muted)] uppercase sm:inline">
                                            {KIND_LABELS[item.kind]}
                                        </span>
                                        <CornerDownLeft
                                            size={13}
                                            aria-hidden="true"
                                            className={`transition-opacity ${
                                                isActive
                                                    ? 'text-[var(--accent-red)] opacity-100'
                                                    : 'text-[var(--text-muted)] opacity-0 group-hover:opacity-60'
                                            }`}
                                        />
                                    </div>
                                </a>
                            );
                        })
                    )}
                </div>

                {/* Telemetry Footer Bar */}
                <div className="flex items-center justify-between gap-2 border-t border-[var(--border-color)] bg-[var(--bg-panel)]/70 px-4 py-2 font-oxanium text-[10px] tracking-[0.14em] text-[var(--text-muted)] uppercase">
                    <div className="flex items-center gap-3">
                        <span>↑↓ MOVE</span>
                        <span>↵ OPEN</span>
                        <span>ESC CLOSE</span>
                    </div>
                    <span className="truncate text-right">
                        {isIndexing
                            ? 'INDEXING 2018–2026...'
                            : `${results.length} RESULTS · 2018–2026`}
                    </span>
                </div>
            </div>
        </div>,
        document.body,
    );
}

/**
 * Global F1 quick-search command palette triggered by `Ctrl+K` / `⌘K` or `/`.
 */
export function CommandPalette({ isOpen, onClose, currentSeason }: CommandPaletteProps) {
    if (!isOpen) return null;
    return <CommandPaletteDialog onClose={onClose} currentSeason={currentSeason} />;
}

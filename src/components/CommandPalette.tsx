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
import { Search, X } from 'lucide-react';
import {
    buildBundleCommandItems,
    buildInstantCommandItems,
    loadAllStaticSearchBundles,
    searchCommandItems,
    type CommandCategory,
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

function getPlainRightMeta(item: CommandSearchItem): string | null {
    if (!item.badge) return null;
    if (item.kind === 'drivers' || item.kind === 'races') return item.badge;
    if (item.kind === 'seasons' && item.badge === 'LIVE') return 'LIVE';
    return null;
}

function CommandPaletteDialog({ onClose, currentSeason }: Omit<CommandPaletteProps, 'isOpen'>) {
    const navigate = useNavigate();
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const previousFocusRef = useRef<HTMLElement | null>(null);
    const keyboardNavRef = useRef(false);

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

    // Only scroll active option into view when navigating via keyboard
    useEffect(() => {
        if (!keyboardNavRef.current) return;
        keyboardNavRef.current = false;

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
                keyboardNavRef.current = true;
                setActiveIndex(prev => (prev + 1) % results.length);
                return;
            }
            if (event.key === 'ArrowUp') {
                if (results.length === 0) return;
                event.preventDefault();
                keyboardNavRef.current = true;
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
            className="fixed inset-0 z-50 flex items-start justify-center bg-black/75 px-3 pt-[7vh] sm:px-4 sm:pt-[11vh]"
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-label="Global F1 quick search"
                onKeyDown={handleKeyDown}
                className="flex h-[min(520px,76vh)] w-full max-w-2xl flex-col overflow-hidden border border-[var(--border-color)] bg-[var(--bg-darker)] shadow-[0_24px_80px_rgba(0,0,0,0.85)]"
            >
                <div className="h-0.5 w-full shrink-0 bg-[var(--accent-red)]" />

                {/* Search Input Row */}
                <div className="flex shrink-0 items-center gap-3 px-4 py-3.5">
                    <Search size={16} className="shrink-0 text-[var(--accent-red)]" aria-hidden="true" />
                    <input
                        ref={inputRef}
                        type="text"
                        value={query}
                        onChange={(event) => {
                            setQuery(event.target.value);
                            setActiveIndex(0);
                            listRef.current?.scrollTo?.({ top: 0 });
                        }}
                        placeholder="Search drivers, teams, tracks, seasons..."
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
                                listRef.current?.scrollTo?.({ top: 0 });
                                inputRef.current?.focus();
                            }}
                            aria-label="Clear search"
                            className="shrink-0 px-1.5 font-oxanium text-[10px] tracking-wider text-[var(--text-muted)] uppercase hover:text-white"
                        >
                            Clear
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close search"
                        className="flex h-7 w-7 shrink-0 items-center justify-center text-[var(--text-muted)] hover:text-white"
                    >
                        <X size={16} aria-hidden="true" />
                    </button>
                </div>

                {/* Hairline Category Tabs */}
                <div
                    role="tablist"
                    aria-label="Filter search results"
                    className="flex shrink-0 items-center justify-between gap-2 border-y border-[var(--border-color)] bg-[var(--bg-panel)]/45 px-3"
                >
                    <div className="flex items-center gap-1 overflow-x-auto">
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
                                        listRef.current?.scrollTo?.({ top: 0 });
                                        inputRef.current?.focus();
                                    }}
                                    className={`shrink-0 border-b-2 px-2.5 py-2 font-oxanium text-[10px] tracking-[0.16em] uppercase ${
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
                    {isIndexing && (
                        <span className="hidden shrink-0 font-oxanium text-[9px] tracking-[0.14em] text-[var(--text-muted)] uppercase sm:inline">
                            INDEXING...
                        </span>
                    )}
                </div>

                {/* Fixed-height Scrollable Results List (zero mouse-hover state churn) */}
                <div
                    ref={listRef}
                    id="command-palette-results"
                    role="listbox"
                    aria-label="Search results"
                    className="min-h-0 flex-1 overflow-y-auto overscroll-contain divide-y divide-white/[0.04]"
                >
                    {results.length === 0 ? (
                        <div className="flex h-full flex-col items-center justify-center px-5 text-center">
                            <p className="font-oxanium text-xs tracking-[0.16em] text-white uppercase">
                                {query.trim()
                                    ? `NO MATCHES FOR "${query.trim().toUpperCase()}"`
                                    : 'NO ENTRIES FOUND'}
                            </p>
                            <p className="mt-2 font-ui text-xs text-[var(--text-muted)]">
                                Try a driver name, team, circuit, or year + query like 2019 hamilton.
                            </p>
                        </div>
                    ) : (
                        results.map((item, index) => {
                            const isActive = index === clampedActiveIndex;
                            const rightMeta = getPlainRightMeta(item);
                            return (
                                <a
                                    key={item.id}
                                    id={`cmd-option-${index}`}
                                    data-command-index={index}
                                    role="option"
                                    aria-selected={isActive}
                                    href={item.to}
                                    onClick={(event) => handleLinkClick(event, item)}
                                    className={`relative flex items-center justify-between gap-3 px-4 py-2.5 ${
                                        isActive
                                            ? 'bg-white/[0.07]'
                                            : 'hover:bg-white/[0.05]'
                                    }`}
                                >
                                    <span
                                        aria-hidden="true"
                                        className="absolute inset-y-1.5 left-0 w-0.5"
                                        style={{
                                            backgroundColor: item.accentColor || 'var(--accent-red)',
                                            opacity: isActive ? 1 : 0.45,
                                        }}
                                    />

                                    <div className="min-w-0 pl-1.5">
                                        <div className="truncate font-display text-sm tracking-wide text-white uppercase sm:text-[15px]">
                                            {item.title}
                                        </div>
                                        <div className="truncate font-oxanium text-[10px] tracking-wider text-[var(--text-muted)] uppercase">
                                            {item.subtitle}
                                        </div>
                                    </div>

                                    {rightMeta && (
                                        <span
                                            className="shrink-0 font-oxanium text-[11px] font-bold tracking-wider uppercase"
                                            style={{
                                                color: rightMeta === 'LIVE'
                                                    ? 'var(--accent-red)'
                                                    : 'var(--text-muted)',
                                            }}
                                        >
                                            {rightMeta}
                                        </span>
                                    )}
                                </a>
                            );
                        })
                    )}
                </div>
            </div>
        </div>,
        document.body,
    );
}

/**
 * Global F1 quick-search command palette triggered from the header Search button, `Ctrl+K` / `⌘K`, or `/`.
 */
export function CommandPalette({ isOpen, onClose, currentSeason }: CommandPaletteProps) {
    if (!isOpen) return null;
    return <CommandPaletteDialog onClose={onClose} currentSeason={currentSeason} />;
}

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import {
    clampStepRating,
    isEditableEventTarget,
    parseRatingShortcut,
} from '../utils/ratingInput';

const MAX_UNDO_HISTORY = 30;

export interface RatingUndoChange<TDriver> {
    driver: TDriver;
    previousRating: number;
}

export interface RatingUndoEntry<TDriver> {
    label: string;
    changes: RatingUndoChange<TDriver>[];
}

export interface UseRatingKeyboardOptions<TDriver extends { driverId: string; driverName: string }> {
    drivers: TDriver[];
    enabled: boolean;
    listRef: RefObject<HTMLDivElement | null>;
    getCurrentRating: (driverId: string) => number;
    onSetRating: (driver: TDriver, rating: number, onCommitted?: (previousRating: number) => void) => void;
    onRemoveRating: (driver: TDriver, onCommitted?: (previousRating: number) => void) => void;
    onRestoreRating?: (driver: TDriver, rating: number) => void;
    onClose: () => void;
}

function escapeDriverIdSelector(driverId: string): string {
    return typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
        ? CSS.escape(driverId)
        : driverId.replace(/["\\]/g, '\\$&');
}

function scrollDriverIntoView(listEl: HTMLDivElement | null, driverId: string) {
    if (!listEl) return;
    const rowEl = listEl.querySelector<HTMLElement>(
        `[data-driver-id="${escapeDriverIdSelector(driverId)}"]`,
    );
    rowEl?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
}

/**
 * Shared keyboard-first rapid rating loop & single/batch Undo stack for RatingModal and QuickRateModal.
 * Keeps `activeDriverId` null during pure mouse/touch usage so sibling rows never re-render on click/hover.
 */
export function useRatingKeyboard<TDriver extends { driverId: string; driverName: string }>(
    options: UseRatingKeyboardOptions<TDriver>,
) {
    const [activeDriverId, setActiveDriverId] = useState<string | null>(null);
    const [undoStack, setUndoStack] = useState<RatingUndoEntry<TDriver>[]>([]);

    const optionsRef = useRef(options);
    const activeDriverIdRef = useRef<string | null>(null);
    const undoStackRef = useRef<RatingUndoEntry<TDriver>[]>([]);

    useEffect(() => {
        optionsRef.current = options;
    });

    useEffect(() => {
        activeDriverIdRef.current = activeDriverId;
    }, [activeDriverId]);

    const pushUndo = useCallback((entry: RatingUndoEntry<TDriver>) => {
        if (entry.changes.length === 0) return;
        const next = [...undoStackRef.current.slice(-(MAX_UNDO_HISTORY - 1)), entry];
        undoStackRef.current = next;
        setUndoStack(next);
    }, []);

    const clearKeyboardFocus = useCallback(() => {
        if (activeDriverIdRef.current !== null) {
            activeDriverIdRef.current = null;
            setActiveDriverId(null);
        }
    }, []);

    const setKeyboardDriver = useCallback((driverId: string | null) => {
        activeDriverIdRef.current = driverId;
        setActiveDriverId(driverId);
        if (driverId) {
            scrollDriverIntoView(optionsRef.current.listRef.current, driverId);
        }
    }, []);

    const undo = useCallback(() => {
        const stack = undoStackRef.current;
        const entry = stack[stack.length - 1];
        if (!entry) return;

        const next = stack.slice(0, -1);
        undoStackRef.current = next;
        setUndoStack(next);

        const { onSetRating, onRemoveRating, onRestoreRating } = optionsRef.current;
        for (const change of entry.changes) {
            if (onRestoreRating) {
                onRestoreRating(change.driver, change.previousRating);
            } else if (change.previousRating > 0) {
                onSetRating(change.driver, change.previousRating);
            } else {
                onRemoveRating(change.driver);
            }
        }

        if (activeDriverIdRef.current !== null && entry.changes.length === 1) {
            setKeyboardDriver(entry.changes[0].driver.driverId);
        }
    }, [setKeyboardDriver]);

    useEffect(() => {
        if (!options.enabled) return;

        function handleKeyDown(event: KeyboardEvent) {
            if (isEditableEventTarget(event.target)) return;

            const action = parseRatingShortcut(event);
            if (!action) return;

            const {
                drivers,
                getCurrentRating,
                onSetRating,
                onRemoveRating,
                onClose,
            } = optionsRef.current;

            if (drivers.length === 0 && action.type !== 'escape' && action.type !== 'undo') {
                return;
            }

            event.preventDefault();

            if (action.type === 'undo') {
                undo();
                return;
            }

            if (action.type === 'escape') {
                if (activeDriverIdRef.current !== null) {
                    clearKeyboardFocus();
                } else {
                    onClose();
                }
                return;
            }

            const currentIndex = activeDriverIdRef.current
                ? drivers.findIndex(d => d.driverId === activeDriverIdRef.current)
                : -1;

            if (action.type === 'move') {
                const nextIndex = currentIndex === -1
                    ? (action.delta > 0 ? 0 : drivers.length - 1)
                    : Math.min(drivers.length - 1, Math.max(0, currentIndex + action.delta));
                const nextDriver = drivers[nextIndex];
                if (nextDriver) {
                    setKeyboardDriver(nextDriver.driverId);
                }
                return;
            }

            const resolveTargetIndex = () => {
                if (currentIndex !== -1) return currentIndex;
                const firstUnrated = drivers.findIndex(d => getCurrentRating(d.driverId) === 0);
                return firstUnrated !== -1 ? firstUnrated : 0;
            };

            if (action.type === 'rate') {
                const targetIndex = resolveTargetIndex();
                const driver = drivers[targetIndex];
                if (!driver) return;

                const current = getCurrentRating(driver.driverId);
                if (current !== action.value) {
                    onSetRating(driver, action.value, (previousRating) => {
                        if (previousRating !== action.value) {
                            pushUndo({
                                label: `${driver.driverName} -> ${action.value.toFixed(1)}`,
                                changes: [{ driver, previousRating }],
                            });
                        }
                    });
                }

                const nextIndex = Math.min(targetIndex + 1, drivers.length - 1);
                const nextDriver = drivers[nextIndex];
                setKeyboardDriver(nextDriver ? nextDriver.driverId : driver.driverId);
                return;
            }

            if (action.type === 'step') {
                const targetIndex = resolveTargetIndex();
                const driver = drivers[targetIndex];
                if (!driver) return;

                const current = getCurrentRating(driver.driverId);
                const nextVal = clampStepRating(current, action.delta);
                if (nextVal !== current) {
                    if (nextVal === 0) {
                        onRemoveRating(driver, (previousRating) => {
                            if (previousRating > 0) {
                                pushUndo({
                                    label: `Cleared ${driver.driverName}`,
                                    changes: [{ driver, previousRating }],
                                });
                            }
                        });
                    } else {
                        onSetRating(driver, nextVal, (previousRating) => {
                            if (previousRating !== nextVal) {
                                pushUndo({
                                    label: `${driver.driverName} -> ${nextVal.toFixed(1)}`,
                                    changes: [{ driver, previousRating }],
                                });
                            }
                        });
                    }
                }
                setKeyboardDriver(driver.driverId);
                return;
            }

            if (action.type === 'clear') {
                if (currentIndex === -1) return;
                const driver = drivers[currentIndex];
                if (!driver) return;

                const current = getCurrentRating(driver.driverId);
                if (current > 0) {
                    onRemoveRating(driver, (previousRating) => {
                        if (previousRating > 0) {
                            pushUndo({
                                label: `Cleared ${driver.driverName}`,
                                changes: [{ driver, previousRating }],
                            });
                        }
                    });
                }
            }
        }

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [options.enabled, clearKeyboardFocus, pushUndo, setKeyboardDriver, undo]);

    const lastUndoLabel = undoStack.length > 0 ? undoStack[undoStack.length - 1].label : null;

    return {
        activeDriverId,
        canUndo: undoStack.length > 0,
        lastUndoLabel,
        pushUndo,
        undo,
        clearKeyboardFocus,
    };
}

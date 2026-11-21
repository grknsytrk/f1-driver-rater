export type RatingShortcutAction =
    | { type: 'undo' }
    | { type: 'move'; delta: -1 | 1 }
    | { type: 'step'; delta: -0.5 | 0.5 }
    | { type: 'rate'; value: number; advance: true }
    | { type: 'clear' }
    | { type: 'escape' };

export type RatingKeyboardEvent = Pick<
    KeyboardEvent,
    'key' | 'code' | 'shiftKey' | 'ctrlKey' | 'metaKey' | 'altKey'
>;

/**
 * Map a horizontal pointer X coordinate over the 20-segment rating bar
 * to a 0.5–10.0 rating in 0.5 increments.
 */
export function ratingFromClientX(
    clientX: number,
    rect: { left: number; width: number },
): number {
    if (!rect || rect.width <= 0) return 0.5;
    const ratio = Math.min(0.999999, Math.max(0, (clientX - rect.left) / rect.width));
    const index = Math.min(19, Math.max(0, Math.floor(ratio * 20)));
    return (index + 1) * 0.5;
}

/**
 * Step a rating by -0.5 or +0.5 within [0, 10], where 0 represents cleared/unrated.
 */
export function clampStepRating(current: number, delta: -0.5 | 0.5): number {
    return Math.round(Math.min(10, Math.max(0, current + delta)) * 2) / 2;
}

function extractDigit(event: RatingKeyboardEvent): string | null {
    const codeMatch = event.code?.match(/^(?:Digit|Numpad)([0-9])$/);
    if (codeMatch) return codeMatch[1];

    const keyMatch = event.key?.match(/^([0-9])$/);
    return keyMatch ? keyMatch[1] : null;
}

/**
 * Parse keyboard events inside rating modals into semantic rating actions.
 * Uses physical key `code` first for digit shortcuts so Shift+0..9 behaves
 * consistently across international keyboard layouts (e.g., Turkish-Q).
 */
export function parseRatingShortcut(event: RatingKeyboardEvent): RatingShortcutAction | null {
    const keyLower = event.key.toLowerCase();

    if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && keyLower === 'z') {
        return { type: 'undo' };
    }

    if (event.ctrlKey || event.metaKey || event.altKey) {
        return null;
    }

    const digit = extractDigit(event);
    if (digit !== null) {
        const base = digit === '0' ? 10 : Number(digit);
        const value = event.shiftKey ? (digit === '0' ? 0.5 : base + 0.5) : base;
        return { type: 'rate', value, advance: true };
    }

    if (event.key === '+' || (!event.shiftKey && event.key === '=')) {
        return { type: 'step', delta: 0.5 };
    }

    if (event.shiftKey) {
        return null;
    }

    switch (event.key) {
        case 'ArrowDown':
        case 'j':
        case 'J':
            return { type: 'move', delta: 1 };
        case 'ArrowUp':
        case 'k':
        case 'K':
            return { type: 'move', delta: -1 };
        case 'ArrowRight':
            return { type: 'step', delta: 0.5 };
        case 'ArrowLeft':
        case '-':
            return { type: 'step', delta: -0.5 };
        case 'Backspace':
        case 'Delete':
            return { type: 'clear' };
        case 'Escape':
            return { type: 'escape' };
        default:
            return null;
    }
}

/**
 * Check whether the event originated inside a text/form input where modal shortcuts should stand down.
 */
export function isEditableEventTarget(target: EventTarget | null): boolean {
    if (!target || typeof HTMLElement === 'undefined' || !(target instanceof HTMLElement)) {
        return false;
    }
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

import { describe, expect, it } from 'vitest';
import {
    clampStepRating,
    isEditableEventTarget,
    parseRatingShortcut,
    ratingFromClientX,
} from './ratingInput';

const baseEvent = {
    key: '',
    code: '',
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
};

describe('ratingInput helpers', () => {
    describe('ratingFromClientX', () => {
        const rect = { left: 0, width: 200 };

        it('maps pointer coordinates across the 20 segments from 0.5 to 10.0', () => {
            expect(ratingFromClientX(0, rect)).toBe(0.5);
            expect(ratingFromClientX(100, rect)).toBe(5.5);
            expect(ratingFromClientX(165, rect)).toBe(8.5);
            expect(ratingFromClientX(199.9, rect)).toBe(10);
        });

        it('clamps out-of-bounds coordinates and handles zero-width rects safely', () => {
            expect(ratingFromClientX(-50, rect)).toBe(0.5);
            expect(ratingFromClientX(350, rect)).toBe(10);
            expect(ratingFromClientX(120, { left: 0, width: 0 })).toBe(0.5);
        });
    });

    describe('clampStepRating', () => {
        it('steps ratings by 0.5 within [0, 10]', () => {
            expect(clampStepRating(0, 0.5)).toBe(0.5);
            expect(clampStepRating(8, 0.5)).toBe(8.5);
            expect(clampStepRating(10, 0.5)).toBe(10);
            expect(clampStepRating(0.5, -0.5)).toBe(0);
            expect(clampStepRating(0, -0.5)).toBe(0);
        });
    });

    describe('parseRatingShortcut', () => {
        it('parses Digit1..9 and Digit0 as integer ratings 1..10', () => {
            for (let n = 1; n <= 9; n += 1) {
                expect(parseRatingShortcut({ ...baseEvent, key: String(n), code: `Digit${n}` })).toEqual({
                    type: 'rate',
                    value: n,
                    advance: true,
                });
            }
            expect(parseRatingShortcut({ ...baseEvent, key: '0', code: 'Digit0' })).toEqual({
                type: 'rate',
                value: 10,
                advance: true,
            });
            expect(parseRatingShortcut({ ...baseEvent, key: '5', code: 'Numpad5' })).toEqual({
                type: 'rate',
                value: 5,
                advance: true,
            });
        });

        it('parses Shift+Digit1..9 as .5 ratings and Shift+Digit0 as 0.5', () => {
            expect(parseRatingShortcut({ ...baseEvent, key: '&', code: 'Digit6', shiftKey: true })).toEqual({
                type: 'rate',
                value: 6.5,
                advance: true,
            });
            expect(parseRatingShortcut({ ...baseEvent, key: '=', code: 'Digit0', shiftKey: true })).toEqual({
                type: 'rate',
                value: 0.5,
                advance: true,
            });
        });

        it('falls back to event.key when code is omitted', () => {
            expect(parseRatingShortcut({ ...baseEvent, key: '7' })).toEqual({
                type: 'rate',
                value: 7,
                advance: true,
            });
            expect(parseRatingShortcut({ ...baseEvent, key: '0', shiftKey: true })).toEqual({
                type: 'rate',
                value: 0.5,
                advance: true,
            });
        });

        it('parses navigation, fine-tune, clear, undo, and escape keys', () => {
            expect(parseRatingShortcut({ ...baseEvent, key: 'ArrowDown' })).toEqual({ type: 'move', delta: 1 });
            expect(parseRatingShortcut({ ...baseEvent, key: 'j' })).toEqual({ type: 'move', delta: 1 });
            expect(parseRatingShortcut({ ...baseEvent, key: 'ArrowUp' })).toEqual({ type: 'move', delta: -1 });
            expect(parseRatingShortcut({ ...baseEvent, key: 'K' })).toEqual({ type: 'move', delta: -1 });

            expect(parseRatingShortcut({ ...baseEvent, key: 'ArrowRight' })).toEqual({ type: 'step', delta: 0.5 });
            expect(parseRatingShortcut({ ...baseEvent, key: '+', shiftKey: true })).toEqual({ type: 'step', delta: 0.5 });
            expect(parseRatingShortcut({ ...baseEvent, key: '=' })).toEqual({ type: 'step', delta: 0.5 });
            expect(parseRatingShortcut({ ...baseEvent, key: 'ArrowLeft' })).toEqual({ type: 'step', delta: -0.5 });
            expect(parseRatingShortcut({ ...baseEvent, key: '-' })).toEqual({ type: 'step', delta: -0.5 });

            expect(parseRatingShortcut({ ...baseEvent, key: 'Backspace' })).toEqual({ type: 'clear' });
            expect(parseRatingShortcut({ ...baseEvent, key: 'Delete' })).toEqual({ type: 'clear' });
            expect(parseRatingShortcut({ ...baseEvent, key: 'Escape' })).toEqual({ type: 'escape' });

            expect(parseRatingShortcut({ ...baseEvent, key: 'z', ctrlKey: true })).toEqual({ type: 'undo' });
            expect(parseRatingShortcut({ ...baseEvent, key: 'Z', metaKey: true })).toEqual({ type: 'undo' });
        });

        it('ignores browser/modified shortcuts that should not be intercepted', () => {
            expect(parseRatingShortcut({ ...baseEvent, key: 'r', ctrlKey: true })).toBeNull();
            expect(parseRatingShortcut({ ...baseEvent, key: '1', code: 'Digit1', altKey: true })).toBeNull();
            expect(parseRatingShortcut({ ...baseEvent, key: '1', code: 'Digit1', metaKey: true })).toBeNull();
            expect(parseRatingShortcut({ ...baseEvent, key: 'z', ctrlKey: true, shiftKey: true })).toBeNull();
        });
    });

    describe('isEditableEventTarget', () => {
        it('returns true only for editable HTML elements', () => {
            const input = document.createElement('input');
            const textarea = document.createElement('textarea');
            const button = document.createElement('button');
            const div = document.createElement('div');
            div.contentEditable = 'true';

            expect(isEditableEventTarget(input)).toBe(true);
            expect(isEditableEventTarget(textarea)).toBe(true);
            expect(isEditableEventTarget(div)).toBe(true);
            expect(isEditableEventTarget(button)).toBe(false);
            expect(isEditableEventTarget(null)).toBe(false);
        });
    });
});

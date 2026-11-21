import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RatingSegments } from './RatingSegments';

vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);

let container: HTMLDivElement;
let root: Root;

function createMockPointerEvent(
    type: string,
    props: { clientX: number; pointerId?: number; pointerType?: string; button?: number },
): Event {
    const EventCtor = typeof PointerEvent !== 'undefined' ? PointerEvent : MouseEvent;
    const event = new EventCtor(type, {
        bubbles: true,
        cancelable: true,
        clientX: props.clientX,
        button: props.button ?? 0,
    });
    Object.defineProperty(event, 'pointerId', { value: props.pointerId ?? 1 });
    Object.defineProperty(event, 'pointerType', { value: props.pointerType ?? 'touch' });
    return event;
}

describe('RatingSegments pointer scrubbing', () => {
    beforeEach(() => {
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
    });

    afterEach(async () => {
        await act(async () => root.unmount());
        container.remove();
        vi.restoreAllMocks();
    });

    it('updates live preview during drag scrub, commits final rating, and suppresses trailing click', async () => {
        const onHoverChange = vi.fn();
        const onSelect = vi.fn();

        await act(async () => {
            root.render(
                <RatingSegments
                    driverName="Charles Leclerc"
                    currentRating={0}
                    displayRating={0}
                    onHoverChange={onHoverChange}
                    onSelect={onSelect}
                />,
            );
        });

        const track = container.querySelector<HTMLDivElement>('div.w-max')!;
        expect(track).not.toBeNull();
        vi.spyOn(track, 'getBoundingClientRect').mockReturnValue({
            left: 0,
            right: 200,
            width: 200,
            top: 0,
            bottom: 40,
            height: 40,
            x: 0,
            y: 0,
            toJSON: () => ({}),
        });

        await act(async () => {
            track.dispatchEvent(createMockPointerEvent('pointerdown', { clientX: 20, pointerType: 'touch' }));
        });
        expect(onHoverChange).toHaveBeenLastCalledWith(1.5);

        await act(async () => {
            track.dispatchEvent(createMockPointerEvent('pointermove', { clientX: 165, pointerType: 'touch' }));
        });
        expect(onHoverChange).toHaveBeenLastCalledWith(8.5);
        expect(track.getAttribute('data-scrubbing')).toBe('true');

        await act(async () => {
            track.dispatchEvent(createMockPointerEvent('pointerup', { clientX: 165, pointerType: 'touch' }));
        });
        expect(onSelect).toHaveBeenCalledTimes(1);
        expect(onSelect).toHaveBeenCalledWith(8.5, { fromScrub: true });
        expect(onHoverChange).toHaveBeenLastCalledWith(null);
        expect(track.getAttribute('data-scrubbing')).toBeNull();

        // Trailing synthetic click right after pointerup must be suppressed
        const button = container.querySelector<HTMLButtonElement>('button[aria-label="Charles Leclerc: 8.5 out of 10"]')!;
        await act(async () => {
            button.click();
        });
        expect(onSelect).toHaveBeenCalledTimes(1);
    });

    it('clears preview without committing on pointercancel', async () => {
        const onHoverChange = vi.fn();
        const onSelect = vi.fn();

        await act(async () => {
            root.render(
                <RatingSegments
                    driverName="Lando Norris"
                    currentRating={0}
                    displayRating={0}
                    onHoverChange={onHoverChange}
                    onSelect={onSelect}
                />,
            );
        });

        const track = container.querySelector<HTMLDivElement>('div.w-max')!;
        vi.spyOn(track, 'getBoundingClientRect').mockReturnValue({
            left: 0,
            right: 200,
            width: 200,
            top: 0,
            bottom: 40,
            height: 40,
            x: 0,
            y: 0,
            toJSON: () => ({}),
        });

        await act(async () => {
            track.dispatchEvent(createMockPointerEvent('pointerdown', { clientX: 20, pointerType: 'touch' }));
            track.dispatchEvent(createMockPointerEvent('pointermove', { clientX: 140, pointerType: 'touch' }));
            track.dispatchEvent(createMockPointerEvent('pointercancel', { clientX: 140, pointerType: 'touch' }));
        });

        expect(onSelect).not.toHaveBeenCalled();
        expect(onHoverChange).toHaveBeenLastCalledWith(null);
    });

    it('triggers plain tap/click without fromScrub option', async () => {
        const onHoverChange = vi.fn();
        const onSelect = vi.fn();

        await act(async () => {
            root.render(
                <RatingSegments
                    driverName="Lando Norris"
                    currentRating={0}
                    displayRating={0}
                    onHoverChange={onHoverChange}
                    onSelect={onSelect}
                />,
            );
        });

        const button = container.querySelector<HTMLButtonElement>('button[aria-label="Lando Norris: 9.0 out of 10"]')!;
        await act(async () => {
            button.click();
        });

        expect(onSelect).toHaveBeenCalledTimes(1);
        expect(onSelect).toHaveBeenCalledWith(9);
    });
});

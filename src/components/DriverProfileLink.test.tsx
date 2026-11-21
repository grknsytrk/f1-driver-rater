import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DriverProfileLink } from './DriverProfileLink';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
});

afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
});

describe('DriverProfileLink', () => {
    it('renders the canonical driver profile href inside MemoryRouter and without a Router', async () => {
        await act(async () => root.render(
            <MemoryRouter>
                <DriverProfileLink season="2026" driverId="max_verstappen">
                    Max Verstappen
                </DriverProfileLink>
            </MemoryRouter>,
        ));

        const routerLink = container.querySelector('a');
        expect(routerLink).not.toBeNull();
        expect(routerLink?.getAttribute('href')).toBe('/2026/driver/max_verstappen');

        await act(async () => root.render(
            <DriverProfileLink season="2026" driverId="max_verstappen">
                Max Verstappen
            </DriverProfileLink>,
        ));

        const standaloneLink = container.querySelector('a');
        expect(standaloneLink).not.toBeNull();
        expect(standaloneLink?.getAttribute('href')).toBe('/2026/driver/max_verstappen');
    });

    it('calls onNavigate and prevents default navigation on plain left-click', async () => {
        const onNavigate = vi.fn();

        await act(async () => root.render(
            <MemoryRouter>
                <DriverProfileLink season="2026" driverId="leclerc" onNavigate={onNavigate}>
                    Charles Leclerc
                </DriverProfileLink>
            </MemoryRouter>,
        ));

        const link = container.querySelector('a')!;
        const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
        await act(async () => {
            link.dispatchEvent(clickEvent);
        });

        expect(onNavigate).toHaveBeenCalledTimes(1);
        expect(clickEvent.defaultPrevented).toBe(true);
    });

    it('does not call onNavigate or preventDefault on modifier-clicks or middle-click', async () => {
        const onNavigate = vi.fn();

        await act(async () => root.render(
            <MemoryRouter>
                <DriverProfileLink season="2026" driverId="hamilton" onNavigate={onNavigate}>
                    Lewis Hamilton
                </DriverProfileLink>
            </MemoryRouter>,
        ));

        const link = container.querySelector('a')!;
        const events = [
            new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ctrlKey: true }),
            new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, metaKey: true }),
            new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, shiftKey: true }),
            new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, altKey: true }),
            new MouseEvent('click', { bubbles: true, cancelable: true, button: 1 }),
            new MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 1 }),
        ];

        for (const event of events) {
            await act(async () => {
                link.dispatchEvent(event);
            });
            expect(event.defaultPrevented).toBe(false);
        }

        expect(onNavigate).not.toHaveBeenCalled();
    });

    it('stops click and auxclick propagation when stopPropagation is enabled', async () => {
        const onParentClick = vi.fn();
        const onParentAuxClick = vi.fn();
        const onNavigate = vi.fn();

        await act(async () => root.render(
            <MemoryRouter>
                <div onClick={onParentClick} onAuxClick={onParentAuxClick}>
                    <DriverProfileLink
                        season="2026"
                        driverId="norris"
                        onNavigate={onNavigate}
                        stopPropagation
                    >
                        Lando Norris
                    </DriverProfileLink>
                </div>
            </MemoryRouter>,
        ));

        const link = container.querySelector('a')!;
        await act(async () => {
            link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
            link.dispatchEvent(new MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 1 }));
        });

        expect(onNavigate).toHaveBeenCalledTimes(1);
        expect(onParentClick).not.toHaveBeenCalled();
        expect(onParentAuxClick).not.toHaveBeenCalled();
    });
});

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from './ui/tooltip';
import App from '../App';
import { NotFoundPage } from './NotFoundPage';

vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
});

afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
});

describe('NotFoundPage & route validation', () => {
    it('renders NotFoundPage with link back to all seasons', () => {
        act(() => {
            root.render(
                <HelmetProvider>
                    <MemoryRouter>
                        <NotFoundPage />
                    </MemoryRouter>
                </HelmetProvider>,
            );
        });

        expect(container.textContent).toContain('Page Not Found');
        const link = container.querySelector('a[href="/"]');
        expect(link?.textContent).toContain('All Seasons');
    });

    it('renders NotFoundPage for invalid season paths and multi-segment unknown routes without showing header season actions', async () => {
        await act(async () => {
            root.render(
                <HelmetProvider>
                    <MemoryRouter initialEntries={['/not-a-season']}>
                        <TooltipProvider>
                            <App />
                        </TooltipProvider>
                    </MemoryRouter>
                </HelmetProvider>,
            );
        });

        expect(container.textContent).toContain('Page Not Found');
        expect(container.querySelector('header')?.textContent).not.toContain('not-a-season');
        expect(container.querySelector('header')?.textContent).not.toContain('Quick Rate');

        await act(async () => {
            root.render(
                <HelmetProvider>
                    <MemoryRouter initialEntries={['/2026/unknown/extra']}>
                        <TooltipProvider>
                            <App />
                        </TooltipProvider>
                    </MemoryRouter>
                </HelmetProvider>,
            );
        });

        expect(container.textContent).toContain('Page Not Found');
    });
});

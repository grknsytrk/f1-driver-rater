import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary';

vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);

let container: HTMLDivElement;
let root: Root;

function Thrower({ error }: { error?: Error }) {
    if (error) {
        throw error;
    }
    return <div data-testid="healthy-child">Healthy Content</div>;
}

beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
});

afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
});

describe('ErrorBoundary', () => {
    it('renders children when no error occurs', () => {
        act(() => {
            root.render(
                <ErrorBoundary resetKey="/2026">
                    <Thrower />
                </ErrorBoundary>,
            );
        });

        expect(container.querySelector('[data-testid="healthy-child"]')?.textContent).toBe('Healthy Content');
    });

    it('renders fallback UI for runtime errors and resets when resetKey changes', () => {
        act(() => {
            root.render(
                <ErrorBoundary resetKey="/2026/results">
                    <Thrower error={new Error('Unexpected crash')} />
                </ErrorBoundary>,
            );
        });

        expect(container.textContent).toContain('Something Went Wrong');
        expect(container.textContent).toContain('Reload Page');
        expect(container.textContent).toContain('Back to Home');

        act(() => {
            root.render(
                <ErrorBoundary resetKey="/2026">
                    <Thrower />
                </ErrorBoundary>,
            );
        });

        expect(container.querySelector('[data-testid="healthy-child"]')?.textContent).toBe('Healthy Content');
    });

    it('shows a deployment update message when dynamic chunk import fails', () => {
        act(() => {
            root.render(
                <ErrorBoundary resetKey="/2026/standings">
                    <Thrower error={new Error('Failed to fetch dynamically imported module: /assets/StandingsRoute.js')} />
                </ErrorBoundary>,
            );
        });

        expect(container.textContent).toContain('App Update Available');
        expect(container.textContent).toContain('New Version Deployed');
    });
});

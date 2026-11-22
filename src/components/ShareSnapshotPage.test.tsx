import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeShareToken } from '../utils/shareSnapshot';
import { ShareSnapshotPage } from './ShareSnapshotPage';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
});

afterEach(async () => {
    await act(async () => {
        root.unmount();
    });
    container.remove();
    vi.unstubAllGlobals();
});

describe('ShareSnapshotPage', () => {
    it('renders shared podium, full driver rankings, and interactive links from stateless token', async () => {
        const token = encodeShareToken({
            version: 1,
            season: '2026',
            mode: 'personal',
            source: 'race',
            ratedRaces: 20,
            createdAt: '2026-11-22',
            drivers: [
                {
                    driverId: 'leclerc',
                    driverName: 'Charles Leclerc',
                    constructorId: 'ferrari',
                    constructorName: 'Ferrari',
                    averageRating: 8.85,
                    totalRaces: 20,
                },
                {
                    driverId: 'norris',
                    driverName: 'Lando Norris',
                    constructorId: 'mclaren',
                    constructorName: 'McLaren',
                    averageRating: 8.4,
                    totalRaces: 20,
                },
                {
                    driverId: 'max_verstappen',
                    driverName: 'Max Verstappen',
                    constructorId: 'red_bull',
                    constructorName: 'Red Bull',
                    averageRating: 8.15,
                    totalRaces: 20,
                },
                {
                    driverId: 'piastri',
                    driverName: 'Oscar Piastri',
                    constructorId: 'mclaren',
                    constructorName: 'McLaren',
                    averageRating: 7.5,
                    totalRaces: 20,
                },
            ],
        });

        await act(async () => {
            root.render(
                <HelmetProvider>
                    <MemoryRouter>
                        <ShareSnapshotPage shareId={token} />
                    </MemoryRouter>
                </HelmetProvider>,
            );
        });

        expect(container.textContent).toContain('2026 SEASON RANKINGS');
        expect(container.textContent).toContain('PERSONAL RANKINGS');
        expect(container.textContent).toContain('20 RACES RATED');
        expect(container.textContent).toContain('Charles Leclerc');
        expect(container.textContent).toContain('8.85');
        expect(container.textContent).toContain('Oscar Piastri');

        const leclercLink = container.querySelector<HTMLAnchorElement>('a[href="/2026/driver/leclerc"]');
        const rateCta = container.querySelector<HTMLAnchorElement>('a[href="/2026"]');
        expect(leclercLink).not.toBeNull();
        expect(rateCta).not.toBeNull();
    });

    it('renders 404 recovery panel when share ID is invalid or missing', async () => {
        await act(async () => {
            root.render(
                <HelmetProvider>
                    <MemoryRouter>
                        <ShareSnapshotPage shareId="invalid-token" />
                    </MemoryRouter>
                </HelmetProvider>,
            );
        });

        expect(container.textContent).toContain('SHARED LINK NOT FOUND');
        expect(container.querySelector<HTMLAnchorElement>('a[href="/"]')).not.toBeNull();
    });
});

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TyreStint } from '../api/openf1';
import { TyreStints } from './TyreStints';

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

describe('TyreStints', () => {
    it('renders nothing when stints array is empty or undefined', async () => {
        await act(async () => {
            root.render(<TyreStints stints={[]} />);
        });
        expect(container.firstChild).toBeNull();
    });

    it('renders official Pirelli S/M/H/I/W SVG compound icons with strategy tooltips', async () => {
        const stints: TyreStint[] = [
            { stintNumber: 1, compound: 'SOFT', lapStart: 1, lapEnd: 12, lapCount: 12, tyreAgeAtStart: 0 },
            { stintNumber: 2, compound: 'MEDIUM', lapStart: 13, lapEnd: 34, lapCount: 22, tyreAgeAtStart: 0 },
            { stintNumber: 3, compound: 'HARD', lapStart: 35, lapEnd: 52, lapCount: 18, tyreAgeAtStart: 0 },
            { stintNumber: 4, compound: 'INTERMEDIATE', lapStart: 53, lapEnd: 58, lapCount: 6, tyreAgeAtStart: 0 },
            { stintNumber: 5, compound: 'WET', lapStart: 59, lapEnd: 60, lapCount: 2, tyreAgeAtStart: 0 },
        ];

        await act(async () => {
            root.render(<TyreStints stints={stints} />);
        });

        const wrapper = container.querySelector('[aria-label="Tyre strategy: Soft, Medium, Hard, Intermediate, Wet"]');
        expect(wrapper).not.toBeNull();

        const svgs = container.querySelectorAll('svg');
        expect(svgs).toHaveLength(5);
        expect(Array.from(svgs).map(svg => svg.textContent)).toEqual(['S', 'M', 'H', 'I', 'W']);

        const firstBadge = container.querySelector('span[title="Stint 1: Soft · L1–12 (12L)"]');
        expect(firstBadge).not.toBeNull();
    });
});

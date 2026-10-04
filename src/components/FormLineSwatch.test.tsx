import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FormLineSwatch } from './FormLineSwatch';

function rectangles(dash: string | undefined, height: number) {
    const container = document.createElement('div');
    container.innerHTML = renderToStaticMarkup(<FormLineSwatch color="#ff0000" dash={dash} height={height} />);
    return [...container.querySelectorAll('rect')].map(rect => ({
        y: Number(rect.getAttribute('y') ?? 0),
        height: Number(rect.getAttribute('height')),
    }));
}

describe('Form Tracker vertical line swatches', () => {
    it.each([40, 32, 20])('centers full dashes in a %ipx swatch', height => {
        const dashes = rectangles('8 5', height);
        expect(dashes.length).toBeGreaterThan(1);
        expect(dashes.every(dash => dash.height === dashes[0].height)).toBe(true);
        expect(dashes[0].y).toBe(height - (dashes.at(-1)!.y + dashes.at(-1)!.height));
        expect(dashes[0].y).toBeGreaterThanOrEqual(2);
    });

    it('keeps dotted styles complete and solid styles edge to edge', () => {
        expect(rectangles('2 4', 32).every(dash => dash.height === 2)).toBe(true);
        expect(rectangles(undefined, 40)).toEqual([{ y: 0, height: 40 }]);
    });
});

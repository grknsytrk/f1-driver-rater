import { describe, expect, it } from 'vitest';
import { parseF1TimeSeconds } from './f1Time';

describe('parseF1TimeSeconds', () => {
    it.each([
        ['1:23.456', 83.456],
        ['59.987', 59.987],
        ['1:02:03.004', 3723.004],
        ['+2.510', 2.51],
    ])('parses %s as seconds', (input, expected) => {
        expect(parseF1TimeSeconds(input)).toBeCloseTo(expected, 3);
    });

    it.each([undefined, '', '\\N', '+1 Lap', '1:75.000', 'not a time'])('rejects %s', input => {
        expect(parseF1TimeSeconds(input)).toBeNull();
    });
});

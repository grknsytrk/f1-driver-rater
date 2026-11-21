import { describe, expect, it } from 'vitest';
import { TEAM_COLORS, getTeamColor } from './index';

describe('getTeamColor', () => {
    it('returns official team colors including 2026 constructors', () => {
        expect(getTeamColor('audi')).toBe('#bb0a30');
        expect(getTeamColor('cadillac')).toBe('#c5a26a');
        expect(getTeamColor('racing_bulls')).toBe('#2b4562');
        expect(getTeamColor('rb')).toBe(TEAM_COLORS.rb);
        expect(getTeamColor('ferrari')).toBe('#dc0000');
        expect(getTeamColor('mercedes')).toBe('#00d2be');
        expect(getTeamColor('red_bull')).toBe('#1e41ff');
        expect(getTeamColor('mclaren')).toBe('#ff8700');
    });

    it('falls back gracefully for unknown constructors', () => {
        expect(getTeamColor('unknown_team')).toBe('#888888');
        expect(getTeamColor('unknown_team', '#666')).toBe('#666');
    });
});

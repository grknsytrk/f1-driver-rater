import { beforeEach, describe, expect, it } from 'vitest';
import { calculateAverages, exportRatings, getQuickRatings, getRaceRatings, importRatings, markQuickRatingsCommunityEligible, markRaceRatingsCommunityEligible, saveQuickDriverRating, saveRaceDriverRating } from './storage';
import { OUTBOX_KEY } from './guestSync';
import { QUICK_STORAGE_KEY, RACE_STORAGE_KEY, readStored } from './ratingData';

const driver = { driverId: 'norris', driverName: 'Lando Norris', constructorId: 'mclaren', constructorName: 'McLaren', rating: 8.5 };
const other = { ...driver, driverId: 'piastri', rating: 5 };
beforeEach(() => localStorage.clear());

describe('explicit rating persistence', () => {
    it('creates only the selected race driver, with no phantom fives', () => {
        saveRaceDriverRating('2026', '1', 'GP', '2026-01-01', driver);
        expect(getRaceRatings('2026', '1')?.ratings).toEqual([{ ...driver, communityEligible: true }]);
        expect(calculateAverages('2026')).toHaveLength(1);
    });
    it('reselects an old score without opting in any other legacy driver', () => {
        localStorage.setItem(QUICK_STORAGE_KEY, JSON.stringify({ '2026': [driver, other] }));
        saveQuickDriverRating('2026', driver);
        expect(getQuickRatings('2026')).toEqual([other, { ...driver, communityEligible: true }]);
        const pending = readStored<{ entry: { rating: { driverId: string } } }[]>(OUTBOX_KEY, []);
        expect(pending).toHaveLength(1);
        expect(pending[0].entry.rating.driverId).toBe('norris');
    });
    it('promotes every existing race score when leaving the race screen', () => {
        localStorage.setItem(RACE_STORAGE_KEY, JSON.stringify({
            '2026': {
                season: '2026',
                races: [{
                    round: '1', raceName: 'GP', date: '2026-01-01', completed: true,
                    ratings: [driver, other],
                }],
            },
        }));

        expect(markRaceRatingsCommunityEligible('2026', '1', 'GP', '2026-01-01')).toBe(2);
        expect(getRaceRatings('2026', '1')?.ratings.every(rating => rating.communityEligible === true)).toBe(true);
        expect(readStored<unknown[]>(OUTBOX_KEY, [])).toHaveLength(2);
    });
    it('promotes every existing Quick Rate score when leaving the season screen', () => {
        localStorage.setItem(QUICK_STORAGE_KEY, JSON.stringify({ '2026': [driver, other] }));

        expect(markQuickRatingsCommunityEligible('2026')).toBe(2);
        expect(getQuickRatings('2026')?.every(rating => rating.communityEligible === true)).toBe(true);
        expect(readStored<unknown[]>(OUTBOX_KEY, [])).toHaveLength(2);
    });
    it('updates the same vote and preserves the latest independent selection', () => {
        saveQuickDriverRating('2026', driver);
        saveQuickDriverRating('2026', other);
        saveQuickDriverRating('2026', { ...driver, rating: 10 });
        expect(getQuickRatings('2026')).toHaveLength(2);
        expect(readStored<unknown[]>(OUTBOX_KEY, [])).toHaveLength(2);
        expect(getQuickRatings('2026')?.find(row => row.driverId === 'norris')?.rating).toBe(10);
    });
    it('rejects invalid explicit selections and ignores historical zero placeholders', () => {
        saveQuickDriverRating('2026', { ...driver, rating: 0 });
        saveQuickDriverRating('2026', { ...driver, rating: 7.3 });
        expect(getQuickRatings('2026')).toBeNull();
        localStorage.setItem(QUICK_STORAGE_KEY, JSON.stringify({ '2026': [driver, { ...other, rating: 0 }] }));
        expect(calculateAverages('2026')).toHaveLength(1);
    });
    it('imports version 1 and 2 as personal ratings, including historical tenths', () => {
        for (const version of [1, 2]) {
            const result = importRatings(JSON.stringify({ version, season: '2026', quickRatings: [{ ...driver, rating: 8.2, communityEligible: true }] }));
            expect(result.success).toBe(true);
            expect(getQuickRatings('2026')?.[0]).toMatchObject({ rating: 8.2, communityEligible: false });
            expect(JSON.parse(exportRatings('2026')).version).toBe(2);
        }
    });
    it('validates the whole import before overwriting existing personal records', () => {
        saveRaceDriverRating('2026', '1', 'GP', '2026-01-01', driver);
        const before = localStorage.getItem(RACE_STORAGE_KEY);
        expect(importRatings(JSON.stringify({ season: '2026', raceRatings: { races: [] }, quickRatings: [{ ...driver, rating: 100 }] })).success).toBe(false);
        expect(localStorage.getItem(RACE_STORAGE_KEY)).toBe(before);
    });
});

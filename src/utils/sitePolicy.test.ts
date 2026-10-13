import { beforeEach, describe, expect, it } from 'vitest';
import {
    acceptCurrentSitePolicy,
    hasCurrentSitePolicyAcceptance,
    hasLocalSitePolicyAcceptance,
    SITE_POLICY_VERSION,
} from './sitePolicy';

beforeEach(() => {
    localStorage.clear();
});

describe('site policy acceptance', () => {
    it('starts unaccepted for a new local account', async () => {
        await expect(hasCurrentSitePolicyAcceptance()).resolves.toBe(false);
    });

    it('persists acceptance locally when cloud sync is not configured', async () => {
        acceptCurrentSitePolicy();

        expect(hasLocalSitePolicyAcceptance()).toBe(true);
        await expect(hasCurrentSitePolicyAcceptance()).resolves.toBe(true);
        const acceptedAt = localStorage.getItem('f1_site_policy_accepted_' + SITE_POLICY_VERSION);
        expect(acceptedAt).not.toBeNull();
        expect(Number.isFinite(Date.parse(acceptedAt!))).toBe(true);
    });

    it('does not treat an older policy version as accepted', async () => {
        localStorage.setItem('f1_site_policy_accepted_2026-10-13', 'true');

        expect(hasLocalSitePolicyAcceptance()).toBe(false);
        await expect(hasCurrentSitePolicyAcceptance()).resolves.toBe(false);
    });
});

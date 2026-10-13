import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const policyApi = vi.hoisted(() => ({
    acceptCurrentSitePolicy: vi.fn(),
    hasCurrentSitePolicyAcceptance: vi.fn<() => Promise<boolean>>(),
}));

vi.mock('../utils/sitePolicy', () => policyApi);

import { useSitePolicyConsent } from './useSitePolicyConsent';

vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function ConsentHarness() {
    const [rating, setRating] = useState(5);
    const policy = useSitePolicyConsent();

    return (
        <>
            <output data-testid="rating">{rating}</output>
            <button onClick={() => policy.requestAcceptance(() => setRating(8))}>
                SAVE RATING
            </button>
            {policy.overlays}
        </>
    );
}

function mountHarness() {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root?.render(<ConsentHarness />));
}

async function clickAndFlush(element: HTMLElement | null | undefined) {
    await act(async () => {
        element?.click();
        await Promise.resolve();
        await Promise.resolve();
    });
}

beforeEach(() => {
    policyApi.acceptCurrentSitePolicy.mockReset();
    policyApi.hasCurrentSitePolicyAcceptance.mockReset();
    policyApi.hasCurrentSitePolicyAcceptance.mockResolvedValue(false);
});

afterEach(() => {
    if (root) act(() => root?.unmount());
    root = null;
    host?.remove();
    host = null;
    document.body.innerHTML = '';
});

describe('site policy rating consent flow', () => {
    it('keeps the old score unchanged until the account accepts, then saves once', async () => {
        mountHarness();
        const saveButton = [...document.body.querySelectorAll('button')]
            .find(button => button.textContent?.includes('SAVE RATING')) as HTMLButtonElement | undefined;

        await clickAndFlush(saveButton);
        expect(document.querySelector('[data-testid="rating"]')?.textContent).toBe('5');

        const checkbox = document.querySelector<HTMLInputElement>('input[type="checkbox"]');
        const agreeButton = [...document.body.querySelectorAll('button')]
            .find(button => button.textContent?.includes('AGREE AND SAVE RATING')) as HTMLButtonElement | undefined;
        expect(agreeButton?.disabled).toBe(true);

        await clickAndFlush(checkbox);
        expect(agreeButton?.disabled).toBe(false);
        await clickAndFlush(agreeButton);

        expect(policyApi.acceptCurrentSitePolicy).toHaveBeenCalledOnce();
        expect(document.querySelector('[data-testid="rating"]')?.textContent).toBe('8');
    });

    it('does not save or change the score when the account cancels', async () => {
        mountHarness();
        const saveButton = [...document.body.querySelectorAll('button')]
            .find(button => button.textContent?.includes('SAVE RATING')) as HTMLButtonElement | undefined;

        await clickAndFlush(saveButton);
        const cancelButton = [...document.body.querySelectorAll('button')]
            .find(button => button.textContent?.includes('CANCEL')) as HTMLButtonElement | undefined;
        await clickAndFlush(cancelButton);

        expect(policyApi.acceptCurrentSitePolicy).not.toHaveBeenCalled();
        expect(document.querySelector('[data-testid="rating"]')?.textContent).toBe('5');
    });

    it('runs the pending rating directly after this account already accepted', async () => {
        policyApi.hasCurrentSitePolicyAcceptance.mockResolvedValue(true);
        mountHarness();
        const saveButton = [...document.body.querySelectorAll('button')]
            .find(button => button.textContent?.includes('SAVE RATING')) as HTMLButtonElement | undefined;

        await clickAndFlush(saveButton);

        expect(policyApi.acceptCurrentSitePolicy).not.toHaveBeenCalled();
        expect(document.querySelector('[data-testid="rating"]')?.textContent).toBe('8');
        expect(document.querySelector('input[type="checkbox"]')).toBeNull();
    });
});

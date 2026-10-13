import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SitePolicyAcceptanceDialog, SitePolicyModal } from './SitePolicy';

vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function mount(element: React.ReactNode) {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root?.render(element));
}

afterEach(() => {
    if (root) act(() => root?.unmount());
    root = null;
    host?.remove();
    host = null;
    document.body.innerHTML = '';
});

function ConsentHarness({ onAccept }: { onAccept: () => void }) {
    const [checked, setChecked] = useState(false);
    return (
        <SitePolicyAcceptanceDialog
            open
            checked={checked}
            onCheckedChange={setChecked}
            onOpenChange={() => {}}
            onAccept={onAccept}
            onReadPolicy={() => {}}
        />
    );
}

describe('site policy UI', () => {
    it('requires the account holder to check the consent box before continuing', () => {
        const onAccept = vi.fn();
        mount(<ConsentHarness onAccept={onAccept} />);

        const agreeButton = [...document.body.querySelectorAll('button')]
            .find(button => button.textContent?.includes('AGREE AND SAVE RATING'));
        const checkbox = document.body.querySelector<HTMLInputElement>('input[type="checkbox"]');

        expect(agreeButton?.disabled).toBe(true);
        expect(checkbox).not.toBeNull();

        act(() => checkbox?.click());

        expect(agreeButton?.disabled).toBe(false);
    });

    it('shows the full headed policy in the themed modal without dash characters', () => {
        mount(<SitePolicyModal open onClose={() => {}} />);

        const text = document.body.textContent ?? '';
        expect(text).toContain('WEBSITE USE AND COMMUNITY STANDARDS');
        expect(text).toContain('About This Website');
        expect(text).toContain('Information and Data');
        expect(text).toContain('Ratings and Community Conduct');
        expect(text).toContain('Rating Reviews and Enforcement');
        expect(text).toContain('Availability and Policy Updates');
        expect(text).not.toContain('-');
    });
});

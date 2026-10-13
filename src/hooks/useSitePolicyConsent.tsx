import { useCallback, useRef, useState } from 'react';
import { SitePolicyAcceptanceDialog, SitePolicyModal } from '../components/SitePolicy';
import { acceptCurrentSitePolicy, hasCurrentSitePolicyAcceptance } from '../utils/sitePolicy';

export function useSitePolicyConsent() {
    const pendingAction = useRef<(() => void) | null>(null);
    const checking = useRef(false);
    const switchingToPolicy = useRef(false);
    const [acceptanceOpen, setAcceptanceOpen] = useState(false);
    const [policyOpen, setPolicyOpen] = useState(false);
    const [checked, setChecked] = useState(false);

    const requestAcceptance = useCallback((action: () => void) => {
        if (pendingAction.current || checking.current) return;
        pendingAction.current = action;
        checking.current = true;

        void hasCurrentSitePolicyAcceptance()
            .catch(() => false)
            .then(accepted => {
                checking.current = false;
                if (!pendingAction.current) return;
                if (accepted) {
                    const pending = pendingAction.current;
                    pendingAction.current = null;
                    pending();
                    return;
                }
                setChecked(false);
                setAcceptanceOpen(true);
            });
    }, []);

    const handleAccept = useCallback(() => {
        if (!checked || !pendingAction.current) return;

        acceptCurrentSitePolicy();
        const pending = pendingAction.current;
        pendingAction.current = null;
        setAcceptanceOpen(false);
        setChecked(false);
        pending();
    }, [checked]);

    const handleAcceptanceOpenChange = useCallback((open: boolean) => {
        setAcceptanceOpen(open);
        if (!open && !switchingToPolicy.current) {
            pendingAction.current = null;
            setChecked(false);
        }
    }, []);

    const handleReadPolicy = useCallback(() => {
        switchingToPolicy.current = true;
        setAcceptanceOpen(false);
        setPolicyOpen(true);
    }, []);

    const handlePolicyClose = useCallback(() => {
        setPolicyOpen(false);
        if (switchingToPolicy.current) {
            switchingToPolicy.current = false;
            if (pendingAction.current) setAcceptanceOpen(true);
        }
    }, []);

    return {
        requestAcceptance,
        overlays: (
            <>
                <SitePolicyAcceptanceDialog
                    open={acceptanceOpen}
                    checked={checked}
                    onCheckedChange={setChecked}
                    onOpenChange={handleAcceptanceOpenChange}
                    onAccept={handleAccept}
                    onReadPolicy={handleReadPolicy}
                />
                <SitePolicyModal open={policyOpen} onClose={handlePolicyClose} />
            </>
        ),
    };
}

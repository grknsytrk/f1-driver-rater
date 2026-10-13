import { createPortal } from 'react-dom';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogTitle,
} from './ui/alert-dialog';
import { ModalShell } from './ModalShell';

const POLICY_SECTIONS = [
    {
        title: 'About This Website',
        text: 'By accessing or using F1 Driver Rating, including browsing the website, creating or using an account, or submitting ratings, you acknowledge this policy and agree to follow these standards. F1 Driver Rating is an independent community website. It is not affiliated with or endorsed by Formula 1, the FIA, any team, driver, or championship organizer.',
    },
    {
        title: 'Information and Data',
        text: 'Race results, standings, schedules, and other information may come from external sources, including the Jolpica API. Information may be delayed, incomplete, revised, or inaccurate. Please check official sources when accuracy matters. The website and its features may change over time.',
    },
    {
        title: 'Ratings and Community Conduct',
        text: 'Ratings represent personal opinions. When submitting a rating, you agree to do so honestly and in good faith, based on the selected race or season. Do not use the website to manipulate community scores through review bombing, coordinated voting, multiple or misleading accounts, automated activity, or other deliberate attempts to distort results. Harassment, threats, impersonation, and misuse of website features are also prohibited. You are responsible for activity carried out through your account and for ensuring that anything you submit is appropriate to share.',
    },
    {
        title: 'Rating Reviews and Enforcement',
        text: 'To protect the fairness of community scores, ratings from new accounts or activity flagged by safety measures may be temporarily held out of community averages while reviewed. If no suspicious activity is identified, eligible ratings may be included automatically after the review period. Ratings found to be manipulative may be excluded. Accounts involved in deliberate manipulation or attempts to bypass restrictions may lose access to community rating indefinitely.',
    },
    {
        title: 'Availability and Policy Updates',
        text: 'F1 Driver Rating is provided for informational and community use. We cannot guarantee that every feature or data source will always be available, uninterrupted, current, or error free. We may update this policy by publishing a revised version on the website. If you do not accept these standards, you should stop using the website.',
    },
] as const;

interface SitePolicyModalProps {
    open: boolean;
    onClose: () => void;
}

export function SitePolicyModal({ open, onClose }: SitePolicyModalProps) {
    if (!open) return null;

    return createPortal((
        <ModalShell
            eyebrow="SITE POLICY"
            title="WEBSITE USE AND COMMUNITY STANDARDS"
            subtitle="F1 DRIVER RATING"
            onClose={onClose}
            footer={(
                <div className="flex justify-end border-t border-[var(--border-color)] bg-[var(--bg-panel)] p-4">
                    <button
                        type="button"
                        onClick={onClose}
                        className="border border-[var(--border-color)] px-6 py-3 font-oxanium text-xs font-bold tracking-widest text-[var(--text-secondary)] uppercase transition-colors hover:border-[var(--accent-red)] hover:text-white md:py-2"
                    >
                        CLOSE
                    </button>
                </div>
            )}
        >
            <div className="custom-scrollbar flex-1 space-y-6 overflow-y-auto p-4 md:p-7">
                {POLICY_SECTIONS.map(section => (
                    <section key={section.title} className="border-l-2 border-[var(--accent-red)]/70 pl-4 md:pl-5">
                        <h3 className="mb-2 font-display-condensed text-lg font-bold uppercase tracking-wide text-white md:text-xl">
                            {section.title}
                        </h3>
                        <p className="font-oxanium text-xs leading-6 text-[var(--text-secondary)] md:text-sm md:leading-7">
                            {section.text}
                        </p>
                    </section>
                ))}
            </div>
        </ModalShell>
    ), document.body);
}

interface SitePolicyAcceptanceDialogProps {
    open: boolean;
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
    onOpenChange: (open: boolean) => void;
    onAccept: () => void;
    onReadPolicy: () => void;
}

export function SitePolicyAcceptanceDialog({
    open,
    checked,
    onCheckedChange,
    onOpenChange,
    onAccept,
    onReadPolicy,
}: SitePolicyAcceptanceDialogProps) {
    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent className="w-full max-w-md rounded-none border border-[var(--border-color)] bg-[var(--bg-panel)] p-5 shadow-2xl sm:p-7">
                <div className="mb-1 font-oxanium text-[10px] uppercase tracking-[0.2em] text-[var(--accent-red)]">
                    SITE POLICY
                </div>
                <AlertDialogTitle className="font-display-condensed text-2xl font-bold uppercase tracking-wide text-white sm:text-3xl">
                    CONFIRM YOUR RATING
                </AlertDialogTitle>
                <AlertDialogDescription className="font-oxanium text-xs leading-6 text-[var(--text-secondary)] sm:text-sm">
                    Before adding or changing a rating, review and accept the Website Use and Community Standards. You will only be asked once for this policy version on this account.
                </AlertDialogDescription>

                <div className="flex items-start gap-3 border border-[var(--border-color)] bg-[var(--bg-darker)] p-3 font-oxanium text-xs leading-5 text-[var(--text-secondary)]">
                    <input
                        id="site-policy-consent"
                        type="checkbox"
                        checked={checked}
                        onChange={event => onCheckedChange(event.target.checked)}
                        aria-label="I have read and agree to the Website Use and Community Standards."
                        className="mt-1 h-4 w-4 shrink-0 accent-[var(--accent-red)]"
                    />
                    <p>
                        <label htmlFor="site-policy-consent" className="cursor-pointer">
                            I have read and agree to the{' '}
                        </label>
                        <button
                            type="button"
                            onClick={onReadPolicy}
                            className="whitespace-normal text-left font-oxanium text-xs font-semibold text-[var(--accent-red)] underline decoration-[var(--accent-red)] underline-offset-4 transition-colors hover:text-[#ff3333]"
                        >
                            Website Use and Community Standards
                        </button>
                        <label htmlFor="site-policy-consent" className="cursor-pointer">.</label>
                    </p>
                </div>

                <div className="flex flex-col-reverse gap-2 sm:flex-row">
                    <AlertDialogCancel className="flex-1 rounded-none border border-[var(--border-color)] bg-[var(--bg-darker)] py-3 font-display text-sm uppercase tracking-widest text-white hover:border-white hover:bg-[var(--bg-darker)] hover:text-white dark:hover:bg-[var(--bg-darker)] dark:hover:text-white focus-visible:text-white">
                        CANCEL
                    </AlertDialogCancel>
                    <AlertDialogAction
                        disabled={!checked}
                        onClick={onAccept}
                        className="flex-1 rounded-none border-0 bg-[var(--accent-red)] py-3 font-display text-sm uppercase tracking-widest text-white hover:bg-[#ff0000] disabled:pointer-events-none disabled:opacity-40"
                    >
                        AGREE AND SAVE RATING
                    </AlertDialogAction>
                </div>
            </AlertDialogContent>
        </AlertDialog>
    );
}

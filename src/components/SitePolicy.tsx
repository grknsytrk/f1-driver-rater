import { createPortal } from 'react-dom';
import {
    Check,
    Clock,
    Database,
    FileText,
    Globe,
    RefreshCw,
    ShieldAlert,
    ShieldCheck,
    Users,
} from 'lucide-react';
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
        code: '01',
        icon: Globe,
        title: 'About This Website',
        text: 'By accessing or using F1 Driver Rating, including browsing the website, creating or using an account, or submitting ratings, you acknowledge this policy and agree to follow these standards. F1 Driver Rating is an independent community website. It is not affiliated with or endorsed by Formula 1, the FIA, any team, driver, or championship organizer.',
    },
    {
        code: '02',
        icon: Database,
        title: 'Information and Data',
        text: 'Race results, standings, schedules, and other information may come from external sources, including the Jolpica API. Information may be delayed, incomplete, revised, or inaccurate. Please check official sources when accuracy matters. The website and its features may change over time.',
    },
    {
        code: '03',
        icon: Users,
        title: 'Ratings and Community Conduct',
        text: 'Ratings represent personal opinions. When submitting a rating, you agree to do so honestly and in good faith, based on the selected race or season. Do not use the website to manipulate community scores through review bombing, coordinated voting, multiple or misleading accounts, automated activity, or other deliberate attempts to distort results. Harassment, threats, impersonation, and misuse of website features are also prohibited. You are responsible for activity carried out through your account and for ensuring that anything you submit is appropriate to share.',
    },
    {
        code: '04',
        icon: ShieldAlert,
        title: 'Rating Reviews and Enforcement',
        text: 'To protect the fairness of community scores, ratings from new accounts or activity flagged by safety measures may be temporarily held out of community averages while reviewed. If no suspicious activity is identified, eligible ratings may be included automatically after the review period. Ratings found to be manipulative may be excluded. Accounts involved in deliberate manipulation or attempts to bypass restrictions may lose access to community rating indefinitely.',
    },
    {
        code: '05',
        icon: RefreshCw,
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
            eyebrowIcon={<ShieldCheck size={14} className="text-[var(--accent-red)]" />}
            eyebrowTextClassName="text-[var(--accent-red)] font-bold"
            title="WEBSITE USE AND COMMUNITY STANDARDS"
            subtitle="F1 DRIVER RATING · EFFECTIVE OCTOBER 2026"
            onClose={onClose}
            footer={(
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-color)] bg-[var(--bg-panel)] px-4 py-3.5 md:px-6">
                    <span className="font-oxanium text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">
                        POLICY VERSION 2026.10.14
                    </span>
                    <button
                        type="button"
                        onClick={onClose}
                        className="border border-[var(--border-color)] bg-[var(--bg-darker)] px-6 py-2.5 font-oxanium text-xs font-bold tracking-widest text-[var(--text-secondary)] uppercase transition-colors hover:border-[var(--accent-red)] hover:text-white"
                    >
                        CLOSE
                    </button>
                </div>
            )}
        >
            <div className="custom-scrollbar flex-1 space-y-4 overflow-y-auto p-4 md:p-7">
                <div className="flex items-start gap-3 border border-[var(--border-color)] border-l-2 border-l-[var(--accent-red)] bg-[var(--bg-panel)] p-4">
                    <span
                        aria-hidden="true"
                        className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center border border-[var(--accent-red)]/35 bg-[var(--bg-darker)] text-[var(--accent-red)]"
                    >
                        <FileText size={16} />
                    </span>
                    <p className="font-oxanium text-xs leading-6 text-[var(--text-secondary)] md:text-sm">
                        These standards explain how F1 Driver Rating operates and how community averages are protected against automated activity, coordinated voting, and rating manipulation.
                    </p>
                </div>

                <div className="space-y-3.5">
                    {POLICY_SECTIONS.map(section => {
                        const Icon = section.icon;
                        return (
                            <section
                                key={section.title}
                                className="border border-[var(--border-color)] bg-[var(--bg-panel)] p-4 transition-colors hover:border-white/15 md:p-5"
                            >
                                <div className="flex items-center gap-3 border-b border-white/[0.06] pb-3">
                                    <span className="flex h-7 w-7 shrink-0 items-center justify-center border border-[var(--accent-red)]/35 bg-[var(--bg-darker)] font-oxanium text-[10px] font-bold tracking-wider text-[var(--accent-red)]">
                                        {section.code}
                                    </span>
                                    <Icon size={15} aria-hidden="true" className="shrink-0 text-[var(--text-muted)]" />
                                    <h3 className="font-display-condensed text-lg font-bold uppercase tracking-wide text-white md:text-xl">
                                        {section.title}
                                    </h3>
                                </div>
                                <p className="mt-3 font-oxanium text-xs leading-6 text-[var(--text-secondary)] md:text-sm md:leading-7">
                                    {section.text}
                                </p>
                            </section>
                        );
                    })}
                </div>
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
            <AlertDialogContent className="w-full max-w-lg gap-0 overflow-hidden rounded-none border border-[var(--border-color)] border-t-2 border-t-[var(--accent-red)] bg-[var(--bg-panel)] p-0 shadow-2xl">
                <div className="border-b border-[var(--border-color)] bg-[var(--bg-darker)]/80 px-5 pt-5 pb-4 sm:px-6 sm:pt-6">
                    <div className="flex items-start gap-3.5">
                        <span
                            aria-hidden="true"
                            className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center border border-[var(--accent-red)]/40 bg-[var(--accent-red)]/10 text-[var(--accent-red)]"
                        >
                            <ShieldCheck size={20} />
                        </span>
                        <div className="min-w-0">
                            <div className="font-oxanium text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--accent-red)]">
                                SITE POLICY · ONE-TIME CONFIRMATION
                            </div>
                            <AlertDialogTitle className="mt-1 font-display-condensed text-2xl font-bold uppercase tracking-wide text-white sm:text-3xl">
                                CONFIRM YOUR RATING
                            </AlertDialogTitle>
                        </div>
                    </div>
                </div>

                <div className="space-y-4 px-5 py-5 sm:px-6">
                    <AlertDialogDescription className="font-oxanium text-xs leading-6 text-[var(--text-secondary)] sm:text-sm">
                        Before adding or changing a rating, review and accept the Website Use and Community Standards. You will only be asked once for this policy version on this account.
                    </AlertDialogDescription>

                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <div className="flex items-start gap-2.5 border border-[var(--border-color)] bg-[var(--bg-darker)]/60 p-3">
                            <ShieldCheck size={14} aria-hidden="true" className="mt-0.5 shrink-0 text-[#00FF88]" />
                            <div>
                                <div className="font-oxanium text-[10px] font-bold uppercase tracking-wider text-white">
                                    FAIR PLAY ONLY
                                </div>
                                <p className="mt-0.5 font-oxanium text-[10px] leading-relaxed text-[var(--text-muted)]">
                                    Honest scores based on race or season performance.
                                </p>
                            </div>
                        </div>
                        <div className="flex items-start gap-2.5 border border-[var(--border-color)] bg-[var(--bg-darker)]/60 p-3">
                            <Clock size={14} aria-hidden="true" className="mt-0.5 shrink-0 text-sky-300" />
                            <div>
                                <div className="font-oxanium text-[10px] font-bold uppercase tracking-wider text-white">
                                    24H NEW ACCOUNT REVIEW
                                </div>
                                <p className="mt-0.5 font-oxanium text-[10px] leading-relaxed text-[var(--text-muted)]">
                                    Protects community averages from bot manipulation.
                                </p>
                            </div>
                        </div>
                    </div>

                    <div
                        className={`flex items-start gap-3 border p-3.5 font-oxanium text-xs leading-5 transition-colors ${
                            checked
                                ? 'border-[var(--accent-red)]/60 bg-[var(--accent-red)]/[0.07] text-white'
                                : 'border-[var(--border-color)] bg-[var(--bg-darker)] text-[var(--text-secondary)] hover:border-white/25'
                        }`}
                    >
                        <input
                            id="site-policy-consent"
                            type="checkbox"
                            checked={checked}
                            onChange={event => onCheckedChange(event.target.checked)}
                            aria-label="I have read and agree to the Terms of Use."
                            className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-[var(--accent-red)]"
                        />
                        <p className="min-w-0 flex-1">
                            <label htmlFor="site-policy-consent" className="cursor-pointer">
                                I have read and agree to the{' '}
                            </label>
                            <button
                                type="button"
                                onClick={onReadPolicy}
                                className="inline-flex items-center gap-1 whitespace-normal text-left font-oxanium text-xs font-semibold text-[var(--accent-red)] underline decoration-[var(--accent-red)]/70 underline-offset-4 transition-colors hover:text-[#ff3333]"
                            >
                                Terms of Use
                            </button>
                            <label htmlFor="site-policy-consent" className="cursor-pointer">.</label>
                        </p>
                    </div>
                </div>

                <div className="flex flex-col-reverse gap-2.5 border-t border-[var(--border-color)] bg-[var(--bg-darker)]/60 px-5 py-4 sm:flex-row sm:px-6">
                    <AlertDialogCancel className="flex-1 rounded-none border border-[var(--border-color)] bg-[var(--bg-darker)] py-3 font-display text-sm uppercase tracking-widest text-white hover:border-white hover:bg-[var(--bg-panel-hover)] hover:text-white dark:hover:bg-[var(--bg-panel-hover)] dark:hover:text-white focus-visible:text-white">
                        CANCEL
                    </AlertDialogCancel>
                    <AlertDialogAction
                        disabled={!checked}
                        onClick={onAccept}
                        className="flex flex-1 items-center justify-center gap-2 rounded-none border-0 bg-[var(--accent-red)] py-3 font-display text-sm uppercase tracking-widest text-white hover:bg-[#ff0000] disabled:pointer-events-none disabled:opacity-40"
                    >
                        <Check size={15} aria-hidden="true" />
                        AGREE AND SAVE RATING
                    </AlertDialogAction>
                </div>
            </AlertDialogContent>
        </AlertDialog>
    );
}

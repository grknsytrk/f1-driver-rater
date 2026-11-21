import { Link } from 'react-router-dom';
import { ChevronLeft, Flag } from 'lucide-react';
import { SEOHead } from './SEOHead';

export function NotFoundPage() {
    return (
        <>
            <SEOHead
                title="Page Not Found"
                description="The requested Formula 1 season or page could not be found."
                path="/404"
                noindex
            />
            <div className="mx-auto my-8 max-w-2xl border border-[var(--border-color)] bg-[var(--bg-panel)] p-6 md:p-10">
                <div className="border-l-4 border-[var(--accent-red)] pl-4 md:pl-6">
                    <div className="flex items-center gap-2 font-oxanium text-xs uppercase tracking-[0.25em] text-[var(--accent-red)]">
                        <Flag size={14} aria-hidden="true" />
                        <span>404 · Off Track</span>
                    </div>
                    <h2 className="mt-2 font-display text-3xl uppercase tracking-tight text-white md:text-5xl">
                        Page Not Found
                    </h2>
                    <p className="mt-3 font-ui text-sm text-[var(--text-secondary)]">
                        The season or race route you requested does not exist. Select a supported F1 season to continue rating drivers.
                    </p>
                </div>

                <div className="mt-8">
                    <Link
                        to="/"
                        className="inline-flex items-center gap-2 border border-[var(--accent-red)] bg-[var(--accent-red)]/10 px-5 py-3 font-oxanium text-xs font-bold uppercase tracking-widest text-white transition-colors hover:bg-[var(--accent-red)]"
                    >
                        <ChevronLeft size={14} aria-hidden="true" />
                        All Seasons
                    </Link>
                </div>
            </div>
        </>
    );
}

import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';

interface ModalShellProps {
    eyebrow: string;
    title: string;
    subtitle?: string;
    onClose: () => void;
    children: ReactNode;
    eyebrowIcon?: ReactNode;
    eyebrowTextClassName?: string;
    footer?: ReactNode;
}

export function ModalShell({
    eyebrow,
    title,
    subtitle,
    onClose,
    children,
    eyebrowIcon,
    eyebrowTextClassName = 'text-[var(--text-muted)]',
    footer,
}: ModalShellProps) {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-0 md:p-4"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
        >
            <div className="absolute inset-0 bg-[#000]/95" />

            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                onClick={(event) => event.stopPropagation()}
                className="relative flex h-[100dvh] w-full max-w-5xl min-h-0 flex-col overflow-hidden rounded-none border-0 border-[var(--border-color)] bg-[var(--bg-main)] shadow-2xl md:h-auto md:max-h-[90vh] md:border"
                style={{ boxShadow: '0 0 100px rgba(0,0,0,0.8)' }}
            >
                <div className="relative border-b border-[var(--border-color)] bg-[var(--bg-panel)] p-4 md:p-6">
                    <div className="pointer-events-none absolute right-0 top-0 p-4 opacity-5">
                        <div className="flex h-32 w-32 items-center justify-center rounded-full border-2 border-white">
                            <div className="h-24 w-24 border border-white" />
                        </div>
                    </div>

                    <div className="relative z-10 flex items-center justify-between gap-4">
                        <div className="min-w-0">
                            <div className="mb-2 flex items-center gap-2">
                                {eyebrowIcon}
                                <span className={`font-oxanium text-[10px] uppercase tracking-[0.2em] ${eyebrowTextClassName}`}>
                                    {eyebrow}
                                </span>
                            </div>
                            <h2 className="font-display-condensed text-2xl font-bold uppercase leading-tight tracking-tight text-white md:text-5xl">
                                {title}
                            </h2>
                            {subtitle && (
                                <p className="mt-1 font-oxanium text-sm uppercase tracking-wider text-[var(--text-secondary)]">
                                    {subtitle}
                                </p>
                            )}
                        </div>

                        <button
                            onClick={onClose}
                            className="group flex h-12 w-12 flex-shrink-0 items-center justify-center border border-[var(--border-color)] transition-all hover:border-[var(--accent-red)] hover:bg-[var(--accent-red)]"
                        >
                            <X size={24} className="text-[var(--text-muted)] group-hover:text-white" />
                        </button>
                    </div>
                </div>

                <div className="flex min-h-0 flex-1 flex-col">
                    {children}
                </div>

                {footer}
            </motion.div>
        </motion.div>
    );
}

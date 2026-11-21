import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, Home, RotateCw } from 'lucide-react';

interface ErrorBoundaryProps {
    children: ReactNode;
    resetKey?: string;
}

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
}

function isChunkLoadError(error: Error | null): boolean {
    if (!error) return false;
    const text = `${error.name} ${error.message}`;
    return /ChunkLoadError|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(text);
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    public state: ErrorBoundaryState = {
        hasError: false,
        error: null,
    };

    public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
        console.error('Route ErrorBoundary caught an error:', error, errorInfo);
    }

    public componentDidUpdate(prevProps: ErrorBoundaryProps): void {
        if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
            this.setState({ hasError: false, error: null });
        }
    }

    private handleReload = () => {
        window.location.reload();
    };

    private handleReset = () => {
        this.setState({ hasError: false, error: null });
    };

    public render(): ReactNode {
        if (!this.state.hasError) {
            return this.props.children;
        }

        const chunkFailure = isChunkLoadError(this.state.error);

        return (
            <div className="mx-auto my-8 max-w-2xl border border-[var(--border-color)] bg-[var(--bg-panel)] p-6 md:p-10">
                <div className="border-l-4 border-[var(--accent-red)] pl-4 md:pl-6">
                    <div className="flex items-center gap-2 font-oxanium text-xs uppercase tracking-[0.2em] text-[var(--accent-red)]">
                        <AlertTriangle size={14} aria-hidden="true" />
                        <span>{chunkFailure ? 'App Update Available' : 'Telemetry Interrupted'}</span>
                    </div>
                    <h2 className="mt-2 font-display text-2xl uppercase tracking-tight text-white md:text-4xl">
                        {chunkFailure ? 'New Version Deployed' : 'Something Went Wrong'}
                    </h2>
                    <p className="mt-3 font-ui text-sm text-[var(--text-secondary)]">
                        {chunkFailure
                            ? 'A newer version of F1 Driver Rating was deployed. Reload the page to load the latest application files.'
                            : 'An unexpected error interrupted this view. Reload the page or return to the seasons overview.'}
                    </p>
                </div>

                <div className="mt-8 flex flex-wrap gap-3">
                    <button
                        type="button"
                        onClick={this.handleReload}
                        className="inline-flex items-center gap-2 bg-[var(--accent-red)] px-5 py-3 font-oxanium text-xs font-bold uppercase tracking-widest text-white transition-colors hover:bg-[#ff1e17] cursor-pointer"
                    >
                        <RotateCw size={14} aria-hidden="true" />
                        Reload Page
                    </button>
                    <a
                        href="/"
                        onClick={this.handleReset}
                        className="inline-flex items-center gap-2 border border-[var(--border-color)] bg-[var(--bg-darker)] px-5 py-3 font-oxanium text-xs font-bold uppercase tracking-widest text-[var(--text-secondary)] transition-colors hover:border-white hover:text-white"
                    >
                        <Home size={14} aria-hidden="true" />
                        Back to Home
                    </a>
                </div>
            </div>
        );
    }
}

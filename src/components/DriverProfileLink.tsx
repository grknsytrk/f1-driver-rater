import type { CSSProperties, MouseEvent, ReactNode } from 'react';
import { Link, useInRouterContext } from 'react-router-dom';

export interface DriverProfileLinkProps {
    season: string;
    driverId: string;
    onNavigate?: () => void;
    className?: string;
    style?: CSSProperties;
    title?: string;
    stopPropagation?: boolean;
    'aria-label'?: string;
    'data-testid'?: string;
    children: ReactNode;
}

export function DriverProfileLink({
    season,
    driverId,
    onNavigate,
    className,
    style,
    title,
    stopPropagation = false,
    'aria-label': ariaLabel,
    'data-testid': dataTestId,
    children,
}: DriverProfileLinkProps) {
    const inRouter = useInRouterContext();
    const href = `/${encodeURIComponent(season)}/driver/${encodeURIComponent(driverId)}`;

    const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
        if (stopPropagation) {
            event.stopPropagation();
        }
        // Let middle-click and modifier-clicks (Ctrl/Cmd/Shift/Alt) trigger native new-tab/window opening.
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
            return;
        }
        if (onNavigate) {
            event.preventDefault();
            onNavigate();
        }
    };

    const handleAuxClick = (event: MouseEvent<HTMLAnchorElement>) => {
        if (stopPropagation) {
            event.stopPropagation();
        }
    };

    if (inRouter) {
        return (
            <Link
                to={href}
                onClick={handleClick}
                onAuxClick={handleAuxClick}
                className={className}
                style={style}
                title={title}
                aria-label={ariaLabel}
                data-testid={dataTestId}
            >
                {children}
            </Link>
        );
    }

    return (
        <a
            href={href}
            onClick={handleClick}
            onAuxClick={handleAuxClick}
            className={className}
            style={style}
            title={title}
            aria-label={ariaLabel}
            data-testid={dataTestId}
        >
            {children}
        </a>
    );
}

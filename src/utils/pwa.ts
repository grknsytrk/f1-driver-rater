export interface ServiceWorkerContainerLike {
    register: (url: string, options?: RegistrationOptions) => Promise<ServiceWorkerRegistration>;
}

export interface RegisterServiceWorkerOptions {
    isProd?: boolean;
    swUrl?: string;
    nav?: { serviceWorker?: ServiceWorkerContainerLike } | null;
}

/**
 * Registers the PWA Service Worker cleanly in production builds without interrupting dev HMR or tests.
 */
export async function registerServiceWorker(
    options: RegisterServiceWorkerOptions = {},
): Promise<ServiceWorkerRegistration | null> {
    const isProd = options.isProd ?? Boolean(import.meta.env?.PROD);
    if (!isProd) {
        return null;
    }

    const nav = options.nav !== undefined
        ? options.nav
        : (typeof navigator !== 'undefined' ? navigator : null);

    if (!nav?.serviceWorker || typeof nav.serviceWorker.register !== 'function') {
        return null;
    }

    const swUrl = options.swUrl ?? '/sw.js';

    try {
        return await nav.serviceWorker.register(swUrl, { scope: '/' });
    } catch (error) {
        console.warn('Service worker registration failed:', error);
        return null;
    }
}

/**
 * Schedules Service Worker registration after initial window load in production.
 */
export function setupServiceWorkerRegistration(): void {
    if (!import.meta.env?.PROD || typeof window === 'undefined') {
        return;
    }

    if (document.readyState === 'complete') {
        void registerServiceWorker();
        return;
    }

    window.addEventListener(
        'load',
        () => {
            void registerServiceWorker();
        },
        { once: true },
    );
}

/* F1 Driver Rating Service Worker - Offline App Shell & Static Season Caching */

const APP_SHELL_CACHE = 'f1-rating-shell-v1';
const STATIC_ASSET_CACHE = 'f1-rating-assets-v1';
const DATA_CACHE = 'f1-rating-data-v1';

const ACTIVE_CACHES = new Set([
    APP_SHELL_CACHE,
    STATIC_ASSET_CACHE,
    DATA_CACHE,
]);

const PRECACHE_URLS = [
    '/',
    '/manifest.webmanifest',
    '/favicon.png',
    '/icons/icon-192.png',
    '/icons/icon-512.png',
];

const ARCHIVED_SEASON_BUNDLE_RE = /^\/data\/seasons\/(2018|2019|2020|2021|2022|2023|2024|2025)\.json$/;
const STATIC_IMMUTABLE_PREFIXES = ['/assets/', '/fonts/', '/images/', '/icons/'];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches
            .open(APP_SHELL_CACHE)
            .then((cache) => cache.addAll(PRECACHE_URLS))
            .catch(() => undefined)
            .finally(() => self.skipWaiting()),
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((keys) =>
                Promise.all(
                    keys
                        .filter((key) => key.startsWith('f1-rating-') && !ACTIVE_CACHES.has(key))
                        .map((key) => caches.delete(key)),
                ),
            )
            .then(() => self.clients.claim()),
    );
});

self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

async function cacheIfOk(cacheName, request, response) {
    if (response && response.ok && (response.type === 'basic' || response.type === 'cors')) {
        const cache = await caches.open(cacheName);
        await cache.put(request, response.clone());
    }
    return response;
}

async function cacheFirst(request, cacheName) {
    const cached = await caches.match(request);
    if (cached) {
        return cached;
    }
    const networkResponse = await fetch(request);
    return cacheIfOk(cacheName, request, networkResponse);
}

async function networkFirstWithCache(request, cacheName, fallbackUrl) {
    try {
        const networkResponse = await fetch(request);
        await cacheIfOk(cacheName, fallbackUrl ? fallbackUrl : request, networkResponse);
        return networkResponse;
    } catch {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (fallbackUrl) {
            const shellFallback = await caches.match(fallbackUrl);
            if (shellFallback) return shellFallback;
        }
        return Response.error();
    }
}

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

    // Never cache or intercept Supabase auth/RPC traffic
    if (url.hostname.endsWith('.supabase.co')) return;

    // Jolpica API: network-first with offline cache fallback
    if (url.hostname === 'api.jolpi.ca') {
        event.respondWith(networkFirstWithCache(request, DATA_CACHE));
        return;
    }

    if (url.origin !== self.location.origin) return;

    // SPA navigation routes fallback to cached '/' shell offline
    if (request.mode === 'navigate') {
        event.respondWith(networkFirstWithCache(request, APP_SHELL_CACHE, '/'));
        return;
    }

    const { pathname } = url;

    if (STATIC_IMMUTABLE_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
        event.respondWith(cacheFirst(request, STATIC_ASSET_CACHE));
        return;
    }

    if (ARCHIVED_SEASON_BUNDLE_RE.test(pathname)) {
        event.respondWith(cacheFirst(request, DATA_CACHE));
        return;
    }

    if (pathname.startsWith('/data/') || pathname === '/manifest.webmanifest' || pathname === '/favicon.png') {
        event.respondWith(networkFirstWithCache(request, DATA_CACHE));
    }
});

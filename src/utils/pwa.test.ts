import { describe, expect, it, vi } from 'vitest';
import indexHtml from '../../index.html?raw';
import vercelConfig from '../../vercel.json';
import manifestRaw from '../../public/manifest.webmanifest?raw';
import swSource from '../../public/sw.js?raw';
import { registerServiceWorker } from './pwa';

describe('PWA support & offline caching', () => {
    it('does not register a service worker outside production or when unsupported', async () => {
        const registerSpy = vi.fn();

        await expect(
            registerServiceWorker({ isProd: false, nav: { serviceWorker: { register: registerSpy } } }),
        ).resolves.toBeNull();
        expect(registerSpy).not.toHaveBeenCalled();

        await expect(registerServiceWorker({ isProd: true, nav: {} })).resolves.toBeNull();
    });

    it('registers /sw.js at root scope in production and handles rejected registration safely', async () => {
        const fakeRegistration = { scope: '/' } as ServiceWorkerRegistration;
        const registerSpy = vi.fn().mockResolvedValue(fakeRegistration);

        const reg = await registerServiceWorker({
            isProd: true,
            nav: { serviceWorker: { register: registerSpy } },
        });
        expect(registerSpy).toHaveBeenCalledWith('/sw.js', { scope: '/' });
        expect(reg).toBe(fakeRegistration);

        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            const failingRegister = vi.fn().mockRejectedValue(new Error('SW blocked'));
            const failed = await registerServiceWorker({
                isProd: true,
                nav: { serviceWorker: { register: failingRegister } },
            });
            expect(failed).toBeNull();
            expect(warnSpy).toHaveBeenCalledTimes(1);
        } finally {
            warnSpy.mockRestore();
        }
    });

    it('publishes a valid installable Web App Manifest and PWA head tags', () => {
        const manifest = JSON.parse(manifestRaw) as {
            name: string;
            short_name: string;
            start_url: string;
            display: string;
            theme_color: string;
            background_color: string;
            icons: Array<{ src: string; sizes: string; purpose?: string; type: string }>;
        };

        expect(manifest.name).toBe('F1 Driver Rating');
        expect(manifest.short_name).toBe('F1 Rating');
        expect(manifest.start_url).toBe('/');
        expect(manifest.display).toBe('standalone');
        expect(manifest.theme_color).toBe('#e10600');

        const sizes = manifest.icons.map(icon => `${icon.sizes}:${icon.purpose ?? 'any'}`);
        expect(sizes).toContain('192x192:any');
        expect(sizes).toContain('512x512:any');
        expect(sizes).toContain('512x512:maskable');

        expect(indexHtml).toMatch(/<link[^>]+rel="manifest"[^>]+href="\/manifest\.webmanifest"/);
        expect(indexHtml).toMatch(/<meta[^>]+name="apple-mobile-web-app-capable"[^>]+content="yes"/);
        expect(indexHtml).toMatch(/<meta[^>]+name="mobile-web-app-capable"[^>]+content="yes"/);
    });

    it('configures /sw.js and manifest headers in vercel.json and bypasses Supabase in sw.js', () => {
        const getHeaders = (source: string) =>
            vercelConfig.headers.find(entry => entry.source === source)?.headers ?? [];

        const swCache = getHeaders('/sw.js').find(kv => kv.key === 'Cache-Control')?.value;
        const swScope = getHeaders('/sw.js').find(kv => kv.key === 'Service-Worker-Allowed')?.value;
        const manifestType = getHeaders('/manifest.webmanifest').find(kv => kv.key === 'Content-Type')?.value;

        expect(swCache).toContain('no-cache');
        expect(swScope).toBe('/');
        expect(manifestType).toContain('application/manifest+json');

        expect(swSource).toContain('.supabase.co');
        expect(swSource).toContain("request.mode === 'navigate'");
        expect(swSource).toContain('/data/');
    });
});

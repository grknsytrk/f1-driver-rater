/**
 * prerender.mjs
 *
 * Post-build prerender script using Puppeteer.
 * Launches a local static server on the `dist/` folder, visits each indexable
 * route, waits for the app to render, then saves the resulting HTML snapshot.
 *
 * Run as: node scripts/prerender.mjs
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = resolve(__dirname, '..', 'dist');
const CURRENT_YEAR = new Date().getFullYear();
const START_YEAR = 2020;
const PORT = 4173;
const SPA_TEMPLATE_PATH = resolve(DIST_DIR, 'index.html');
const SPA_TEMPLATE_HTML = readFileSync(SPA_TEMPLATE_PATH, 'utf-8');
const SPA_HEAD_ASSET_TAGS = [
  ...(SPA_TEMPLATE_HTML.match(/<link rel="stylesheet"[^>]*>/g) ?? []),
];
const SPA_BODY_ASSET_TAGS = [
  ...(SPA_TEMPLATE_HTML.match(/<script type="module"[^>]*><\/script>/g) ?? []),
];

function restoreAssetTags(html) {
  let nextHtml = html;

  SPA_HEAD_ASSET_TAGS.forEach((tag) => {
    if (!nextHtml.includes(tag)) {
      nextHtml = nextHtml.replace('</head>', `${tag}</head>`);
    }
  });

  SPA_BODY_ASSET_TAGS.forEach((tag) => {
    if (!nextHtml.includes(tag)) {
      nextHtml = nextHtml.replace('</body>', `${tag}</body>`);
    }
  });

  return nextHtml;
}

/**
 * Build the list of routes to prerender.
 */
function getRoutes() {
  const routes = ['/'];
  for (let year = START_YEAR; year <= CURRENT_YEAR; year++) {
    routes.push(`/${year}`);
    routes.push(`/${year}/standings`);
    routes.push(`/${year}/teammate-wars`);
  }
  return routes;
}

/**
 * Create a simple static file server that falls back to index.html (SPA).
 */
function startServer() {
  return new Promise((res) => {
    const mimeTypes = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.png': 'image/png',
      '.svg': 'image/svg+xml',
      '.woff2': 'font/woff2',
      '.woff': 'font/woff',
      '.txt': 'text/plain',
      '.xml': 'application/xml',
    };

    const server = createServer((req, res2) => {
      let url = req.url || '/';
      if (url.includes('?')) url = url.split('?')[0];

      let filePath = resolve(DIST_DIR, '.' + url);
      if (!existsSync(filePath) || !filePath.includes('.')) {
        res2.writeHead(200, { 'Content-Type': 'text/html' });
        res2.end(SPA_TEMPLATE_HTML);
        return;
      }

      const ext = '.' + filePath.split('.').pop();
      const contentType = mimeTypes[ext] || 'application/octet-stream';

      try {
        const data = readFileSync(filePath);
        res2.writeHead(200, { 'Content-Type': contentType });
        res2.end(data);
      } catch {
        res2.writeHead(404);
        res2.end('Not found');
      }
    });

    server.listen(PORT, () => {
      console.log(`📦  Static server running at http://localhost:${PORT}`);
      res(server);
    });
  });
}

/**
 * Main prerender logic.
 */
async function prerender() {
  let puppeteer;
  try {
    puppeteer = await import('puppeteer');
  } catch {
    console.warn(
      '⚠️  Puppeteer not installed. Skipping prerender. Install with: npm i -D puppeteer'
    );
    console.log('ℹ️  Falling back to basic indexing mode (SPA only).');
    return;
  }

  const server = await startServer();
  const browser = await puppeteer.default.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const routes = getRoutes();
  console.log(`\n🚀  Prerendering ${routes.length} routes...\n`);

  for (const route of routes) {
    const page = await browser.newPage();
    const url = `http://localhost:${PORT}${route}`;

    try {
      await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });

      // Wait for React Router + Helmet to settle on the requested route.
      await page.waitForFunction(
        (expectedRoute) => {
          const root = document.querySelector('#root');
          if (!root || root.childElementCount === 0) return false;

          const canonical = document.querySelector('link[rel="canonical"]');
          if (!canonical) return false;

          try {
            return new URL(canonical.href).pathname === expectedRoute;
          } catch {
            return false;
          }
        },
        { timeout: 15000 },
        route
      );

      // Give animations a moment to settle
      await new Promise((r) => setTimeout(r, 500));

      const html = restoreAssetTags(await page.content());

      // Determine output path
      const routePath = route === '/' ? '/index.html' : `${route}/index.html`;
      const outPath = resolve(DIST_DIR, '.' + routePath);
      const outDir = dirname(outPath);

      if (!existsSync(outDir)) {
        mkdirSync(outDir, { recursive: true });
      }

      writeFileSync(outPath, html, 'utf-8');
      console.log(`  ✅  ${route}  →  ${routePath}`);
    } catch (err) {
      console.error(`  ❌  ${route}  →  ${err.message}`);
    } finally {
      await page.close();
    }
  }

  await browser.close();
  server.close();
  console.log('\n🎉  Prerender complete!\n');
}

prerender();

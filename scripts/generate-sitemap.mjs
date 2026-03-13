/**
 * generate-sitemap.mjs
 *
 * Generates sitemap.xml with all indexable routes.
 * Runs as: node scripts/generate-sitemap.mjs
 */

import { existsSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SITE_URL = 'https://f1-driver-rater.vercel.app';
const CURRENT_YEAR = new Date().getFullYear();
const START_YEAR = 2020;

// Build date for lastmod
const BUILD_DATE = new Date().toISOString().split('T')[0];

function generateSitemap() {
  const urls = [];

  // Home
  urls.push({ loc: SITE_URL, priority: '1.0', changefreq: 'weekly' });

  // Season landing pages
  for (let year = START_YEAR; year <= CURRENT_YEAR; year++) {
    urls.push({
      loc: `${SITE_URL}/${year}`,
      priority: year === CURRENT_YEAR ? '0.9' : '0.7',
      changefreq: year === CURRENT_YEAR ? 'weekly' : 'monthly',
    });
  }

  // Keep only current season's secondary SEO pages to reduce sitemap size.
  urls.push({
    loc: `${SITE_URL}/${CURRENT_YEAR}/standings`,
    priority: '0.6',
    changefreq: 'weekly',
  });
  urls.push({
    loc: `${SITE_URL}/${CURRENT_YEAR}/teammate-wars`,
    priority: '0.6',
    changefreq: 'weekly',
  });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${BUILD_DATE}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`
  )
  .join('\n')}
</urlset>
`;

  const publicOutPath = resolve(__dirname, '..', 'public', 'sitemap.xml');
  writeFileSync(publicOutPath, xml, 'utf-8');

  const logs = [publicOutPath];
  const distDir = resolve(__dirname, '..', 'dist');
  if (existsSync(distDir)) {
    const distOutPath = resolve(distDir, 'sitemap.xml');
    writeFileSync(distOutPath, xml, 'utf-8');
    logs.push(distOutPath);
  }

  console.log(`✅  sitemap.xml generated (${urls.length} URLs):`);
  logs.forEach((path) => console.log(`   - ${path}`));
}

generateSitemap();

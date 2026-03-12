/**
 * generate-sitemap.mjs
 *
 * Generates sitemap.xml at build time with all indexable routes.
 * Runs as: node scripts/generate-sitemap.mjs
 */

import { writeFileSync } from 'node:fs';
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

  // Season pages + per-season sub-pages
  for (let year = START_YEAR; year <= CURRENT_YEAR; year++) {
    urls.push({
      loc: `${SITE_URL}/${year}`,
      priority: year === CURRENT_YEAR ? '0.9' : '0.7',
      changefreq: year === CURRENT_YEAR ? 'weekly' : 'monthly',
    });
    urls.push({
      loc: `${SITE_URL}/${year}/standings`,
      priority: '0.6',
      changefreq: 'monthly',
    });
    urls.push({
      loc: `${SITE_URL}/${year}/teammate-wars`,
      priority: '0.6',
      changefreq: 'monthly',
    });
  }

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

  const outPath = resolve(__dirname, '..', 'dist', 'sitemap.xml');
  writeFileSync(outPath, xml, 'utf-8');
  console.log(`✅  sitemap.xml generated → ${outPath}  (${urls.length} URLs)`);
}

generateSitemap();

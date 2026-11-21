/**
 * generate-sitemap.mjs
 *
 * Generates sitemap files with all indexable routes.
 * Runs as: node scripts/generate-sitemap.mjs
 */

import { existsSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSeasonDriversMap } from './season-drivers.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SITE_URL = 'https://f1-driver-rater.vercel.app';
const SITEMAP_FILES = ['sitemap.xml', 'sitemap-main.xml'];
const START_YEAR = 2018;
const CURRENT_YEAR = new Date().getFullYear();

function generateSitemap() {
  // Keep the XML minimal because this format already validates in Search Console.
  const urls = [{ loc: `${SITE_URL}/`, priority: '1.0', changefreq: 'weekly' }];

  for (let year = START_YEAR; year <= CURRENT_YEAR; year += 1) {
    const isCurrent = year === CURRENT_YEAR;
    urls.push({
      loc: `${SITE_URL}/${year}`,
      priority: isCurrent ? '0.9' : '0.7',
      changefreq: isCurrent ? 'weekly' : 'monthly',
    });
    urls.push({
      loc: `${SITE_URL}/${year}/standings`,
      priority: '0.6',
      changefreq: isCurrent ? 'weekly' : 'monthly',
    });
    urls.push({
      loc: `${SITE_URL}/${year}/teammate-wars`,
      priority: '0.6',
      changefreq: isCurrent ? 'weekly' : 'monthly',
    });
    urls.push({
      loc: `${SITE_URL}/${year}/awards`,
      priority: '0.6',
      changefreq: isCurrent ? 'weekly' : 'monthly',
    });

    for (const driverId of getSeasonDriversMap(year).keys()) {
      urls.push({
        loc: `${SITE_URL}/${year}/driver/${encodeURIComponent(driverId)}`,
        priority: isCurrent ? '0.6' : '0.5',
        changefreq: isCurrent ? 'weekly' : 'monthly',
      });
    }
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) => `  <url>
    <loc>${u.loc}</loc>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`
  )
  .join('\n')}
</urlset>
`;

  const logs = [];
  for (const filename of SITEMAP_FILES) {
    const publicOutPath = resolve(__dirname, '..', 'public', filename);
    writeFileSync(publicOutPath, xml, 'utf-8');
    logs.push(publicOutPath);
  }

  const distDir = resolve(__dirname, '..', 'dist');
  if (existsSync(distDir)) {
    for (const filename of SITEMAP_FILES) {
      const distOutPath = resolve(distDir, filename);
      writeFileSync(distOutPath, xml, 'utf-8');
      logs.push(distOutPath);
    }
  }

  console.log(`✅  sitemap files generated (${urls.length} URLs):`);
  logs.forEach((path) => console.log(`   - ${path}`));
}

generateSitemap();

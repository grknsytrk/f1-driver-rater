/**
 * generate-sitemap.mjs
 *
 * Generates sitemap files with all indexable routes.
 * Runs as: node scripts/generate-sitemap.mjs
 */

import { existsSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SITE_URL = 'https://f1-driver-rater.vercel.app';
const SITEMAP_FILES = ['sitemap.xml', 'sitemap-main.xml'];
const START_YEAR = 2020;
const CURRENT_YEAR = new Date().getFullYear();

function generateSitemap() {
  // Keep the XML minimal because this format already validates in Search Console.
  const urls = [{ loc: `${SITE_URL}/`, priority: '1.0', changefreq: 'weekly' }];

  for (let year = START_YEAR; year <= CURRENT_YEAR; year += 1) {
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

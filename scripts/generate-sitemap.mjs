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

function generateSitemap() {
  const urls = [{ loc: `${SITE_URL}/`, priority: '1.0', changefreq: 'weekly' }];

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

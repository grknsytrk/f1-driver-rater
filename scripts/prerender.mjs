/**
 * Build-time static prerender for route-specific SEO metadata.
 *
 * We only need public route HTML snapshots so crawlers/social bots receive the
 * correct head tags without executing React on the client.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = resolve(__dirname, '..', 'dist');
const CURRENT_YEAR = new Date().getFullYear();
const START_YEAR = 2020;
const SITE_URL = 'https://f1-driver-rater.vercel.app';
const SITE_NAME = 'F1 Driver Rating';
const DEFAULT_OG_IMAGE = `${SITE_URL}/og-image.png`;
const DEFAULT_OG_IMAGE_ALT = 'F1 Driver Rating share card';
const SPA_TEMPLATE_PATH = resolve(DIST_DIR, 'index.html');
const SPA_TEMPLATE_HTML = readFileSync(SPA_TEMPLATE_PATH, 'utf-8');

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function getRoutes() {
  const routes = ['/'];

  for (let year = START_YEAR; year <= CURRENT_YEAR; year++) {
    routes.push(`/${year}`);
    routes.push(`/${year}/standings`);
    routes.push(`/${year}/teammate-wars`);
  }

  return routes;
}

function getHomeJsonLd() {
  const websiteSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: SITE_URL,
    description:
      'The ultimate F1 driver rater. Rate drivers race-by-race, create tier lists, view season standings, and compare teammates head-to-head.',
    potentialAction: {
      '@type': 'SearchAction',
      target: `${SITE_URL}/{season}`,
      'query-input': 'required name=season',
    },
  };

  const appSchema = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: SITE_NAME,
    url: SITE_URL,
    description:
      'Rate Formula 1 drivers race-by-race, create driver tier lists and power rankings, and track season standings.',
    applicationCategory: 'SportsApplication',
    operatingSystem: 'All',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
    author: {
      '@type': 'Person',
      name: 'F1 Driver Rating Team',
    },
  };

  return [
    `<script type="application/ld+json">${JSON.stringify(websiteSchema)}</script>`,
    `<script type="application/ld+json">${JSON.stringify(appSchema)}</script>`,
  ].join('\n');
}

function getSeoConfig(route) {
  if (route === '/') {
    return {
      title: 'F1 Driver Rating – Rate & Rank F1 Drivers by Season',
      description:
        'The ultimate F1 driver rater and tier list maker. Rate Formula 1 drivers race-by-race, create your own power rankings, view season standings, and compare teammates head-to-head.',
      path: '/',
      keywords:
        'f1 driver rater, f1 tier list, formula 1 driver ranking, rate f1 drivers, f1 power rankings, f1 driver tier list, best f1 drivers, f1 season standings, f1 teammate comparison, race by race rating, formula one driver rater',
      extraHead: getHomeJsonLd(),
    };
  }

  const match = route.match(/^\/(\d{4})(?:\/(standings|teammate-wars))?$/);
  if (!match) {
    return null;
  }

  const [, season, page] = match;

  if (!page) {
    return {
      title: `F1 ${season} Driver Ratings – Race-by-Race Tier List`,
      description: `Rate and rank every driver from the ${season} Formula 1 season race-by-race. Create your personal F1 ${season} driver tier list and power rankings.`,
      path: route,
      keywords: `f1 ${season}, formula 1 ${season} driver ratings, f1 ${season} tier list, rate f1 drivers ${season}, f1 ${season} power rankings, best f1 driver ${season}, f1 driver rater`,
    };
  }

  if (page === 'standings') {
    return {
      title: `F1 ${season} Standings – Driver & Constructor Rankings`,
      description: `F1 ${season} driver and constructor championship standings. Track points, wins, and positions throughout the Formula 1 ${season} season.`,
      path: route,
      keywords: `f1 ${season} standings, f1 ${season} championship, driver standings ${season}, constructor standings ${season}, f1 points ${season}, formula 1 ${season} rankings`,
    };
  }

  return {
    title: `F1 ${season} Teammate Wars – Head-to-Head Comparison`,
    description: `F1 ${season} teammate head-to-head battle. Compare qualifying pace, race results, and overall ratings between teammates. Who won the intra-team war?`,
    path: route,
    keywords: `f1 ${season} teammates, f1 teammate comparison, head to head f1 ${season}, teammate battle, f1 intra-team rivalry, who is better f1 ${season}`,
  };
}

function buildHeadMarkup(route) {
  const seo = getSeoConfig(route);

  if (!seo) {
    return '';
  }

  const canonicalUrl = `${SITE_URL}${seo.path === '/' ? '' : seo.path}`;
  const fullTitle = seo.path === '/' ? seo.title : `${seo.title} | ${SITE_NAME}`;
  const escapedTitle = escapeHtml(fullTitle);
  const escapedDescription = escapeHtml(seo.description);
  const escapedCanonicalUrl = escapeHtml(canonicalUrl);
  const escapedSiteName = escapeHtml(SITE_NAME);
  const escapedOgImage = escapeHtml(DEFAULT_OG_IMAGE);
  const escapedOgImageAlt = escapeHtml(DEFAULT_OG_IMAGE_ALT);
  const metaTags = [
    `<title>${escapedTitle}</title>`,
    `<meta name="description" content="${escapedDescription}" />`,
    `<link rel="canonical" href="${escapedCanonicalUrl}" />`,
    seo.keywords ? `<meta name="keywords" content="${escapeHtml(seo.keywords)}" />` : '',
    '<meta name="robots" content="index,follow" />',
    `<meta name="application-name" content="${escapedSiteName}" />`,
    `<meta name="apple-mobile-web-app-title" content="${escapedSiteName}" />`,
    '<meta property="og:type" content="website" />',
    `<meta property="og:site_name" content="${escapedSiteName}" />`,
    `<meta property="og:title" content="${escapedTitle}" />`,
    `<meta property="og:description" content="${escapedDescription}" />`,
    `<meta property="og:url" content="${escapedCanonicalUrl}" />`,
    `<meta property="og:image" content="${escapedOgImage}" />`,
    `<meta property="og:image:alt" content="${escapedOgImageAlt}" />`,
    '<meta name="twitter:card" content="summary_large_image" />',
    `<meta name="twitter:title" content="${escapedTitle}" />`,
    `<meta name="twitter:description" content="${escapedDescription}" />`,
    `<meta name="twitter:url" content="${escapedCanonicalUrl}" />`,
    `<meta name="twitter:image" content="${escapedOgImage}" />`,
    `<meta name="twitter:image:alt" content="${escapedOgImageAlt}" />`,
    seo.extraHead ?? '',
  ].filter(Boolean);

  return metaTags.join('\n');
}

function injectHead(html, route) {
  const headMarkup = buildHeadMarkup(route);

  if (!headMarkup) {
    return html;
  }

  return html.replace('</head>', `${headMarkup}\n</head>`);
}

function writeSnapshot(route, html) {
  const routePath = route === '/' ? '/index.html' : `${route}/index.html`;
  const outPath = resolve(DIST_DIR, '.' + routePath);
  const outDir = dirname(outPath);

  if (!existsSync(outDir)) {
    mkdirSync(outDir, { recursive: true });
  }

  writeFileSync(outPath, html, 'utf-8');
  console.log(`  ✅  ${route}  →  ${routePath}`);
}

function prerender() {
  const routes = getRoutes();
  console.log(`\n🚀  Writing static SEO snapshots for ${routes.length} routes...\n`);

  for (const route of routes) {
    writeSnapshot(route, injectHead(SPA_TEMPLATE_HTML, route));
  }

  console.log('\n🎉  Static SEO snapshot generation complete!\n');
}

prerender();

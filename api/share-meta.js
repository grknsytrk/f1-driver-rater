import { escapeHtml, resolveShareSnapshot, SITE_URL } from './_shareResolver.js';

export const config = {
    runtime: 'edge',
};

export default async function handler(request) {
    const url = new URL(request.url);
    const id = url.searchParams.get('id') || '';
    const snapshot = await resolveShareSnapshot(id);

    const safeId = encodeURIComponent(id);
    const shareUrl = `${SITE_URL}/share/${safeId}`;
    const ogImageUrl = snapshot
        ? `${SITE_URL}/api/og?id=${safeId}`
        : `${SITE_URL}/og-image.png`;

    const title = snapshot
        ? `${snapshot.season} ${snapshot.mode === 'community' ? 'Community' : 'Personal'} F1 Rankings | F1 Driver Rating`
        : 'Shared Season Rankings | F1 Driver Rating';

    const topSummary = snapshot && snapshot.drivers.length > 0
        ? snapshot.drivers
            .slice(0, 3)
            .map((driver, idx) => `${idx + 1}. ${driver.driverName} (${Number(driver.averageRating).toFixed(2)})`)
            .join(' · ')
        : 'Explore interactive Formula 1 season driver ratings on F1 Driver Rating.';

    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(topSummary)}" />
  <meta name="robots" content="noindex,follow" />
  <link rel="canonical" href="${escapeHtml(shareUrl)}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="F1 Driver Rating" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(topSummary)}" />
  <meta property="og:url" content="${escapeHtml(shareUrl)}" />
  <meta property="og:image" content="${escapeHtml(ogImageUrl)}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="${escapeHtml(topSummary)}" />
  <meta name="twitter:image" content="${escapeHtml(ogImageUrl)}" />
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <p>${escapeHtml(topSummary)}</p>
  <p><a href="${escapeHtml(shareUrl)}">Open Interactive Rankings</a></p>
</body>
</html>`;

    return new Response(html, {
        status: 200,
        headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'public, max-age=300, s-maxage=3600',
        },
    });
}

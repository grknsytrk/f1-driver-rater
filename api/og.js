import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { getTeamColor, resolveShareSnapshot } from './_shareResolver.js';

const FONT_PATH = fileURLToPath(new URL('./_fonts/Geist-Regular.ttf', import.meta.url));
const CACHE_CONTROL_HEADER = 'public, s-maxage=3600, stale-while-revalidate=86400';
const HEX_COLOR_RE = /^#[0-9a-fA-F]{3,8}$/;

function escapeXml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function truncateText(value, maxLength) {
    const text = String(value ?? '').trim();
    if (text.length <= maxLength) return text;
    return `${text.slice(0, maxLength - 1).trimEnd()}…`;
}

function safeColor(color, fallback = '#E10600') {
    return typeof color === 'string' && HEX_COLOR_RE.test(color) ? color : fallback;
}

function renderDriverRowSvg(driver, rank, x, y, width) {
    const rowHeight = 70;
    const isTop3 = rank <= 3;
    const rankColor = rank === 1 ? '#FFD700' : rank === 2 ? '#C6CCD5' : rank === 3 ? '#CD7F32' : '#71717A';
    const teamColor = safeColor(getTeamColor(driver.constructorId), '#6B7280');
    const rowFill = isTop3 ? 'rgba(255,255,255,0.045)' : 'rgba(255,255,255,0.018)';
    const scoreColor = isTop3 ? '#FFD700' : '#FFFFFF';
    const driverName = escapeXml(truncateText(String(driver.driverName || driver.driverId).toUpperCase(), 22));
    const constructorName = escapeXml(truncateText(String(driver.constructorName || 'Unknown').toUpperCase(), 28));
    const score = escapeXml(Number(driver.averageRating || 0).toFixed(2));

    return `
        <g>
            <rect x="${x}" y="${y}" width="${width}" height="${rowHeight}" fill="${rowFill}" />
            <rect x="${x}" y="${y}" width="5" height="${rowHeight}" fill="${teamColor}" />
            <rect x="${x}" y="${y + rowHeight - 1}" width="${width}" height="1" fill="rgba(255,255,255,0.07)" />
            <text x="${x + 20}" y="${y + 43}" font-size="21" font-weight="700" fill="${rankColor}">P${rank}</text>
            <text x="${x + 76}" y="${y + 33}" font-size="20" font-weight="700" fill="#FFFFFF" letter-spacing="0.5">${driverName}</text>
            <text x="${x + 76}" y="${y + 53}" font-size="11.5" fill="#8E9196" letter-spacing="1.2">${constructorName}</text>
            <text x="${x + width - 18}" y="${y + 44}" text-anchor="end" font-size="24" font-weight="700" fill="${scoreColor}">${score}</text>
        </g>
    `;
}

function buildRankedCardSvg(snapshot) {
    const topDrivers = snapshot.drivers.slice(0, 10);
    const leftCol = topDrivers.slice(0, 5);
    const rightCol = topDrivers.slice(5, 10);
    const subtitle = snapshot.mode === 'community' ? 'COMMUNITY DRIVER RATINGS' : 'PERSONAL DRIVER RATINGS';
    const racesLabel = snapshot.source === 'quick'
        ? 'QUICK RATE SEASON GRID'
        : `${snapshot.ratedRaces} RACES RATED`;
    const headerSub = escapeXml(`${subtitle} · ${racesLabel}`);
    const headerTitle = escapeXml(`${snapshot.season} SEASON RANKINGS`);

    const colWidth = 534;
    const rowStep = 80;
    const startY = 152;

    const leftRows = leftCol
        .map((driver, idx) => renderDriverRowSvg(driver, idx + 1, 52, startY + idx * rowStep, colWidth))
        .join('');
    const rightRows = rightCol
        .map((driver, idx) => renderDriverRowSvg(driver, idx + 6, 614, startY + idx * rowStep, colWidth))
        .join('');

    return `
        <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" font-family="Geist, sans-serif">
            <defs>
                <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#0A0A0B" />
                    <stop offset="55%" stop-color="#141418" />
                    <stop offset="100%" stop-color="#0A0A0B" />
                </linearGradient>
            </defs>
            <rect width="1200" height="630" fill="url(#bgGrad)" />
            <rect x="0" y="0" width="1200" height="8" fill="#E10600" />
            <rect x="52" y="42" width="6" height="82" fill="#E10600" />
            <text x="76" y="64" font-size="14.5" font-weight="700" fill="#E10600" letter-spacing="3.5">${headerSub}</text>
            <text x="76" y="116" font-size="48" font-weight="700" fill="#FFFFFF" letter-spacing="-0.5">${headerTitle}</text>
            <text x="1148" y="112" text-anchor="end" font-size="15" font-weight="700" fill="#8E9196" letter-spacing="3">F1 DRIVER RATING</text>
            ${leftRows}
            ${rightRows}
            <line x1="52" y1="566" x2="1148" y2="566" stroke="#22242A" stroke-width="1" />
            <text x="52" y="598" font-size="13.5" fill="#6B7280" letter-spacing="2.2">TOP ${topDrivers.length} GRID RATINGS</text>
            <text x="1148" y="598" text-anchor="end" font-size="13.5" fill="#6B7280" letter-spacing="2.2">F1-DRIVER-RATER.VERCEL.APP</text>
        </svg>
    `;
}

function buildFallbackCardSvg() {
    return `
        <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" font-family="Geist, sans-serif">
            <defs>
                <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#0A0A0B" />
                    <stop offset="55%" stop-color="#141418" />
                    <stop offset="100%" stop-color="#0A0A0B" />
                </linearGradient>
            </defs>
            <rect width="1200" height="630" fill="url(#bgGrad)" />
            <rect x="0" y="0" width="1200" height="8" fill="#E10600" />
            <rect x="64" y="190" width="6" height="162" fill="#E10600" />
            <text x="92" y="216" font-size="18" font-weight="700" fill="#E10600" letter-spacing="4.5">FORMULA 1 TELEMETRY</text>
            <text x="92" y="288" font-size="64" font-weight="700" fill="#FFFFFF" letter-spacing="-1">F1 DRIVER RATING</text>
            <text x="92" y="340" font-size="23" fill="#9CA3AF">Race-by-race driver ratings, championship rankings &amp; teammate comparisons.</text>
            <line x1="64" y1="538" x2="1136" y2="538" stroke="#23252A" stroke-width="1" />
            <text x="64" y="578" font-size="16" fill="#6B7280" letter-spacing="2.5">F1-DRIVER-RATER.VERCEL.APP</text>
            <text x="1136" y="578" text-anchor="end" font-size="16" font-weight="700" fill="#E10600" letter-spacing="2.5">SEASON RANKINGS</text>
        </svg>
    `;
}

function renderSvgToPng(svg) {
    const resvg = new Resvg(svg, {
        fitTo: { mode: 'width', value: 1200 },
        font: {
            fontFiles: [FONT_PATH],
            loadSystemFonts: false,
            defaultFontFamily: 'Geist',
            sansSerifFamily: 'Geist',
        },
    });
    return resvg.render().asPng();
}

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id') || '';
        const snapshot = await resolveShareSnapshot(id);
        const svg = snapshot ? buildRankedCardSvg(snapshot) : buildFallbackCardSvg();
        const pngBuffer = renderSvgToPng(svg);

        return new Response(pngBuffer, {
            status: 200,
            headers: {
                'Content-Type': 'image/png',
                'Cache-Control': CACHE_CONTROL_HEADER,
            },
        });
    } catch {
        const fallbackPng = renderSvgToPng(buildFallbackCardSvg());
        return new Response(fallbackPng, {
            status: 200,
            headers: {
                'Content-Type': 'image/png',
                'Cache-Control': 'no-store',
            },
        });
    }
}

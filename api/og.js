import { ImageResponse } from '@vercel/og';
import { getTeamColor, resolveShareSnapshot } from './_shareResolver.js';

export const config = {
    runtime: 'edge',
};

function el(type, style, children) {
    return {
        type,
        props: {
            style,
            children,
        },
    };
}

function buildDriverRow(driver, rank) {
    const isTop3 = rank <= 3;
    const rankColor = rank === 1 ? '#FFD700' : rank === 2 ? '#C6CCD5' : rank === 3 ? '#CD7F32' : '#71717A';
    const teamColor = getTeamColor(driver.constructorId);

    return el(
        'div',
        {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 14px',
            backgroundColor: isTop3 ? 'rgba(255,255,255,0.045)' : 'rgba(255,255,255,0.015)',
            borderLeft: `4px solid ${teamColor}`,
            borderBottom: '1px solid rgba(255,255,255,0.06)',
        },
        [
            el('div', { display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }, [
                el(
                    'span',
                    {
                        width: '28px',
                        fontSize: '20px',
                        fontWeight: 800,
                        color: rankColor,
                    },
                    `P${rank}`,
                ),
                el('div', { display: 'flex', flexDirection: 'column', minWidth: 0 }, [
                    el(
                        'span',
                        {
                            fontSize: '19px',
                            fontWeight: 700,
                            color: '#FFFFFF',
                            textTransform: 'uppercase',
                            letterSpacing: '0.02em',
                        },
                        driver.driverName,
                    ),
                    el(
                        'span',
                        {
                            fontSize: '11px',
                            color: '#8E9196',
                            textTransform: 'uppercase',
                            letterSpacing: '0.08em',
                        },
                        driver.constructorName,
                    ),
                ]),
            ]),
            el(
                'span',
                {
                    fontSize: '22px',
                    fontWeight: 800,
                    color: isTop3 ? '#FFD700' : '#FFFFFF',
                },
                Number(driver.averageRating).toFixed(2),
            ),
        ],
    );
}

function renderFallbackCard() {
    return el(
        'div',
        {
            width: '1200px',
            height: '630px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            backgroundColor: '#0A0A0B',
            color: '#FFFFFF',
            padding: '56px 64px',
            borderTop: '8px solid #E10600',
            fontFamily: 'sans-serif',
        },
        [
            el('div', { display: 'flex', flexDirection: 'column', borderLeft: '6px solid #E10600', paddingLeft: '24px' }, [
                el('span', { fontSize: '18px', letterSpacing: '0.28em', color: '#E10600', fontWeight: 700 }, 'FORMULA 1 TELEMETRY'),
                el('span', { fontSize: '68px', fontWeight: 900, marginTop: '10px', letterSpacing: '-0.02em' }, 'F1 DRIVER RATING'),
                el('span', { fontSize: '24px', color: '#9CA3AF', marginTop: '14px' }, 'Race-by-race driver ratings, championship rankings & teammate comparisons.'),
            ]),
            el('div', { display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #23252A', paddingTop: '20px', fontSize: '16px', color: '#6B7280', letterSpacing: '0.15em' }, [
                el('span', {}, 'F1-DRIVER-RATER.VERCEL.APP'),
                el('span', { color: '#E10600', fontWeight: 700 }, 'SEASON RANKINGS'),
            ]),
        ],
    );
}

export default async function handler(request) {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id') || '';
    const snapshot = await resolveShareSnapshot(id);

    const card = snapshot
        ? (() => {
            const topDrivers = snapshot.drivers.slice(0, 10);
            const leftCol = topDrivers.slice(0, 5);
            const rightCol = topDrivers.slice(5, 10);
            const subtitle = snapshot.mode === 'community' ? 'COMMUNITY DRIVER RATINGS' : 'PERSONAL DRIVER RATINGS';
            const racesLabel = snapshot.source === 'quick'
                ? 'QUICK RATE SEASON GRID'
                : `${snapshot.ratedRaces} RACES RATED`;

            return el(
                'div',
                {
                    width: '1200px',
                    height: '630px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    backgroundColor: '#0A0A0B',
                    color: '#FFFFFF',
                    padding: '40px 52px 34px',
                    borderTop: '8px solid #E10600',
                    fontFamily: 'sans-serif',
                },
                [
                    el('div', { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '22px' }, [
                        el('div', { display: 'flex', flexDirection: 'column', borderLeft: '6px solid #E10600', paddingLeft: '20px' }, [
                            el(
                                'span',
                                { fontSize: '14px', letterSpacing: '0.26em', color: '#E10600', fontWeight: 700 },
                                `${subtitle} · ${racesLabel}`,
                            ),
                            el(
                                'span',
                                { fontSize: '52px', fontWeight: 900, lineHeight: 1.05, marginTop: '6px' },
                                `${snapshot.season} SEASON RANKINGS`,
                            ),
                        ]),
                        el(
                            'span',
                            { fontSize: '15px', letterSpacing: '0.2em', color: '#8E9196', fontWeight: 700 },
                            'F1 DRIVER RATING',
                        ),
                    ]),

                    el('div', { display: 'flex', gap: '24px', flex: 1 }, [
                        el('div', { display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 },
                            leftCol.map((driver, idx) => buildDriverRow(driver, idx + 1)),
                        ),
                        el('div', { display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 },
                            rightCol.map((driver, idx) => buildDriverRow(driver, idx + 6)),
                        ),
                    ]),

                    el('div', {
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        borderTop: '1px solid #22242A',
                        paddingTop: '14px',
                        marginTop: '14px',
                        fontSize: '13px',
                        color: '#6B7280',
                        letterSpacing: '0.16em',
                    }, [
                        el('span', {}, `TOP ${topDrivers.length} GRID RATINGS`),
                        el('span', {}, 'F1-DRIVER-RATER.VERCEL.APP'),
                    ]),
                ],
            );
        })()
        : renderFallbackCard();

    return new ImageResponse(card, {
        width: 1200,
        height: 630,
        headers: {
            'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
        },
    });
}

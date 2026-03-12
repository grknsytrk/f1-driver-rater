import { Helmet } from 'react-helmet-async';

const SITE_URL = 'https://f1-driver-rater.vercel.app';

/**
 * JSON-LD structured data for the home page.
 * Includes WebSite + SoftwareApplication schemas.
 */
export function HomeJsonLd() {
  const websiteSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'F1 Driver Rating',
    url: SITE_URL,
    description:
      'Rate F1 drivers race-by-race, view season standings, and compare teammates head-to-head.',
    potentialAction: {
      '@type': 'SearchAction',
      target: `${SITE_URL}/{season}`,
      'query-input': 'required name=season',
    },
  };

  const appSchema = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'F1 Driver Rating',
    url: SITE_URL,
    description:
      'A web application to rate Formula 1 drivers race-by-race and track season standings.',
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

  return (
    <Helmet>
      <script type="application/ld+json">
        {JSON.stringify(websiteSchema)}
      </script>
      <script type="application/ld+json">
        {JSON.stringify(appSchema)}
      </script>
    </Helmet>
  );
}

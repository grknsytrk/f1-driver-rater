import { Helmet } from 'react-helmet-async';
import { DEFAULT_OG_IMAGE, SITE_ALTERNATE_NAME, SITE_NAME, SITE_URL } from './SEOHead';

/**
 * JSON-LD structured data for the home page.
 * Includes WebSite + SoftwareApplication schemas.
 */
export function HomeJsonLd() {
  const websiteSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    alternateName: SITE_ALTERNATE_NAME,
    url: SITE_URL,
    description:
      'The ultimate F1 driver rater and rating tracker. Rate drivers race-by-race, create tier lists, view season standings, and compare teammates head-to-head.',
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
    alternateName: SITE_ALTERNATE_NAME,
    url: SITE_URL,
    description:
      'Rate Formula 1 drivers race-by-race, create driver ratings and tier lists, build power rankings, and track season standings.',
    applicationCategory: 'SportsApplication',
    operatingSystem: 'All',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
    author: {
      '@type': 'Person',
      name: `${SITE_NAME} Team`,
    },
  };

  const organizationSchema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    alternateName: SITE_ALTERNATE_NAME,
    url: SITE_URL,
    logo: DEFAULT_OG_IMAGE,
  };

  return (
    <Helmet>
      <script type="application/ld+json">
        {JSON.stringify(websiteSchema)}
      </script>
      <script type="application/ld+json">
        {JSON.stringify(appSchema)}
      </script>
      <script type="application/ld+json">
        {JSON.stringify(organizationSchema)}
      </script>
    </Helmet>
  );
}

import { Helmet } from 'react-helmet-async';

const SITE_URL = 'https://f1-driver-rater.vercel.app';
const SITE_NAME = 'F1 Driver Rating';
const DEFAULT_OG_IMAGE = `${SITE_URL}/og-image.png`;
const DEFAULT_OG_IMAGE_ALT = 'F1 Driver Rating share card';
const DEFAULT_DESCRIPTION =
  'Rate F1 drivers race-by-race, view season standings, and compare teammates head-to-head. Your personal Formula 1 driver rating tracker.';

interface SEOHeadProps {
  title: string;
  description?: string;
  path?: string;
  noindex?: boolean;
  keywords?: string;
}

export function SEOHead({
  title,
  description = DEFAULT_DESCRIPTION,
  path = '/',
  noindex = false,
  keywords,
}: SEOHeadProps) {
  const canonicalUrl = `${SITE_URL}${path === '/' ? '' : path}`;
  const fullTitle = path === '/' ? title : `${title} | ${SITE_NAME}`;

  return (
    <Helmet>
      {/* Primary */}
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={canonicalUrl} />
      {keywords && <meta name="keywords" content={keywords} />}

      {/* Robots */}
      {noindex ? (
        <meta name="robots" content="noindex,follow" />
      ) : (
        <meta name="robots" content="index,follow" />
      )}

      {/* Open Graph */}
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={canonicalUrl} />
      <meta
        property="og:image"
        content={DEFAULT_OG_IMAGE}
      />
      <meta property="og:image:alt" content={DEFAULT_OG_IMAGE_ALT} />

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:url" content={canonicalUrl} />
      <meta
        name="twitter:image"
        content={DEFAULT_OG_IMAGE}
      />
      <meta name="twitter:image:alt" content={DEFAULT_OG_IMAGE_ALT} />
    </Helmet>
  );
}

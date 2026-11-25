import { Suspense, useEffect, useState } from 'react';
import { Link, Routes, Route, useNavigate, useParams, useLocation } from 'react-router-dom';
import { LazyMotion, domAnimation, m, AnimatePresence } from 'framer-motion';
import { ChevronLeft, Trophy, Zap, Swords, Medal, Award, Search } from 'lucide-react';
import { SeasonSelector } from './components/SeasonSelector';
import { RaceList } from './components/RaceList';
import { SitePolicyModal } from './components/SitePolicy';
import { DeveloperCredit } from './components/DeveloperCredit';
import { CommandPalette } from './components/CommandPalette';
import { ErrorBoundary } from './components/ErrorBoundary';
import { NotFoundPage } from './components/NotFoundPage';
import { SEOHead } from './components/SEOHead';
import { HomeJsonLd } from './components/JsonLd';
import {
  AwardsRouteFallback,
  QuickRateModalContentFallback,
  RatingModalContentFallback,
  ResultsRouteFallback,
  StandingsRouteFallback,
  TeammateWarsRouteFallback,
} from './components/RouteFallbacks';
import { getSeasons, getRaces } from './api/f1Api';
import {
  AwardsRoute,
  DriverProfileRoute,
  QuickRateRoute,
  RaceRatingRoute,
  ResultsRoute,
  ShareSnapshotRoute,
  StandingsRoute,
  TeammateWarsRoute,
  preloadAwardsRoute,
  preloadQuickRateRoute,
  preloadRaceRatingRoute,
  preloadResultsRoute,
  preloadStandingsRoute,
  preloadTeammateWarsRoute,
  scheduleSeasonRoutePrefetch,
} from './routes/routeChunks';
import { fetchWithMinDelay } from './utils/delay';
import { useCommunityRatings } from './hooks/useCommunityRatings';
import { initializeGuestSync } from './utils/guestSync';
import { LOCAL_RATINGS_EVENT } from './utils/ratingData';
import { isEditableEventTarget } from './utils/ratingInput';
import type { Season, Race } from './types';

// Minimum loading time in ms for better UX
const MIN_LOADING_TIME = 800;
const MIN_SUPPORTED_SEASON = 2018;

function isValidSeasonParam(season: string | undefined | null): season is string {
  if (!season || !/^\d{4}$/.test(season)) return false;
  const year = Number.parseInt(season, 10);
  const maxYear = Math.max(2026, new Date().getUTCFullYear() + 1);
  return year >= MIN_SUPPORTED_SEASON && year <= maxYear;
}

function SeasonAwardsAction({ season, onNavigate, onPreload }: {
  season: string;
  onNavigate: () => void;
  onPreload: () => void;
}) {
  const community = useCommunityRatings('race', season);
  const communityRatedRaceCount = community.status === 'ready'
    ? new Set(community.ratings.filter(rating => rating.round && rating.voteCount > 0).map(rating => rating.round)).size
    : 0;

  return (
    <m.button
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      onClick={onNavigate}
      onMouseEnter={onPreload}
      onFocus={onPreload}
      className="group relative flex w-full items-center justify-center gap-2 px-2 md:px-4 py-2 md:py-1.5 bg-[var(--bg-panel)] border border-[var(--border-color)] hover:border-[var(--accent-yellow)] transition-all min-h-[44px] md:min-w-0 md:w-auto md:min-h-0"
      title={communityRatedRaceCount > 0
        ? 'Season Awards · ' + communityRatedRaceCount + ' community-rated races'
        : 'Season Awards'}
      aria-label={communityRatedRaceCount > 0
        ? 'Season Awards, ' + communityRatedRaceCount + ' community-rated races'
        : 'Season Awards'}
    >
      <Award size={16} className="text-[var(--text-secondary)] group-hover:text-[var(--accent-yellow)]" />
      <span className="hidden md:inline font-ui font-bold text-xs text-white uppercase tracking-wider">Season Awards</span>
      {communityRatedRaceCount > 0 && (
        <span className="absolute -top-1 -right-1 rounded-full bg-[var(--bg-darker)] px-1.5 py-0.5 font-oxanium text-[8px] leading-none uppercase tracking-wide text-[var(--text-muted)] md:static md:rounded-none md:bg-transparent md:px-0 md:py-0 md:text-[10px]">
          {communityRatedRaceCount}
        </span>
      )}
    </m.button>
  );
}

// Season Page Component
function SeasonPage() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    async function loadSeasons() {
      setLoading(true);
      const data = await fetchWithMinDelay(() => getSeasons(), MIN_LOADING_TIME);
      setSeasons(data);
      setLoading(false);
    }
    loadSeasons();
  }, []);

  function handleSelectSeason(season: string) {
    navigate(`/${season}`);
  }

  return (
    <m.div
      key="seasons"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
    >
      <SEOHead
        title="F1 Driver Rating – Rate, Rank & Track F1 Drivers by Season"
        description="The ultimate F1 driver rater and rating tracker. Rate Formula 1 drivers race-by-race, build season ratings and power rankings, view standings, and compare teammates head-to-head."
        path="/"
        keywords="f1 driver rating, f1 driver ratings, f1 driver rater, formula 1 driver rating, formula 1 driver ratings, formula 1 driver ranking, rate f1 drivers, f1 power rankings, f1 driver tier list, best f1 drivers, f1 season standings, f1 teammate comparison, race by race rating"
      />
      <HomeJsonLd />

      {/* Hero Section */}
      <div className="text-center mb-10 relative">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl h-32 bg-[var(--accent-red)]/5 blur-3xl -z-10" />

        <m.h1
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="font-display text-5xl md:text-6xl text-white mb-4 uppercase tracking-tight leading-none"
        >
          F1 Driver <span className="text-transparent bg-clip-text bg-gradient-to-b from-white to-[#666]">Rating</span>
        </m.h1>

        <m.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="font-ui text-[var(--text-secondary)] text-lg max-w-xl mx-auto tracking-wide"
        >
          Rate every F1 driver race-by-race with your own F1 driver rater and rating tracker. Build season rankings, compare teammates head-to-head, and see who really is the best on the grid.
        </m.p>
      </div>

      {/* Season Grid */}
      <SeasonSelector
        seasons={seasons}
        onSelect={handleSelectSeason}
        loading={loading}
      />
    </m.div>
  );
}

// Races Page Component
function RacesPage() {
  const { season } = useParams<{ season: string }>();
  const isValidSeason = isValidSeasonParam(season);
  const [races, setRaces] = useState<Race[]>([]);
  const [loading, setLoading] = useState(isValidSeason);
  const navigate = useNavigate();

  useEffect(() => {
    if (!isValidSeason || !season) return;
    const validSeason = season;

    async function loadRaces() {
      setLoading(true);
      const data = await fetchWithMinDelay(() => getRaces(validSeason), MIN_LOADING_TIME);
      setRaces(data);
      setLoading(false);
    }
    void loadRaces();
  }, [season, isValidSeason]);

  useEffect(() => {
    if (!isValidSeason || !season || loading) return;

    return scheduleSeasonRoutePrefetch();
  }, [season, isValidSeason, loading]);

  function handleSelectRace(race: Race) {
    navigate(`/${season}/race/${race.round}`, {
      state: {
        raceSnapshot: {
          season,
          round: race.round,
          raceName: race.raceName,
          date: race.date,
        },
      },
    });
  }

  if (!isValidSeason || !season) return <NotFoundPage />;

  return (
    <m.div
      key="races"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
    >
      <SEOHead
        title={`F1 ${season} Driver Ratings – Race‑by‑Race Tier List`}
        description={`Rate and rank every driver from the ${season} Formula 1 season race-by-race. Use this F1 ${season} driver rater to create personal driver ratings, tier lists, and power rankings.`}
        path={`/${season}`}
        keywords={`f1 ${season}, f1 ${season} driver rating, f1 ${season} driver ratings, formula 1 ${season} driver ratings, f1 ${season} tier list, rate f1 drivers ${season}, f1 ${season} power rankings, best f1 driver ${season}, f1 driver rater`}
      />
      <RaceList
        races={races}
        season={season}
        onSelectRace={handleSelectRace}
        onRacePrefetch={preloadRaceRatingRoute}
        loading={loading}
      />
    </m.div>
  );
}

// Main App with Header
function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [, setStorageRevision] = useState(0);
  const [sitePolicyOpen, setSitePolicyOpen] = useState(false);
  const [isCommandOpen, setIsCommandOpen] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  useEffect(() => {
    function handleCommandShortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setIsCommandOpen(prev => !prev);
        return;
      }

      if (
        event.key === '/'
        && !event.metaKey
        && !event.ctrlKey
        && !event.altKey
        && !isEditableEventTarget(event.target)
      ) {
        event.preventDefault();
        setIsCommandOpen(true);
      }
    }

    window.addEventListener('keydown', handleCommandShortcut);
    return () => window.removeEventListener('keydown', handleCommandShortcut);
  }, []);

  useEffect(() => {
    let cancelIdle: (() => void) | undefined;
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      const id = window.requestIdleCallback(() => {
        void initializeGuestSync();
      }, { timeout: 1500 });
      cancelIdle = () => window.cancelIdleCallback(id);
    } else {
      const id = globalThis.setTimeout(() => {
        void initializeGuestSync();
      }, 800);
      cancelIdle = () => globalThis.clearTimeout(id);
    }

    const handleStorageSync = () => {
      setStorageRevision((revision) => revision + 1);
    };

    window.addEventListener('f1:guest-sync', handleStorageSync);
    window.addEventListener(LOCAL_RATINGS_EVENT, handleStorageSync);
    return () => {
      cancelIdle?.();
      window.removeEventListener('f1:guest-sync', handleStorageSync);
      window.removeEventListener(LOCAL_RATINGS_EVENT, handleStorageSync);
    };
  }, []);

  // Get current path info from React Router
  const pathname = location.pathname;
  const pathParts = pathname.split('/').filter(Boolean);
  const rawSeason = pathParts[0] || null;
  const currentSeason = isValidSeasonParam(rawSeason) ? rawSeason : null;
  const isResultsPage = pathParts[1] === 'results';
  const isQuickRatePage = pathParts[1] === 'quick-rate';
  const isRacePage = pathParts[1] === 'race';
  const isTeammateWarsPage = pathParts[1] === 'teammate-wars';
  const isStandingsPage = pathParts[1] === 'standings';
  const isAwardsPage = pathParts[1] === 'awards';
  const isDriverProfilePage = pathParts[1] === 'driver';
  const isSharePage = pathParts[0] === 'share';
  const isHomePage = pathname === '/' || pathname === '';

  const showResultsButton = Boolean(currentSeason);
  const showSeasonActions = Boolean(
    currentSeason && !isResultsPage && !isQuickRatePage && !isRacePage && !isTeammateWarsPage && !isStandingsPage && !isAwardsPage && !isDriverProfilePage
  );
  const mobileActionGridClass = showResultsButton ? 'grid-cols-5' : 'grid-cols-4';

  function primeRoute(preload: () => void) {
    return {
      onMouseEnter: preload,
      onFocus: preload,
    };
  }

  function handleBack() {
    if (isDriverProfilePage && currentSeason) {
      if (window.history.state && typeof window.history.state.idx === 'number' && window.history.state.idx > 0) {
        navigate(-1);
      } else {
        navigate(`/${currentSeason}`);
      }
    } else if (isResultsPage && currentSeason) {
      navigate(`/${currentSeason}`);
    } else if (isQuickRatePage && currentSeason) {
      navigate(`/${currentSeason}`);
    } else if (isRacePage && currentSeason) {
      navigate(`/${currentSeason}`);
    } else if (isTeammateWarsPage && currentSeason) {
      navigate(`/${currentSeason}`);
    } else if (isStandingsPage && currentSeason) {
      navigate(`/${currentSeason}`);
    } else if (isAwardsPage && currentSeason) {
      navigate(`/${currentSeason}`);
    } else {
      navigate('/');
    }
  }

  return (
    <LazyMotion features={domAnimation}>
    <div className="min-h-screen flex flex-col">
      {/* Header - Frosted Glass */}
      <header className="sticky top-0 z-40 border-b border-white/5 bg-gradient-to-b from-[var(--bg-main)]/90 to-[var(--bg-main)]/75 backdrop-blur-md [transform:translateZ(0)] shadow-[0_4px_30px_rgba(0,0,0,0.3)]">
        <div
          className={`max-w-6xl mx-auto px-4 ${
            showSeasonActions
              ? 'py-3 md:h-16 flex flex-col gap-3 md:flex-row md:items-center md:justify-between md:gap-0'
              : 'h-16 flex items-center justify-between'
          }`}
        >
          <div className="flex items-center justify-between gap-3 min-w-0 w-full md:w-auto md:flex-1">
            <div className="flex items-center gap-3 md:gap-6 min-w-0">
              {!isHomePage && (
                <m.button
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  onClick={handleBack}
                  className="h-8 w-8 flex items-center justify-center border border-[var(--border-color)] hover:border-[var(--accent-red)] hover:bg-[var(--accent-red)]/10 transition-colors flex-shrink-0"
                >
                  <ChevronLeft size={20} className="text-white" />
                </m.button>
              )}

              <div
                className="flex items-center gap-3 md:gap-4 select-none cursor-pointer min-w-0"
                onClick={() => navigate('/')}
              >
                <img
                  src="/favicon.png"
                  alt="F1 Rating"
                  className="w-8 h-8 object-cover flex-shrink-0"
                />
                {!showSeasonActions && (
                  <h1 className="font-display text-2xl leading-[0.9] text-white tracking-tight truncate">
                    F1 RATING
                  </h1>
                )}
              </div>

              {/* Breadcrumb / Context */}
              {currentSeason && (
                <div className="hidden md:flex items-center gap-2 pl-6 border-l border-[var(--border-color)]">
                  <span className="font-oxanium text-xs text-[var(--text-muted)]">Season:</span>
                  <span className="font-display text-xl text-white">{currentSeason}</span>
                  {isResultsPage && (
                    <>
                      <span className="text-[var(--text-muted)]">/</span>
                      <span className="font-oxanium text-xs text-[var(--accent-yellow)] uppercase">Results</span>
                    </>
                  )}
                  {isQuickRatePage && (
                    <>
                      <span className="text-[var(--text-muted)]">/</span>
                      <span className="font-oxanium text-xs text-[var(--accent-yellow)] uppercase">Quick Rate</span>
                    </>
                  )}
                  {isRacePage && pathParts[2] && (
                    <>
                      <span className="text-[var(--text-muted)]">/</span>
                      <span className="font-oxanium text-xs text-[var(--accent-yellow)] uppercase">Race {pathParts[2]}</span>
                    </>
                  )}
                  {isTeammateWarsPage && (
                    <>
                      <span className="text-[var(--text-muted)]">/</span>
                      <span className="font-oxanium text-xs text-[var(--accent-yellow)] uppercase">Teammate Wars</span>
                    </>
                  )}
                  {isStandingsPage && (
                    <>
                      <span className="text-[var(--text-muted)]">/</span>
                      <span className="font-oxanium text-xs text-[var(--accent-yellow)] uppercase">Standings</span>
                    </>
                  )}
                  {isAwardsPage && (
                    <>
                      <span className="text-[var(--text-muted)]">/</span>
                      <span className="font-oxanium text-xs text-[var(--accent-yellow)] uppercase">Awards</span>
                    </>
                  )}
                  {isDriverProfilePage && (
                    <>
                      <span className="text-[var(--text-muted)]">/</span>
                      <span className="font-oxanium text-xs text-[var(--accent-yellow)] uppercase">Driver Profile</span>
                    </>
                  )}
                </div>
              )}
              {isSharePage && (
                <div className="hidden md:flex items-center gap-2 pl-6 border-l border-[var(--border-color)]">
                  <span className="font-oxanium text-xs text-[var(--accent-yellow)] uppercase tracking-wider">Shared Rankings</span>
                </div>
              )}
            </div>

            {isHomePage ? (
              <button
                type="button"
                onClick={() => setIsCommandOpen(true)}
                aria-label="Open search"
                title="Search"
                className="group flex shrink-0 items-center gap-2 border border-[var(--border-color)] bg-[var(--bg-panel)]/90 px-2.5 py-1.5 text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-red)] hover:text-white"
              >
                <Search size={14} className="text-[var(--accent-red)]" aria-hidden="true" />
                <span className="hidden font-oxanium text-[10px] tracking-[0.16em] uppercase sm:inline">Search</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIsCommandOpen(true)}
                aria-label="Open search"
                title="Search"
                className={`h-8 w-8 shrink-0 items-center justify-center border border-[var(--border-color)] bg-[var(--bg-panel)] text-[var(--accent-red)] transition-colors hover:border-[var(--accent-red)] ${
                  showSeasonActions ? 'flex md:hidden' : 'flex'
                }`}
              >
                <Search size={16} aria-hidden="true" />
              </button>
            )}
          </div>

          {/* Actions - only show on races list page */}
          {showSeasonActions && (
            <div className={`grid ${mobileActionGridClass} w-full gap-2 md:flex md:w-auto md:items-center md:gap-3 md:justify-end`}>
              {/* Standings Button */}
              <m.button
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                onClick={() => navigate(`/${currentSeason}/standings`)}
                {...primeRoute(() => preloadStandingsRoute(currentSeason || undefined))}
                className="group flex w-full items-center justify-center gap-2 px-2 md:px-4 py-2 md:py-1.5 bg-[var(--bg-panel)] border border-[var(--border-color)] hover:border-[var(--accent-yellow)] transition-all min-h-[44px] md:min-w-0 md:w-auto md:min-h-0"
                title="Standings"
              >
                <Medal size={16} className="text-[var(--text-secondary)] group-hover:text-[var(--accent-yellow)]" />
                <span className="hidden md:inline font-ui font-bold text-xs text-white uppercase tracking-wider">Standings</span>
              </m.button>

              <SeasonAwardsAction
                season={currentSeason!}
                onNavigate={() => navigate(`/${currentSeason}/awards`)}
                onPreload={() => preloadAwardsRoute(currentSeason || undefined)}
              />

              {/* Teammate Wars Button */}
              <m.button
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                onClick={() => navigate(`/${currentSeason}/teammate-wars`)}
                {...primeRoute(() => preloadTeammateWarsRoute(currentSeason || undefined))}
                className="group flex w-full items-center justify-center gap-2 px-2 md:px-4 py-2 md:py-1.5 bg-[var(--bg-panel)] border border-[var(--border-color)] hover:border-[var(--accent-red)] transition-all min-h-[44px] md:min-w-0 md:w-auto md:min-h-0"
                title="Teammate Wars"
              >
                <Swords size={16} className="text-[var(--text-secondary)] group-hover:text-[var(--accent-red)]" />
                <span className="hidden md:inline font-ui font-bold text-xs text-white uppercase tracking-wider">VS</span>
              </m.button>
              {/* Quick Rate Button */}
              <m.button
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                onClick={() => navigate(`/${currentSeason}/quick-rate`)}
                {...primeRoute(() => preloadQuickRateRoute(currentSeason || undefined))}
                className="group flex w-full items-center justify-center gap-2 px-2 md:px-4 py-2 md:py-1.5 bg-[var(--accent-yellow)]/10 border border-[var(--accent-yellow)]/30 hover:border-[var(--accent-yellow)] transition-all min-h-[44px] md:min-w-0 md:w-auto md:min-h-0"
              >
                <Zap size={16} className="text-[var(--accent-yellow)]" />
                <span className="hidden md:inline font-ui font-bold text-xs text-[var(--accent-yellow)] uppercase tracking-wider">Quick Rate</span>
              </m.button>

              {/* View Results Button */}
              {showResultsButton && (
                <m.button
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  onClick={() => navigate(`/${currentSeason}/results`)}
                  {...primeRoute(() => preloadResultsRoute(currentSeason || undefined))}
                  className="group flex w-full items-center justify-center gap-2 px-2 md:px-4 py-2 md:py-1.5 bg-[var(--bg-panel)] border border-[var(--border-color)] hover:border-[var(--accent-red)] transition-all min-h-[44px] md:min-w-0 md:w-auto md:min-h-0"
                >
                  <Trophy size={16} className="text-[var(--text-secondary)] group-hover:text-[var(--accent-yellow)]" />
                  <span className="hidden md:inline font-ui font-bold text-xs text-white uppercase tracking-wider">View Results</span>
                </m.button>
              )}

              <button
                type="button"
                onClick={() => setIsCommandOpen(true)}
                aria-label="Open search"
                title="Search"
                className="hidden md:flex h-8 w-8 shrink-0 items-center justify-center border border-[var(--border-color)] bg-[var(--bg-panel)] text-[var(--accent-red)] transition-colors hover:border-[var(--accent-red)]"
              >
                <Search size={16} aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Main Content - flex-1 pushes footer to bottom */}
      <main className="flex-1 max-w-6xl mx-auto px-4 py-8 w-full">
        <ErrorBoundary resetKey={location.pathname}>
          <AnimatePresence mode="wait" onExitComplete={() => window.scrollTo(0, 0)}>
            <Routes location={location} key={location.pathname}>
              <Route path="/" element={<SeasonPage />} />
              <Route path="/:season" element={<RacesPage />} />
              <Route
                path="/:season/race/:round"
                element={(
                  <Suspense fallback={<RatingModalContentFallback />}>
                    <RaceRatingRoute />
                  </Suspense>
                )}
              />
              <Route
                path="/:season/quick-rate"
                element={(
                  <Suspense fallback={<QuickRateModalContentFallback />}>
                    <QuickRateRoute />
                  </Suspense>
                )}
              />
              <Route
                path="/:season/results"
                element={(
                  <Suspense fallback={<ResultsRouteFallback />}>
                    <ResultsRoute />
                  </Suspense>
                )}
              />
              <Route
                path="/:season/teammate-wars"
                element={(
                  <Suspense fallback={<TeammateWarsRouteFallback />}>
                    <TeammateWarsRoute />
                  </Suspense>
                )}
              />
              <Route
                path="/:season/standings"
                element={(
                  <Suspense fallback={<StandingsRouteFallback />}>
                    <StandingsRoute />
                  </Suspense>
                )}
              />
              <Route
                path="/:season/awards"
                element={(
                  <Suspense fallback={<AwardsRouteFallback />}>
                    <AwardsRoute />
                  </Suspense>
                )}
              />
              <Route
                path="/:season/driver/:driverId"
                element={(
                  <Suspense fallback={<ResultsRouteFallback />}>
                    <DriverProfileRoute />
                  </Suspense>
                )}
              />
              <Route
                path="/share/:id"
                element={(
                  <Suspense fallback={<ResultsRouteFallback />}>
                    <ShareSnapshotRoute />
                  </Suspense>
                )}
              />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </AnimatePresence>
        </ErrorBoundary>
      </main>

      {/* Footer - Premium F1 styled */}
      <footer className="border-t border-[var(--border-carbon)] mt-auto relative z-0 overflow-hidden">
        {/* Subtle background pattern */}
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
          style={{
            backgroundImage: 'linear-gradient(45deg, var(--border-color) 25%, transparent 25%, transparent 75%, var(--border-color) 75%)',
            backgroundSize: '4px 4px'
          }}
        />

        {/* Red accent line at top */}
        <div className="h-[2px] bg-gradient-to-r from-transparent via-[var(--accent-red)] to-transparent" />

        <div className="max-w-6xl mx-auto px-4 py-10 relative">
          {/* Main footer grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">

            {/* Brand column */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <img
                  src="/favicon.png"
                  alt="F1 Rating"
                  className="w-7 h-7 object-cover flex-shrink-0"
                />
                <span className="font-display text-lg text-white tracking-tight">F1 RATING</span>
              </div>
              <p className="font-ui text-xs text-[var(--text-muted)] leading-relaxed max-w-[240px]">
                Rate F1 drivers race-by-race, track season standings, and settle teammate debates.
              </p>
            </div>

            {/* Quick Links column */}
            <div>
              <h3 className="font-oxanium text-[10px] text-[var(--accent-red)] uppercase tracking-[0.2em] mb-4 border-b border-[var(--border-color)] pb-2">
                Quick Links
              </h3>
              <nav className="flex flex-col gap-2" aria-label="Footer navigation">
                <Link to="/" className="font-ui text-xs text-[var(--text-secondary)] hover:text-white hover:translate-x-1 transition-all inline-flex items-center gap-2 group">
                  <span className="w-1 h-1 bg-[var(--text-muted)] group-hover:bg-[var(--accent-red)] transition-colors" />
                  All Seasons
                </Link>
                <Link to={`/${new Date().getFullYear()}`} className="font-ui text-xs text-[var(--text-secondary)] hover:text-white hover:translate-x-1 transition-all inline-flex items-center gap-2 group">
                  <span className="w-1 h-1 bg-[var(--text-muted)] group-hover:bg-[var(--accent-red)] transition-colors" />
                  {new Date().getFullYear()} Season
                </Link>
                <Link to={`/${new Date().getFullYear()}/standings`} className="font-ui text-xs text-[var(--text-secondary)] hover:text-white hover:translate-x-1 transition-all inline-flex items-center gap-2 group">
                  <span className="w-1 h-1 bg-[var(--text-muted)] group-hover:bg-[var(--accent-red)] transition-colors" />
                  Standings
                </Link>
                <Link to={`/${new Date().getFullYear()}/teammate-wars`} className="font-ui text-xs text-[var(--text-secondary)] hover:text-white hover:translate-x-1 transition-all inline-flex items-center gap-2 group">
                  <span className="w-1 h-1 bg-[var(--text-muted)] group-hover:bg-[var(--accent-red)] transition-colors" />
                  Teammate Wars
                </Link>
                <button
                  type="button"
                  onClick={() => setSitePolicyOpen(true)}
                  className="font-ui text-xs text-[var(--text-secondary)] hover:text-white hover:translate-x-1 transition-all inline-flex items-center gap-2 group text-left"
                >
                  <span className="w-1 h-1 bg-[var(--text-muted)] group-hover:bg-[var(--accent-red)] transition-colors" />
                  Site Policy
                </button>
              </nav>
            </div>

            {/* Seasons column */}
            <div>
              <h3 className="font-oxanium text-[10px] text-[var(--accent-red)] uppercase tracking-[0.2em] mb-4 border-b border-[var(--border-color)] pb-2">
                Popular Seasons
              </h3>
              <nav className="flex flex-wrap gap-2" aria-label="Season links">
                {[2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018].map(year => (
                  <Link
                    key={year}
                    to={`/${year}`}
                    className={`font-oxanium text-xs px-3 py-1.5 border transition-all ${
                      year === new Date().getFullYear()
                        ? 'border-[var(--accent-red)]/40 text-[var(--accent-red)] hover:bg-[var(--accent-red)]/10'
                        : 'border-[var(--border-color)] text-[var(--text-secondary)] hover:border-[var(--text-secondary)] hover:text-white'
                    }`}
                  >
                    {year}
                  </Link>
                ))}
              </nav>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="border-t border-[var(--border-color)] pt-5 flex items-center justify-center">
            <p className="font-ui text-[11px] text-[var(--text-muted)] text-center">
              F1 Driver Rating © {new Date().getFullYear()} · Data by{' '}
              <a
                href="https://api.jolpi.ca/ergast/f1/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--f1-red)] hover:underline"
              >
                Jolpica API
              </a>
            </p>
          </div>
        </div>
      </footer>
      <CommandPalette
        isOpen={isCommandOpen}
        onClose={() => setIsCommandOpen(false)}
        currentSeason={currentSeason}
      />
      <SitePolicyModal open={sitePolicyOpen} onClose={() => setSitePolicyOpen(false)} />
      <DeveloperCredit />
    </div>
    </LazyMotion>
  );
}

export default App;

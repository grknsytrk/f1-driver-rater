import { Suspense, useEffect, useState } from 'react';
import { Routes, Route, useNavigate, useParams, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, Trophy, Zap, Swords, Medal } from 'lucide-react';
import { SeasonSelector } from './components/SeasonSelector';
import { RaceList } from './components/RaceList';
import { DeveloperCredit } from './components/DeveloperCredit';
import { SEOHead } from './components/SEOHead';
import { HomeJsonLd } from './components/JsonLd';
import {
  QuickRateModalRouteFallback,
  RatingModalRouteFallback,
  ResultsRouteFallback,
  StandingsRouteFallback,
  TeammateWarsRouteFallback,
} from './components/RouteFallbacks';
import { getSeasons, getRaces } from './api/f1Api';
import { getRatedRacesCount, hasQuickRatings } from './utils/storage';
import {
  QuickRateRoute,
  RaceRatingRoute,
  ResultsRoute,
  StandingsRoute,
  TeammateWarsRoute,
  preloadQuickRateRoute,
  preloadRaceRatingRoute,
  preloadResultsRoute,
  preloadStandingsRoute,
  preloadTeammateWarsRoute,
  scheduleSeasonRoutePrefetch,
} from './routes/routeChunks';
import { fetchWithMinDelay } from './utils/delay';
import type { Season, Race } from './types';

// Minimum loading time in ms for better UX
const MIN_LOADING_TIME = 800;

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
    <motion.div
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
      <div className="text-center mb-16 relative">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl h-32 bg-[var(--accent-red)]/5 blur-3xl -z-10" />

        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="inline-flex items-center gap-3 px-4 py-1 border-x border-[var(--accent-red)] mb-6"
        >
          <span className="font-oxanium text-xs font-bold text-[var(--accent-red)] tracking-[0.25em] uppercase">
            F1 Driver Rater
          </span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="font-display text-5xl md:text-6xl text-white mb-6 uppercase tracking-tight leading-none"
        >
          F1 Driver <span className="text-transparent bg-clip-text bg-gradient-to-b from-white to-[#666]">Rating</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="font-ui text-[var(--text-secondary)] text-lg max-w-xl mx-auto tracking-wide"
        >
          Rate every F1 driver race-by-race with your own F1 driver rater and rating tracker. Build season rankings, compare teammates head-to-head, and see who really is the best on the grid.
        </motion.p>
      </div>

      {/* Season Grid */}
      <SeasonSelector
        seasons={seasons}
        onSelect={handleSelectSeason}
        loading={loading}
      />
    </motion.div>
  );
}

// Races Page Component
function RacesPage() {
  const { season } = useParams<{ season: string }>();
  const [races, setRaces] = useState<Race[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    async function loadRaces() {
      if (season) {
        setLoading(true);
        const data = await fetchWithMinDelay(() => getRaces(season), MIN_LOADING_TIME);
        setRaces(data);
        setLoading(false);
      }
    }
    void loadRaces();
  }, [season]);

  useEffect(() => {
    if (!season || loading) return;

    return scheduleSeasonRoutePrefetch();
  }, [season, loading]);

  function handleSelectRace(race: Race) {
    navigate(`/${season}/race/${race.round}`);
  }

  if (!season) return null;

  return (
    <motion.div
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
    </motion.div>
  );
}

// Main App with Header
function App() {
  const navigate = useNavigate();
  const location = useLocation();

  // Get current path info from React Router
  const pathname = location.pathname;
  const pathParts = pathname.split('/').filter(Boolean);
  const currentSeason = pathParts[0] || null;
  const isResultsPage = pathParts[1] === 'results';
  const isQuickRatePage = pathParts[1] === 'quick-rate';
  const isRacePage = pathParts[1] === 'race';
  const isTeammateWarsPage = pathParts[1] === 'teammate-wars';
  const isStandingsPage = pathParts[1] === 'standings';
  const isHomePage = pathname === '/' || pathname === '';

  const ratedCount = currentSeason ? getRatedRacesCount(currentSeason) : 0;
  const showResultsButton = currentSeason ? (ratedCount > 0 || hasQuickRatings(currentSeason)) : false;

  function primeRoute(preload: () => void) {
    return {
      onMouseEnter: preload,
      onFocus: preload,
    };
  }

  function handleBack() {
    if (isResultsPage && currentSeason) {
      navigate(`/${currentSeason}`);
    } else if (isQuickRatePage && currentSeason) {
      navigate(`/${currentSeason}`);
    } else if (isRacePage && currentSeason) {
      navigate(`/${currentSeason}`);
    } else if (isTeammateWarsPage && currentSeason) {
      navigate(`/${currentSeason}`);
    } else if (isStandingsPage && currentSeason) {
      navigate(`/${currentSeason}`);
    } else if (currentSeason) {
      navigate('/');
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header - Frosted Glass */}
      <header className="sticky top-0 z-40 border-b border-white/5 bg-gradient-to-b from-[var(--bg-main)]/80 to-[var(--bg-main)]/60 backdrop-blur-xl backdrop-saturate-150 shadow-[0_4px_30px_rgba(0,0,0,0.3)]">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          {/* Logo / Back */}
          <div className="flex items-center gap-6">
            {!isHomePage && (
              <motion.button
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                onClick={handleBack}
                className="h-8 w-8 flex items-center justify-center border border-[var(--border-color)] hover:border-[var(--accent-red)] hover:bg-[var(--accent-red)]/10 transition-colors"
              >
                <ChevronLeft size={20} className="text-white" />
              </motion.button>
            )}

            <div
              className="flex items-center gap-4 select-none cursor-pointer"
              onClick={() => navigate('/')}
            >
              <div className="w-8 h-8 bg-[var(--accent-red)] flex items-center justify-center">
                <Zap size={16} className="text-white" />
              </div>
              <div className="flex flex-col justify-center h-8">
                <h1 className="font-display text-2xl leading-none text-white tracking-tight">
                  F1 RATING
                </h1>
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent-red)] animate-pulse" />
                  <span className="font-oxanium text-[10px] text-[var(--accent-red)] tracking-widest uppercase">Live</span>
                </div>
              </div>
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
              </div>
            )}
          </div>

          {/* Actions - only show on races list page */}
          {currentSeason && !isResultsPage && !isQuickRatePage && !isRacePage && !isTeammateWarsPage && !isStandingsPage && (
            <div className="flex items-center gap-2 md:gap-3">
              {/* Standings Button */}
              <motion.button
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                onClick={() => navigate(`/${currentSeason}/standings`)}
                {...primeRoute(preloadStandingsRoute)}
                className="group flex items-center justify-center gap-2 px-2 md:px-4 py-2 md:py-1.5 bg-[var(--bg-panel)] border border-[var(--border-color)] hover:border-[var(--accent-yellow)] transition-all min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0"
                title="Standings"
              >
                <Medal size={16} className="text-[var(--text-secondary)] group-hover:text-[var(--accent-yellow)]" />
                <span className="hidden md:inline font-ui font-bold text-xs text-white uppercase tracking-wider">Standings</span>
              </motion.button>
              {/* Teammate Wars Button */}
              <motion.button
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                onClick={() => navigate(`/${currentSeason}/teammate-wars`)}
                {...primeRoute(preloadTeammateWarsRoute)}
                className="group flex items-center justify-center gap-2 px-2 md:px-4 py-2 md:py-1.5 bg-[var(--bg-panel)] border border-[var(--border-color)] hover:border-[var(--accent-red)] transition-all min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0"
                title="Teammate Wars"
              >
                <Swords size={16} className="text-[var(--text-secondary)] group-hover:text-[var(--accent-red)]" />
                <span className="hidden md:inline font-ui font-bold text-xs text-white uppercase tracking-wider">VS</span>
              </motion.button>
              {/* Quick Rate Button */}
              <motion.button
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                onClick={() => navigate(`/${currentSeason}/quick-rate`)}
                {...primeRoute(preloadQuickRateRoute)}
                className="group flex items-center justify-center gap-2 px-2 md:px-4 py-2 md:py-1.5 bg-[var(--accent-yellow)]/10 border border-[var(--accent-yellow)]/30 hover:border-[var(--accent-yellow)] transition-all min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0"
              >
                <Zap size={16} className="text-[var(--accent-yellow)]" />
                <span className="hidden md:inline font-ui font-bold text-xs text-[var(--accent-yellow)] uppercase tracking-wider">Quick Rate</span>
              </motion.button>

              {/* View Results Button */}
              {showResultsButton && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  onClick={() => navigate(`/${currentSeason}/results`)}
                  {...primeRoute(preloadResultsRoute)}
                  className="group flex items-center justify-center gap-2 px-2 md:px-4 py-2 md:py-1.5 bg-[var(--bg-panel)] border border-[var(--border-color)] hover:border-[var(--accent-red)] transition-all min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0"
                >
                  <Trophy size={16} className="text-[var(--text-secondary)] group-hover:text-[var(--accent-yellow)]" />
                  <span className="hidden md:inline font-ui font-bold text-xs text-white uppercase tracking-wider">View Results</span>
                </motion.button>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Main Content - flex-1 pushes footer to bottom */}
      <main className="flex-1 max-w-6xl mx-auto px-4 py-8 w-full">
        <AnimatePresence mode="wait">
          <Routes location={location} key={location.pathname}>
            <Route path="/" element={<SeasonPage />} />
            <Route path="/:season" element={<RacesPage />} />
            <Route
              path="/:season/race/:round"
              element={(
                <Suspense fallback={<RatingModalRouteFallback />}>
                  <RaceRatingRoute />
                </Suspense>
              )}
            />
            <Route
              path="/:season/quick-rate"
              element={(
                <Suspense fallback={<QuickRateModalRouteFallback />}>
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
          </Routes>
        </AnimatePresence>
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
                <div className="w-7 h-7 bg-[var(--accent-red)] flex items-center justify-center">
                  <Zap size={14} className="text-white" />
                </div>
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
                <a href="/" className="font-ui text-xs text-[var(--text-secondary)] hover:text-white hover:translate-x-1 transition-all inline-flex items-center gap-2 group">
                  <span className="w-1 h-1 bg-[var(--text-muted)] group-hover:bg-[var(--accent-red)] transition-colors" />
                  All Seasons
                </a>
                <a href={`/${new Date().getFullYear()}`} className="font-ui text-xs text-[var(--text-secondary)] hover:text-white hover:translate-x-1 transition-all inline-flex items-center gap-2 group">
                  <span className="w-1 h-1 bg-[var(--text-muted)] group-hover:bg-[var(--accent-red)] transition-colors" />
                  {new Date().getFullYear()} Season
                </a>
                <a href={`/${new Date().getFullYear()}/standings`} className="font-ui text-xs text-[var(--text-secondary)] hover:text-white hover:translate-x-1 transition-all inline-flex items-center gap-2 group">
                  <span className="w-1 h-1 bg-[var(--text-muted)] group-hover:bg-[var(--accent-red)] transition-colors" />
                  Standings
                </a>
                <a href={`/${new Date().getFullYear()}/teammate-wars`} className="font-ui text-xs text-[var(--text-secondary)] hover:text-white hover:translate-x-1 transition-all inline-flex items-center gap-2 group">
                  <span className="w-1 h-1 bg-[var(--text-muted)] group-hover:bg-[var(--accent-red)] transition-colors" />
                  Teammate Wars
                </a>
              </nav>
            </div>

            {/* Seasons column */}
            <div>
              <h3 className="font-oxanium text-[10px] text-[var(--accent-red)] uppercase tracking-[0.2em] mb-4 border-b border-[var(--border-color)] pb-2">
                Popular Seasons
              </h3>
              <nav className="flex flex-wrap gap-2" aria-label="Season links">
                {[2026, 2025, 2024, 2023, 2022, 2021, 2020].map(year => (
                  <a
                    key={year}
                    href={`/${year}`}
                    className={`font-oxanium text-xs px-3 py-1.5 border transition-all ${
                      year === new Date().getFullYear()
                        ? 'border-[var(--accent-red)]/40 text-[var(--accent-red)] hover:bg-[var(--accent-red)]/10'
                        : 'border-[var(--border-color)] text-[var(--text-secondary)] hover:border-[var(--text-secondary)] hover:text-white'
                    }`}
                  >
                    {year}
                  </a>
                ))}
              </nav>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="border-t border-[var(--border-color)] pt-5 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="font-ui text-[11px] text-[var(--text-muted)]">
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
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="font-oxanium text-[10px] text-[var(--text-muted)] uppercase tracking-widest">All systems operational</span>
            </div>
          </div>
        </div>
      </footer>
      <DeveloperCredit />
    </div>
  );
}

export default App;

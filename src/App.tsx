import { useEffect, useState } from 'react';
import { Routes, Route, useNavigate, useParams, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, Trophy, Zap } from 'lucide-react';
import { SeasonSelector } from './components/SeasonSelector';
import { RaceList } from './components/RaceList';
import { RatingModal } from './components/RatingModal';
import { QuickRateModal } from './components/QuickRateModal';
import { ResultsDashboard } from './components/ResultsDashboard';
import { getSeasons, getRaces } from './api/f1Api';
import { getRatedRacesCount, hasQuickRatings } from './utils/storage';
import type { Season, Race } from './types';

// Season Page Component
function SeasonPage() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    async function loadSeasons() {
      setLoading(true);
      const data = await getSeasons();
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
            Rate Your Drivers
          </span>
        </motion.div>

        <motion.h2
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="font-display text-5xl md:text-6xl text-white mb-6 uppercase tracking-tight leading-none"
        >
          Select <span className="text-transparent bg-clip-text bg-gradient-to-b from-white to-[#666]">Season</span>
        </motion.h2>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="font-ui text-[var(--text-secondary)] text-lg max-w-xl mx-auto tracking-wide"
        >
          Rate every driver race-by-race and see who comes out on top.
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
        const data = await getRaces(season);
        setRaces(data);
        setLoading(false);
      }
    }
    loadRaces();
  }, [season]);

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
      <RaceList
        races={races}
        season={season}
        onSelectRace={handleSelectRace}
        loading={loading}
      />
    </motion.div>
  );
}

// Race Rating Page Component
function RaceRatingPage() {
  const { season, round } = useParams<{ season: string; round: string }>();
  const [races, setRaces] = useState<Race[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    async function loadRaces() {
      if (season) {
        setLoading(true);
        const data = await getRaces(season);
        setRaces(data);
        setLoading(false);
      }
    }
    loadRaces();
  }, [season]);

  const selectedRace = races.find(r => r.round === round);

  function handleSaveRatings() {
    navigate(`/${season}`);
  }

  function handleClose() {
    navigate(`/${season}`);
  }

  if (!season || !round) return null;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="w-8 h-8 border-2 border-[var(--accent-red)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!selectedRace) {
    return (
      <div className="text-center py-20">
        <p className="text-[var(--text-muted)]">Race not found</p>
        <button
          onClick={() => navigate(`/${season}`)}
          className="mt-4 text-[var(--accent-red)] hover:underline"
        >
          Back to season
        </button>
      </div>
    );
  }

  return (
    <RatingModal
      race={selectedRace}
      season={season}
      onClose={handleClose}
      onSave={handleSaveRatings}
    />
  );
}

// Quick Rate Page Component
function QuickRatePage() {
  const { season } = useParams<{ season: string }>();
  const navigate = useNavigate();

  if (!season) return null;

  function handleClose() {
    navigate(`/${season}`);
  }

  function handleSave() {
    navigate(`/${season}`);
  }

  return (
    <QuickRateModal
      season={season}
      onClose={handleClose}
      onSave={handleSave}
    />
  );
}

// Results Page Component
function ResultsPage() {
  const { season } = useParams<{ season: string }>();
  const navigate = useNavigate();

  if (!season) return null;

  return (
    <motion.div
      key="results"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
    >
      <ResultsDashboard
        season={season}
        onReset={() => navigate(`/${season}`)}
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
  const isHomePage = pathname === '/' || pathname === '';

  const ratedCount = currentSeason ? getRatedRacesCount(currentSeason) : 0;

  function handleBack() {
    if (isResultsPage && currentSeason) {
      navigate(`/${currentSeason}`);
    } else if (isQuickRatePage && currentSeason) {
      navigate(`/${currentSeason}`);
    } else if (isRacePage && currentSeason) {
      navigate(`/${currentSeason}`);
    } else if (currentSeason) {
      navigate('/');
    }
  }

  return (
    <div className="min-h-screen">
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
              </div>
            )}
          </div>

          {/* Actions - only show on races list page */}
          {currentSeason && !isResultsPage && !isQuickRatePage && !isRacePage && (
            <div className="flex items-center gap-2 md:gap-3">
              {/* Quick Rate Button */}
              <motion.button
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                onClick={() => navigate(`/${currentSeason}/quick-rate`)}
                className="group flex items-center justify-center gap-2 px-2 md:px-4 py-2 md:py-1.5 bg-[var(--accent-yellow)]/10 border border-[var(--accent-yellow)]/30 hover:border-[var(--accent-yellow)] transition-all min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0"
              >
                <Zap size={16} className="text-[var(--accent-yellow)]" />
                <span className="hidden md:inline font-ui font-bold text-xs text-[var(--accent-yellow)] uppercase tracking-wider">Quick Rate</span>
              </motion.button>

              {/* View Results Button */}
              {(ratedCount > 0 || hasQuickRatings(currentSeason)) && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  onClick={() => navigate(`/${currentSeason}/results`)}
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

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 py-8">
        <AnimatePresence mode="wait">
          <Routes location={location} key={location.pathname}>
            <Route path="/" element={<SeasonPage />} />
            <Route path="/:season" element={<RacesPage />} />
            <Route path="/:season/race/:round" element={<RaceRatingPage />} />
            <Route path="/:season/quick-rate" element={<QuickRatePage />} />
            <Route path="/:season/results" element={<ResultsPage />} />
          </Routes>
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="border-t border-[var(--border-carbon)] py-6 mt-12">
        <div className="max-w-6xl mx-auto px-4 text-center">
          <p className="text-sm text-[var(--text-muted)]">
            F1 data provided by{' '}
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
      </footer>
    </div>
  );
}

export default App;

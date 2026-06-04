import React, { useEffect, useMemo, useRef, useState } from 'react';
import SearchBar from './components/SearchBar.jsx';
import Controls from './components/Controls.jsx';
import FilmGrid from './components/FilmGrid.jsx';
import ProgressPanel from './components/ProgressPanel.jsx';
import { streamWatchlist } from './lib/api.js';

const DEFAULT_SORT = 'rating';

function sortFilms(films, sort) {
  const copy = [...films];
  switch (sort) {
    case 'rating':
      return copy.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1));
    case 'platforms':
      return copy.sort((a, b) => b.providerCount - a.providerCount || (b.rating ?? -1) - (a.rating ?? -1));
    case 'added':
      return copy.sort((a, b) => a.order - b.order);
    case 'release':
      return copy.sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
    case 'title':
      return copy.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    default:
      return copy;
  }
}

export default function App() {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(null);
  const [status, setStatus] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const [sort, setSort] = useState(DEFAULT_SORT);
  const [freeOnly, setFreeOnly] = useState(false);
  const [activePlatforms, setActivePlatforms] = useState(new Set());

  const streamRef = useRef(null);

  useEffect(() => () => streamRef.current?.cancel(), []);

  const start = (username) => {
    streamRef.current?.cancel();
    setLoading(true);
    setError(null);
    setResult(null);
    setProgress(null);
    setStatus(null);
    setActivePlatforms(new Set());

    streamRef.current = streamWatchlist(username, {
      onProgress: setProgress,
      onStatus: setStatus,
      onResult: (data) => {
        setResult(data);
        setLoading(false);
      },
      onError: (err) => {
        setError(err.message || 'Something went wrong.');
        setLoading(false);
      },
    });
  };

  const cancel = () => {
    streamRef.current?.cancel();
    setLoading(false);
    setProgress(null);
  };

  // Distinct platforms present in the current result, for the filter chips.
  const platforms = useMemo(() => {
    if (!result) return [];
    const map = new Map();
    for (const film of result.films) {
      for (const p of film.providers) {
        if (!map.has(p.id)) map.set(p.id, { id: p.id, name: p.name });
      }
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [result]);

  const visibleFilms = useMemo(() => {
    if (!result) return [];
    let films = result.films;
    if (freeOnly) films = films.filter((f) => f.hasFree);
    if (activePlatforms.size > 0) {
      films = films.filter((f) => f.providers.some((p) => activePlatforms.has(p.id)));
    }
    return sortFilms(films, sort);
  }, [result, freeOnly, activePlatforms, sort]);

  const togglePlatform = (id) => {
    setActivePlatforms((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>
          Watchlist <span className="arrow">→</span> Streaming
        </h1>
        <p className="tagline">
          See which films from a Letterboxd watchlist you can actually watch in France —
          on subscription services or for free. Rent/buy is hidden.
        </p>
        <SearchBar onSubmit={start} loading={loading} onCancel={cancel} />
      </header>

      <main className="app-main">
        {loading && <ProgressPanel progress={progress} status={status} />}

        {error && (
          <div className="error-box" role="alert">
            <strong>Couldn’t load that watchlist.</strong>
            <p>{error}</p>
          </div>
        )}

        {result && !loading && (
          <>
            {result.warnings?.map((w) => (
              <div key={w} className="warning-box">{w}</div>
            ))}

            <div className="summary">
              <strong>{result.totalAvailable}</strong> of{' '}
              <strong>{result.totalWatchlist}</strong> watchlist films are streamable in{' '}
              {result.region}.
              {result.unmatchedCount > 0 && (
                <span className="muted"> · {result.unmatchedCount} couldn’t be matched.</span>
              )}
            </div>

            {result.films.length > 0 && (
              <Controls
                sort={sort}
                setSort={setSort}
                freeOnly={freeOnly}
                setFreeOnly={setFreeOnly}
                platforms={platforms}
                activePlatforms={activePlatforms}
                togglePlatform={togglePlatform}
                clearPlatforms={() => setActivePlatforms(new Set())}
                resultCount={visibleFilms.length}
              />
            )}

            {result.films.length === 0 ? (
              <p className="empty-state">
                None of the films on this watchlist are currently streamable in {result.region}.
              </p>
            ) : (
              <FilmGrid films={visibleFilms} />
            )}
          </>
        )}

        {!result && !loading && !error && (
          <div className="hint">
            <p>Enter a public Letterboxd username to begin.</p>
            <p className="muted">
              Try a username like <code>dave</code> or paste a full watchlist URL.
            </p>
          </div>
        )}
      </main>

      <footer className="app-footer">
        <p className="muted">
          Availability via TMDB / JustWatch · free films via Internet Archive &amp; YouTube ·
          Letterboxd data is scraped from public pages and may break.
        </p>
      </footer>
    </div>
  );
}

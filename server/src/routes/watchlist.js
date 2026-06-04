import { Router } from 'express';
import { getEnrichedWatchlist, parseUsername } from '../services/letterboxd.js';
import { filterAvailableFilms } from '../services/availability.js';
import { config, tmdbConfigured } from '../config.js';

export const router = Router();

/** Run the full pipeline, invoking `emit(event, data)` for progress updates. */
async function runPipeline(usernameInput, emit) {
  const username = parseUsername(usernameInput);
  emit('status', { phase: 'start', username });

  // 1. Scrape + enrich the watchlist.
  const films = await getEnrichedWatchlist(username, {
    onProgress: (p) => emit('progress', p),
  });
  emit('status', { phase: 'watchlist-done', total: films.length });

  // 2. Check streaming availability, keeping only available films.
  const { available, totalChecked, unmatched } = await filterAvailableFilms(films, {
    onProgress: (p) => emit('progress', { phase: 'availability', ...p }),
  });

  return {
    username,
    region: config.tmdb.region,
    totalWatchlist: films.length,
    totalChecked,
    totalAvailable: available.length,
    unmatchedCount: unmatched.length,
    films: available,
    warnings: tmdbConfigured()
      ? []
      : ['TMDB is not configured — streaming availability will be empty. Set TMDB_API_KEY.'],
  };
}

/**
 * GET /api/watchlist/stream?username=...
 * Server-Sent Events stream: emits `progress` / `status` events while working,
 * then a final `result` event (or `error`).
 */
router.get('/stream', async (req, res) => {
  const username = req.query.username;
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const emit = (event, data) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // Keep the connection alive through long availability scans.
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 15000);

  try {
    const result = await runPipeline(username, emit);
    emit('result', result);
  } catch (err) {
    emit('error', { message: err.message, code: err.code || 'ERROR' });
  } finally {
    clearInterval(heartbeat);
    res.end();
  }
});

/**
 * GET /api/watchlist?username=...
 * Blocking JSON variant (no progress). Handy for scripting / debugging.
 */
router.get('/', async (req, res) => {
  try {
    const result = await runPipeline(req.query.username, () => {});
    res.json(result);
  } catch (err) {
    const status = err.code === 'WATCHLIST_NOT_FOUND' ? 404 : 400;
    res.status(status).json({ error: err.message, code: err.code || 'ERROR' });
  }
});

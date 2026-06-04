import express from 'express';
import cors from 'cors';
import { config, tmdbConfigured } from './config.js';
import { router as watchlistRouter } from './routes/watchlist.js';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    region: config.tmdb.region,
    tmdbConfigured: tmdbConfigured(),
    sources: {
      tmdb: tmdbConfigured(),
      internetArchive: config.archive.enabled,
      youtube: config.youtube.enabled && Boolean(config.youtube.apiKey),
    },
  });
});

app.use('/api/watchlist', watchlistRouter);

app.use((err, _req, res, _next) => {
  // eslint-disable-next-line no-console
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`\n  letterboxd-stream-fr server listening on http://localhost:${config.port}`);
  if (!tmdbConfigured()) {
    // eslint-disable-next-line no-console
    console.warn('  ⚠  TMDB not configured — set TMDB_API_KEY in .env for streaming availability.\n');
  }
});

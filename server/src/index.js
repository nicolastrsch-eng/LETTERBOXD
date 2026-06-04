import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { config, tmdbConfigured } from './config.js';
import { router as watchlistRouter } from './routes/watchlist.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

// In production (e.g. Render) serve the built React app from the same origin,
// so frontend + API share a host and there are no CORS or base-URL concerns.
const clientDist = path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  // SPA fallback: any non-/api route returns index.html.
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.use((err, _req, res, _next) => {
  // eslint-disable-next-line no-console
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`\n  letterboxd-stream-fr server listening on port ${config.port}`);
  if (fs.existsSync(clientDist)) {
    // eslint-disable-next-line no-console
    console.log('  Serving built frontend from client/dist');
  }
  if (!tmdbConfigured()) {
    // eslint-disable-next-line no-console
    console.warn('  ⚠  TMDB not configured — set TMDB_API_KEY in .env for streaming availability.\n');
  }
});

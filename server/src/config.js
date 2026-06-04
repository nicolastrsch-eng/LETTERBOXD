import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Load .env from the repository root (one level above /server).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const bool = (v, fallback = false) => {
  if (v === undefined || v === null || v === '') return fallback;
  return /^(1|true|yes|on)$/i.test(String(v).trim());
};

const num = (v, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export const config = {
  port: num(process.env.PORT, 5174),

  tmdb: {
    apiKey: process.env.TMDB_API_KEY || '',
    readToken: process.env.TMDB_READ_ACCESS_TOKEN || '',
    language: process.env.TMDB_LANGUAGE || 'fr-FR',
    region: (process.env.WATCH_REGION || 'FR').toUpperCase(),
    imageBase: 'https://image.tmdb.org/t/p',
  },

  youtube: {
    apiKey: process.env.YOUTUBE_API_KEY || '',
    enabled: bool(process.env.ENABLE_YOUTUBE, false),
  },

  archive: {
    enabled: bool(process.env.ENABLE_INTERNET_ARCHIVE, true),
  },

  cache: {
    availabilityTtlMs: num(process.env.CACHE_TTL_AVAILABILITY_HOURS, 24) * 3600_000,
    filmMetaTtlMs: num(process.env.CACHE_TTL_FILM_META_HOURS, 168) * 3600_000,
  },

  scrape: {
    concurrency: num(process.env.SCRAPE_CONCURRENCY, 4),
    delayMs: num(process.env.SCRAPE_DELAY_MS, 350),
    // Optional outbound proxy for scraping (e.g. to dodge datacenter-IP blocks
    // on Letterboxd's Cloudflare). Accepts http(s):// proxy URLs.
    proxy:
      process.env.SCRAPE_PROXY ||
      process.env.HTTPS_PROXY ||
      process.env.https_proxy ||
      '',
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  },
};

export const tmdbConfigured = () =>
  Boolean(config.tmdb.readToken || config.tmdb.apiKey);

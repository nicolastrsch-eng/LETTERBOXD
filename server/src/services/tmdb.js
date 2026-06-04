import { config, tmdbConfigured } from '../config.js';
import { fetchJson } from '../utils/http.js';
import { cached } from '../utils/cache.js';
import { pickBestMatch } from '../utils/match.js';

const API = 'https://api.themoviedb.org/3';

function authParams() {
  // v4 read token via header is preferred; otherwise v3 api_key query param.
  const headers = { Accept: 'application/json' };
  const query = new URLSearchParams();
  if (config.tmdb.readToken) {
    headers.Authorization = `Bearer ${config.tmdb.readToken}`;
  } else if (config.tmdb.apiKey) {
    query.set('api_key', config.tmdb.apiKey);
  }
  return { headers, query };
}

async function tmdbGet(path, params = {}) {
  const { headers, query } = authParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') query.set(k, v);
  }
  const qs = query.toString();
  return fetchJson(`${API}${path}${qs ? `?${qs}` : ''}`, { headers });
}

/** Search TMDB for a movie by title (+ optional year) and pick the best hit. */
async function searchMovie({ title, year }) {
  const data = await tmdbGet('/search/movie', {
    query: title,
    year: year || undefined,
    language: config.tmdb.language,
    include_adult: 'false',
  });
  const results = data?.results || [];
  if (!results.length) return null;

  const best = pickBestMatch(
    { title, year },
    results,
    {
      getTitle: (c) => c.title || c.original_title,
      getYear: (c) => (c.release_date ? parseInt(c.release_date.slice(0, 4), 10) : null),
      minScore: 0.6,
    }
  );
  return best?.candidate || null;
}

const MONETIZATION_KEEP = new Set(['flatrate', 'free', 'ads']); // subscription or free
// 'rent' and 'buy' are deliberately excluded.

function logo(path) {
  return path ? `${config.tmdb.imageBase}/w92${path}` : null;
}

/**
 * Look up subscription/free streaming providers for a film in the configured
 * region. Returns { tmdbId, providers: [...], link } or null when unmatched.
 */
export async function getTmdbAvailability(film) {
  if (!tmdbConfigured()) return null;

  const key = `tmdb_avail:${config.tmdb.region}:${film.slug || film.title}:${film.year || ''}`;
  return cached(key, config.cache.availabilityTtlMs, async () => {
    const match = await searchMovie(film);
    if (!match) return null;

    const providersData = await tmdbGet(`/movie/${match.id}/watch/providers`);
    const region = providersData?.results?.[config.tmdb.region];
    if (!region) return { tmdbId: match.id, providers: [], link: null };

    const seen = new Map();
    for (const type of MONETIZATION_KEEP) {
      for (const p of region[type] || []) {
        if (seen.has(p.provider_id)) continue;
        seen.set(p.provider_id, {
          id: p.provider_id,
          name: p.provider_name,
          logo: logo(p.logo_path),
          monetization: type === 'flatrate' ? 'subscription' : 'free',
          source: 'tmdb',
          // JustWatch deep link for the region (search/detail page).
          link: region.link || null,
        });
      }
    }

    return {
      tmdbId: match.id,
      tmdbTitle: match.title,
      tmdbYear: match.release_date ? match.release_date.slice(0, 4) : null,
      providers: [...seen.values()],
      link: region.link || null,
    };
  });
}

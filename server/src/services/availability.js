import pLimit from 'p-limit';
import { getTmdbAvailability } from './tmdb.js';
import { getArchiveAvailability } from './archive.js';
import { getYouTubeAvailability } from './youtube.js';
import { config } from '../config.js';

/**
 * Resolve all subscription/free providers for a single film across every
 * enabled source. Returns a normalized list (deduped by provider id) plus the
 * matched TMDB id when available. Never throws — failures degrade to "no
 * availability from that source".
 */
export async function getFilmAvailability(film) {
  const settled = await Promise.allSettled([
    getTmdbAvailability(film),
    getArchiveAvailability(film),
    getYouTubeAvailability(film),
  ]);

  const [tmdbRes, archiveRes, ytRes] = settled.map((s) =>
    s.status === 'fulfilled' ? s.value : null
  );

  const providers = new Map();
  const add = (p) => {
    if (!p) return;
    if (!providers.has(p.id)) providers.set(p.id, p);
  };

  if (tmdbRes?.providers) tmdbRes.providers.forEach(add);
  if (archiveRes?.provider) add(archiveRes.provider);
  if (ytRes?.provider) add(ytRes.provider);

  const list = [...providers.values()];
  return {
    tmdbId: tmdbRes?.tmdbId || null,
    link: tmdbRes?.link || null,
    providers: list,
    available: list.length > 0,
    hasFree: list.some((p) => p.monetization === 'free'),
  };
}

/**
 * Given an enriched watchlist, check availability for every film and return
 * ONLY the films available on at least one supported platform.
 * `onProgress` reports { done, total, available } as work proceeds.
 */
export async function filterAvailableFilms(films, { onProgress } = {}) {
  const limit = pLimit(config.scrape.concurrency);
  let done = 0;
  let availableCount = 0;
  const unmatched = [];

  const results = await Promise.all(
    films.map((film) =>
      limit(async () => {
        const avail = await getFilmAvailability(film);
        done += 1;
        if (avail.available) availableCount += 1;
        else if (!avail.tmdbId) unmatched.push({ title: film.title, year: film.year });
        onProgress?.({ done, total: films.length, available: availableCount });
        return { ...film, ...avail };
      })
    )
  );

  const available = results
    .filter((f) => f.available)
    .map((f) => ({
      slug: f.slug,
      url: f.url,
      title: f.title,
      year: f.year,
      rating: f.rating,
      ratingCount: f.ratingCount,
      poster: f.poster,
      order: f.order,
      tmdbId: f.tmdbId,
      watchLink: f.link,
      providers: f.providers,
      providerCount: f.providers.length,
      hasFree: f.hasFree,
    }));

  return { available, totalChecked: films.length, unmatched };
}

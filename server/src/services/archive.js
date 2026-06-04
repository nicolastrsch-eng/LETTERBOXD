import { fetchJson } from '../utils/http.js';
import { cached } from '../utils/cache.js';
import { config } from '../config.js';
import { titleSimilarity } from '../utils/match.js';

const SEARCH = 'https://archive.org/advancedsearch.php';

/**
 * Search the Internet Archive for a full, freely-watchable copy of a film.
 * Conservative: requires mediatype:movies, a close title match and a year
 * within ±1 to avoid false positives (home videos, trailers, lectures...).
 */
export async function getArchiveAvailability(film) {
  if (!config.archive.enabled) return null;
  if (!film.title) return null;

  const key = `archive:${film.slug || film.title}:${film.year || ''}`;
  return cached(key, config.cache.availabilityTtlMs, async () => {
    const q = `title:(${escapeQuery(film.title)}) AND mediatype:(movies)`;
    const url =
      `${SEARCH}?q=${encodeURIComponent(q)}` +
      '&fl[]=identifier&fl[]=title&fl[]=year&fl[]=mediatype' +
      '&rows=15&page=1&output=json&sort[]=downloads+desc';

    let data;
    try {
      data = await fetchJson(url, { timeoutMs: 12000 });
    } catch {
      return null;
    }

    const docs = data?.response?.docs || [];
    for (const doc of docs) {
      if (doc.mediatype !== 'movies') continue;
      const sim = titleSimilarity(film.title, doc.title);
      if (sim < 0.82) continue; // strict to stay conservative

      const docYear = parseInt(doc.year, 10);
      if (film.year && Number.isFinite(docYear) && Math.abs(docYear - film.year) > 1) {
        continue;
      }

      return {
        provider: {
          id: 'internet-archive',
          name: 'Internet Archive',
          monetization: 'free',
          source: 'archive',
          logo: null,
          link: `https://archive.org/details/${doc.identifier}`,
        },
      };
    }
    return null;
  });
}

function escapeQuery(s) {
  // Strip Lucene special characters that would break the advancedsearch query.
  return String(s).replace(/[+\-!(){}\[\]^"~*?:\\/]/g, ' ').replace(/\s+/g, ' ').trim();
}

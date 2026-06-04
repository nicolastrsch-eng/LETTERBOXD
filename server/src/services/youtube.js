import { fetchJson } from '../utils/http.js';
import { cached } from '../utils/cache.js';
import { config } from '../config.js';
import { titleSimilarity } from '../utils/match.js';

const API = 'https://www.googleapis.com/youtube/v3';

/** Parse an ISO-8601 duration (e.g. PT1H42M) into total minutes. */
function isoDurationToMinutes(iso) {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso || '');
  if (!m) return 0;
  const [, h = 0, min = 0, s = 0] = m;
  return Number(h) * 60 + Number(min) + Number(s) / 60;
}

const BLOCKLIST = /trailer|teaser|clip|scene|review|reaction|recap|explained|behind the scenes|soundtrack|bande[- ]?annonce/i;

/**
 * Best-effort lookup of a full, free film on YouTube. This source is noisy by
 * nature; we keep it conservative: long-form video (>=60min), official-ish
 * title match, and obvious non-films filtered out. Disabled unless an API key
 * is configured AND ENABLE_YOUTUBE=true.
 */
export async function getYouTubeAvailability(film) {
  if (!config.youtube.enabled || !config.youtube.apiKey || !film.title) return null;

  const key = `youtube:${film.slug || film.title}:${film.year || ''}`;
  return cached(key, config.cache.availabilityTtlMs, async () => {
    const query = `${film.title} ${film.year || ''} full movie`.trim();
    let search;
    try {
      search = await fetchJson(
        `${API}/search?part=snippet&type=video&videoDuration=long` +
          `&maxResults=5&q=${encodeURIComponent(query)}&key=${config.youtube.apiKey}`,
        { timeoutMs: 12000 }
      );
    } catch {
      return null;
    }

    const ids = (search.items || []).map((i) => i.id?.videoId).filter(Boolean);
    if (!ids.length) return null;

    let details;
    try {
      details = await fetchJson(
        `${API}/videos?part=contentDetails,snippet,status&id=${ids.join(',')}` +
          `&key=${config.youtube.apiKey}`,
        { timeoutMs: 12000 }
      );
    } catch {
      return null;
    }

    for (const v of details.items || []) {
      const title = v.snippet?.title || '';
      if (BLOCKLIST.test(title)) continue;
      if (v.status && v.status.embeddable === false) continue;
      const minutes = isoDurationToMinutes(v.contentDetails?.duration);
      if (minutes < 60) continue; // full features only
      if (titleSimilarity(film.title, title) < 0.5) continue;

      return {
        provider: {
          id: 'youtube',
          name: 'YouTube (free)',
          monetization: 'free',
          source: 'youtube',
          logo: null,
          link: `https://www.youtube.com/watch?v=${v.id}`,
        },
      };
    }
    return null;
  });
}

import * as cheerio from 'cheerio';
import pLimit from 'p-limit';
import { fetchHtml, sleep } from '../utils/http.js';
import { cached } from '../utils/cache.js';
import { config } from '../config.js';

const BASE = 'https://letterboxd.com';

/**
 * Accepts a bare username, a profile URL, or a watchlist URL and returns the
 * canonical Letterboxd username. Throws on obviously invalid input.
 */
export function parseUsername(input) {
  if (!input || typeof input !== 'string') {
    throw new Error('A Letterboxd username or watchlist URL is required.');
  }
  let value = input.trim();

  // Full URL? Pull the first path segment.
  const urlMatch = value.match(/letterboxd\.com\/([^/?#]+)/i);
  if (urlMatch) value = urlMatch[1];

  value = value.replace(/^@/, '').replace(/\/+$/, '').trim();

  if (!/^[a-z0-9_]+$/i.test(value)) {
    throw new Error(`"${input}" does not look like a valid Letterboxd username.`);
  }
  return value.toLowerCase();
}

/** Extract the film entries shown on a single watchlist grid page. */
function parseWatchlistPage(html) {
  const $ = cheerio.load(html);
  const films = [];

  $('li.poster-container div.film-poster, li.poster-container div[data-film-slug]').each((_, el) => {
    const $el = $(el);
    const slug = $el.attr('data-film-slug') || $el.attr('data-item-slug');
    const targetLink = $el.attr('data-target-link') || (slug ? `/film/${slug}/` : null);
    const filmId = $el.attr('data-film-id') || $el.attr('data-item-id');
    const title = $el.find('img').attr('alt') || $el.attr('data-item-name') || null;
    if (!slug && !targetLink) return;
    const finalSlug = slug || targetLink.replace(/^\/film\//, '').replace(/\/$/, '');
    films.push({
      slug: finalSlug,
      filmId: filmId || null,
      url: `${BASE}${targetLink}`,
      title,
    });
  });

  // Determine whether a "next" page exists.
  const hasNext = $('.paginate-nextprev .next').length > 0 &&
    !$('.paginate-nextprev .next').hasClass('paginate-disabled');

  return { films, hasNext };
}

/**
 * Scrape every page of a user's public watchlist.
 * Returns lightweight entries (slug/url/title) tagged with their order.
 * `onProgress` is called with { page, count } as pages are fetched.
 */
export async function scrapeWatchlist(username, { onProgress, maxPages = 100 } = {}) {
  const user = parseUsername(username);
  const entries = [];
  let page = 1;

  while (page <= maxPages) {
    const url = page === 1
      ? `${BASE}/${user}/watchlist/`
      : `${BASE}/${user}/watchlist/page/${page}/`;

    let html;
    try {
      html = await fetchHtml(url);
    } catch (err) {
      if (err.code === 'NOT_FOUND' && page === 1) {
        const e = new Error(`Watchlist not found for "${user}". Is the username correct and the watchlist public?`);
        e.code = 'WATCHLIST_NOT_FOUND';
        throw e;
      }
      if (err.code === 'NOT_FOUND') break; // ran past the last page
      throw err;
    }

    const { films, hasNext } = parseWatchlistPage(html);
    for (const film of films) {
      entries.push({ ...film, order: entries.length });
    }

    onProgress?.({ page, count: entries.length });

    if (!hasNext || films.length === 0) break;
    page += 1;
    await sleep(config.scrape.delayMs); // be polite between pages
  }

  return entries;
}

/** Strip Letterboxd's CDATA wrapper and parse the JSON-LD movie blob. */
function parseJsonLd(html) {
  const $ = cheerio.load(html);
  let data = null;
  $('script[type="application/ld+json"]').each((_, el) => {
    if (data) return;
    let raw = $(el).contents().text();
    raw = raw.replace(/\/\*\s*<!\[CDATA\[\s*\*\//, '').replace(/\/\*\s*\]\]>\s*\*\//, '').trim();
    try {
      const json = JSON.parse(raw);
      if (json && (json['@type'] === 'Movie' || json.aggregateRating || json.name)) {
        data = json;
      }
    } catch {
      /* ignore malformed blobs */
    }
  });
  return data;
}

function extractYear($, jsonLd) {
  // Prefer the JSON-LD publication event, fall back to the header link.
  const start = jsonLd?.releasedEvent?.[0]?.startDate;
  if (start) {
    const y = parseInt(String(start).slice(0, 4), 10);
    if (Number.isFinite(y)) return y;
  }
  const headerYear = $('.releaseyear a').first().text().trim() ||
    $('small.number a').first().text().trim();
  const y = parseInt(headerYear, 10);
  return Number.isFinite(y) ? y : null;
}

/**
 * Fetch rich metadata for a single film page (title, year, average rating,
 * poster). Cached aggressively since film facts rarely change.
 */
export async function fetchFilmMeta(slug, fallbackTitle = null) {
  const url = `${BASE}/film/${slug}/`;
  return cached(`lb_film:${slug}`, config.cache.filmMetaTtlMs, async () => {
    let html;
    try {
      html = await fetchHtml(url);
    } catch {
      return {
        slug, url, title: fallbackTitle, year: null,
        rating: null, ratingCount: null, poster: null,
      };
    }
    const $ = cheerio.load(html);
    const jsonLd = parseJsonLd(html);

    const title =
      jsonLd?.name ||
      $('h1.headline-1 .name').first().text().trim() ||
      $('h1.filmtitle .name').first().text().trim() ||
      fallbackTitle;

    const year = extractYear($, jsonLd);

    let rating = jsonLd?.aggregateRating?.ratingValue ?? null;
    if (rating != null) rating = Number(rating);
    const ratingCount = jsonLd?.aggregateRating?.ratingCount
      ? Number(jsonLd.aggregateRating.ratingCount)
      : null;

    const poster = jsonLd?.image || null;

    return { slug, url, title, year, rating, ratingCount, poster };
  });
}

/** Scrape the watchlist and enrich each entry with film metadata. */
export async function getEnrichedWatchlist(username, { onProgress } = {}) {
  const entries = await scrapeWatchlist(username, {
    onProgress: (p) => onProgress?.({ phase: 'watchlist', ...p }),
  });

  const limit = pLimit(config.scrape.concurrency);
  let done = 0;

  const films = await Promise.all(
    entries.map((entry) =>
      limit(async () => {
        const meta = await fetchFilmMeta(entry.slug, entry.title);
        done += 1;
        onProgress?.({ phase: 'metadata', done, total: entries.length });
        await sleep(config.scrape.delayMs);
        return {
          slug: entry.slug,
          url: entry.url,
          order: entry.order,
          title: meta.title || entry.title,
          year: meta.year,
          rating: meta.rating,
          ratingCount: meta.ratingCount,
          poster: meta.poster,
        };
      })
    )
  );

  return films;
}

import { config } from '../config.js';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * fetch with timeout, retries (exponential backoff) and sane defaults.
 * Retries on network errors and on 429 / 5xx responses.
 */
export async function fetchWithRetry(url, options = {}) {
  const {
    retries = 3,
    timeoutMs = 15000,
    baseDelayMs = 600,
    ...init
  } = options;

  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timer);

      if (res.status === 429 || res.status >= 500) {
        // Respect Retry-After when present, else exponential backoff.
        const retryAfter = Number(res.headers.get('retry-after'));
        const wait = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : baseDelayMs * 2 ** attempt;
        if (attempt < retries) {
          await sleep(wait);
          continue;
        }
      }
      return res;
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (attempt < retries) {
        await sleep(baseDelayMs * 2 ** attempt);
        continue;
      }
    }
  }
  throw lastErr || new Error(`Failed to fetch ${url}`);
}

/** Fetch a Letterboxd HTML page with a browser-like User-Agent. */
export async function fetchHtml(url) {
  const res = await fetchWithRetry(url, {
    headers: {
      'User-Agent': config.scrape.userAgent,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9,fr;q=0.8',
    },
  });
  if (res.status === 404) {
    const err = new Error('Not found');
    err.code = 'NOT_FOUND';
    throw err;
  }
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status} for ${url}`);
    err.code = 'HTTP_ERROR';
    err.status = res.status;
    throw err;
  }
  return res.text();
}

export async function fetchJson(url, options = {}) {
  const res = await fetchWithRetry(url, options);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`HTTP ${res.status} for ${url}: ${body.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

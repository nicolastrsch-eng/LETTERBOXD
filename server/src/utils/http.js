import { config } from '../config.js';

// Route all outbound fetches through a proxy when one is configured. This is
// the main mitigation when a host's datacenter IP is blocked by Letterboxd's
// Cloudflare. Uses Node's bundled undici — no extra dependency.
if (config.scrape.proxy) {
  try {
    const { ProxyAgent, setGlobalDispatcher } = await import('undici');
    setGlobalDispatcher(new ProxyAgent(config.scrape.proxy));
    // eslint-disable-next-line no-console
    console.log(`  Outbound scraping proxy enabled: ${config.scrape.proxy.replace(/\/\/.*@/, '//***@')}`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`  ⚠  Failed to enable scraping proxy: ${err.message}`);
  }
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Heuristics for spotting a Cloudflare / bot-protection block page.
const BLOCK_MARKERS = /just a moment|attention required|cf-chl|cloudflare|enable javascript and cookies|you have been blocked|sorry, you have been blocked/i;

export function looksBlocked(status, body = '') {
  if (status === 403 || status === 503 || status === 429) return true;
  return BLOCK_MARKERS.test(body);
}

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
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9,fr;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'no-cache',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Ch-Ua': '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"Windows"',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
    },
  });
  if (res.status === 404) {
    const err = new Error('Not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const text = await res.text().catch(() => '');

  if (!res.ok || looksBlocked(res.status, text)) {
    if (looksBlocked(res.status, text)) {
      const err = new Error(
        `Letterboxd blocked the request (HTTP ${res.status}). This usually means ` +
        `the server's IP is rate-limited or filtered by Cloudflare. ` +
        `Configure SCRAPE_PROXY (or run from a different network) and try again.`
      );
      err.code = 'BLOCKED';
      err.status = res.status;
      throw err;
    }
    const err = new Error(`HTTP ${res.status} for ${url}`);
    err.code = 'HTTP_ERROR';
    err.status = res.status;
    throw err;
  }
  return text;
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

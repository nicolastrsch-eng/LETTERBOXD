# Watchlist → Streaming (FR)

Connect a **Letterboxd watchlist** to **streaming availability in France** and
see **only** the films you can actually watch right now — on a subscription
service (Netflix, Max, Disney+, Prime Video, Canal+, …) or **for free**
(Internet Archive, YouTube). Films you'd have to **rent or buy** are hidden, and
films with no availability are dropped entirely.

---

## How it works

1. **Scrape** the public Letterboxd watchlist (`letterboxd.com/<user>/watchlist/`),
   following pagination, then enrich each film from its film page's JSON-LD
   (title, year, average rating, poster).
2. **Resolve availability** per film for region `FR`:
   - **TMDB `/watch/providers`** (JustWatch-sourced) — kept only when the
     monetization type is `flatrate` / `free` / `ads`. `rent` and `buy` are
     dropped.
   - **Internet Archive** advanced search — conservative full-movie matching.
   - **YouTube** Data API — optional, best-effort full-film detection.
3. **Filter** to films available on ≥ 1 supported platform and return them with
   per-platform badges and watch links.

The frontend streams **live progress** over Server-Sent Events while the
(slow) availability scan runs, and results are **cached aggressively** so repeat
queries are fast.

## Tech stack

- **Backend:** Node + Express (ESM). Scraping with `cheerio`, concurrency with
  `p-limit`, a two-tier (memory + JSON file) cache with TTLs. All third-party
  calls happen server-side, so API keys stay secret and there are no CORS issues.
- **Frontend:** React + Vite. Dark, responsive grid UI with sorting, filtering,
  and a free-only toggle.

```
.
├── server/            Express API (scraper + availability + cache)
│   └── src/
│       ├── services/  letterboxd, tmdb, archive, youtube, availability
│       ├── utils/     http (retry/UA), cache, match (title+year)
│       └── routes/    /api/watchlist (+ /stream SSE)
├── client/            React + Vite frontend
└── .env.example       Copy to .env and fill in keys
```

## Setup

Requires **Node 20+**.

```bash
# 1. Install everything (npm workspaces)
npm install

# 2. Configure environment
cp .env.example .env
#   → add your TMDB_API_KEY (or TMDB_READ_ACCESS_TOKEN)

# 3. Run backend + frontend together
npm run dev
```

- Frontend: <http://localhost:5173>
- Backend:  <http://localhost:5174> (the Vite dev server proxies `/api` to it)

Run them separately with `npm run dev:server` / `npm run dev:client`.

### Production (single service)

The Express server serves the built React app from the same origin, so one
process runs the whole site:

```bash
npm run build      # builds the client into client/dist
npm start          # starts the API server AND serves the frontend
```

Then open the server URL (default <http://localhost:5174>). API lives under
`/api/*`; every other route serves the SPA.

## Deploy to Render

This repo includes a [`render.yaml`](./render.yaml) blueprint for a single
free web service.

1. Push this repo to GitHub (already done if you're reading this on GitHub).
2. Go to <https://dashboard.render.com> → **New** → **Blueprint**, and select
   this repository. Render reads `render.yaml` automatically.
   - Build command: `npm install && npm run build`
   - Start command: `npm start`
   - Health check: `/api/health`
3. In the service's **Environment** tab, set the secret env var:
   - `TMDB_API_KEY` = your TMDB key (and optionally `YOUTUBE_API_KEY`).
   The non-secret vars (`WATCH_REGION=FR`, etc.) come from `render.yaml`.
4. Deploy. Render gives you a public `https://<name>.onrender.com` URL.

Notes:
- Render injects `PORT` automatically; the server already reads it.
- The **free plan sleeps after inactivity**, so the first request after a pause
  takes ~30s to wake up.
- ⚠️ Letterboxd sits behind Cloudflare and **sometimes blocks datacenter IPs**.
  See [Handling Cloudflare blocks](#handling-cloudflare-blocks) below.

## Handling Cloudflare blocks

Letterboxd has no public API, so the watchlist is scraped from public HTML.
From cloud/datacenter IPs, Cloudflare may answer with a `403`/`503` challenge
instead of the page. The app **detects this explicitly** and returns a clear
`BLOCKED` error (rather than crashing or silently returning nothing), along with
browser-like request headers, retries with backoff, and polite rate limiting to
minimise it.

When a host's IP is blocked, the reliable fix is to route scraping through a
proxy via **`SCRAPE_PROXY`** (or the standard `HTTPS_PROXY`):

```bash
# any HTTP(S) proxy — a residential/rotating proxy works best against Cloudflare
SCRAPE_PROXY=http://user:pass@proxy-host:port
```

On Render, add `SCRAPE_PROXY` in the service's **Environment** tab. No proxy is
needed when running locally from a normal home/office connection. Other knobs:
lower `SCRAPE_CONCURRENCY` and raise `SCRAPE_DELAY_MS` to look less bot-like.

## Environment variables

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `TMDB_API_KEY` | yes¹ | – | TMDB v3 API key (streaming availability). |
| `TMDB_READ_ACCESS_TOKEN` | – | – | TMDB v4 token; used instead of the key if set. |
| `WATCH_REGION` | – | `FR` | ISO region for availability. |
| `TMDB_LANGUAGE` | – | `fr-FR` | TMDB metadata language. |
| `YOUTUBE_API_KEY` | – | – | Enables the YouTube free-film source. |
| `ENABLE_INTERNET_ARCHIVE` | – | `true` | Toggle the Internet Archive source. |
| `ENABLE_YOUTUBE` | – | `false` | Toggle the YouTube source. |
| `PORT` | – | `5174` | API server port. |
| `CACHE_TTL_AVAILABILITY_HOURS` | – | `24` | Availability cache TTL. |
| `CACHE_TTL_FILM_META_HOURS` | – | `168` | Film-metadata cache TTL. |
| `SCRAPE_CONCURRENCY` | – | `4` | Parallel film lookups. |
| `SCRAPE_DELAY_MS` | – | `350` | Polite delay between scrape requests. |
| `SCRAPE_PROXY` | – | – | Outbound proxy URL for scraping (see below). Falls back to `HTTPS_PROXY`. |

¹ Without TMDB the app still runs, but subscription availability will be empty
(only the free sources can contribute).

Get a free TMDB key at <https://www.themoviedb.org/settings/api>.

## API

| Endpoint | Description |
| --- | --- |
| `GET /api/health` | Configuration / source status. |
| `GET /api/watchlist/stream?username=<user>` | SSE stream: `progress`, `status`, then `result` (or `error`). Used by the UI. |
| `GET /api/watchlist?username=<user>` | Blocking JSON variant (no progress). |

`username` accepts a bare handle, a profile URL, or a full watchlist URL.

## Features

- Input a Letterboxd username **or** watchlist URL.
- Results grid with poster, title, year, Letterboxd rating, and a badge/logo +
  watch link per platform.
- **Sorting:** Letterboxd rating, number of platforms, order added to watchlist,
  release year, title (A–Z). Default is rating (configurable in `App.jsx`).
- **Filters:** by platform (chips) and a **free-only** toggle.
- Live **loading/progress** for both phases; results **cached** per film+region.

## Limitations & notes

- **Letterboxd has no public API.** This scrapes public HTML, so a markup change
  on their side can break it. It only works for **public** watchlists. Please
  scrape responsibly — the defaults add polite delays and limit concurrency.
- **Availability data** comes from TMDB/JustWatch and is only as accurate and
  fresh as their catalogue (it can lag real-world changes; the cache adds up to
  24h more). "Release date" sorting uses the film's **year** (the finest
  granularity Letterboxd reliably exposes).
- **Free sources are best-effort.** Internet Archive matching is deliberately
  strict (title similarity + year tolerance) and YouTube full-film detection is
  inherently noisy — false negatives are preferred over false positives. The
  YouTube source is **off by default**.
- "Order added to watchlist" uses the watchlist **display order**; Letterboxd
  does not expose the exact date a film was added on public pages.
- This project is for personal use and is **not affiliated** with Letterboxd,
  TMDB, JustWatch, or any streaming service. TMDB is used per their terms but
  this product hasn't been endorsed or certified by TMDB.

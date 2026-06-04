// Thin client over the backend's SSE streaming endpoint.
//
// streamWatchlist returns an object with a `.cancel()` method. Callbacks:
//   onProgress(data) — incremental progress updates
//   onStatus(data)   — phase transitions
//   onResult(data)   — final payload (films, counts, warnings)
//   onError(err)     — terminal error

export function streamWatchlist(username, handlers = {}) {
  const url = `/api/watchlist/stream?username=${encodeURIComponent(username)}`;
  const source = new EventSource(url);
  let settled = false;

  const close = () => {
    settled = true;
    source.close();
  };

  source.addEventListener('progress', (e) => {
    handlers.onProgress?.(JSON.parse(e.data));
  });
  source.addEventListener('status', (e) => {
    handlers.onStatus?.(JSON.parse(e.data));
  });
  source.addEventListener('result', (e) => {
    handlers.onResult?.(JSON.parse(e.data));
    close();
  });
  source.addEventListener('error', (e) => {
    // Distinguish a server-sent `error` event (has data) from a transport drop.
    if (e.data) {
      try {
        handlers.onError?.(JSON.parse(e.data));
      } catch {
        handlers.onError?.({ message: 'Stream error' });
      }
      close();
    } else if (!settled) {
      handlers.onError?.({ message: 'Connection lost. Is the server running?' });
      close();
    }
  });

  return { cancel: close };
}

export async function getHealth() {
  const res = await fetch('/api/health');
  return res.json();
}

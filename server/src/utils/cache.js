import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.resolve(__dirname, '../../.cache');

// Two-tier cache: in-memory for the lifetime of the process, plus a
// JSON-file backing store so repeat queries survive restarts.
const memory = new Map();

function keyToFile(key) {
  const safe = key.replace(/[^a-z0-9_.-]/gi, '_').slice(0, 200);
  return path.join(CACHE_DIR, `${safe}.json`);
}

async function ensureDir() {
  await fs.mkdir(CACHE_DIR, { recursive: true });
}

/** Returns the cached value if present and not expired, else undefined. */
export async function cacheGet(key) {
  const now = Date.now();

  const mem = memory.get(key);
  if (mem) {
    if (mem.expires > now) return mem.value;
    memory.delete(key);
  }

  try {
    const raw = await fs.readFile(keyToFile(key), 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed.expires > now) {
      memory.set(key, parsed);
      return parsed.value;
    }
    // Expired on disk: clean it up lazily.
    await fs.unlink(keyToFile(key)).catch(() => {});
  } catch {
    /* miss */
  }
  return undefined;
}

export async function cacheSet(key, value, ttlMs) {
  const entry = { value, expires: Date.now() + ttlMs };
  memory.set(key, entry);
  try {
    await ensureDir();
    await fs.writeFile(keyToFile(key), JSON.stringify(entry), 'utf8');
  } catch {
    /* non-fatal: memory cache still works */
  }
}

/**
 * Get from cache or compute via `producer`, caching the result.
 * Negative results (null/undefined) are cached too, to avoid hammering
 * upstream APIs for films that simply aren't available anywhere.
 */
export async function cached(key, ttlMs, producer) {
  const hit = await cacheGet(key);
  if (hit !== undefined) return hit;
  const value = await producer();
  await cacheSet(key, value ?? null, ttlMs);
  return value;
}

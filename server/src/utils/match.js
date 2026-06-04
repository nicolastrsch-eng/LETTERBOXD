// Title/year matching helpers for reconciling Letterboxd films with TMDB,
// Internet Archive and YouTube results.

/** Lowercase, strip diacritics, drop punctuation, collapse whitespace. */
export function normalizeTitle(input = '') {
  return String(input)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip accents
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(the|a|an|le|la|les|un|une|des|der|die|das)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Levenshtein distance (iterative, O(n*m) space-optimised). */
function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let curr = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = curr;
  }
  return prev[b.length];
}

/** Similarity in [0,1] between two raw titles after normalization. */
export function titleSimilarity(a, b) {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const dist = levenshtein(na, nb);
  return 1 - dist / Math.max(na.length, nb.length);
}

/**
 * Pick the best candidate from a TMDB-style search result list.
 * Scores by title similarity, with a bonus for an exact/near year match.
 * Returns { candidate, score } or null when nothing clears the threshold.
 */
export function pickBestMatch(target, candidates, {
  getTitle,
  getYear,
  minScore = 0.6,
  yearTolerance = 1,
} = {}) {
  let best = null;
  for (const candidate of candidates) {
    const sim = titleSimilarity(target.title, getTitle(candidate));
    let score = sim;

    const cYear = getYear(candidate);
    if (target.year && cYear) {
      const diff = Math.abs(target.year - cYear);
      if (diff === 0) score += 0.25;
      else if (diff <= yearTolerance) score += 0.1;
      else score -= 0.2; // wrong year is a strong negative signal
    }

    if (!best || score > best.score) best = { candidate, score, sim };
  }

  if (!best || best.sim < minScore) return null;
  return best;
}

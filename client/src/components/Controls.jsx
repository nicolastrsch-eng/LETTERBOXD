import React from 'react';

export const SORT_OPTIONS = [
  { value: 'rating', label: 'Letterboxd rating' },
  { value: 'platforms', label: 'Number of platforms' },
  { value: 'added', label: 'Order added to watchlist' },
  { value: 'release', label: 'Release date' },
  { value: 'title', label: 'Title (A–Z)' },
];

export default function Controls({
  sort,
  setSort,
  freeOnly,
  setFreeOnly,
  platforms,
  activePlatforms,
  togglePlatform,
  clearPlatforms,
  resultCount,
}) {
  return (
    <div className="controls">
      <div className="controls-row">
        <label className="control">
          <span>Sort by</span>
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>

        <label className="control checkbox">
          <input
            type="checkbox"
            checked={freeOnly}
            onChange={(e) => setFreeOnly(e.target.checked)}
          />
          <span>Free only</span>
        </label>

        <span className="result-count">{resultCount} films</span>
      </div>

      {platforms.length > 0 && (
        <div className="platform-filter">
          {platforms.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`chip ${activePlatforms.has(p.id) ? 'chip-active' : ''}`}
              onClick={() => togglePlatform(p.id)}
            >
              {p.name}
            </button>
          ))}
          {activePlatforms.size > 0 && (
            <button type="button" className="chip chip-clear" onClick={clearPlatforms}>
              Clear ✕
            </button>
          )}
        </div>
      )}
    </div>
  );
}

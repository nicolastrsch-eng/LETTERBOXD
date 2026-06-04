import React from 'react';

const PHASE_LABEL = {
  start: 'Starting…',
  watchlist: 'Fetching watchlist pages…',
  metadata: 'Reading film details…',
  'watchlist-done': 'Watchlist loaded',
  availability: 'Checking streaming availability…',
};

export default function ProgressPanel({ progress, status }) {
  const phase = progress?.phase || status?.phase || 'start';
  const label = PHASE_LABEL[phase] || 'Working…';

  let detail = null;
  let pct = null;

  if (phase === 'watchlist') {
    detail = `${progress.count} films found (page ${progress.page})`;
  } else if (phase === 'metadata' || phase === 'availability') {
    detail = `${progress.done} / ${progress.total}`;
    pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
    if (phase === 'availability' && progress.available != null) {
      detail += ` · ${progress.available} streamable so far`;
    }
  }

  return (
    <div className="progress-panel" role="status" aria-live="polite">
      <div className="spinner" aria-hidden="true" />
      <div className="progress-text">
        <strong>{label}</strong>
        {detail && <span className="progress-detail">{detail}</span>}
      </div>
      {pct != null && (
        <div className="progress-bar">
          <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}

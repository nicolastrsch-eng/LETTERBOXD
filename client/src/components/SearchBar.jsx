import React, { useState } from 'react';

export default function SearchBar({ onSubmit, loading, onCancel }) {
  const [value, setValue] = useState('');

  const submit = (e) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (trimmed && !loading) onSubmit(trimmed);
  };

  return (
    <form className="search-bar" onSubmit={submit}>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Letterboxd username or watchlist URL (e.g. dave)"
        aria-label="Letterboxd username or watchlist URL"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck="false"
        disabled={loading}
      />
      {loading ? (
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
      ) : (
        <button type="submit" className="btn btn-primary" disabled={!value.trim()}>
          Find streamable films
        </button>
      )}
    </form>
  );
}

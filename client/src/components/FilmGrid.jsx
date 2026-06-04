import React from 'react';
import FilmCard from './FilmCard.jsx';

export default function FilmGrid({ films }) {
  if (!films.length) {
    return <p className="empty-state">No films match the current filters.</p>;
  }
  return (
    <div className="film-grid">
      {films.map((film) => (
        <FilmCard key={film.slug} film={film} />
      ))}
    </div>
  );
}

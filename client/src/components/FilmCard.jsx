import React from 'react';

function ProviderBadge({ provider }) {
  const content = provider.logo ? (
    <img src={provider.logo} alt={provider.name} title={provider.name} loading="lazy" />
  ) : (
    <span className={`badge-text ${provider.monetization === 'free' ? 'badge-free' : ''}`}>
      {provider.name}
    </span>
  );

  const className = `provider-badge ${provider.monetization === 'free' ? 'is-free' : 'is-sub'}`;

  return provider.link ? (
    <a href={provider.link} target="_blank" rel="noopener noreferrer" className={className}>
      {content}
    </a>
  ) : (
    <span className={className}>{content}</span>
  );
}

export default function FilmCard({ film }) {
  return (
    <article className="film-card">
      <a
        className="poster-wrap"
        href={film.url}
        target="_blank"
        rel="noopener noreferrer"
        title={`${film.title} on Letterboxd`}
      >
        {film.poster ? (
          <img className="poster" src={film.poster} alt={`${film.title} poster`} loading="lazy" />
        ) : (
          <div className="poster poster-placeholder">{film.title}</div>
        )}
        {film.hasFree && <span className="free-flag">FREE</span>}
      </a>

      <div className="film-info">
        <h3 className="film-title">
          {film.title}
          {film.year && <span className="film-year"> ({film.year})</span>}
        </h3>

        <div className="film-meta">
          {film.rating != null && (
            <span className="rating" title="Letterboxd average rating">
              ★ {Number(film.rating).toFixed(2)}
            </span>
          )}
          <span className="platform-count">
            {film.providerCount} platform{film.providerCount === 1 ? '' : 's'}
          </span>
        </div>

        <div className="providers">
          {film.providers.map((p) => (
            <ProviderBadge key={`${p.source}-${p.id}`} provider={p} />
          ))}
        </div>
      </div>
    </article>
  );
}

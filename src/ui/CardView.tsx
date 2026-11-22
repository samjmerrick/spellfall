import { useLayoutEffect, useRef } from 'react';
import { baseId, getCard, type Faction } from '../engine';
import { GLYPHS } from './factions';
import { emblemFor, polygonPoints } from './emblem';
import { artUrl } from './art';
import { KeywordRow } from './keywordIcons';

export function CardEmblem({ id, faction }: { id: string; faction: Faction | 'neutral' }) {
  const e = emblemFor(baseId(id));
  return (
    <svg className="emblem" viewBox="0 0 100 100" aria-hidden="true">
      {Array.from({ length: e.rings }, (_, i) => (
        <polygon
          key={i}
          points={polygonPoints(e.sides, 42 - i * 12, e.rotation + i * 15)}
          className="emblem__ring"
        />
      ))}
      <polygon points={polygonPoints(e.inner, 10, e.rotation)} className="emblem__core" />
      <text x="50" y="58" className="emblem__glyph" textAnchor="middle">
        {faction === 'neutral' ? '✦' : GLYPHS[faction]}
      </text>
    </svg>
  );
}

/** Per-card illustration when one exists for the base card id, otherwise the generated emblem. */
export function CardArt({ id, faction }: { id: string; faction: Faction | 'neutral' }) {
  const url = artUrl(id);
  if (!url) return <CardEmblem id={id} faction={faction} />;
  return (
    <>
      <img className="card-art" src={url} alt="" draggable={false} />
      <span className="card-art__glyph" aria-hidden="true">
        {faction === 'neutral' ? '✦' : GLYPHS[faction]}
      </span>
    </>
  );
}

/** Card name on its own line: the font shrinks to fit, with an ellipsis only as a last resort. */
function CardName({ name }: { name: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      el.style.fontSize = '';
      const base = parseFloat(getComputedStyle(el).fontSize);
      if (el.scrollWidth > el.clientWidth && el.clientWidth > 0) {
        el.style.fontSize = `${Math.max(base * 0.7, (base * el.clientWidth) / el.scrollWidth)}px`;
      }
    };
    fit();
  }, [name]);
  return (
    <span className="card__name" ref={ref}>
      {name}
    </span>
  );
}

export function CardView({ cardId, size = 'hand' }: { cardId: string; size?: 'hand' | 'large' }) {
  const card = getCard(cardId);
  const isUnit = card.type === 'unit';
  return (
    <div
      className={`card card--${size} faction-${card.faction}`}
      aria-label={card.name}
      data-card-id={cardId}
    >
      <span className="card__cost" aria-label={`Cost ${card.cost}`}>
        {card.cost}
      </span>
      <div className="card__art">
        <CardArt id={card.id} faction={card.faction} />
      </div>
      <CardName name={card.name} />
      {size === 'large' && <p className="card__text">{card.text || 'No abilities.'}</p>}
      <div className="card__foot">
        {isUnit ? (
          <>
            <span className="card__power">{card.power}</span>
            <KeywordRow keywords={card.keywords} effects={card.effects} className="card__kw" />
            <span className="card__health">{card.health}</span>
          </>
        ) : (
          <span className="card__type">Spell</span>
        )}
      </div>
    </div>
  );
}

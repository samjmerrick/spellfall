// Card art: the line icon for a card id, or a generated emblem when there is none.
import { baseId, type Faction } from '../rules';
import { GLYPHS } from './factions';
import { emblemFor, polygonPoints } from './emblem';
import { artUrl } from './art';

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

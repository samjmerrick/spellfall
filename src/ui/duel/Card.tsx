import { useLayoutEffect, useRef } from 'react';
import {
  getCard,
  unitPower,
  unitRemainingHealth,
  unitMaxHealth,
  type Effect,
  type GameState,
  type Keyword,
  type Unit,
} from '../../rules';
import { CardArt } from '../CardView';
import { PATHS } from '../keywordPaths';
import { GLOSSARY, TRIGGER_NAME, keywordName } from './glossary';

/** Keywords that say nothing more once a unit is on the board. */
const SPENT_IN_PLAY = new Set<Keyword>(['quick']);

const SPEED_LABEL = { burst: 'Burst', fast: 'Fast', slow: 'Slow' } as const;

/** Keywords first, then non-spell trigger marks, in a fixed order. */
function iconKinds(keywords: readonly Keyword[], effects: readonly Effect[]): string[] {
  const marks = (['onPlay', 'ongoing', 'startOfTurn', 'endOfTurn', 'lastBreath'] as const).filter((t) =>
    effects.some((e) => e.trigger === t),
  );
  return [...keywords, ...marks];
}

function iconName(kind: string): string {
  return (TRIGGER_NAME as Record<string, string>)[kind] ?? keywordName(kind as Keyword);
}

export function Icons({
  keywords,
  effects,
  className,
  max,
}: {
  keywords: readonly Keyword[];
  effects: readonly Effect[];
  className: string;
  max?: number;
}) {
  const kinds = iconKinds(keywords, effects).slice(0, max);
  if (kinds.length === 0) return null;
  return (
    <span className={className}>
      {kinds.map((k) => {
        const name = iconName(k);
        return (
          <svg
            key={k}
            className={`kw kw--${k}`}
            viewBox="0 0 24 24"
            role="img"
            aria-label={name}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <title>{GLOSSARY[name] ? `${name}: ${GLOSSARY[name]}` : name}</title>
            {PATHS[k]}
          </svg>
        );
      })}
    </span>
  );
}

function CardName({ name }: { name: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.fontSize = '';
    const base = parseFloat(getComputedStyle(el).fontSize);
    if (el.scrollWidth > el.clientWidth && el.clientWidth > 0) {
      el.style.fontSize = `${Math.max(base * 0.7, (base * el.clientWidth) / el.scrollWidth)}px`;
    }
  }, [name]);
  return (
    <span className="card__name" ref={ref}>
      {name}
    </span>
  );
}

/** A Spellfall card in hand or enlarged. */
export function DuelCard({ cardId, size = 'hand' }: { cardId: string; size?: 'hand' | 'large' }) {
  const card = getCard(cardId);
  const isUnit = card.type === 'unit';
  const legendary = card.rarity === 'legendary';
  return (
    <div
      className={`card card--${size} card--${card.type}${legendary ? ' card--legendary' : ''} faction-${card.faction}`}
      aria-label={card.name}
      data-card-id={cardId}
    >
      <span className="card__cost" aria-label={`Cost ${card.cost}`}>
        {card.cost}
      </span>
      {legendary && <span className="card__crest" aria-label="Legendary" />}
      <div className="card__art">
        <CardArt id={card.id} faction={card.faction} />
      </div>
      <CardName name={card.name} />
      {size === 'large' && <p className="card__text">{card.text || 'No abilities.'}</p>}
      <div className="card__foot">
        {isUnit ? (
          <>
            <span className="card__power">{card.power}</span>
            <Icons keywords={card.keywords} effects={card.effects} className="card__kw" />
            <span className="card__health">{card.health}</span>
          </>
        ) : (
          <span className={`card__type card__type--${card.speed}`}>{SPEED_LABEL[card.speed!]}</span>
        )}
      </div>
    </div>
  );
}

/** A unit on the board, with its current stats. */
export function UnitFace({ s, unit }: { s: GameState; unit: Unit }) {
  const card = getCard(unit.cardId);
  const power = unitPower(s, unit);
  const health = unitRemainingHealth(s, unit);
  const hurt = health < unitMaxHealth(s, unit);
  return (
    <>
      <div className="unit__art">
        <CardArt id={card.id} faction={card.faction} />
      </div>
      {/* Only what still matters in play: not Quick or On Play (done); Guard stays, next to its frame. */}
      <Icons
        keywords={unit.keywords.filter((k) => !SPENT_IN_PLAY.has(k))}
        effects={unit.silenced ? [] : card.effects.filter((e) => e.trigger !== 'onPlay')}
        className="unit__kw"
        max={3}
      />
      <span className={`unit__power${power > unit.basePower ? ' unit__stat--up' : ''}`}>{power}</span>
      <span className={`unit__health${hurt ? ' unit__health--hurt' : ''}`}>{health}</span>
    </>
  );
}

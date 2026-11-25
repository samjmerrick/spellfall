import { useLayoutEffect, useRef, type ReactNode } from 'react';
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
  const marks = (
    [
      'onPlay',
      'ongoing',
      'startOfTurn',
      'endOfTurn',
      'lastBreath',
      'onAttack',
      'whenFriendlyPlay',
      'whenFriendlyDies',
      'whenDamaged',
    ] as const
  ).filter((t) => effects.some((e) => e.trigger === t));
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

/** Keyword and trigger names in effect text that get an icon: the name, then its path key. */
const MARKS: Record<string, string> = {
  Guard: 'guard',
  Barrier: 'barrier',
  Overwhelm: 'overwhelm',
  Lifesteal: 'lifesteal',
  Quick: 'quick',
  Elusive: 'elusive',
  Growth: 'growth',
  Regenerate: 'regenerate',
  Ephemeral: 'ephemeral',
  'On Play': 'onPlay',
  Ongoing: 'ongoing',
  'Start of Turn': 'startOfTurn',
  'End of Turn': 'endOfTurn',
  'Last Breath': 'lastBreath',
  'Attack(?=:)': 'onAttack',
};
const MARK_RE = new RegExp(`\\b(${Object.keys(MARKS).join('|')})`, 'g');

/** Effect text with each keyword set in bold beside its icon. */
function RichText({ text }: { text: string }) {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(MARK_RE)) {
    const name = m[1]!;
    const key = MARKS[name] ?? MARKS[`${name}(?=:)`]!;
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(
      <b className="kwt" key={m.index}>
        <svg
          className={`kwt__icon kw--${key}`}
          viewBox="0 0 24 24"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {PATHS[key as Keyword]}
        </svg>
        {name}
      </b>,
    );
    last = m.index + name.length;
  }
  out.push(text.slice(last));
  return <span>{out}</span>;
}

/** Effect text on a card; the type shrinks until the text fits its box (hand and collection sizes). */
function CardText({ text, cardId }: { text: string; cardId: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.fontSize = '';
    const base = parseFloat(getComputedStyle(el).fontSize);
    let size = base;
    while (el.scrollHeight > el.clientHeight + 1 && size > 5.5) {
      size -= 0.5;
      el.style.fontSize = `${size}px`;
    }
  }, [text, cardId]);
  return (
    <p className="card__text" ref={ref}>
      <RichText text={text} />
    </p>
  );
}

/** A Spellfall card in hand, in the collection or enlarged: the same frame, with its effect text. */
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
      {card.text && <CardText text={card.text} cardId={cardId} />}
      {isUnit ? (
        <>
          <span className="card__power">{card.power}</span>
          <span className="card__health">{card.health}</span>
        </>
      ) : (
        <div className="card__foot">
          <span className={`card__type card__type--${card.speed}`}>{SPEED_LABEL[card.speed!]}</span>
        </div>
      )}
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

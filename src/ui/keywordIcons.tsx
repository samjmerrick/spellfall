import type { Keyword } from '../engine';
import type { Effect } from '../engine/schema';
import { GLOSSARY, KEYWORD_NAMES } from './glossary';
import { PATHS } from './keywordPaths';

/** Trigger markers for effects that are not keywords. `spell` is implied by the card type. */
export type EffectMark = 'onReveal' | 'ongoing' | 'endOfRound' | 'lastBreath';

const MARK_NAMES: Record<EffectMark, string> = {
  onReveal: 'On Reveal',
  ongoing: 'Ongoing',
  endOfRound: 'End of Round',
  lastBreath: 'Last Breath',
};

function label(kind: Keyword | EffectMark): { name: string; help: string } {
  const name = kind in KEYWORD_NAMES ? KEYWORD_NAMES[kind as Keyword] : MARK_NAMES[kind as EffectMark];
  return { name, help: GLOSSARY[name] ?? '' };
}

export function KeywordIcon({ kind }: { kind: Keyword | EffectMark }) {
  const { name, help } = label(kind);
  return (
    <svg
      className={`kw kw--${kind}`}
      viewBox="0 0 24 24"
      role="img"
      aria-label={name}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <title>{help ? `${name}: ${help}` : name}</title>
      {PATHS[kind]}
    </svg>
  );
}

/** Distinct non-spell triggers on a card's effects, in a stable order. */
function effectMarks(effects: readonly Effect[]): EffectMark[] {
  const order: EffectMark[] = ['onReveal', 'ongoing', 'endOfRound', 'lastBreath'];
  return order.filter((t) => effects.some((e) => e.trigger === t));
}

/** Keywords first (Shift leading, since it is actionable), then effect markers. */
function cardIconKinds(keywords: readonly Keyword[], effects: readonly Effect[]): (Keyword | EffectMark)[] {
  const ks = [...keywords].sort((a, b) => Number(b === 'shift') - Number(a === 'shift'));
  return [...ks, ...effectMarks(effects)];
}

export function KeywordRow({
  keywords,
  effects = [],
  className = 'kw-row',
  max,
}: {
  keywords: readonly Keyword[];
  effects?: readonly Effect[];
  className?: string;
  max?: number;
}) {
  const kinds = cardIconKinds(keywords, effects).slice(0, max);
  if (kinds.length === 0) return null;
  return (
    <span className={className}>
      {kinds.map((k) => (
        <KeywordIcon key={k} kind={k} />
      ))}
    </span>
  );
}

// Spellfall's keyword and trigger definitions, as shown in the card detail view (spec: Keywords).
import type { Effect, Keyword } from '../../rules';
import { KEYWORD_NAME } from '../../rules/text';

export const TRIGGER_NAME: Partial<Record<Effect['trigger'], string>> = {
  onPlay: 'On Play',
  ongoing: 'Ongoing',
  startOfTurn: 'Start of Turn',
  endOfTurn: 'End of Turn',
  lastBreath: 'Last Breath',
  onAttack: 'Attack',
  whenFriendlyPlay: 'Ally Played',
  whenFriendlyDies: 'Ally Died',
  whenDamaged: 'Damaged',
};

export const GLOSSARY: Record<string, string> = {
  Guard: 'While you have a Guard unit, enemies can only attack Guard units.',
  Barrier: 'Prevents the next damage this unit would take, then is removed.',
  Overwhelm: "When it attacks a unit, damage beyond the target's Health hits the enemy hero.",
  Lifesteal: 'Damage this unit deals in combat heals your hero by the same amount.',
  Quick: 'Can attack the turn it enters.',
  Elusive: 'Cannot be targeted by enemy spells or effects until it attacks.',
  Growth: 'End of your turn: +1 Power and +1 Health.',
  Regenerate: 'Start of your turn: heal this unit fully.',
  Ephemeral: 'Dies at the end of your turn.',
  'On Play': 'Effect resolves when the card is played from hand.',
  Ongoing: 'Effect applies while the unit is in play.',
  'Last Breath': 'Effect resolves when the unit dies.',
  'Start of Turn': 'Effect resolves at the start of your turn.',
  'End of Turn': 'Effect resolves at the end of your turn.',
  Attack: 'Effect resolves when this unit attacks.',
  Discover: 'Choose one of three random cards that fit; it is added to your hand.',
  Freeze: 'A frozen unit cannot attack until the end of its owner’s turn.',
  'Ally Played': 'Effect resolves whenever you play another unit.',
  'Ally Died': 'Effect resolves whenever another friendly unit dies.',
  Damaged: 'Effect resolves whenever this unit takes damage and survives.',
  Burst: 'Resolves at once. You keep priority.',
  Fast: 'Can be cast any time you have priority. The opponent may respond.',
  Slow: 'Only in your main phase with an empty stack. The opponent may respond.',
};

export function keywordName(k: Keyword): string {
  return KEYWORD_NAME[k];
}

/** Glossary entries for a card: its keywords, trigger words in its text, and its speed. */
export function glossaryTerms(
  keywords: readonly Keyword[],
  text: string,
  speed?: string,
): [string, string][] {
  const terms = [
    ...keywords.map(keywordName),
    ...Object.keys(GLOSSARY).filter((t) => text.includes(t)),
    ...(speed ? [speed.charAt(0).toUpperCase() + speed.slice(1)] : []),
  ];
  return [...new Set(terms)].filter((t) => GLOSSARY[t]).map((t) => [t, GLOSSARY[t]!]);
}

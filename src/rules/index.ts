// Public API of Spellfall's rules. The UI, AI and simulator import from here only.
export { initMatch, legalActions, applyAction } from './match';
export { viewFor, eventsFor, HIDDEN, type PlayerView } from './view';
export {
  findUnit,
  allUnits,
  unitPower,
  unitMaxHealth,
  unitRemainingHealth,
  canAttack,
  hasKeyword,
} from './board';
export { attackTargets, legalTargets, targetCombos, targetMatches, sameTarget } from './targets';
export {
  CARDS,
  getCard,
  hasCard,
  collectibleCards,
  upgradeCard,
  isUpgraded,
  baseId,
  generatedText,
  UPGRADED,
  PREBUILT_DECKS,
} from './content';
export * from './types';
export type { CardDef, DeckDef, Keyword, Faction, Speed, TargetSpec, MatchModifier, Effect } from './schema';
export { KEYWORDS, FACTIONS, SPEEDS, MatchModifierSchema } from './schema';

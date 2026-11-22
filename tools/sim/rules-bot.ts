// A random bot for Spellfall's rules: plays legal actions at random from a seeded stream, preferring to act
// over passing so matches progress. Used by the bulk simulation and determinism tests.
import { nextFloat } from '../../src/rules/rng';
import {
  applyAction,
  collectibleCards,
  initMatch,
  legalActions,
  type Action,
  type GameEvent,
  type GameState,
  viewFor,
} from '../../src/rules';
import { act, type Difficulty } from '../../src/ai/next';

/** 30-card mono-faction decks from the collectible cards: every card once, then the commons again. */
const deckCache = new Map<string, string[]>();
export function factionDeck(faction: string): string[] {
  const hit = deckCache.get(faction);
  if (hit) return hit;
  const cards = collectibleCards().filter((c) => c.faction === faction);
  const deck = cards.map((c) => c.id);
  const commons = cards.filter((c) => c.rarity === 'common');
  for (let i = 0; deck.length < 30; i++) deck.push(commons[i % commons.length]!.id);
  deckCache.set(faction, deck);
  return deck;
}

export interface BotMatch {
  state: GameState;
  actions: Action[];
  events: GameEvent[];
}

/** Plays one match between two random bots. `passChance` is how often a bot passes when it could act. */
export function randomMatch(decks: [string[], string[]], seed: number, passChance = 0.15): BotMatch {
  let s = initMatch({ decks }, seed);
  let rng = (seed * 7919 + 17) >>> 0;
  const rand = () => {
    const [v, next] = nextFloat(rng);
    rng = next;
    return v;
  };
  const actions: Action[] = [];
  const events: GameEvent[] = [];
  for (let step = 0; s.phase !== 'over'; step++) {
    if (step > 5000) throw new Error(`match ${seed} did not end`);
    const legal = legalActions(s);
    const acts = legal.filter((a) => a.type !== 'pass');
    const pass = legal.find((a) => a.type === 'pass');
    let a: Action;
    if (s.phase === 'mulligan') a = legal[Math.floor(rand() * legal.length)]!;
    else if (acts.length === 0 || (pass && rand() < passChance)) a = pass!;
    else a = acts[Math.floor(rand() * acts.length)]!;
    const r = applyAction(s, a);
    s = r.state;
    actions.push(a);
    events.push(...r.events);
  }
  return { state: s, actions, events };
}

/** Plays one match between two AI levels; each player decides from its own view. */
export function aiMatch(
  decks: [string[], string[]],
  levels: [Difficulty, Difficulty],
  seed: number,
  onDecision?: (ms: number, level: Difficulty) => void,
  clock: () => number = () => 0,
): BotMatch {
  let s = initMatch({ decks }, seed);
  const rngs: [number, number] = [(seed * 31 + 1) >>> 0, (seed * 37 + 2) >>> 0];
  const actions: Action[] = [];
  const events: GameEvent[] = [];
  for (let step = 0; s.phase !== 'over'; step++) {
    if (step > 5000) throw new Error(`match ${seed} did not end`);
    const player = s.phase === 'mulligan' ? (s.players[0].mulliganed ? 1 : 0) : s.priority;
    const t0 = clock();
    const { action, rng } = act(levels[player], viewFor(s, player), rngs[player]);
    onDecision?.(clock() - t0, levels[player]);
    rngs[player] = rng;
    const r = applyAction(s, action);
    s = r.state;
    actions.push(action);
    events.push(...r.events);
  }
  return { state: s, actions, events };
}

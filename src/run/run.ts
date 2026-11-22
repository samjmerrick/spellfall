// Roguelike run state. A run is its config (seed, hero, card pool) plus the list of choices made;
// `replayRun` rebuilds the state from those, so saves stay small and every bug is reproducible.
import { getCard, isUpgraded, UPGRADED, type Faction, type MatchConfig } from '../rules';
import { FACTIONS } from '../rules/schema';
import { nextInt, seedRng, shuffle, type RngState } from '../rules/rng';
import type { Difficulty } from '../ai/next';
import { ENEMIES, EVENTS, getEnemy, getEvent, getHero, getRelic, type EventOutcome } from './content';
import type { RunChoice, RunConfig } from './schema';
import { MAP_ROWS, generateMap, type MapNode, type RunMap } from './map';
import { ascensionEnemyModifiers } from './meta';

export const START_HEARTS = 3;
export const START_GOLD = 30;
export const CARD_CHOICES = 3;
export const NODE_XP = 10;
export const BOSS_XP = 100;
export const REMOVE_PRICE = 40;
export const RELIC_PRICE = 75;
export const CARD_PRICES = { common: 25, uncommon: 40, rare: 60, legendary: 80 } as const;
export const SHOP_CARDS = 4;
export const SHOP_RELICS = 2;
/** Gold for an empty treasure chest (every relic already owned). */
export const TREASURE_GOLD = 50;
export const ACTS = 3;
/** Ascension 3: gold lost at the start of a run. */
export const ASCENSION_GOLD_PENALTY = 15;
const RARITY_RANK = { common: 0, uncommon: 1, rare: 2, legendary: 3 } as const;

export type { RunConfig, RunChoice };

export interface ShopItem {
  kind: 'card' | 'relic';
  id: string;
  price: number;
  sold: boolean;
}

export type RunPhase =
  | { kind: 'map' }
  | { kind: 'match'; enemyId: string; seed: number }
  /** After a won fight or elite: pick a card. An elite's relic (or gold, if none are left) is already given. */
  | { kind: 'reward'; cards: string[]; gold: number; relicId: string | null }
  | { kind: 'event'; eventId: string; chosen: number | null; result: string[] }
  /** An act's boss is beaten: a relic is given; after act 1 a second faction may be picked. */
  | { kind: 'actCleared'; act: number; relicId: string | null; gold: number; factions: Faction[] }
  | { kind: 'shop'; stock: ShopItem[]; removed: boolean }
  | { kind: 'rest' }
  | { kind: 'treasure'; relicId: string | null; gold: number }
  | { kind: 'over'; won: boolean; abandoned: boolean };

export interface RunState {
  config: RunConfig;
  rng: RngState;
  act: number;
  map: RunMap;
  /** -1 before the first step; MAP_ROWS is the boss row. */
  row: number;
  col: number;
  hearts: number;
  gold: number;
  deck: string[];
  relics: string[];
  /** Added after the act 1 boss; its cards then appear in rewards and shops too. */
  secondFaction: Faction | null;
  phase: RunPhase;
  nodesCleared: number;
  bossesBeaten: number;
  /** Number of choices applied so far. */
  step: number;
}

export class IllegalChoiceError extends Error {}

function fail(msg: string): never {
  throw new IllegalChoiceError(msg);
}

export function startRun(config: RunConfig): RunState {
  const hero = getHero(config.heroId);
  const [map, rng] = generateMap(seedRng(config.seed));
  return {
    config,
    rng,
    act: 1,
    map,
    row: -1,
    col: 0,
    // Ascension 10 starts with 2 Hearts; the limit stays 3.
    hearts: config.ascension >= 10 ? START_HEARTS - 1 : START_HEARTS,
    gold: config.ascension >= 3 ? START_GOLD - ASCENSION_GOLD_PENALTY : START_GOLD,
    deck: [...hero.starterDeck],
    relics: [],
    secondFaction: null,
    phase: { kind: 'map' },
    nodesCleared: 0,
    bossesBeaten: 0,
    step: 0,
  };
}

export function currentNode(r: RunState): MapNode | null {
  return r.row < 0 ? null : (r.map.rows[r.row]?.[r.col] ?? null);
}

/** Columns of the next row the player may move to. */
export function nextCols(r: RunState): number[] {
  if (r.row >= MAP_ROWS) return [];
  if (r.row < 0) return r.map.rows[0]!.map((n) => n.col);
  return currentNode(r)!.next;
}

function runBonus(r: RunState, key: 'fightGold' | 'shopDiscount' | 'cardChoices' | 'hearts'): number {
  return r.relics.reduce((n, id) => n + (getRelic(id).run[key] ?? 0), 0);
}

/** The most Hearts the run can hold: 3, plus any from relics. */
export function maxHearts(r: RunState): number {
  return START_HEARTS + runBonus(r, 'hearts');
}

/** Cards that can appear in rewards and shops: owned cards of the hero's faction and the second faction. */
export function cardPool(r: RunState): string[] {
  const factions = [getHero(r.config.heroId).faction, r.secondFaction];
  return r.config.pool.filter((id) => {
    const c = getCard(id);
    return !c.token && c.faction !== 'neutral' && factions.includes(c.faction);
  });
}

/** Deck indexes of cards that can still be upgraded. */
export function upgradable(r: RunState): number[] {
  return r.deck.flatMap((id, i) => (isUpgraded(id) ? [] : [i]));
}

function draw<T>(r: RunState, list: readonly T[], n: number): T[] {
  const [shuffled, rng] = shuffle(r.rng, list);
  r.rng = rng;
  return shuffled.slice(0, n);
}

function roll(r: RunState, min: number, max: number): number {
  const [v, rng] = nextInt(r.rng, min, max);
  r.rng = rng;
  return v;
}

/** A shop price: relic discounts first (rounded), then Ascension 2's 25% markup (rounded up). */
function price(r: RunState, base: number): number {
  const discounted = Math.round((base * (100 - Math.min(90, runBonus(r, 'shopDiscount')))) / 100);
  return r.config.ascension >= 2 ? Math.ceil((discounted * 125) / 100) : discounted;
}

/** What removing a card costs in a shop. */
export function removePrice(r: RunState): number {
  return price(r, REMOVE_PRICE);
}

/** Gold from a fight reward; Ascension 5 takes 25% off (rounded down). */
function fightGold(r: RunState, gold: number): number {
  return r.config.ascension >= 5 ? Math.floor((gold * 75) / 100) : gold;
}

/** Cards offered after a fight: 3 (2 from Ascension 9), plus relic bonuses. */
export function cardChoices(r: RunState): number {
  return (r.config.ascension >= 9 ? CARD_CHOICES - 1 : CARD_CHOICES) + runBonus(r, 'cardChoices');
}

function unownedRelics(r: RunState): string[] {
  return r.config.relics.filter((id) => !r.relics.includes(id));
}

function grantRelic(r: RunState, id: string): void {
  r.relics.push(id);
  r.hearts += getRelic(id).run.hearts ?? 0;
}

/** Gives a random unowned relic; returns its id, or null (and gives gold) when every relic is owned. */
function randomRelic(r: RunState): string | null {
  const id = draw(r, unownedRelics(r), 1)[0] ?? null;
  if (id) grantRelic(r, id);
  else r.gold += TREASURE_GOLD;
  return id;
}

function randomCard(r: RunState, rarity?: keyof typeof RARITY_RANK): string | null {
  const pool = cardPool(r);
  const good = rarity ? pool.filter((id) => RARITY_RANK[getCard(id).rarity] >= RARITY_RANK[rarity]) : pool;
  return draw(r, good.length > 0 ? good : pool, 1)[0] ?? null;
}

function upgradeAt(r: RunState, index: number): string {
  const id = r.deck[index]!;
  r.deck[index] = id + UPGRADED;
  return r.deck[index]!;
}

function startAct(r: RunState, act: number): void {
  r.act = act;
  const [map, rng] = generateMap(r.rng);
  r.map = map;
  r.rng = rng;
  r.row = -1;
  r.col = 0;
  // A new act restores 1 Heart.
  r.hearts = Math.min(maxHearts(r), r.hearts + 1);
  r.phase = { kind: 'map' };
}

/** Applies an event outcome and returns a line describing what happened. */
function applyOutcome(r: RunState, o: EventOutcome): string {
  switch (o.kind) {
    case 'gold': {
      const n = roll(r, o.min, o.max);
      r.gold += n;
      return `+${n} gold`;
    }
    case 'hearts': {
      const before = r.hearts;
      r.hearts = Math.min(maxHearts(r), r.hearts + o.amount);
      return r.hearts > before ? `+${r.hearts - before} Heart` : 'Hearts already full';
    }
    case 'card': {
      const id = randomCard(r, o.rarity);
      if (!id) return 'No card found';
      r.deck.push(id);
      return `Added ${getCard(id).name}`;
    }
    case 'relic': {
      const id = randomRelic(r);
      return id ? `Relic: ${getRelic(id).name}` : `+${TREASURE_GOLD} gold`;
    }
    case 'upgrade': {
      const picks = draw(r, upgradable(r), o.count);
      return picks.length === 0
        ? 'Nothing to upgrade'
        : picks.map((i) => `Upgraded ${getCard(upgradeAt(r, i)).name}`).join(', ');
    }
    case 'remove': {
      const picks = draw(
        r,
        r.deck.map((_, i) => i),
        Math.min(o.count, r.deck.length - 1),
      ).sort((a, b) => b - a);
      const names = picks.map((i) => getCard(r.deck.splice(i, 1)[0]!).name);
      return names.length === 0 ? 'Nothing removed' : `Removed ${names.join(', ')}`;
    }
  }
}

/** Whether an event choice can be taken: its gold is affordable and Hearts would be left over. */
export function canChoose(r: RunState, cost: { gold?: number; hearts?: number }): boolean {
  return (cost.gold ?? 0) <= r.gold && (cost.hearts ?? 0) < r.hearts;
}

function enterNode(r: RunState): void {
  const node = currentNode(r)!;
  switch (node.type) {
    case 'fight':
    case 'elite':
    case 'boss': {
      const pool = ENEMIES.filter((e) => e.act === r.act && e.kind === node.type);
      const enemy = draw(r, pool, 1)[0]!;
      r.phase = { kind: 'match', enemyId: enemy.id, seed: roll(r, 1, 0x7fffffff) };
      return;
    }
    case 'rest':
      r.nodesCleared++;
      r.phase = { kind: 'rest' };
      return;
    case 'shop': {
      r.nodesCleared++;
      const cards = draw(r, cardPool(r), SHOP_CARDS).map((id): ShopItem => ({
        kind: 'card',
        id,
        price: price(r, CARD_PRICES[getCard(id).rarity]),
        sold: false,
      }));
      const relics = draw(r, unownedRelics(r), SHOP_RELICS).map((id): ShopItem => ({
        kind: 'relic',
        id,
        price: price(r, RELIC_PRICE),
        sold: false,
      }));
      r.phase = { kind: 'shop', stock: [...cards, ...relics], removed: false };
      return;
    }
    case 'treasure': {
      r.nodesCleared++;
      const relicId = randomRelic(r);
      r.phase = { kind: 'treasure', relicId, gold: relicId ? 0 : TREASURE_GOLD };
      return;
    }
    case 'event': {
      r.nodesCleared++;
      const event = draw(r, EVENTS, 1)[0]!;
      r.phase = { kind: 'event', eventId: event.id, chosen: null, result: [] };
      return;
    }
  }
}

function matchEnded(r: RunState, won: boolean): void {
  const node = currentNode(r)!;
  if (!won) {
    r.hearts--;
    if (r.hearts <= 0) r.phase = { kind: 'over', won: false, abandoned: false };
    else if (node.type === 'boss')
      enterNode(r); // a rematch against the boss
    else r.phase = { kind: 'map' };
    return;
  }
  r.nodesCleared++;
  if (node.type === 'boss') {
    r.bossesBeaten++;
    if (r.act >= ACTS) {
      r.phase = { kind: 'over', won: true, abandoned: false };
      return;
    }
    const gold = fightGold(r, roll(r, 40, 60) + runBonus(r, 'fightGold'));
    r.gold += gold;
    const relicId = randomRelic(r);
    const hero = getHero(r.config.heroId).faction;
    const factions = r.act === 1 ? FACTIONS.filter((f) => f !== hero) : [];
    r.phase = { kind: 'actCleared', act: r.act, relicId, gold, factions };
    return;
  }
  const relicId = node.type === 'elite' ? randomRelic(r) : null;
  const cards = draw(r, cardPool(r), cardChoices(r));
  const gold = fightGold(r, roll(r, 15, 25) + (node.type === 'elite' ? 15 : 0) + runBonus(r, 'fightGold'));
  r.gold += gold;
  r.phase = { kind: 'reward', cards, gold, relicId };
}

/** Applies one choice. Pure: returns a new state, or throws IllegalChoiceError. */
export function applyChoice(state: RunState, choice: RunChoice): RunState {
  const r = structuredClone(state);
  const phase = r.phase;
  if (phase.kind === 'over') fail('The run is over');
  if (choice.t === 'abandon') {
    if (phase.kind === 'match') fail('Leave the match before abandoning');
    r.phase = { kind: 'over', won: false, abandoned: true };
  } else if (phase.kind === 'map') {
    if (choice.t !== 'move') fail(`Cannot ${choice.t} on the map`);
    if (!nextCols(r).includes(choice.col)) fail(`Cannot move to column ${choice.col}`);
    r.row++;
    r.col = choice.col;
    enterNode(r);
  } else if (phase.kind === 'match') {
    if (choice.t !== 'matchEnd') fail('Finish the match first');
    matchEnded(r, choice.won);
  } else if (phase.kind === 'reward') {
    if (choice.t !== 'pick') fail('Pick a card or skip');
    if (choice.index !== null) {
      const card = phase.cards[choice.index] ?? fail('No such card');
      r.deck.push(card);
    }
    r.phase = { kind: 'map' };
  } else if (phase.kind === 'shop') {
    if (choice.t === 'leave') r.phase = { kind: 'map' };
    else if (choice.t === 'buy') {
      const item = phase.stock[choice.index] ?? fail('No such item');
      if (item.sold) fail('Already sold');
      if (item.price > r.gold) fail('Not enough gold');
      r.gold -= item.price;
      item.sold = true;
      if (item.kind === 'card') r.deck.push(item.id);
      else grantRelic(r, item.id);
    } else if (choice.t === 'removeCard') {
      if (phase.removed) fail('Only one card can be removed per shop');
      if (removePrice(r) > r.gold) fail('Not enough gold');
      if (r.deck.length <= 1) fail('Your deck needs at least one card');
      if (!r.deck[choice.index]) fail('No such card');
      r.deck.splice(choice.index, 1);
      r.gold -= removePrice(r);
      phase.removed = true;
    } else fail(`Cannot ${choice.t} in a shop`);
  } else if (phase.kind === 'rest') {
    if (choice.t === 'rest') {
      if (r.config.ascension >= 8) fail('Rests can only upgrade a card at this Ascension');
      if (r.hearts >= maxHearts(r)) fail('Hearts are already full');
      r.hearts++;
    } else if (choice.t === 'upgrade') {
      if (!upgradable(r).includes(choice.index)) fail('That card cannot be upgraded');
      upgradeAt(r, choice.index);
    } else if (choice.t !== 'leave') fail(`Cannot ${choice.t} at a rest`);
    r.phase = { kind: 'map' };
  } else if (phase.kind === 'event') {
    if (phase.chosen === null) {
      if (choice.t !== 'event') fail('Make a choice');
      const option = getEvent(phase.eventId).choices[choice.index] ?? fail('No such choice');
      if (!canChoose(r, option.cost)) fail('You cannot pay for that');
      r.gold -= option.cost.gold ?? 0;
      r.hearts -= option.cost.hearts ?? 0;
      const lines = [
        ...(option.cost.gold ? [`-${option.cost.gold} gold`] : []),
        ...(option.cost.hearts ? [`-${option.cost.hearts} Heart`] : []),
        ...option.outcomes.map((o) => applyOutcome(r, o)),
      ];
      r.phase = { kind: 'event', eventId: phase.eventId, chosen: choice.index, result: lines };
    } else if (choice.t === 'leave') r.phase = { kind: 'map' };
    else fail('Leave the event');
  } else if (phase.kind === 'actCleared') {
    if (choice.t !== 'nextAct') fail('Continue to the next act');
    if (choice.faction !== null) {
      r.secondFaction = phase.factions[choice.faction] ?? fail('No such faction');
    }
    startAct(r, phase.act + 1);
  } else if (phase.kind === 'treasure') {
    if (choice.t !== 'leave') fail('Take the treasure and leave');
    r.phase = { kind: 'map' };
  }
  r.step++;
  return r;
}

export function replayRun(config: RunConfig, choices: readonly RunChoice[]): RunState {
  return choices.reduce(applyChoice, startRun(config));
}

/** XP earned so far: 10 per node cleared, 100 per boss, doubled for a full win. */
export function runXp(r: RunState): number {
  const xp = r.nodesCleared * NODE_XP + r.bossesBeaten * BOSS_XP;
  return r.phase.kind === 'over' && r.phase.won ? xp * 2 : xp;
}

/** Boss overrides for the AI (see `ai` in enemies.json). */
export interface AiHooks {
  seesHand?: boolean;
}

export interface RunMatch {
  config: MatchConfig;
  seed: number;
  difficulty: Difficulty;
  hooks: AiHooks;
  enemyId: string;
}

/** The match for the current node: your run deck, hero passive and relics against the enemy. */
export function runMatch(r: RunState): RunMatch {
  if (r.phase.kind !== 'match') fail('No match in progress');
  const enemy = getEnemy(r.phase.enemyId);
  const hero = getHero(r.config.heroId);
  return {
    config: {
      decks: [r.deck, enemy.deck],
      modifiers: [
        [...hero.modifiers, ...r.relics.flatMap((id) => getRelic(id).modifiers)],
        [...enemy.modifiers, ...ascensionEnemyModifiers(r.config.ascension, enemy)],
      ],
    },
    seed: r.phase.seed,
    // Ascension 7: act 1 enemies never use Easy AI.
    difficulty:
      r.config.ascension >= 7 && enemy.act === 1 && enemy.difficulty === 'easy' ? 'normal' : enemy.difficulty,
    hooks: enemy.ai,
    enemyId: enemy.id,
  };
}

/** The AI's random stream for a match, separate from the match RNG. */
export function matchAiRng(seed: number): RngState {
  return seedRng((seed ^ 0x5bd1e995) >>> 0);
}

// Effect primitives, selectors, damage, deaths and triggers. Every function here mutates a draft state
// owned by the caller (applyAction clones the state first).
import { allUnits, findUnit, hasKeyword, unitEffects, unitMaxHealth, unitRemainingHealth } from './board';
import { collectibleCardIds, getCard } from './content';
import { nextInt } from './rng';
import type { CardFilter, Condition, Effect, Primitive, Trigger, UnitSelector } from './schema';
import {
  BOARD_LIMIT,
  HAND_LIMIT,
  other,
  type GameEvent,
  type GameState,
  type PlayerId,
  type TargetRef,
  type Unit,
} from './types';

export interface Ctx {
  s: GameState;
  events: GameEvent[];
}

/** Where an effect comes from: its owner, its unit (if any, and still relevant) and its chosen targets. */
export interface Source {
  owner: PlayerId;
  unitUid: number | null;
  /** Chosen targets by index; null where a target became illegal before resolving. */
  targets: (TargetRef | null)[];
  /** The stack item id of the resolving spell, for counters. */
  stackId?: number;
  /** The spell that was just cast, for whenCast / whenEnemyCast triggers. */
  castCardId?: string;
}

export function randomInt(ctx: Ctx, min: number, max: number): number {
  const [v, next] = nextInt(ctx.s.rng, min, max);
  ctx.s.rng = next;
  return v;
}

function pickRandom<T>(ctx: Ctx, items: readonly T[]): T | undefined {
  if (items.length === 0) return undefined;
  return items[randomInt(ctx, 0, items.length - 1)];
}

const byPlayOrder = (a: Unit, b: Unit) => a.playOrder - b.playOrder;

// ---------- Selectors ----------

function chosen(src: Source, sel: 'target' | 'target2'): TargetRef | null {
  return src.targets[sel === 'target' ? 0 : 1] ?? null;
}

/** Live units a selector picks, in play order. Dead (doomed or lethally damaged) units are skipped. */
export function selectUnits(ctx: Ctx, sel: UnitSelector, src: Source): Unit[] {
  const s = ctx.s;
  const alive = (u: Unit) => !u.doomed && unitRemainingHealth(s, u) > 0;
  const mine = s.boards[src.owner].filter(alive);
  const theirs = s.boards[other(src.owner)].filter(alive);
  switch (sel) {
    case 'self': {
      const loc = src.unitUid === null ? null : findUnit(s, src.unitUid);
      return loc && alive(loc.unit) ? [loc.unit] : [];
    }
    case 'target':
    case 'target2': {
      const t = chosen(src, sel);
      if (!t || t.kind !== 'unit') return [];
      const loc = findUnit(s, t.uid);
      return loc && alive(loc.unit) ? [loc.unit] : [];
    }
    case 'allFriendlyUnits':
      return [...mine].sort(byPlayOrder);
    case 'otherFriendlyUnits':
      return mine.filter((u) => u.uid !== src.unitUid).sort(byPlayOrder);
    case 'allEnemyUnits':
      return [...theirs].sort(byPlayOrder);
    case 'allUnits':
      return [...mine, ...theirs].sort(byPlayOrder);
    case 'otherUnits':
      return [...mine, ...theirs].filter((u) => u.uid !== src.unitUid).sort(byPlayOrder);
    case 'adjacentUnits': {
      const loc = src.unitUid === null ? null : findUnit(s, src.unitUid);
      if (!loc) return [];
      const board = s.boards[loc.owner];
      return [board[loc.index - 1], board[loc.index + 1]].filter((u): u is Unit => !!u && alive(u));
    }
    case 'randomEnemyUnit': {
      const u = pickRandom(ctx, theirs);
      return u ? [u] : [];
    }
    case 'randomFriendlyUnit': {
      const u = pickRandom(
        ctx,
        mine.filter((x) => x.uid !== src.unitUid),
      );
      return u ? [u] : [];
    }
  }
}

/** Heroes a damage/heal selector picks: the named hero, or a chosen hero target. */
function selectHero(sel: string, src: Source): PlayerId | null {
  if (sel === 'friendlyHero') return src.owner;
  if (sel === 'enemyHero') return other(src.owner);
  if (sel === 'target' || sel === 'target2') {
    const t = chosen(src, sel);
    if (t?.kind === 'hero') return t.player;
  }
  return null;
}

// ---------- Conditions and counts ----------

export function conditionMet(ctx: Ctx, c: Condition, src: Source): boolean {
  const s = ctx.s;
  switch (c.kind) {
    case 'hpAtMost':
      return s.players[src.owner].hp <= c.amount;
    case 'enemyHpAtMost':
      return s.players[other(src.owner)].hp <= c.amount;
    case 'friendlyUnitsAtLeast':
      return s.boards[src.owner].length >= c.amount;
    case 'enemyUnitsAtLeast':
      return s.boards[other(src.owner)].length >= c.amount;
    case 'handAtMost':
      return s.players[src.owner].hand.length <= c.amount;
    case 'selfDamaged': {
      const loc = src.unitUid === null ? null : findUnit(s, src.unitUid);
      return !!loc && loc.unit.damage > 0;
    }
  }
}

function countOf(
  ctx: Ctx,
  per: NonNullable<Extract<Primitive, { op: 'damage' }>['per']>,
  src: Source,
): number {
  const s = ctx.s;
  switch (per) {
    case 'friendlyUnits':
      return s.boards[src.owner].length;
    case 'enemyUnits':
      return s.boards[other(src.owner)].length;
    case 'handSize':
      return s.players[src.owner].hand.length;
    case 'enemyHandSize':
      return s.players[other(src.owner)].hand.length;
    case 'fallen':
      return s.players[src.owner].discard.filter((id) => getCard(id).type === 'unit').length;
  }
}

/** Collectible cards that fit a filter, in content order. */
export function cardPool(filter: CardFilter): string[] {
  return collectibleCardIds().filter((id) => {
    const c = getCard(id);
    return (
      (filter.type === undefined || c.type === filter.type) &&
      (filter.faction === undefined || c.faction === filter.faction) &&
      (filter.minCost === undefined || c.cost >= filter.minCost) &&
      (filter.maxCost === undefined || c.cost <= filter.maxCost) &&
      (filter.rarity === undefined || c.rarity === filter.rarity) &&
      (filter.keyword === undefined || c.keywords.includes(filter.keyword))
    );
  });
}

// ---------- Mutations ----------

/** Deals damage to a unit; Barrier prevents it. Returns the damage actually dealt. */
export function damageUnit(ctx: Ctx, unit: Unit, amount: number): number {
  if (amount <= 0) return 0;
  if (unit.barrier) {
    unit.barrier = false;
    unit.keywords = unit.keywords.filter((k) => k !== 'barrier');
    ctx.events.push({ type: 'BarrierBroken', uid: unit.uid });
    return 0;
  }
  unit.damage += amount;
  ctx.events.push({ type: 'DamageDealt', uid: unit.uid, amount });
  if (unitRemainingHealth(ctx.s, unit) > 0 && !unit.doomed) runTrigger(ctx, unit, 'whenDamaged');
  return amount;
}

export function healUnit(ctx: Ctx, unit: Unit, amount: number | 'full'): void {
  const healed = amount === 'full' ? unit.damage : Math.min(unit.damage, amount);
  if (healed <= 0) return;
  unit.damage -= healed;
  ctx.events.push({ type: 'UnitHealed', uid: unit.uid, amount: healed });
}

export function damageHero(ctx: Ctx, player: PlayerId, amount: number): void {
  if (amount <= 0) return;
  const p = ctx.s.players[player];
  // Death Ward: the hero cannot be reduced below 1 HP (a hero already at 0 or less is not saved).
  if (p.deathWard && p.hp >= 1) {
    const taken = Math.min(amount, p.hp - 1);
    if (taken <= 0) {
      ctx.events.push({ type: 'HeroWarded', player });
      return;
    }
    p.hp -= taken;
    ctx.events.push({ type: 'HeroDamaged', player, amount: taken });
    return;
  }
  p.hp -= amount;
  ctx.events.push({ type: 'HeroDamaged', player, amount });
}

export function healHero(ctx: Ctx, player: PlayerId, amount: number | 'full'): void {
  const p = ctx.s.players[player];
  const missing = Math.max(0, p.maxHp - p.hp);
  const healed = amount === 'full' ? missing : Math.min(missing, amount);
  if (healed <= 0) return;
  p.hp += healed;
  ctx.events.push({ type: 'HeroHealed', player, amount: healed });
}

/** Draws one card. From an empty deck the player takes fatigue damage (1, 2, 3, …) instead. */
export function drawCard(ctx: Ctx, player: PlayerId): void {
  const p = ctx.s.players[player];
  const cardId = p.deck.pop();
  if (cardId === undefined) {
    p.fatigue += 1;
    ctx.events.push({ type: 'Fatigue', player, amount: p.fatigue });
    damageHero(ctx, player, p.fatigue);
    return;
  }
  addToHand(ctx, player, cardId);
}

/** Puts a card into a hand (a full hand burns it). Returns the new hand uid, or null if burned. */
export function addToHand(ctx: Ctx, player: PlayerId, cardId: string): number | null {
  const p = ctx.s.players[player];
  if (p.hand.length >= HAND_LIMIT) {
    p.discard.push(cardId);
    ctx.events.push({ type: 'CardBurned', player, cardId });
    return null;
  }
  const uid = ctx.s.nextUid++;
  p.hand.push({ uid, cardId });
  ctx.events.push({ type: 'CardDrawn', player, uid, cardId });
  return uid;
}

export function createUnit(ctx: Ctx, cardId: string, owner: PlayerId, uid?: number): Unit {
  const card = getCard(cardId);
  return {
    uid: uid ?? ctx.s.nextUid++,
    cardId,
    owner,
    basePower: card.power ?? 0,
    baseHealth: card.health ?? 1,
    turnPower: 0,
    turnHealth: 0,
    damage: 0,
    keywords: [...card.keywords],
    barrier: card.keywords.includes('barrier'),
    silenced: false,
    enteredTurn: ctx.s.turn,
    attacked: false,
    doomed: false,
    playOrder: ctx.s.nextPlayOrder++,
  };
}

function summon(ctx: Ctx, cardId: string, owner: PlayerId): void {
  const board = ctx.s.boards[owner];
  if (board.length >= BOARD_LIMIT) return;
  const unit = createUnit(ctx, cardId, owner);
  board.push(unit);
  ctx.events.push({ type: 'UnitSummoned', player: owner, uid: unit.uid, cardId, position: board.length - 1 });
}

/** Moves an enemy unit to the end of `owner`'s board (if there is room). It cannot attack this turn unless Quick. */
function steal(ctx: Ctx, unit: Unit, owner: PlayerId): void {
  if (unit.owner === owner) return;
  const dest = ctx.s.boards[owner];
  if (dest.length >= BOARD_LIMIT) return;
  const loc = findUnit(ctx.s, unit.uid);
  if (!loc) return;
  ctx.s.boards[loc.owner].splice(loc.index, 1);
  const from = unit.owner;
  unit.owner = owner;
  unit.enteredTurn = ctx.s.turn;
  unit.attacked = false;
  unit.playOrder = ctx.s.nextPlayOrder++;
  dest.push(unit);
  ctx.events.push({ type: 'UnitControlled', uid: unit.uid, from, to: owner, position: dest.length - 1 });
}

/** Returns up to `count` units from the owner's discard pile to the board, most recent first. */
function revive(ctx: Ctx, owner: PlayerId, count: number): void {
  const discard = ctx.s.players[owner].discard;
  let left = count;
  for (let i = discard.length - 1; i >= 0 && left > 0; i--) {
    if (ctx.s.boards[owner].length >= BOARD_LIMIT) return;
    const id = discard[i]!;
    if (getCard(id).type !== 'unit') continue;
    discard.splice(i, 1);
    summon(ctx, id, owner);
    left--;
  }
}

function bounce(ctx: Ctx, unit: Unit): void {
  const loc = findUnit(ctx.s, unit.uid);
  if (!loc) return;
  ctx.s.boards[loc.owner].splice(loc.index, 1);
  const token = getCard(unit.cardId).token;
  const handUid = token ? null : addToHand(ctx, unit.owner, unit.cardId);
  ctx.events.push({ type: 'UnitBounced', uid: unit.uid, cardId: unit.cardId, owner: unit.owner, handUid });
}

function silence(ctx: Ctx, unit: Unit): void {
  const card = getCard(unit.cardId);
  unit.silenced = true;
  unit.keywords = [];
  unit.barrier = false;
  unit.basePower = card.power ?? 0;
  unit.baseHealth = card.health ?? 1;
  unit.turnPower = 0;
  unit.turnHealth = 0;
  ctx.events.push({ type: 'Silenced', uid: unit.uid });
}

export function grantKeyword(ctx: Ctx, unit: Unit, keyword: Unit['keywords'][number]): void {
  if (!unit.keywords.includes(keyword)) unit.keywords.push(keyword);
  if (keyword === 'barrier') unit.barrier = true;
  ctx.events.push({ type: 'KeywordGranted', uid: unit.uid, keyword });
}

// ---------- Primitive dispatch ----------

export function runPrimitive(ctx: Ctx, action: Primitive, src: Source): void {
  switch (action.op) {
    case 'damage': {
      const amount = action.amount * (action.per ? countOf(ctx, action.per, src) : 1);
      if (amount <= 0) return;
      const hero = selectHero(action.target, src);
      if (hero !== null) damageHero(ctx, hero, amount);
      else for (const u of selectUnits(ctx, action.target as UnitSelector, src)) damageUnit(ctx, u, amount);
      return;
    }
    case 'heal': {
      const amount =
        action.amount === 'full' ? 'full' : action.amount * (action.per ? countOf(ctx, action.per, src) : 1);
      if (amount === 0) return;
      const hero = selectHero(action.target, src);
      if (hero !== null) healHero(ctx, hero, amount);
      else for (const u of selectUnits(ctx, action.target as UnitSelector, src)) healUnit(ctx, u, amount);
      return;
    }
    case 'buff': {
      const n = action.per ? countOf(ctx, action.per, src) : 1;
      const power = action.power * n;
      const health = action.health * n;
      if (power === 0 && health === 0) return;
      for (const u of selectUnits(ctx, action.target, src)) {
        if (action.duration === 'permanent') {
          u.basePower += power;
          u.baseHealth += health;
        } else {
          u.turnPower += power;
          u.turnHealth += health;
        }
        ctx.events.push({ type: 'UnitBuffed', uid: u.uid, power, health, duration: action.duration });
      }
      return;
    }
    case 'draw':
      for (let i = 0; i < action.count; i++) drawCard(ctx, src.owner);
      return;
    case 'summon':
      for (let i = 0; i < action.count; i++) summon(ctx, action.cardId, src.owner);
      return;
    case 'gainMana': {
      ctx.s.players[src.owner].mana += action.amount;
      ctx.events.push({ type: 'ManaGained', player: src.owner, amount: action.amount, max: false });
      return;
    }
    case 'gainMaxMana': {
      const p = ctx.s.players[src.owner];
      const gained = Math.min(action.amount, 10 - p.maxMana);
      if (gained <= 0) return;
      p.maxMana += gained;
      ctx.events.push({ type: 'ManaGained', player: src.owner, amount: gained, max: true });
      return;
    }
    case 'grantKeyword':
      for (const u of selectUnits(ctx, action.target, src)) grantKeyword(ctx, u, action.keyword);
      return;
    case 'destroy':
      for (const u of selectUnits(ctx, action.target, src)) u.doomed = true;
      return;
    case 'bounce':
      for (const u of selectUnits(ctx, action.target, src)) bounce(ctx, u);
      return;
    case 'silence':
      for (const u of selectUnits(ctx, action.target, src)) silence(ctx, u);
      return;
    case 'counter': {
      const t = chosen(src, 'target');
      if (t?.kind !== 'stack') return;
      const i = ctx.s.stack.findIndex((x) => x.id === t.id);
      if (i < 0) return;
      ctx.s.stack.splice(i, 1);
      ctx.events.push({ type: 'Countered', id: t.id, by: src.stackId ?? -1 });
      return;
    }
    case 'steal':
      for (const u of selectUnits(ctx, action.target, src)) steal(ctx, u, src.owner);
      return;
    case 'setMaxMana': {
      const p = ctx.s.players[src.owner];
      const gained = Math.max(0, Math.min(10, action.amount) - p.maxMana);
      if (gained > 0) {
        p.maxMana += gained;
        ctx.events.push({ type: 'ManaGained', player: src.owner, amount: gained, max: true });
      }
      const refill = p.maxMana - p.mana;
      if (refill > 0) {
        p.mana = p.maxMana;
        ctx.events.push({ type: 'ManaGained', player: src.owner, amount: refill, max: false });
      }
      return;
    }
    case 'deathWard':
      ctx.s.players[src.owner].deathWard = true;
      ctx.events.push({ type: 'HeroWarded', player: src.owner });
      return;
    case 'extraTurn':
      ctx.s.extraTurn = src.owner;
      ctx.events.push({ type: 'ExtraTurn', player: src.owner });
      return;
    case 'revive':
      revive(ctx, src.owner, action.count);
      return;
    case 'copySpell':
      if (src.castCardId !== undefined) addToHand(ctx, src.owner, src.castCardId);
      return;
    case 'conjure':
      for (let i = 0; i < action.count; i++) addToHand(ctx, src.owner, action.cardId);
      return;
    case 'conjureRandom': {
      const pool = cardPool(action.filter);
      for (let i = 0; i < action.count; i++) {
        const id = pickRandom(ctx, pool);
        if (id !== undefined) addToHand(ctx, src.owner, id);
      }
      return;
    }
    case 'fetch': {
      const deck = ctx.s.players[src.owner].deck;
      const ok = new Set(cardPool(action.filter));
      for (let i = deck.length - 1; i >= 0; i--) {
        if (!ok.has(deck[i]!)) continue;
        const [id] = deck.splice(i, 1);
        addToHand(ctx, src.owner, id!);
        return;
      }
      return;
    }
    case 'discover': {
      const pool = [...cardPool(action.filter)];
      const options: string[] = [];
      while (options.length < 3 && pool.length > 0) {
        const i = randomInt(ctx, 0, pool.length - 1);
        options.push(pool.splice(i, 1)[0]!);
      }
      if (options.length === 0) return;
      (ctx.s.pending ??= []).push({ player: src.owner, options });
      ctx.events.push({ type: 'ChoiceOffered', player: src.owner, options });
      return;
    }
    case 'freeze':
      for (const u of selectUnits(ctx, action.target, src)) {
        u.frozen = true;
        ctx.events.push({ type: 'UnitFrozen', uid: u.uid });
      }
      return;
    case 'drainMana': {
      const foe = ctx.s.players[other(src.owner)];
      foe.manaPenalty = (foe.manaPenalty ?? 0) + action.amount;
      ctx.events.push({ type: 'ManaDrained', player: other(src.owner), amount: action.amount });
      return;
    }
    case 'copyUnit':
      for (const u of selectUnits(ctx, action.target, src)) summon(ctx, u.cardId, src.owner);
      return;
  }
}

/** Runs one effect if its condition holds. */
export function runEffect(ctx: Ctx, effect: Effect, src: Source): void {
  if (effect.if && !conditionMet(ctx, effect.if, src)) return;
  runPrimitive(ctx, effect.action, src);
}

/** Runs one trigger of a unit's card effects (none if silenced). */
export function runTrigger(
  ctx: Ctx,
  unit: Unit,
  trigger: Trigger,
  targets: (TargetRef | null)[] = [],
  castCardId?: string,
): void {
  const src: Source = { owner: unit.owner, unitUid: unit.uid, targets, castCardId };
  for (const effect of unitEffects(unit)) {
    if (effect.trigger === trigger) runEffect(ctx, effect, src);
  }
}

/**
 * Removes every unit whose damage reaches its Health (or that is doomed), then runs their Last Breath
 * effects in play order. Repeats until no more units die, since Last Breath (and lost auras) can kill.
 */
export function processDeaths(ctx: Ctx): void {
  for (let pass = 0; pass < 100; pass++) {
    const dying = allUnits(ctx.s)
      .filter((u) => u.doomed || u.damage >= unitMaxHealth(ctx.s, u))
      .sort(byPlayOrder);
    if (dying.length === 0) return;
    for (const u of dying) {
      const loc = findUnit(ctx.s, u.uid)!;
      ctx.s.boards[loc.owner].splice(loc.index, 1);
      if (!getCard(u.cardId).token) ctx.s.players[u.owner].discard.push(u.cardId);
      ctx.events.push({ type: 'UnitDied', uid: u.uid, cardId: u.cardId, owner: u.owner });
    }
    for (const u of dying) runTrigger(ctx, u, 'lastBreath');
    for (const u of dying) {
      for (const f of [...ctx.s.boards[u.owner]].sort(byPlayOrder)) {
        if (findUnit(ctx.s, f.uid) && !f.doomed) runTrigger(ctx, f, 'whenFriendlyDies');
      }
    }
  }
  throw new Error('processDeaths did not settle');
}

/** Resolves one attack: simultaneous damage, Overwhelm to the hero, Lifesteal for both sides. */
export function resolveCombat(ctx: Ctx, attacker: Unit, target: TargetRef, power: (u: Unit) => number): void {
  const s = ctx.s;
  const pa = power(attacker);
  const owner = attacker.owner;
  if (target.kind === 'hero') {
    damageHero(ctx, target.player, pa);
    ctx.events.push({ type: 'Combat', attacker: attacker.uid, target, dealt: pa, taken: 0, overwhelm: 0 });
    if (hasKeyword(attacker, 'lifesteal')) healHero(ctx, owner, pa);
    return;
  }
  const defender = findUnit(s, (target as { uid: number }).uid)!.unit;
  const pt = power(defender);
  const remaining = unitRemainingHealth(s, defender);
  // Overwhelm: the target takes only what it can absorb; the rest goes to its hero.
  const overwhelm = hasKeyword(attacker, 'overwhelm');
  const excess = overwhelm ? Math.max(0, pa - Math.max(0, remaining)) : 0;
  const dealt = damageUnit(ctx, defender, pa - excess);
  const taken = damageUnit(ctx, attacker, pt);
  if (excess > 0) damageHero(ctx, defender.owner, excess);
  ctx.events.push({ type: 'Combat', attacker: attacker.uid, target, dealt, taken, overwhelm: excess });
  if (hasKeyword(attacker, 'lifesteal')) healHero(ctx, owner, dealt + excess);
  if (hasKeyword(defender, 'lifesteal')) healHero(ctx, defender.owner, taken);
}

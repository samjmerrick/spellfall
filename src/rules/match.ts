// Match setup, the turn sequence, priority and the stack. `applyAction` is the only way to change a match.
import { canAttack, findUnit, hasKeyword, unitPower } from './board';
import { getCard } from './content';
import {
  addToHand,
  createUnit,
  drawCard,
  healUnit,
  processDeaths,
  resolveCombat,
  runPrimitive,
  runTrigger,
  type Ctx,
  type Source,
} from './effects';
import { seedRng, shuffle } from './rng';
import { attackTargets, sameTarget, targetCombos, targetMatches } from './targets';
import {
  BOARD_LIMIT,
  DEFAULT_HERO_HP,
  FIRST_HAND,
  IllegalActionError,
  MAX_MANA,
  SECOND_HAND,
  SPARK_ID,
  TURN_LIMIT,
  other,
  type Action,
  type GameEvent,
  type GameState,
  type MatchConfig,
  type PlayerId,
  type PlayerState,
  type StackItem,
  type TargetRef,
} from './types';

const clone = <T>(x: T): T => structuredClone(x);

export function initMatch(config: MatchConfig, seed: number): GameState {
  let rng = seedRng(seed);
  const modifiers = config.modifiers ?? [[], []];
  const firstFromSeed: PlayerId = (seed & 1) as PlayerId;
  const firstPlayer = config.firstPlayer ?? firstFromSeed;
  const players = ([0, 1] as const).map((p) => {
    const [deck, next] = shuffle(rng, config.decks[p]);
    rng = next;
    const bonusHp = modifiers[p].reduce((n, m) => (m.kind === 'heroHp' ? n + m.amount : n), 0);
    const hp = Math.max(1, (config.heroHp ?? DEFAULT_HERO_HP) + bonusHp);
    const ps: PlayerState = {
      hp,
      maxHp: hp,
      maxMana: 0,
      mana: 0,
      deck,
      hand: [],
      discard: [],
      fatigue: 0,
      mulliganed: false,
      turnsTaken: 0,
    };
    return ps;
  }) as [PlayerState, PlayerState];

  const s: GameState = {
    version: 2,
    turn: 0,
    phase: 'mulligan',
    activePlayer: firstPlayer,
    priority: firstPlayer,
    firstPlayer,
    stack: [],
    boards: [[], []],
    players,
    rng,
    nextUid: 1,
    nextPlayOrder: 1,
    result: null,
    modifiers: clone(modifiers),
  };
  const ctx: Ctx = { s, events: [] };
  for (const p of [0, 1] as const) {
    const extra = modifiers[p].reduce((n, m) => (m.kind === 'startHand' ? n + m.amount : n), 0);
    const count = (p === firstPlayer ? FIRST_HAND : SECOND_HAND) + extra;
    for (let i = 0; i < count; i++) {
      const cardId = s.players[p].deck.pop();
      if (cardId !== undefined) s.players[p].hand.push({ uid: s.nextUid++, cardId });
    }
  }
  return ctx.s;
}

// ---------- Turn sequence ----------

function checkWin(ctx: Ctx): boolean {
  const s = ctx.s;
  if (s.result) return true;
  const dead = [s.players[0].hp <= 0, s.players[1].hp <= 0];
  if (!dead[0] && !dead[1]) return false;
  const winner: PlayerId | null = dead[0] && dead[1] ? null : dead[0] ? 1 : 0;
  s.result = { winner, reason: 'hp' };
  s.phase = 'over';
  s.stack = [];
  ctx.events.push({ type: 'MatchEnded', winner, reason: 'hp' });
  return true;
}

/** Deaths, then the win check. Returns true if the match is over. */
function settle(ctx: Ctx): boolean {
  processDeaths(ctx);
  return checkWin(ctx);
}

function startTurn(ctx: Ctx, player: PlayerId): void {
  const s = ctx.s;
  s.turn += 1;
  s.activePlayer = player;
  s.priority = player;
  s.phase = 'main';
  const p = s.players[player];
  p.turnsTaken += 1;
  p.maxMana = Math.min(MAX_MANA, p.maxMana + 1);
  p.mana = p.maxMana;
  for (const u of s.boards[player]) u.attacked = false;
  ctx.events.push({ type: 'TurnStarted', turn: s.turn, player, maxMana: p.maxMana });
  drawCard(ctx, player);
  if (settle(ctx)) return;
  for (const u of [...s.boards[player]].sort((a, b) => a.playOrder - b.playOrder)) {
    if (!findUnit(s, u.uid)) continue;
    if (hasKeyword(u, 'regenerate')) healUnit(ctx, u, 'full');
    runTrigger(ctx, u, 'startOfTurn');
  }
  for (const m of s.modifiers[player]) {
    if (m.kind !== 'turnStart') continue;
    if (m.turns && !m.turns.includes(p.turnsTaken)) continue;
    runPrimitive(ctx, m.action, { owner: player, unitUid: null, targets: [] });
  }
  settle(ctx);
}

function endTurn(ctx: Ctx): void {
  const s = ctx.s;
  const player = s.activePlayer;
  for (const u of [...s.boards[player]].sort((a, b) => a.playOrder - b.playOrder)) {
    if (!findUnit(s, u.uid)) continue;
    runTrigger(ctx, u, 'endOfTurn');
    if (hasKeyword(u, 'growth')) {
      u.basePower += 1;
      u.baseHealth += 1;
      ctx.events.push({ type: 'UnitBuffed', uid: u.uid, power: 1, health: 1, duration: 'permanent' });
    }
    if (hasKeyword(u, 'ephemeral')) u.doomed = true;
  }
  if (settle(ctx)) return;
  for (const u of [...s.boards[0], ...s.boards[1]]) {
    u.turnPower = 0;
    u.turnHealth = 0;
  }
  if (settle(ctx)) return;
  // Death Ward lasts until the end of the turn.
  for (const q of s.players) delete q.deathWard;
  // Unspent mana is kept: it pays for Fast and Burst spells on the opponent's turn, until your next turn refills it.
  ctx.events.push({ type: 'TurnEnded', turn: s.turn, player });
  if (s.turn >= TURN_LIMIT) {
    s.result = { winner: null, reason: 'turns' };
    s.phase = 'over';
    ctx.events.push({ type: 'MatchEnded', winner: null, reason: 'turns' });
    return;
  }
  // An extra-turn effect gives the active player the next turn too (once).
  const again = s.extraTurn === player;
  delete s.extraTurn;
  startTurn(ctx, again ? player : other(player));
}

// ---------- Stack ----------

function nextStackId(s: GameState): number {
  return s.nextUid++;
}

function resolveItem(ctx: Ctx, item: StackItem): void {
  const s = ctx.s;
  ctx.events.push({ type: 'StackResolving', id: item.id });
  if (item.kind === 'attack') {
    const att = findUnit(s, item.attacker);
    if (!att || att.owner !== item.owner) {
      ctx.events.push({ type: 'Fizzled', id: item.id, reason: 'attacker gone' });
      return;
    }
    if (item.target.kind === 'unit') {
      const def = findUnit(s, item.target.uid);
      if (!def || def.owner === item.owner) {
        ctx.events.push({ type: 'Fizzled', id: item.id, reason: 'target gone' });
        return;
      }
    }
    resolveCombat(ctx, att.unit, item.target, (u) => unitPower(s, u));
    return;
  }
  const card = getCard(item.cardId);
  const targets = item.targets.map((t, i) =>
    targetMatches(s, card.targets[i]!, item.owner, t, item.id) ? t : null,
  );
  if (card.targets.length > 0 && targets.every((t) => t === null)) {
    ctx.events.push({ type: 'Fizzled', id: item.id, reason: 'targets gone' });
    return;
  }
  const src: Source = { owner: item.owner, unitUid: null, targets, stackId: item.id };
  for (const e of card.effects) runPrimitive(ctx, e.action, src);
}

/** Resolves the whole stack, newest first, with no priority in between. */
function resolveStack(ctx: Ctx): void {
  const s = ctx.s;
  while (s.stack.length > 0) {
    const item = s.stack.pop()!;
    resolveItem(ctx, item);
    if (settle(ctx)) return;
  }
  s.priority = s.activePlayer;
}

// ---------- Paying ----------

function canPay(p: PlayerState, cost: number): boolean {
  return cost <= p.mana;
}

function pay(ctx: Ctx, player: PlayerId, cost: number): void {
  ctx.s.players[player].mana -= cost;
  if (cost > 0) ctx.events.push({ type: 'ManaSpent', player, mana: cost });
}

// ---------- Legal actions ----------

/**
 * Every legal action for the player with priority. During the mulligan, both players' keep-all and
 * replace-all choices are listed (any subset is legal in `applyAction`).
 */
export function legalActions(s: GameState): Action[] {
  if (s.phase === 'over') return [];
  if (s.phase === 'mulligan') {
    const out: Action[] = [];
    for (const player of [0, 1] as const) {
      const p = s.players[player];
      if (p.mulliganed) continue;
      out.push({ type: 'mulligan', player, uids: [] });
      out.push({ type: 'mulligan', player, uids: p.hand.map((c) => c.uid) });
    }
    return out;
  }
  const player = s.priority;
  const p = s.players[player];
  const open = s.stack.length === 0 && player === s.activePlayer;
  const out: Action[] = [];
  for (const c of p.hand) {
    const card = getCard(c.cardId);
    if (card.type === 'unit') {
      if (!open || !canPay(p, card.cost) || s.boards[player].length >= BOARD_LIMIT) continue;
      const combos = targetCombos(s, card.targets, player);
      for (let position = 0; position <= s.boards[player].length; position++) {
        for (const targets of combos.length > 0 ? combos : [[]])
          out.push({ type: 'playUnit', player, uid: c.uid, position, targets });
      }
    } else {
      if (!canPay(p, card.cost)) continue;
      if (card.speed === 'slow' && !open) continue;
      for (const targets of targetCombos(s, card.targets, player))
        out.push({ type: 'castSpell', player, uid: c.uid, targets });
    }
  }
  if (open) {
    const targets = attackTargets(s, player);
    for (const u of s.boards[player]) {
      if (!canAttack(s, u)) continue;
      for (const target of targets) out.push({ type: 'attack', player, attacker: u.uid, target });
    }
  }
  out.push({ type: 'pass', player });
  return out;
}

// ---------- Applying actions ----------

function illegal(msg: string): never {
  throw new IllegalActionError(msg);
}

function checkTargets(
  s: GameState,
  cardId: string,
  player: PlayerId,
  targets: TargetRef[],
  optional: boolean,
): void {
  const card = getCard(cardId);
  if (targets.length === 0 && card.targets.length > 0) {
    // Units may be played without targets only when no legal target exists.
    if (optional && targetCombos(s, card.targets, player).length === 0) return;
    illegal(`${cardId} needs targets`);
  }
  if (targets.length !== card.targets.length) illegal(`${cardId} takes ${card.targets.length} targets`);
  targets.forEach((t, i) => {
    if (!targetMatches(s, card.targets[i]!, player, t)) illegal(`illegal target for ${cardId}`);
  });
  if (targets.length === 2 && sameTarget(targets[0]!, targets[1]!)) illegal('the two targets must differ');
}

export function applyAction(state: GameState, action: Action): { state: GameState; events: GameEvent[] } {
  if (state.phase === 'over') illegal('the match is over');
  const s = clone(state);
  const ctx: Ctx = { s, events: [] };

  if (action.type === 'mulligan') {
    if (s.phase !== 'mulligan') illegal('not in the mulligan');
    const p = s.players[action.player];
    if (p.mulliganed) illegal('already mulliganed');
    const set = new Set(action.uids);
    if (set.size !== action.uids.length || action.uids.some((u) => !p.hand.some((c) => c.uid === u)))
      illegal('mulligan cards must be distinct cards in hand');
    const back = p.hand.filter((c) => set.has(c.uid));
    p.hand = p.hand.filter((c) => !set.has(c.uid));
    // Keeping the whole hand leaves the deck as it is (no shuffle, no RNG used).
    if (back.length > 0) {
      const [deck, rng] = shuffle(s.rng, [...p.deck, ...back.map((c) => c.cardId)]);
      p.deck = deck;
      s.rng = rng;
    }
    for (let i = 0; i < back.length; i++) {
      const cardId = p.deck.pop()!;
      p.hand.push({ uid: s.nextUid++, cardId });
    }
    p.mulliganed = true;
    ctx.events.push({ type: 'MulliganDone', player: action.player, replaced: back.length });
    if (s.players[0].mulliganed && s.players[1].mulliganed) {
      addToHand(ctx, other(s.firstPlayer), SPARK_ID);
      startTurn(ctx, s.firstPlayer);
    }
    return { state: s, events: ctx.events };
  }

  if (s.phase !== 'main') illegal('not in the main phase');
  const player = action.player;
  if (player !== s.priority) illegal(`player ${player} does not have priority`);
  const p = s.players[player];
  const open = s.stack.length === 0 && player === s.activePlayer;

  switch (action.type) {
    case 'pass': {
      if (s.stack.length === 0) {
        if (player !== s.activePlayer) illegal('only the active player can end the turn');
        endTurn(ctx);
      } else {
        ctx.events.push({ type: 'PriorityPassed', from: player, to: other(player) });
        resolveStack(ctx);
      }
      break;
    }
    case 'playUnit': {
      const hi = p.hand.findIndex((c) => c.uid === action.uid);
      if (hi < 0) illegal('card not in hand');
      const cardId = p.hand[hi]!.cardId;
      const card = getCard(cardId);
      if (card.type !== 'unit') illegal('not a unit');
      if (!open) illegal('units can only be played in your main phase with an empty stack');
      if (!canPay(p, card.cost)) illegal('not enough mana');
      if (s.boards[player].length >= BOARD_LIMIT) illegal('board is full');
      if (
        action.position < 0 ||
        action.position > s.boards[player].length ||
        !Number.isInteger(action.position)
      )
        illegal('bad position');
      checkTargets(s, cardId, player, action.targets, true);
      p.hand.splice(hi, 1);
      pay(ctx, player, card.cost);
      const unit = createUnit(ctx, cardId, player, action.uid);
      s.boards[player].splice(action.position, 0, unit);
      ctx.events.push({
        type: 'UnitPlayed',
        player,
        uid: unit.uid,
        cardId,
        position: action.position,
        targets: action.targets,
      });
      if (hasKeyword(unit, 'rally')) {
        for (const u of s.boards[player]) {
          if (u.uid === unit.uid) continue;
          u.turnPower += 1;
          ctx.events.push({ type: 'UnitBuffed', uid: u.uid, power: 1, health: 0, duration: 'turn' });
        }
      }
      runTrigger(ctx, unit, 'onPlay', action.targets);
      settle(ctx);
      break;
    }
    case 'castSpell': {
      const hi = p.hand.findIndex((c) => c.uid === action.uid);
      if (hi < 0) illegal('card not in hand');
      const cardId = p.hand[hi]!.cardId;
      const card = getCard(cardId);
      if (card.type !== 'spell') illegal('not a spell');
      if (card.speed === 'slow' && !open) illegal('slow spells need your main phase and an empty stack');
      if (!canPay(p, card.cost)) illegal('not enough mana');
      checkTargets(s, cardId, player, action.targets, false);
      p.hand.splice(hi, 1);
      p.discard.push(cardId);
      pay(ctx, player, card.cost);
      ctx.events.push({
        type: 'SpellCast',
        player,
        uid: action.uid,
        cardId,
        speed: card.speed!,
        targets: action.targets,
      });
      // Whenever-you-cast triggers (and the enemy's) happen as the spell is cast, before it resolves.
      for (const who of [player, other(player)] as const) {
        const trigger = who === player ? 'whenCast' : 'whenEnemyCast';
        for (const u of [...s.boards[who]].sort((a, b) => a.playOrder - b.playOrder)) {
          if (findUnit(s, u.uid)) runTrigger(ctx, u, trigger, [], cardId);
        }
      }
      if (settle(ctx)) break;
      if (card.speed === 'burst') {
        const src: Source = { owner: player, unitUid: null, targets: action.targets };
        for (const e of card.effects) runPrimitive(ctx, e.action, src);
        settle(ctx);
      } else {
        const item: StackItem = {
          id: nextStackId(s),
          kind: 'spell',
          owner: player,
          cardId,
          targets: action.targets,
        };
        s.stack.push(item);
        ctx.events.push({ type: 'StackItemAdded', item });
        s.priority = other(player);
      }
      break;
    }
    case 'attack': {
      if (!open) illegal('attacks need your main phase and an empty stack');
      const att = findUnit(s, action.attacker);
      if (!att || att.owner !== player) illegal('attacker not on your board');
      if (!canAttack(s, att.unit)) illegal('that unit cannot attack now');
      if (!attackTargets(s, player).some((t) => sameTarget(t, action.target)))
        illegal('illegal attack target');
      att.unit.attacked = true;
      if (hasKeyword(att.unit, 'elusive')) {
        att.unit.keywords = att.unit.keywords.filter((k) => k !== 'elusive');
        ctx.events.push({ type: 'KeywordLost', uid: att.unit.uid, keyword: 'elusive' });
      }
      const item: StackItem = {
        id: nextStackId(s),
        kind: 'attack',
        owner: player,
        attacker: action.attacker,
        target: action.target,
      };
      s.stack.push(item);
      ctx.events.push({
        type: 'AttackDeclared',
        player,
        attacker: action.attacker,
        target: action.target,
        stackId: item.id,
      });
      ctx.events.push({ type: 'StackItemAdded', item });
      s.priority = other(player);
      break;
    }
  }
  return { state: s, events: ctx.events };
}

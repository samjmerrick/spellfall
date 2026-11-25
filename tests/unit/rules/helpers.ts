import {
  awaitingAbility,
  applyAction,
  getCard,
  initMatch,
  type Action,
  type GameEvent,
  type GameState,
  type Keyword,
  type MatchConfig,
  type PlayerId,
  type TargetRef,
  type Unit,
} from '../../../src/rules';

export const FILLER = 'bastion-recruit';

/**
 * A match past the mulligan, in player 0's main phase on turn 1 (player 0 goes first), with both hands
 * emptied and both players on `mana` max mana. Tests add cards with `give` and units with `place`.
 */
// Rule tests use a 20 HP hero so damage numbers stay small; the 30 HP default is tested in turns.test.ts.
export function setup(
  opts: {
    seed?: number;
    deck?: string[];
    heroHp?: number;
    mana?: number;
    modifiers?: MatchConfig['modifiers'];
    keepHands?: boolean;
  } = {},
): GameState {
  const deck = opts.deck ?? Array.from({ length: 30 }, () => FILLER);
  let s = initMatch(
    { decks: [deck, deck], heroHp: opts.heroHp ?? 20, modifiers: opts.modifiers, firstPlayer: 0 },
    opts.seed ?? 1,
  );
  s = act(s, { type: 'mulligan', player: 0, uids: [] });
  s = act(s, { type: 'mulligan', player: 1, uids: [] });
  if (!opts.keepHands) {
    s.players[0].hand = [];
    s.players[1].hand = [];
  }
  if (opts.mana !== undefined) {
    for (const p of s.players) {
      p.maxMana = opts.mana;
      p.mana = opts.mana;
    }
  }
  return s;
}

let uidCounter = 10_000;

/** Puts a unit straight onto the board (test setup only; mutates s). It entered last turn, so it can attack. */
export function place(
  s: GameState,
  player: PlayerId,
  cardId: string,
  opts: { keywords?: Keyword[]; damage?: number; fresh?: boolean; position?: number } = {},
): Unit {
  const card = getCard(cardId);
  const keywords = [...card.keywords, ...(opts.keywords ?? [])];
  const unit: Unit = {
    uid: uidCounter++,
    cardId,
    owner: player,
    basePower: card.power ?? 0,
    baseHealth: card.health ?? 1,
    turnPower: 0,
    turnHealth: 0,
    damage: opts.damage ?? 0,
    keywords,
    barrier: keywords.includes('barrier'),
    silenced: false,
    enteredTurn: opts.fresh ? s.turn : s.turn - 1,
    attacked: false,
    doomed: false,
    playOrder: s.nextPlayOrder++,
  };
  s.boards[player].splice(opts.position ?? s.boards[player].length, 0, unit);
  return unit;
}

/** Adds a card to a hand (mutates s) and returns its uid. */
export function give(s: GameState, player: PlayerId, cardId: string): number {
  const uid = uidCounter++;
  s.players[player].hand.push({ uid, cardId });
  return uid;
}

let lastEvents: GameEvent[] = [];

/** Applies an action and returns the new state; the events are in `events()`. */
export function act(s: GameState, action: Action): GameState {
  const r = applyAction(s, action);
  lastEvents = r.events;
  return r.state;
}

export function events(): GameEvent[] {
  return lastEvents;
}

export const unit = (uid: number): TargetRef => ({ kind: 'unit', uid });
export const hero = (player: PlayerId): TargetRef => ({ kind: 'hero', player });

export function cast(s: GameState, player: PlayerId, cardId: string, targets: TargetRef[] = []): GameState {
  return act(s, { type: 'castSpell', player, uid: give(s, player, cardId), targets });
}

export function play(
  s: GameState,
  player: PlayerId,
  cardId: string,
  targets: TargetRef[] = [],
  position?: number,
): GameState {
  const played = act(s, {
    type: 'playUnit',
    player,
    uid: give(s, player, cardId),
    position: position ?? s.boards[player].length,
    targets,
  });
  return resolveAbility(played);
}

/** Lets an On Play ability on the stack resolve (the opponent passes), unless it still waits for targets. */
export function resolveAbility(s: GameState): GameState {
  if (s.stack.length === 0 || awaitingAbility(s)) return s;
  const top = s.stack[s.stack.length - 1]!;
  if (top.kind !== 'ability') return s;
  return act(s, { type: 'pass', player: s.priority });
}

export const pass = (s: GameState, player: PlayerId = s.priority): GameState =>
  act(s, { type: 'pass', player });

export function attack(s: GameState, attacker: Unit, target: TargetRef): GameState {
  return act(s, { type: 'attack', player: attacker.owner, attacker: attacker.uid, target });
}

/** The unit with this uid in state `s`. */
export function u(s: GameState, uid: number): Unit {
  for (const b of s.boards) {
    const found = b.find((x) => x.uid === uid);
    if (found) return found;
  }
  throw new Error(`unit ${uid} not on the board`);
}

export const onBoard = (s: GameState, uid: number) => s.boards.some((b) => b.some((x) => x.uid === uid));

import type { Keyword, MatchModifier } from './schema';

export type PlayerId = 0 | 1;

export const BOARD_LIMIT = 6;
export const MAX_MANA = 10;
export const SPELL_MANA_CAP = 3;
export const HAND_LIMIT = 10;
export const FIRST_HAND = 3;
export const SECOND_HAND = 4;
export const DEFAULT_HERO_HP = 20;
/** The match is a draw when this turn ends with no winner (20 turns each). */
export const TURN_LIMIT = 40;
export const SPARK_ID = 'neutral-spark';

export interface Unit {
  uid: number;
  cardId: string;
  owner: PlayerId;
  /** Printed stats plus permanent buffs. */
  basePower: number;
  baseHealth: number;
  /** Buffs that expire at the end of the current turn. */
  turnPower: number;
  turnHealth: number;
  damage: number;
  keywords: Keyword[];
  barrier: boolean;
  /** Silenced units have no keywords and no card effects. */
  silenced: boolean;
  /** The turn number it entered; it cannot attack that turn unless Quick. */
  enteredTurn: number;
  /** Whether it has declared an attack this turn. */
  attacked: boolean;
  /** Set by destroy effects and Ephemeral; it dies at the next death check. */
  doomed: boolean;
  /** Global play order: trigger order. */
  playOrder: number;
}

export interface HandCard {
  uid: number;
  cardId: string;
}

/** A chosen target. Heroes are named by their player; stack items by their id. */
export type TargetRef =
  { kind: 'unit'; uid: number } | { kind: 'hero'; player: PlayerId } | { kind: 'stack'; id: number };

export type StackItem =
  | { id: number; kind: 'spell'; owner: PlayerId; cardId: string; targets: TargetRef[] }
  | { id: number; kind: 'attack'; owner: PlayerId; attacker: number; target: TargetRef };

export interface PlayerState {
  hp: number;
  maxHp: number;
  maxMana: number;
  mana: number;
  spellMana: number;
  /** Top of deck is the last element. */
  deck: string[];
  hand: HandCard[];
  discard: string[];
  /** Fatigue damage taken by the next draw from an empty deck, minus 1. */
  fatigue: number;
  mulliganed: boolean;
  /** Number of turns this player has started (1 on their first turn). */
  turnsTaken: number;
}

export interface MatchResult {
  winner: PlayerId | null;
  reason: 'hp' | 'turns';
}

export interface GameState {
  version: 2;
  /** Turns started so far, both players together (1 = the first player's first turn). */
  turn: number;
  phase: 'mulligan' | 'main' | 'over';
  activePlayer: PlayerId;
  /** Who may act now (in the mulligan, both may). */
  priority: PlayerId;
  firstPlayer: PlayerId;
  stack: StackItem[];
  /** boards[player] left to right. */
  boards: [Unit[], Unit[]];
  players: [PlayerState, PlayerState];
  rng: number;
  nextUid: number;
  nextPlayOrder: number;
  result: MatchResult | null;
  /** Per-player match modifiers (hero passive, relics, boss rule). */
  modifiers: [MatchModifier[], MatchModifier[]];
}

export interface MatchConfig {
  decks: [string[], string[]];
  heroHp?: number;
  /** Force who goes first; otherwise the seed decides. */
  firstPlayer?: PlayerId;
  modifiers?: [MatchModifier[], MatchModifier[]];
}

export type Action =
  | { type: 'mulligan'; player: PlayerId; uids: number[] }
  | { type: 'playUnit'; player: PlayerId; uid: number; position: number; targets: TargetRef[] }
  | { type: 'castSpell'; player: PlayerId; uid: number; targets: TargetRef[] }
  | { type: 'attack'; player: PlayerId; attacker: number; target: TargetRef }
  /** With an empty stack: end the turn. With items on the stack: resolve the whole stack. */
  | { type: 'pass'; player: PlayerId };

export type GameEvent =
  | { type: 'MulliganDone'; player: PlayerId; replaced: number }
  | { type: 'TurnStarted'; turn: number; player: PlayerId; maxMana: number }
  | { type: 'CardDrawn'; player: PlayerId; uid: number; cardId: string }
  | { type: 'CardBurned'; player: PlayerId; cardId: string }
  | { type: 'Fatigue'; player: PlayerId; amount: number }
  | { type: 'ManaSpent'; player: PlayerId; mana: number; spellMana: number }
  | { type: 'ManaGained'; player: PlayerId; amount: number; max: boolean }
  | {
      type: 'UnitPlayed';
      player: PlayerId;
      uid: number;
      cardId: string;
      position: number;
      targets: TargetRef[];
    }
  | { type: 'UnitSummoned'; player: PlayerId; uid: number; cardId: string; position: number }
  | { type: 'SpellCast'; player: PlayerId; uid: number; cardId: string; speed: string; targets: TargetRef[] }
  | { type: 'AttackDeclared'; player: PlayerId; attacker: number; target: TargetRef; stackId: number }
  | { type: 'StackItemAdded'; item: StackItem }
  | { type: 'PriorityPassed'; from: PlayerId; to: PlayerId }
  | { type: 'StackResolving'; id: number }
  | { type: 'Fizzled'; id: number; reason: string }
  | { type: 'Countered'; id: number; by: number }
  | { type: 'Combat'; attacker: number; target: TargetRef; dealt: number; taken: number; overwhelm: number }
  | { type: 'UnitBuffed'; uid: number; power: number; health: number; duration: 'permanent' | 'turn' }
  | { type: 'KeywordGranted'; uid: number; keyword: Keyword }
  | { type: 'KeywordLost'; uid: number; keyword: Keyword }
  | { type: 'Silenced'; uid: number }
  | { type: 'DamageDealt'; uid: number; amount: number }
  | { type: 'BarrierBroken'; uid: number }
  | { type: 'UnitHealed'; uid: number; amount: number }
  | { type: 'UnitDied'; uid: number; cardId: string; owner: PlayerId }
  | { type: 'UnitBounced'; uid: number; cardId: string; owner: PlayerId; handUid: number | null }
  | { type: 'HeroDamaged'; player: PlayerId; amount: number }
  | { type: 'HeroHealed'; player: PlayerId; amount: number }
  | { type: 'SpellManaBanked'; player: PlayerId; spellMana: number }
  | { type: 'TurnEnded'; turn: number; player: PlayerId }
  | { type: 'MatchEnded'; winner: PlayerId | null; reason: 'hp' | 'turns' };

export class IllegalActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IllegalActionError';
  }
}

export function other(p: PlayerId): PlayerId {
  return p === 0 ? 1 : 0;
}

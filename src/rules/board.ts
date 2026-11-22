// Read-only queries over a GameState: unit stats (with Ongoing auras), lookups and keyword checks.
import { getCard } from './content';
import type { Effect, Keyword } from './schema';
import type { GameState, PlayerId, Unit } from './types';

export interface UnitLocation {
  unit: Unit;
  owner: PlayerId;
  index: number;
}

export function findUnit(s: GameState, uid: number): UnitLocation | null {
  for (const owner of [0, 1] as const) {
    const index = s.boards[owner].findIndex((u) => u.uid === uid);
    if (index >= 0) return { unit: s.boards[owner][index]!, owner, index };
  }
  return null;
}

export function allUnits(s: GameState): Unit[] {
  return [...s.boards[0], ...s.boards[1]];
}

/** A unit's card effects, or none if it is silenced. */
export function unitEffects(u: Unit): Effect[] {
  return u.silenced ? [] : getCard(u.cardId).effects;
}

export function hasKeyword(u: Unit, k: Keyword): boolean {
  return u.keywords.includes(k);
}

/** Ongoing buffs from other units that apply to `u`: [power, health]. */
function auras(s: GameState, u: Unit): [number, number] {
  let p = 0;
  let h = 0;
  for (const owner of [0, 1] as const) {
    const board = s.boards[owner];
    board.forEach((src, i) => {
      if (src.uid === u.uid) return;
      for (const e of unitEffects(src)) {
        if (e.trigger !== 'ongoing' || e.action.op !== 'buff') continue;
        const t = e.action.target;
        const applies =
          (t === 'otherFriendlyUnits' && u.owner === owner) ||
          (t === 'allEnemyUnits' && u.owner !== owner) ||
          (t === 'adjacentUnits' &&
            u.owner === owner &&
            (board[i - 1]?.uid === u.uid || board[i + 1]?.uid === u.uid));
        if (applies) {
          p += e.action.power;
          h += e.action.health;
        }
      }
    });
  }
  return [p, h];
}

export function unitPower(s: GameState, u: Unit): number {
  return Math.max(0, u.basePower + u.turnPower + auras(s, u)[0]);
}

export function unitMaxHealth(s: GameState, u: Unit): number {
  return u.baseHealth + u.turnHealth + auras(s, u)[1];
}

export function unitRemainingHealth(s: GameState, u: Unit): number {
  return unitMaxHealth(s, u) - u.damage;
}

/** Whether `u` can declare an attack now (ignoring priority and the stack). */
export function canAttack(s: GameState, u: Unit): boolean {
  if (u.attacked || u.doomed) return false;
  if (u.owner !== s.activePlayer) return false;
  if (unitPower(s, u) <= 0) return false;
  return u.enteredTurn < s.turn || hasKeyword(u, 'quick');
}

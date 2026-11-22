// Board evaluation for Spellfall planners: a weighted sum, from one player's side.
import weightsJson from '../content/ai-weights.json';
import { canAttack, other, unitPower, unitRemainingHealth, type GameState, type PlayerId } from '../rules';

export interface Weights {
  heroHp: number;
  unitPower: number;
  unitHealth: number;
  keyword: number;
  hand: number;
  mana: number;
  win: number;
}

export const WEIGHTS: Weights = weightsJson;

function side(s: GameState, p: PlayerId, w: Weights): number {
  let v = s.players[p].hp * w.heroHp + s.players[p].hand.length * w.hand;
  for (const u of s.boards[p]) {
    // Units are valued as they will stand once "this turn" buffs expire: a temporary buff is only worth
    // something through what it changed (a fight won, a unit saved), never for itself.
    const health = unitRemainingHealth(s, u) - u.turnHealth;
    if (health <= 0) continue;
    // A Power buff still counts on a unit that can attack with it this turn.
    const power = canAttack(s, u) ? unitPower(s, u) : Math.max(0, unitPower(s, u) - u.turnPower);
    v += power * w.unitPower + health * w.unitHealth;
    v += (u.keywords.length + (u.barrier ? 1 : 0)) * w.keyword;
  }
  return v;
}

/** Higher is better for `p`. A won match scores `win`, a lost one `-win`. */
export function score(s: GameState, p: PlayerId, w: Weights = WEIGHTS): number {
  if (s.result) {
    if (s.result.winner === p) return w.win;
    if (s.result.winner === other(p)) return -w.win;
    return 0;
  }
  return side(s, p, w) - side(s, other(p), w);
}

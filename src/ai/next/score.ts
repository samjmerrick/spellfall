// Board evaluation for Spellfall planners: a weighted sum, from one player's side.
import weightsJson from '../../content/next/ai-weights.json';
import { other, unitPower, unitRemainingHealth, type GameState, type PlayerId } from '../../rules';

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
    v += unitPower(s, u) * w.unitPower + Math.max(0, unitRemainingHealth(s, u)) * w.unitHealth;
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

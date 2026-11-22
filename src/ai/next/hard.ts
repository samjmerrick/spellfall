// Hard AI: determinised look-ahead. The opponent's hidden hand and deck are filled with cards it could hold
// (from the factions it has shown), Normal's best few actions are tried, and each is played out with Normal
// for both sides to the end of the opponent's next turn. The action with the best average score wins.
import { nextInt, type RngState } from '../../rules/rng';
import {
  collectibleCards,
  getCard,
  HIDDEN,
  other,
  type GameState,
  type PlayerId,
  type PlayerView,
} from '../../rules';
import { actNormal, rankActions, simulate, type ActResult } from './index';
import { score } from './score';

/** Reads the time in ms; the UI passes one so Hard stops at its budget. Without it, Hard is deterministic. */
export type Clock = () => number;

export const HARD = {
  candidates: 4,
  samples: 4,
  budgetMs: 400,
  /** Actions per rollout before it is cut off and scored. */
  rolloutCap: 40,
};

/** Factions the opponent has shown (board, discard, stack); all factions if none yet. */
function shownFactions(view: PlayerView): Set<string> {
  const opp = other(view.viewer);
  const ids = [
    ...view.boards[opp].map((u) => u.cardId),
    ...view.players[opp].discard,
    ...view.stack
      .filter((i) => i.kind === 'spell' && i.owner === opp)
      .map((i) => (i as { cardId: string }).cardId),
  ];
  const f = new Set(ids.map((id) => getCard(id).faction).filter((x) => x !== 'neutral'));
  return f.size > 0 ? f : new Set(['ember', 'tide', 'grove', 'bastion', 'dusk']);
}

/** A full state consistent with the view: hidden cards replaced by plausible ones. */
export function determinise(view: PlayerView, rng: RngState): [GameState, RngState] {
  const s = structuredClone(view) as GameState & { viewer?: PlayerId };
  delete s.viewer;
  const factions = shownFactions(view);
  const pool = collectibleCards().filter((c) => factions.has(c.faction));
  let r = rng;
  const pick = () => {
    const [i, next] = nextInt(r, 0, pool.length - 1);
    r = next;
    return pool[i]!.id;
  };
  const opp = other(view.viewer);
  s.players[opp].hand = s.players[opp].hand.map((c) => (c.cardId === HIDDEN ? { ...c, cardId: pick() } : c));
  s.players[opp].deck = s.players[opp].deck.map((id) => (id === HIDDEN ? pick() : id));
  return [s, r];
}

/** Plays Normal for both sides from `s` until `stopAfterTurn` ends (or the cap), then scores for `me`. */
function rollout(s: GameState, me: PlayerId, stopAfterTurn: number): number {
  let g = s;
  for (let i = 0; i < HARD.rolloutCap && g.phase === 'main' && g.turn <= stopAfterTurn; i++) {
    const p = g.priority;
    const v = { ...g, viewer: p } as PlayerView;
    const { action } = actNormal(v, 0);
    const next = simulate(g, action, false);
    if (!next) break;
    g = next;
  }
  return score(g, me);
}

export function actHard(view: PlayerView, rng: RngState, clock?: Clock): ActResult {
  const me = view.viewer;
  if (view.phase === 'mulligan') return actNormal(view, rng);
  const ranked = rankActions(view);
  // Only one sensible option: no search needed.
  if (ranked.length <= 1) return { action: ranked[0]?.action ?? { type: 'pass', player: me }, rng };
  const candidates = ranked.slice(0, HARD.candidates).map((c) => c.action);
  if (!candidates.some((a) => a.type === 'pass')) candidates.push({ type: 'pass', player: me });
  const totals = candidates.map(() => 0);
  const counts = candidates.map(() => 0);
  const start = clock?.() ?? 0;
  // Look as far as the end of the opponent's next turn.
  const horizon = view.turn + (view.activePlayer === me ? 1 : 0);
  let r = rng;
  for (let sample = 0; sample < HARD.samples; sample++) {
    const [world, next] = determinise(view, r);
    r = next;
    for (let i = 0; i < candidates.length; i++) {
      if (clock && clock() - start > HARD.budgetMs) break;
      const after = simulate(world, candidates[i]!, false);
      if (!after) continue;
      totals[i]! += rollout(after, me, horizon);
      counts[i]! += 1;
    }
    if (clock && clock() - start > HARD.budgetMs) break;
  }
  let best = 0;
  let bestValue = -Infinity;
  candidates.forEach((_, i) => {
    if (counts[i] === 0) return;
    const v = totals[i]! / counts[i]!;
    if (v > bestValue) {
      bestValue = v;
      best = i;
    }
  });
  return { action: candidates[best]!, rng: r };
}

// Spellfall opponent planners. Each call returns one action for the player with priority, from that
// player's view only (`viewFor`), plus the advanced AI RNG stream.
import { nextFloat, nextInt, type RngState } from '../rules/rng';
import {
  applyAction,
  awaitingAbility,
  getCard,
  HIDDEN,
  legalActions,
  type Action,
  type GameState,
  type PlayerId,
  type PlayerView,
} from '../rules';
import { score } from './score';
import { actHard, type Clock } from './hard';

export type { Clock };

export type Difficulty = 'easy' | 'normal' | 'hard';

export interface ActResult {
  action: Action;
  rng: RngState;
}

/** Mulligan: replace cards costing 5 or more (both levels). */
function mulligan(view: PlayerView, player: PlayerId): Action {
  const uids = view.players[player].hand.filter((c) => getCard(c.cardId).cost >= 5).map((c) => c.uid);
  return { type: 'mulligan', player, uids };
}

/** Whether simulating `a` from this view would need a card the viewer cannot see. */
function visible(a: Action): boolean {
  return a.type !== 'mulligan';
}

/**
 * The state after `a`, with any stack resolved as if the other player passes. Returns null if the
 * simulation runs into hidden information.
 */
export function simulate(view: GameState, a: Action, resolve = true): GameState | null {
  try {
    let s = applyAction(view, a).state;
    for (
      let i = 0;
      resolve && i < 8 && s.phase === 'main' && (s.stack.length > 0 || s.pending?.length);
      i++
    ) {
      // An open Discover choice or untargeted ability is settled with its first option, so the rest of the plan can be judged.
      const next =
        s.pending?.length || awaitingAbility(s)
          ? legalActions(s)[0]
          : { type: 'pass' as const, player: s.priority };
      if (!next) break;
      s = applyAction(s, next).state;
    }
    return s;
  } catch {
    return null;
  }
}

/**
 * Normal: score every legal action one step ahead (resolving the stack as if the opponent passes) and take
 * the best. Passing scores the current board, so the AI ends its turn when nothing improves on it. Unit
 * positions only matter for cards that care about neighbours, so other units are tried at the right end only.
 */
export function actNormal(view: PlayerView, rng: RngState): ActResult {
  const player = view.viewer;
  if (view.phase === 'mulligan') return { action: mulligan(view, player), rng };
  return { action: rankActions(view)[0]!.action, rng };
}

/**
 * Every (pruned) legal action with Normal's one-step value, best first. Passing scores the current board;
 * acting gets a small bonus, so spending mana now beats holding it when the boards tie. Stable order.
 */
export function rankActions(view: PlayerView): { action: Action; value: number }[] {
  const player = view.viewer;
  const legal = pruned(view, legalActions(view));
  const out: { action: Action; value: number }[] = [];
  for (const a of legal) {
    if (a.type === 'pass') {
      out.push({ action: a, value: score(passOutcome(view) ?? view, player) });
      continue;
    }
    if (!visible(a)) continue;
    const s = simulate(view, a);
    // Between equal choices, a Discover pick prefers the more expensive card.
    const bonus = a.type === 'choose' ? getCard(view.pending![0]!.options[a.index]!).cost * 0.001 : 0;
    if (s) out.push({ action: a, value: score(s, player) + 0.01 + bonus });
  }
  // Pass first among equals, so a tie never acts for nothing.
  return out
    .map((x, i) => ({ ...x, i: x.action.type === 'pass' ? -1 : i }))
    .sort((a, b) => b.value - a.value || a.i - b.i)
    .map(({ action, value }) => ({ action, value }));
}

/** What passing leads to: with a stack, the stack resolves; with an empty stack the board stays. */
function passOutcome(view: PlayerView): GameState | null {
  if (view.stack.length === 0) return view;
  return simulate(view, { type: 'pass', player: view.priority });
}

/** Drops unit positions that cannot matter (no adjacency effects on the board or the card). */
function pruned(view: GameState, legal: Action[]): Action[] {
  const adjacency = (cardId: string) =>
    getCard(cardId).effects.some((e) => 'target' in e.action && e.action.target === 'adjacentUnits');
  const boardCares = view.boards[view.priority].some((u) => adjacency(u.cardId));
  return legal.filter((a) => {
    if (a.type !== 'playUnit') return true;
    const card = view.players[a.player].hand.find((c) => c.uid === a.uid)!.cardId;
    if (card === HIDDEN) return false;
    if (boardCares || adjacency(card)) return true;
    return a.position === view.boards[a.player].length;
  });
}

/**
 * Easy: random legal actions, preferring to spend mana and to attack the hero. When it could respond to
 * the other player's stack item it does so 30% of the time.
 */
export function actEasy(view: PlayerView, rng: RngState): ActResult {
  const player = view.viewer;
  if (view.phase === 'mulligan') return { action: mulligan(view, player), rng };
  if (view.pending?.length || awaitingAbility(view)) {
    const picks = legalActions(view);
    const [i, next] = nextInt(rng, 0, picks.length - 1);
    return { action: picks[i]!, rng: next };
  }
  const legal = pruned(view, legalActions(view));
  const pass = legal.find((a) => a.type === 'pass')!;
  const acts = legal.filter((a) => a.type !== 'pass');
  let r = rng;
  const roll = () => {
    const [v, next] = nextFloat(r);
    r = next;
    return v;
  };
  if (acts.length === 0) return { action: pass, rng: r };
  if (view.stack.length > 0 && roll() >= 0.3) return { action: pass, rng: r };
  const face = acts.filter((a) => a.type === 'attack' && a.target.kind === 'hero');
  if (face.length > 0 && roll() < 0.5) {
    const [i, next] = nextInt(r, 0, face.length - 1);
    return { action: face[i]!, rng: next };
  }
  // Stop sometimes even with plays left, so Easy does not always dump its hand.
  if (view.stack.length === 0 && roll() < 0.1) return { action: pass, rng: r };
  const [i, next] = nextInt(r, 0, acts.length - 1);
  return { action: acts[i]!, rng: next };
}

/**
 * One action for `view.viewer`, who must have priority (or be choosing a mulligan). `clock` lets Hard stop at
 * its time budget; without it Hard does its full, deterministic search.
 */
export function act(difficulty: Difficulty, view: PlayerView, rng: RngState, clock?: Clock): ActResult {
  if (difficulty === 'easy') return actEasy(view, rng);
  if (difficulty === 'hard') return actHard(view, rng, clock);
  return actNormal(view, rng);
}

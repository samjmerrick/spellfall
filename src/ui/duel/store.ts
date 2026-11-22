// The Spellfall match: drives the AI (in a worker), auto-passes for the player, and plays engine events back
// as short effects. It never decides anything itself: every change is an engine action.
import { create } from 'zustand';
import type { Difficulty } from '../../ai';
import {
  applyAction,
  eventsFor,
  getCard,
  initMatch,
  legalActions,
  PREBUILT_DECKS,
  viewFor,
  type Action,
  type DeckDef,
  type GameEvent,
  type GameState,
  type PlayerId,
  type TargetRef,
} from '../../rules';
import { seedRng } from '../../rules/rng';
import { matchAiRng, type AiHooks, type RunMatch } from '../../run';
import { useApp } from '../app';
import { haptic, sfx } from '../feedback';
import { currentScale } from '../motion';
import { randomSeed, urlSeed } from '../settings';
import { runDuelAi } from './aiClient';
import { useRun } from '../runStore';

export const HUMAN: PlayerId = 0;
export const AI: PlayerId = 1;

export interface Fx {
  id: number;
  kind: 'damage' | 'heal' | 'shield';
  amount: number;
  target: { unit: number } | { hero: PlayerId };
}

/** A short line describing the opponent's last action, shown in the stack strip. */
export interface Banner {
  id: number;
  text: string;
}

/** What the player is in the middle of choosing (after picking a card or unit). */
export type Pick =
  | { kind: 'card'; uid: number }
  | { kind: 'unit'; uid: number }
  /** A unit is being placed at `position` and needs On Play targets. */
  | { kind: 'placeTargets'; uid: number; position: number; chosen: TargetRef[] }
  /** A spell with two targets: the first is chosen. */
  | { kind: 'spellTargets'; uid: number; chosen: TargetRef[] };

interface DuelStore {
  /** Quick Play, or a run node's match (autosaved whenever the player gets priority). */
  mode: 'quick' | 'run';
  hooks: AiHooks;
  /** Run mode: the enemy being fought. */
  enemyId: string | null;
  deck: DeckDef | null;
  opponentDeck: DeckDef | null;
  difficulty: Difficulty;
  seed: number;
  game: GameState | null;
  busy: boolean;
  aiRng: number;
  mulligan: number[];
  pick: Pick | null;
  fx: Fx[];
  banner: Banner | null;
  /** Units currently attacking (for a lunge) and a unit that just died (fade). */
  attacking: number | null;
  detail: string | null;
  error: string | null;

  start(deck: DeckDef, difficulty: Difficulty): Promise<void>;
  /** Starts a run node's match, or resumes the saved one. */
  startRun(m: RunMatch, saved: { game: GameState; aiRng: number } | null): Promise<void>;
  toggleMulligan(uid: number): void;
  confirmMulligan(): Promise<void>;
  perform(action: Action): Promise<void>;
  /** The main button: End Turn with an empty stack, otherwise resolve the stack. */
  pass(): Promise<void>;
  setPick(pick: Pick | null): void;
  showDetail(cardId: string | null): void;
  leave(): void;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let fxId = 1;

/** Milliseconds each event holds the screen for, before the speed scale. */
function eventMs(e: GameEvent): number {
  switch (e.type) {
    case 'SpellCast':
    case 'UnitPlayed':
    case 'AttackDeclared':
      return 450;
    case 'Combat':
      return 350;
    case 'DamageDealt':
    case 'HeroDamaged':
    case 'UnitDied':
    case 'Fizzled':
    case 'Countered':
      return 220;
    case 'StackResolving':
      return 200;
    case 'TurnStarted':
      return 300;
    default:
      return 0;
  }
}

function feedbackFor(e: GameEvent) {
  switch (e.type) {
    case 'UnitPlayed':
    case 'SpellCast':
      sfx('play');
      break;
    case 'DamageDealt':
      sfx('hit');
      haptic('hit');
      break;
    case 'HeroDamaged':
      sfx('heroHit');
      haptic('heroHit');
      break;
    case 'UnitDied':
      sfx('death');
      break;
  }
}

export function cardName(state: GameState, uid: number): string | null {
  for (const b of state.boards) for (const u of b) if (u.uid === uid) return u.cardId;
  return null;
}

export const useDuel = create<DuelStore>((set, get) => {
  function pushFx(e: GameEvent) {
    let fx: Fx | null = null;
    if (e.type === 'DamageDealt')
      fx = { id: fxId++, kind: 'damage', amount: e.amount, target: { unit: e.uid } };
    if (e.type === 'UnitHealed') fx = { id: fxId++, kind: 'heal', amount: e.amount, target: { unit: e.uid } };
    if (e.type === 'BarrierBroken') fx = { id: fxId++, kind: 'shield', amount: 0, target: { unit: e.uid } };
    if (e.type === 'HeroDamaged')
      fx = { id: fxId++, kind: 'damage', amount: e.amount, target: { hero: e.player } };
    if (e.type === 'HeroHealed')
      fx = { id: fxId++, kind: 'heal', amount: e.amount, target: { hero: e.player } };
    if (!fx) return;
    const id = fx.id;
    set((st) => ({ fx: [...st.fx, fx] }));
    setTimeout(
      () => set((st) => ({ fx: st.fx.filter((f) => f.id !== id) })),
      900 * Math.max(0.2, currentScale()),
    );
  }

  /**
   * Applies an action and plays its events back. The board shows the state before the action while events
   * play (so damage numbers land on units that may then die), then snaps to the new state.
   */
  async function step(action: Action): Promise<void> {
    const game = get().game!;
    const { state, events } = applyAction(game, action);
    const scale = currentScale();
    // The player's own plays show their result at once, so a dropped card lands on the board without lag.
    const own = action.player === HUMAN && (action.type === 'playUnit' || action.type === 'castSpell');
    if (own) set({ game: state });
    for (const e of eventsFor(events, HUMAN)) {
      if (e.type === 'AttackDeclared') set({ attacking: e.attacker });
      if (e.type === 'StackResolving') set({ attacking: null });
      pushFx(e);
      feedbackFor(e);
      const ms = own && (e.type === 'UnitPlayed' || e.type === 'SpellCast') ? 0 : eventMs(e) * scale;
      if (ms > 0) await sleep(ms);
    }
    set({ game: state, attacking: null });
    // Opponent messages describe an action that has now happened; the strip falls back to the live state.
    if (action.player !== HUMAN) set({ banner: null });
    if (state.result) finish(state);
  }

  function finish(state: GameState) {
    const { winner } = state.result!;
    if (winner !== null) {
      sfx(winner === HUMAN ? 'win' : 'lose');
      haptic(winner === HUMAN ? 'win' : 'lose');
    }
    const outcome = winner === null ? 'draw' : winner === HUMAN ? 'win' : 'loss';
    const deck = get().deck;
    if (get().mode === 'quick' && deck) useApp.getState().recordQuickPlay(deck.id, outcome);
  }

  function describe(a: Action, s: GameState): string | null {
    const handCard = (uid: number) => s.players[a.player].hand.find((c) => c.uid === uid)?.cardId;
    if (a.type === 'castSpell' || a.type === 'playUnit') {
      const id = handCard(a.uid);
      return id ? `Opponent plays ${nameOf(id)}` : null;
    }
    if (a.type === 'attack') {
      const id = cardName(s, a.attacker);
      return id ? `Opponent attacks with ${nameOf(id)}` : null;
    }
    if (a.type === 'pass' && s.stack.length > 0) return 'Opponent lets it resolve';
    return null;
  }

  /** Runs the AI while it has priority, and auto-passes for the player when they have no response. */
  async function loop(): Promise<void> {
    for (let guard = 0; guard < 500; guard++) {
      const s = get().game;
      if (!s || s.phase === 'over') break;
      if (s.phase === 'mulligan') {
        if (!s.players[AI].mulliganed) {
          const { action, rng } = await runDuelAi(get().difficulty, aiView(s), get().aiRng);
          set({ aiRng: rng });
          await step(action);
          continue;
        }
        break; // Waiting for the player's mulligan.
      }
      if (s.priority === AI) {
        set({ busy: true });
        const ai = await runDuelAi(get().difficulty, aiView(s), get().aiRng);
        const action: Action = ai.action;
        set({ aiRng: ai.rng });
        const text = describe(action, s);
        if (text) set({ banner: { id: fxId++, text } });
        await sleep(250 * currentScale());
        if (get().game !== s) break; // Left the match meanwhile.
        await step(action);
        continue;
      }
      // The player has priority. With a stack and nothing to answer with, pass for them.
      const auto = useApp.getState().profile.settings.autoPass;
      if (s.stack.length > 0 && auto && legalActions(s).every((a) => a.type === 'pass')) {
        set({ busy: true });
        await sleep(300 * currentScale());
        await step({ type: 'pass', player: HUMAN });
        continue;
      }
      break;
    }
    set({ busy: false });
    autosave();
  }

  /** The AI's view: a boss that "sees your hand" gets your real hand. */
  function aiView(s: GameState) {
    return viewFor(s, AI, { seeHand: get().hooks.seesHand });
  }

  /** Run mode: save the match whenever the player is about to act (and when it ends). */
  function autosave() {
    const { mode, game, aiRng } = get();
    if (mode === 'run' && game) useRun.getState().saveMatch(game, aiRng);
  }

  function guard(f: () => void): boolean {
    try {
      f();
      return true;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
      return false;
    }
  }

  return {
    mode: 'quick',
    hooks: {},
    enemyId: null,
    deck: null,
    opponentDeck: null,
    difficulty: 'normal',
    seed: 0,
    game: null,
    busy: false,
    aiRng: 0,
    mulligan: [],
    pick: null,
    fx: [],
    banner: null,
    attacking: null,
    detail: null,
    error: null,

    async start(deck, difficulty) {
      const seed = urlSeed() ?? randomSeed();
      // The opponent plays a random pre-built deck (a different one from yours when possible).
      const pool = PREBUILT_DECKS.filter((d) => d.id !== deck.id);
      const opponent = (pool.length > 0 ? pool : PREBUILT_DECKS)[seed % Math.max(1, pool.length)]!;
      const game = initMatch({ decks: [deck.cards, opponent.cards] }, seed);
      useApp.getState().go('duel');
      set({
        mode: 'quick',
        hooks: {},
        enemyId: null,
        deck,
        opponentDeck: opponent,
        difficulty,
        seed,
        game,
        busy: true,
        aiRng: seedRng((seed ^ 0x5bd1e995) >>> 0),
        mulligan: [],
        pick: null,
        fx: [],
        banner: null,
        attacking: null,
        error: null,
      });
      await loop();
    },

    async startRun(m, saved) {
      const game = saved?.game ?? initMatch(m.config, m.seed);
      useApp.getState().go('duel');
      set({
        mode: 'run',
        hooks: m.hooks,
        enemyId: m.enemyId,
        deck: null,
        opponentDeck: null,
        difficulty: m.difficulty,
        seed: m.seed,
        game,
        busy: true,
        aiRng: saved?.aiRng ?? matchAiRng(m.seed),
        mulligan: [],
        pick: null,
        fx: [],
        banner: null,
        attacking: null,
        error: null,
      });
      await loop();
    },

    toggleMulligan(uid) {
      set((st) => ({
        mulligan: st.mulligan.includes(uid) ? st.mulligan.filter((u) => u !== uid) : [...st.mulligan, uid],
      }));
    },

    async confirmMulligan() {
      const { game, mulligan } = get();
      if (!game || game.phase !== 'mulligan') return;
      set({ busy: true });
      if (guard(() => applyAction(game, { type: 'mulligan', player: HUMAN, uids: mulligan }))) {
        set({ mulligan: [] });
        await step({ type: 'mulligan', player: HUMAN, uids: mulligan });
      }
      await loop();
    },

    async perform(action) {
      const { game, busy } = get();
      if (!game || busy || game.priority !== HUMAN) return;
      set({ pick: null, banner: null });
      if (!guard(() => applyAction(game, action))) return;
      set({ busy: true });
      if (action.type !== 'pass') haptic('play');
      await step(action);
      await loop();
    },

    async pass() {
      const { game } = get();
      if (!game || game.phase !== 'main') return;
      sfx('tap');
      haptic('tap');
      await get().perform({ type: 'pass', player: HUMAN });
    },

    setPick: (pick) => set({ pick }),
    showDetail: (detail) => set({ detail }),
    leave() {
      const { mode } = get();
      set({ game: null, busy: false, pick: null });
      // A run match stays saved; the run screen offers to resume it.
      useApp.getState().go(mode === 'run' ? 'run' : 'quickplay');
    },
  };
});

function nameOf(id: string): string {
  try {
    return getCard(id).name;
  } catch {
    return 'a card';
  }
}
